import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { secureRandomSeed } from '../shared/random.js';
import type { ActionEnvelope, ActionReply, CharacterPool, ChatReply, GameMode, Identity, Player, RenameReply, Room, RoomRole, RoomSummary, RoomView } from '../shared/types.js';
import { appendChat, appendPlayerChat, chatBatch, deduplicateStoredNicknames, uniqueNickname, validateChatSend, validateNickname } from '../shared/chat.js';
import { immediateRoomAction } from '../shared/automation.js';
import { projectRoom, reduceRoomAction, setRoomDeadline } from '../shared/room-core.js';
import { createGame, startGame } from '../engine/index.js';
import { timeoutRoomAction as timeoutAction, LEGACY_RULES_VERSION } from '../engine/runtime.js';
import { Store } from './store.js';
import { MAX_SPECTATORS, ROOM_TTL_MS } from '../shared/constants.js';
import { roomExpiry, type RoomCloseReason, type RoomClosure } from '../shared/room-lifecycle.js';
import { legacyRoomConfig, legacyPoolForConfig, validateRoomConfigForPlayers, type RoomConfig } from '../shared/room-config.js';

export const PLAYER_COLORS = ['#df3c32','#175bd1','#159269','#b34fa6','#eb8a19','#6d57c7','#008eaa','#77503c'];
export { ROOM_TTL_MS } from '../shared/constants.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type PresenceRoom = Room & {hostSeenAt?:number};
export class Rooms {
  readonly rooms = new Map<string, Room>();
  onExpired?: (code:string, expiresAt:number, reason?:RoomCloseReason) => void;
  constructor(readonly store: Store, readonly defaultTimeout = 120, readonly now=Date.now) {
    const restoredAt=this.now();
    for(const room of store.load()) {
      room.game.rulesVersion??=LEGACY_RULES_VERSION;
      const healed=deduplicateStoredNicknames([...room.game.players,...(room.spectators??[])]);
      room.game.players=room.game.players.map(player=>({...player,name:healed.find(member=>member.id===player.id)!.name}));
      room.spectators=room.spectators?.map(spectator=>({...spectator,name:healed.find(member=>member.id===spectator.id)!.name}));
      room.ownerId??=room.game.players.find(player=>player.seat===0)?.id??room.hostId;
      room.hostId=room.ownerId;
      if(room.closedAt!==undefined){store.closeRoom({code:room.code,closedAt:room.closedAt,reason:room.closeReason??'dismissed',hostId:room.hostId,version:room.version});continue;}
      // A restart ends all Node connections. Preserve an existing absence;
      // rooms whose owner was online begin their absence at this restart.
      if(room.closedAt===undefined)room.hostLeftAt??=(room as PresenceRoom).hostSeenAt??room.updatedAt;
      if(roomExpiry(room)<=restoredAt){store.closeRoom({code:room.code,closedAt:room.closedAt??roomExpiry(room),reason:room.closeReason??'host-away'});continue;}
      if(room.closedAt===undefined){room.game.players.forEach(p => p.connected = !!p.isAI);room.spectators?.forEach(p=>p.connected=false);store.save(room);}
      this.rooms.set(room.code, room);
    }
  }
  expire(code:string,now=this.now()):boolean {
    const room=this.rooms.get(code);
    if(!room||roomExpiry(room)>now)return false;
    const at=room.closedAt??roomExpiry(room),reason=room.closeReason??'host-away';
    this.closePersonal(room,reason,at);
    this.onExpired?.(code,at,reason);return true;
  }
  closed(code:string):RoomClosure|undefined {return this.store.closed(code);}
  private closePersonal(room:Room,reason:RoomCloseReason,closedAt:number,actionId?:string):void {
    this.store.closeRoom({code:room.code,closedAt,reason,hostId:room.hostId,version:room.version,actionId});this.rooms.delete(room.code);
  }
  get(code: string): Room { code=code.toUpperCase();this.expire(code);const room = this.rooms.get(code); if(!room) {const closed=this.closed(code);throw Error(closed?.reason==='host-away'?'房主离线保留期限已到，房间已关闭。':closed?'房间已关闭。请创建或加入其他房间。':'房间不存在或已过期，请检查房间码。');} return room; }
  list(now=this.now()):RoomSummary[] {
    for(const code of this.rooms.keys())this.expire(code,now);
    return [...this.rooms.values()].filter(room=>room.closedAt===undefined&&room.mode!=='practice').sort((a,b)=>b.createdAt-a.createdAt).map(room=>({
      code:room.code,hostName:room.game.players.find(p=>p.id===(room.ownerId??room.hostId))?.name??'房主',phase:room.game.phase,
      playerCount:room.game.players.length,maxPlayers:room.maxPlayers,spectatorCount:room.spectators?.filter(p=>p.connected).length??0,
      createdAt:room.createdAt,expiresAt:roomExpiry(room),authorityOnline:true,mode:room.mode??'multiplayer',
    }));
  }
  player(name: string, seat: number): Player { return {id:randomUUID(),name,seat,color:PLAYER_COLORS[seat]!,ready:false,connected:false,score:0,hand:[],used:[],selection:[]}; }
  capacity(){return this.store.capacity(this.now());}
  create(name: string, maxPlayers: number, timeoutSeconds?: number, mode:GameMode='multiplayer', aiCount=3, characterPool:CharacterPool='original', config?:RoomConfig, requestId?:string): {identity:Identity;room:RoomView} {
    for(const code of this.rooms.keys())this.expire(code);
    if(this.rooms.size >= 500) throw Error('当前房间较多，请稍后重试。');
    let code: string; do { code = Array.from(randomBytes(6), b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 31]).join(''); } while(this.rooms.has(code)||this.closed(code));
    if(!['multiplayer','practice','ai'].includes(mode))throw Error('比赛模式无效。');
    if(mode==='ai'&&(!Number.isInteger(aiCount)||aiCount<1||aiCount>7))throw Error('AI人数需为1～7。');
    if(mode!=='multiplayer')maxPlayers=mode==='practice'?1:aiCount+1;
    if(!['original','second-wind','mixed','wurstii','all'].includes(characterPool))throw Error('角色牌池无效。');
    if(requestId!==undefined&&!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))throw Error('建房请求编号无效。');
    const rules=validateRoomConfigForPlayers(config??legacyRoomConfig(characterPool,mode==='practice'),maxPlayers,mode==='practice');
    if(config)characterPool=legacyPoolForConfig(rules);
    const request=JSON.stringify({name,maxPlayers,timeoutSeconds:timeoutSeconds??this.defaultTimeout,mode,aiCount,characterPool,config:rules});
    const prior=requestId?this.store.creationReceipt<{identity:Identity;room:RoomView}>(requestId):undefined;
    if(prior){if(prior.request!==request)throw Error('同一建房请求编号不能用于不同设置。');return prior.result;}
    const p = this.player(uniqueNickname(name,[]),0); const now=this.now();
    const players=[p,...Array.from({length:mode==='ai'?aiCount:0},(_,i)=>({...this.player(`电脑${i+1}`,i+1),isAI:true,ready:true,connected:true}))];
    for(let i=1;i<players.length;i++)players[i]!.name=uniqueNickname(players[i]!.name,players.slice(0,i).map(person=>person.name));
    const room:Room = {mode,code,hostId:p.id,ownerId:p.id,hostLeftAt:now,createdAt:now,updatedAt:now,version:1,maxPlayers,timeoutSeconds:timeoutSeconds??this.defaultTimeout,deadline:null,game:createGame(players,secureRandomSeed(),mode,characterPool)};
    room.game.config=rules;room.configFrozen=false;
    if(mode!=='multiplayer'){p.ready=true;room.game.players[0]!.ready=true;startGame(room.game);room.configFrozen=true;this.deadline(room);}
    const token = randomBytes(32).toString('base64url');
    const result=this.store.createRoom(room,p.id,hash(token),{identity:{roomCode:code,playerId:p.id,token,role:'player' as const},room:this.view(room,p.id)},now,requestId,request);
    if(result.identity.roomCode===code)this.rooms.set(code,room);
    return result;
  }
  join(code: string, name: string,role:RoomRole='player'): {identity:Identity;room:RoomView} {
    const original=this.get(code); if(original.closedAt!==undefined) throw Error('房间已解散。请创建或加入其他房间。');
    name=uniqueNickname(name,[...original.game.players,...(original.spectators??[])].map(person=>person.name));
    if(role==='spectator') {
      if((original.spectators?.length??0)>=MAX_SPECTATORS)throw Error('观战人数已满，请稍后再试。');
      const room=structuredClone(original),spectator={id:randomUUID(),name,connected:false};
      room.spectators=[...(room.spectators??[]),spectator];room.version++;room.updatedAt=Date.now();
      const token=randomBytes(32).toString('base64url');this.store.addIdentity(room,spectator.id,hash(token));this.rooms.set(room.code,room);
      return{identity:{roomCode:room.code,playerId:spectator.id,token,role},room:this.view(room,spectator.id)};
    }
    if(role!=='player')throw Error('加入身份无效。');
    if(original.mode==='practice'||original.mode==='ai')throw Error('此对局为自己练习或人机模式。');
    if(original.game.phase!=='lobby') throw Error('比赛已经开始，席位已锁定。原玩家请使用原浏览器重连。');
    if(original.game.players.length >= original.maxPlayers) throw Error('房间已满。');
    const room=structuredClone(original);let seat=0;while(room.game.players.some(p=>p.seat===seat))seat++;
    const p=this.player(name,seat); room.game.players.push(p);room.game.players.sort((a,b)=>a.seat-b.seat);room.version++; room.updatedAt=Date.now();
    const token=randomBytes(32).toString('base64url'); this.store.addIdentity(room,p.id,hash(token)); this.rooms.set(room.code,room);
    return {identity:{roomCode:room.code,playerId:p.id,token,role},room:this.view(room,p.id)};
  }
  authenticate(identity: Identity): Room {
    const room=this.get(identity.roomCode); if(room.closedAt!==undefined) throw Error('房间已解散。请创建或加入其他房间。');
    const expected=this.store.identity(room.code,identity.playerId);
    const role=room.game.players.some(p=>p.id===identity.playerId)?'player':room.spectators?.some(p=>p.id===identity.playerId)?'spectator':undefined;
    if(!expected || !role || (identity.role!==undefined&&identity.role!==role)) throw Error('身份已失效。请使用原浏览器和邀请链接恢复。');
    const actual=hash(identity.token); if(!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))) throw Error('重连凭据无效。请使用原浏览器。'); return room;
  }
  presence(code: string, id: string, connected: boolean): void {
    if(this.expire(code))return;
    const original=this.rooms.get(code);if(!original||original.closedAt!==undefined)return;
    const member=original.game.players.find(p=>p.id===id)??original.spectators?.find(p=>p.id===id);
    if(!member||(member.connected===connected&&!(original.ownerId===id&&connected&&original.hostLeftAt!==undefined)))return;
    const room=structuredClone(original);(room.game.players.find(p=>p.id===id)??room.spectators!.find(p=>p.id===id)!).connected=connected;
    if(room.ownerId===id){if(connected){delete room.hostLeftAt;(room as PresenceRoom).hostSeenAt=this.now();}else room.hostLeftAt??=this.now();}
    room.version++;room.updatedAt=this.now(); this.store.save(room); this.rooms.set(code,room);
  }
  leave(identity:Identity):{ok:true;retainIdentity:boolean} {
    const original=this.authenticate(identity),room=structuredClone(original),id=identity.playerId;
    const spectator=room.spectators?.some(p=>p.id===id)??false;
    const retainIdentity=!spectator&&(room.game.phase!=='lobby'||room.ownerId===id);
    if(spectator)room.spectators=room.spectators!.filter(p=>p.id!==id);
    else if(retainIdentity)room.game.players.find(p=>p.id===id)!.connected=false;
    else room.game.players=room.game.players.filter(p=>p.id!==id);
    if(room.ownerId===id)room.hostLeftAt??=this.now();
    room.version++;room.updatedAt=Date.now();
    if(retainIdentity)this.store.transaction(()=>this.store.save(room));else this.store.removeIdentity(room,id);
    this.rooms.set(room.code,room);return{ok:true,retainIdentity};
  }
  act(code: string, id: string, envelope: ActionEnvelope, automatic=false): ActionReply {
    const closed=this.closed(code);
    if(closed)return closed.actionId===envelope.actionId&&closed.hostId===id&&envelope.action.type==='close'?{ok:true,duplicate:true,version:closed.version}:{ok:false,error:'房间已关闭。请创建或加入其他房间。',version:closed.version};
    const original=this.get(code); const request=JSON.stringify(envelope.action);
    const receipt=this.store.receipt(code,id,envelope.actionId);
    if(receipt) return receipt.request===request ? {...receipt.result,duplicate:true} : {ok:false,error:'同一操作编号不能用于不同操作。'};
    if(original.closedAt!==undefined) return {ok:false,error:'房间已解散。请创建或加入其他房间。',version:original.version};
    if(original.version!==envelope.expectedVersion) return {ok:false,error:'画面已更新，请同步后重试。',version:original.version};
    try {
      const room=reduceRoomAction(original,id,envelope.action,{now:this.now(),rematchSeed:envelope.action.type==='rematch'?secureRandomSeed():0,automatic});
      if(envelope.action.type==='transfer')(room as PresenceRoom).hostSeenAt=this.now();
      if(room.closedAt!==undefined){this.closePersonal(room,'dismissed',room.closedAt,envelope.actionId);return{ok:true,version:room.version};}
      const result={ok:true,version:room.version};this.store.commitAction(room,id,envelope.actionId,request,result);this.rooms.set(code,room);return result;
    }catch(e){return{ok:false,error:e instanceof Error?e.message:'操作失败，请重试。',version:original.version};}
  }
  chat(code:string,id:string,input:unknown):ChatReply {
    try {
      const original=this.get(code),person=original.game.players.find(p=>p.id===id)??original.spectators?.find(p=>p.id===id);
      if(!person||('isAI' in person&&person.isAI))throw Error('只有当前房间内的真人成员可以聊天。');
      const message=validateChatSend(input),prior=this.store.memberReceipt<ChatReply>(code,id,'chat',message.clientMessageId);
      if(prior)return prior.request===message.text?{...prior.result,duplicate:true}:{ok:false,error:'同一消息编号不能用于不同内容。'};
      const room=structuredClone(original);room.chat=appendPlayerChat(room.chat,id,person.name,message,this.now());
      const result:ChatReply={ok:true,message:room.chat.messages.at(-1)!};
      this.store.commitMember(room,id,'chat',message.clientMessageId,message.text,result);this.rooms.set(code,room);return result;
    }catch(error){return{ok:false,error:error instanceof Error?error.message:'消息发送失败。'};}
  }
  chatHistory(code:string,id:string,afterId=0){
    const room=this.get(code);if(!room.game.players.some(p=>p.id===id)&&!room.spectators?.some(p=>p.id===id))throw Error('你不是当前房间成员。');
    return chatBatch(room.chat,afterId);
  }
  rename(code:string,id:string,requestId:unknown,name:unknown):RenameReply {
    try {
      if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))throw Error('改名请求编号无效。');
      const original=this.get(code),player=original.game.players.find(p=>p.id===id);
      if(!player||player.isAI)throw Error('只有真人参赛玩家可以修改昵称。');
      const requested=validateNickname(name);
      const prior=this.store.memberReceipt<RenameReply>(code,id,'rename',requestId);
      if(prior)return prior.request===requested?{...prior.result,duplicate:true}:{ok:false,error:'同一请求编号不能用于不同昵称。'};
      if(original.game.phase==='lobby')throw Error('请在对局开始后修改昵称。');
      if(player.renameUsed)throw Error('本局已修改过昵称。');
      const finalName=uniqueNickname(requested,[...original.game.players,...(original.spectators??[])].filter(p=>p.id!==id).map(p=>p.name));
      if(finalName===player.name)throw Error('新昵称与当前昵称相同。');
      const room=structuredClone(original),next=room.game.players.find(p=>p.id===id)!;
      next.name=finalName;next.renameUsed=true;next.renameRequestId=requestId;room.version++;room.updatedAt=this.now();
      room.chat=appendChat(room.chat,{senderId:id,senderName:'系统',text:`${player.name} 已改名为 ${finalName}`,sentAt:this.now(),kind:'system'});
      const result:RenameReply={ok:true,name:finalName,remaining:0};
      this.store.commitMember(room,id,'rename',requestId,requested,result);this.rooms.set(code,room);return result;
    }catch(error){return{ok:false,error:error instanceof Error?error.message:'修改昵称失败。'};}
  }
  deadline(room: Room): void { setRoomDeadline(room,this.now()); }
  tick(now=this.now()): string[] {
    const updated:string[]=[];
    for(const original of this.rooms.values()){
      if(this.expire(original.code,now))continue;
      if(original.closedAt!==undefined)continue;
      // Persist owner liveness independently of AI turns. After a crash the
      // restart can count downtime instead of resetting the thirty-minute clock.
      if(original.game.players.some(p=>p.id===original.ownerId&&p.connected)&&now-((original as PresenceRoom).hostSeenAt??0)>=15_000){
        (original as PresenceRoom).hostSeenAt=now;this.store.save(original);
      }
      // Local server bots pause when the human leaves; no unattended match
      // consumes their remaining turns while they are disconnected.
      if((original.mode==='ai'||original.mode==='practice')&&!original.game.players.some(p=>!p.isAI&&p.connected))continue;
      const immediate=immediateRoomAction(original,now);
      if(!immediate&&(!original.deadline||original.deadline>now))continue;
      const a=immediate??timeoutAction(original.game);if(!a)continue;
      const result=this.act(original.code,a.playerId,{actionId:randomUUID(),expectedVersion:original.version,action:a.action},!immediate);
      if(result.ok)updated.push(original.code);
    }
    return updated;
  }
  view(room: Room, id: string): RoomView {
    return {...projectRoom(room,id,{authorityId:room.hostId,authorityOnline:true}),hosting:'local'};
  }
}
