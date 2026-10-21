import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ActionEnvelope, ActionReply, GameAction, GameMode, Identity, Player, Room, RoomView } from '../shared/types.js';
import { immediateRoomAction } from '../shared/automation.js';
import { projectRoom, reduceRoomAction, setRoomDeadline } from '../shared/room-core.js';
import { createGame, startGame, automaticAction } from '../engine/index.js';
import { Store } from './store.js';

export const PLAYER_COLORS = ['#df3c32','#175bd1','#159269','#b34fa6','#eb8a19','#6d57c7','#008eaa','#77503c'];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Rooms {
  readonly rooms = new Map<string, Room>();
  constructor(readonly store: Store, readonly defaultTimeout = 120, readonly ttlDays = 30) {
    store.expire(Date.now() - ttlDays * 86400000);
    for(const room of store.load()) { if(room.closedAt===undefined){room.game.players.forEach(p => p.connected = !!p.isAI); store.save(room);} this.rooms.set(room.code, room); }
  }
  get(code: string): Room { const room = this.rooms.get(code.toUpperCase()); if(!room) throw Error('房间不存在或已过期，请检查房间码。'); return room; }
  player(name: string, seat: number): Player { return {id:randomUUID(),name,seat,color:PLAYER_COLORS[seat]!,ready:false,connected:false,score:0,hand:[],used:[],selection:[]}; }
  create(name: string, maxPlayers: number, timeoutSeconds?: number, mode:GameMode='multiplayer', aiCount=3): {identity:Identity;room:RoomView} {
    if(this.rooms.size >= 500) throw Error('当前房间较多，请稍后重试。');
    let code: string; do { code = Array.from(randomBytes(6), b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 31]).join(''); } while(this.rooms.has(code));
    if(!['multiplayer','practice','ai'].includes(mode))throw Error('比赛模式无效。');
    if(mode==='ai'&&(!Number.isInteger(aiCount)||aiCount<1||aiCount>7))throw Error('AI人数需为1～7。');
    if(mode!=='multiplayer')maxPlayers=mode==='practice'?1:aiCount+1;
    const p = this.player(name,0); const now=Date.now();
    const players=[p,...Array.from({length:mode==='ai'?aiCount:0},(_,i)=>({...this.player(`电脑${i+1}`,i+1),isAI:true,ready:true,connected:true}))];
    const room:Room = {mode,code,hostId:p.id,createdAt:now,updatedAt:now,version:1,maxPlayers,timeoutSeconds:timeoutSeconds??this.defaultTimeout,deadline:null,game:createGame(players,randomBytes(4).readUInt32LE(),mode)};
    if(mode!=='multiplayer'){p.ready=true;room.game.players[0]!.ready=true;startGame(room.game);this.deadline(room);}
    const token = randomBytes(32).toString('base64url'); this.store.addIdentity(room,p.id,hash(token)); this.rooms.set(code,room);
    return {identity:{roomCode:code,playerId:p.id,token},room:this.view(room,p.id)};
  }
  join(code: string, name: string): {identity:Identity;room:RoomView} {
    const original=this.get(code); if(original.closedAt!==undefined) throw Error('房间已解散。请创建或加入其他房间。');
    if(original.mode==='practice'||original.mode==='ai')throw Error('此对局为自己练习或人机模式。');
    if(original.game.phase!=='lobby') throw Error('比赛已经开始，席位已锁定。原玩家请使用原浏览器重连。');
    if(original.game.players.length >= original.maxPlayers) throw Error('房间已满。');
    const room=structuredClone(original); const p=this.player(name,room.game.players.length); room.game.players.push(p); room.version++; room.updatedAt=Date.now();
    const token=randomBytes(32).toString('base64url'); this.store.addIdentity(room,p.id,hash(token)); this.rooms.set(room.code,room);
    return {identity:{roomCode:room.code,playerId:p.id,token},room:this.view(room,p.id)};
  }
  authenticate(identity: Identity): Room {
    const room=this.get(identity.roomCode); if(room.closedAt!==undefined) throw Error('房间已解散。请创建或加入其他房间。');
    const expected=this.store.identity(room.code,identity.playerId);
    if(!expected || !room.game.players.some(p=>p.id===identity.playerId)) throw Error('身份已失效。请使用原浏览器和邀请链接恢复。');
    const actual=hash(identity.token); if(!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))) throw Error('重连凭据无效。请使用原浏览器。'); return room;
  }
  presence(code: string, id: string, connected: boolean): void {
    const original=this.get(code); if(original.closedAt!==undefined || original.game.players.find(p=>p.id===id)?.connected===connected) return;
    const room=structuredClone(original); room.game.players.find(p=>p.id===id)!.connected=connected;
    if(!room.game.players.some(p=>p.id===room.hostId && p.connected)) {
      const next=room.game.players.find(p=>p.connected&&!p.isAI); if(next) room.hostId=next.id;
    }
    room.version++; this.store.save(room); this.rooms.set(code,room);
  }
  act(code: string, id: string, envelope: ActionEnvelope, automatic=false): ActionReply {
    const original=this.get(code); const request=JSON.stringify(envelope.action);
    const receipt=this.store.receipt(code,id,envelope.actionId);
    if(receipt) return receipt.request===request ? {...receipt.result,duplicate:true} : {ok:false,error:'同一操作编号不能用于不同操作。'};
    if(original.closedAt!==undefined) return {ok:false,error:'房间已解散。请创建或加入其他房间。',version:original.version};
    if(original.version!==envelope.expectedVersion) return {ok:false,error:'画面已更新，请同步后重试。',version:original.version};
    try {
      const room=reduceRoomAction(original,id,envelope.action,{now:Date.now(),rematchSeed:envelope.action.type==='rematch'?randomBytes(4).readUInt32LE():0,automatic});
      const result={ok:true,version:room.version};this.store.commitAction(room,id,envelope.actionId,request,result);this.rooms.set(code,room);return result;
    }catch(e){return{ok:false,error:e instanceof Error?e.message:'操作失败，请重试。',version:original.version};}
  }
  deadline(room: Room): void { setRoomDeadline(room,Date.now()); }
  tick(now=Date.now()): string[] {
    const updated:string[]=[];
    for(const original of this.rooms.values()){
      if(original.closedAt!==undefined)continue;
      // Local server bots pause when the human leaves; no unattended match
      // consumes their remaining turns while they are disconnected.
      if((original.mode==='ai'||original.mode==='practice')&&!original.game.players.some(p=>!p.isAI&&p.connected))continue;
      const immediate=immediateRoomAction(original,now);
      if(!immediate&&(!original.deadline||original.deadline>now))continue;
      const a=immediate??automaticAction(original.game);if(!a)continue;
      const result=this.act(original.code,a.playerId,{actionId:randomUUID(),expectedVersion:original.version,action:a.action},!immediate);
      if(result.ok)updated.push(original.code);
    }
    return updated;
  }
  view(room: Room, id: string): RoomView {
    return {...projectRoom(room,id,{authorityId:room.hostId,authorityOnline:true}),hosting:'local'};
  }
}
