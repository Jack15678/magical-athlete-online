import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ActionEnvelope, ActionReply, GameAction, Identity, Player, Room, RoomView } from '../shared/types.js';
import { createGame, startGame, applyGameAction, automaticAction } from '../engine/index.js';
import { Store } from './store.js';

export const PLAYER_COLORS = ['#df3c32','#175bd1','#159269','#b34fa6','#eb8a19','#6d57c7','#008eaa','#77503c'];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Rooms {
  readonly rooms = new Map<string, Room>();
  constructor(readonly store: Store, readonly defaultTimeout = 120, readonly ttlDays = 30) {
    store.expire(Date.now() - ttlDays * 86400000);
    for(const room of store.load()) { room.game.players.forEach(p => p.connected = false); store.save(room); this.rooms.set(room.code, room); }
  }
  get(code: string): Room { const room = this.rooms.get(code.toUpperCase()); if(!room) throw Error('房间不存在或已过期，请检查房间码。'); return room; }
  player(name: string, seat: number): Player { return {id:randomUUID(),name,seat,color:PLAYER_COLORS[seat]!,ready:false,connected:false,score:0,hand:[],used:[],selection:[]}; }
  create(name: string, maxPlayers: number, timeoutSeconds?: number): {identity:Identity;room:RoomView} {
    if(this.rooms.size >= 500) throw Error('当前房间较多，请稍后重试。');
    let code: string; do { code = Array.from(randomBytes(6), b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 31]).join(''); } while(this.rooms.has(code));
    const p = this.player(name,0); const now=Date.now();
    const room:Room = {code,hostId:p.id,createdAt:now,updatedAt:now,version:1,maxPlayers,timeoutSeconds:timeoutSeconds??this.defaultTimeout,deadline:null,game:createGame([p],randomBytes(4).readUInt32LE())};
    const token = randomBytes(32).toString('base64url'); this.store.addIdentity(room,p.id,hash(token)); this.rooms.set(code,room);
    return {identity:{roomCode:code,playerId:p.id,token},room:this.view(room,p.id)};
  }
  join(code: string, name: string): {identity:Identity;room:RoomView} {
    const original=this.get(code); if(original.game.phase!=='lobby') throw Error('比赛已经开始，席位已锁定。原玩家请使用原浏览器重连。');
    if(original.game.players.length >= original.maxPlayers) throw Error('房间已满。');
    const room=structuredClone(original); const p=this.player(name,room.game.players.length); room.game.players.push(p); room.version++; room.updatedAt=Date.now();
    const token=randomBytes(32).toString('base64url'); this.store.addIdentity(room,p.id,hash(token)); this.rooms.set(room.code,room);
    return {identity:{roomCode:room.code,playerId:p.id,token},room:this.view(room,p.id)};
  }
  authenticate(identity: Identity): Room {
    const room=this.get(identity.roomCode); const expected=this.store.identity(room.code,identity.playerId);
    if(!expected || !room.game.players.some(p=>p.id===identity.playerId)) throw Error('身份已失效。请使用原浏览器和邀请链接恢复。');
    const actual=hash(identity.token); if(!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))) throw Error('重连凭据无效。请使用原浏览器。'); return room;
  }
  presence(code: string, id: string, connected: boolean): void {
    const original=this.get(code); if(original.game.players.find(p=>p.id===id)?.connected===connected) return;
    const room=structuredClone(original); room.game.players.find(p=>p.id===id)!.connected=connected;
    if(!room.game.players.some(p=>p.id===room.hostId && p.connected)) {
      const next=room.game.players.find(p=>p.connected); if(next) room.hostId=next.id;
    }
    room.version++; this.store.save(room); this.rooms.set(code,room);
  }
  act(code: string, id: string, envelope: ActionEnvelope, automatic=false): ActionReply {
    const original=this.get(code); const request=JSON.stringify(envelope.action);
    const receipt=this.store.receipt(code,id,envelope.actionId);
    if(receipt) return receipt.request===request ? {...receipt.result,duplicate:true} : {ok:false,error:'同一操作编号不能用于不同操作。'};
    if(original.version!==envelope.expectedVersion) return {ok:false,error:'画面已更新，请同步后重试。',version:original.version};
    const room=structuredClone(original);
    try {
      const p=room.game.players.find(p=>p.id===id); if(!p) throw Error('你不在这个房间中。');
      if(automatic)room.game.logs.push({id:(room.game.logs.at(-1)?.id??0)+1,type:'timeout',text:`${p.name}操作超时，按公开房规执行合法默认选择。`});
      switch(envelope.action.type) {
        case 'ready': if(room.game.phase!=='lobby') throw Error('只能在大厅准备。'); p.ready=envelope.action.ready; break;
        case 'start':
          if(room.hostId!==id) throw Error('只有房主能开始比赛。');
          if(room.game.phase!=='lobby' || room.game.players.length<2 || !room.game.players.every(p=>p.ready&&p.connected)) throw Error('需要至少2名玩家，且全员在线并准备。');
          startGame(room.game); break;
        case 'transfer':
          if(room.hostId!==id) throw Error('只有房主能移交管理权。');
          if(!room.game.players.some(p=>p.id===(envelope.action as {playerId:string}).playerId && p.connected)) throw Error('请选择在线玩家。');
          room.hostId=envelope.action.playerId; break;
        case 'rematch':
          if(room.hostId!==id || room.game.phase!=='finished') throw Error('终局后由房主再来一局。');
          room.game=createGame(room.game.players.map(p=>({...p,ready:false,score:0,hand:[],used:[],selection:[]})),randomBytes(4).readUInt32LE()); break;
        default: applyGameAction(room.game,id,envelope.action);
      }
      room.version++;room.updatedAt=Date.now(); this.deadline(room);
      const result={ok:true,version:room.version}; this.store.commitAction(room,id,envelope.actionId,request,result); this.rooms.set(code,room); return result;
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:'操作失败，请重试。',version:original.version}; }
  }
  deadline(room: Room): void { room.deadline=room.timeoutSeconds>0 && automaticAction(room.game) ? Date.now()+room.timeoutSeconds*1000 : null; }
  tick(now=Date.now()): string[] {
    const updated:string[]=[];
    for(const original of this.rooms.values()) if(original.deadline && original.deadline<=now) {
      const a=automaticAction(original.game); if(!a) continue;
      const result=this.act(original.code,a.playerId,{actionId:randomUUID(),expectedVersion:original.version,action:a.action},true);
      if(result.ok) updated.push(original.code);
    }
    return updated;
  }
  view(room: Room, id: string): RoomView {
    const g=room.game; const pending=g.pending;
    return {code:room.code,version:room.version,hostId:room.hostId,selfId:id,maxPlayers:room.maxPlayers,timeoutSeconds:room.timeoutSeconds,deadline:room.deadline,phase:g.phase,round:g.round,track:g.track,
      players:g.players.map(({hand,selection,...p})=>({...p,handCount:hand.length,selected:selection.length>0,...(p.id===id?{hand:[...hand],selection:[...selection]}:{})})),
      draft:g.draft?structuredClone(g.draft):undefined,racers:structuredClone(g.racers),currentRacerId:g.currentRacerId,
      pending:pending?.playerId===id?{id:pending.id,playerId:pending.playerId,racerId:pending.racerId,title:pending.title,options:structuredClone(pending.options),optional:pending.optional,kind:pending.kind}:undefined,
      waitingFor:pending?.playerId,logs:structuredClone(g.logs.slice(-120)),results:structuredClone(g.results),lastRoll:g.lastRoll?{...g.lastRoll}:undefined,rulesStatus:'CMYK 2025 基础盒 · IELLO 2026-08-28 修订核验'};
  }
}
