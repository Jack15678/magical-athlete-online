import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.js';
import type { Identity, RoomView, ActionReply, GameAction } from '../src/shared/types.js';
import { automaticAction,applyGameAction } from '../src/engine/index.js';

async function running(db=':memory:') {const a=createApplication(db);await new Promise<void>(r=>a.http.listen(0,'127.0.0.1',r));const addr=a.http.address();assert(addr&&typeof addr==='object');return {...a,url:`http://127.0.0.1:${addr.port}`};}
async function post(url:string,path:string,data:unknown) {const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
async function connect(url:string,identity:Identity) {const socket=io(url,{auth:identity,transports:['websocket'],reconnection:false,forceNew:true});let view:RoomView|undefined;socket.on('snapshot',s=>view=s);await new Promise<void>((r,j)=>{socket.once('connect',()=>r());socket.once('connect_error',j);});await new Promise<void>((r,j)=>{if(view)return r();const t=setTimeout(()=>j(Error('snapshot timeout')),3000);socket.once('snapshot',()=>{clearTimeout(t);r();});});return {socket,get view(){assert(view);return view;}};}
async function emit(socket:Socket,envelope:unknown):Promise<ActionReply> {return await new Promise((r,j)=>socket.timeout(4000).emit('action',envelope,(e:Error|null,a:ActionReply)=>e?j(e):r(a)));}

test('2..8独立身份、昵称重复、满员、非房主、版本/幂等、暗选隔离',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try{for(let n=2;n<=8;n++) {
    const created=await post(app.url,'/api/rooms',{name:'同名',maxPlayers:n,timeoutSeconds:0});assert.equal(created.status,201);
    const identities:Identity[]=[created.body.identity];for(let i=1;i<n;i++){const joined=await post(app.url,`/api/rooms/${created.body.identity.roomCode}/join`,{name:'同名'});assert.equal(joined.status,201);identities.push(joined.body.identity);}
    assert.equal(new Set(identities.map(i=>i.playerId)).size,n);assert.equal((await post(app.url,`/api/rooms/${identities[0]!.roomCode}/join`,{name:'超员'})).status,400);
    const clients=[];for(const identity of identities){const c=await connect(app.url,identity);sockets.push(c.socket);clients.push(c);}
    const code=identities[0]!.roomCode;for(const identity of identities){const room=app.rooms.get(code);const r=app.rooms.act(code,identity.playerId,{actionId:randomUUID(),expectedVersion:room.version,action:{type:'ready',ready:true}});assert(r.ok);}
    assert.equal(app.rooms.act(code,identities[1]!.playerId,{actionId:randomUUID(),expectedVersion:app.rooms.get(code).version,action:{type:'start'}}).ok,false);
    const actionId=randomUUID();const expectedVersion=app.rooms.get(code).version;const env={actionId,expectedVersion,action:{type:'start'} as GameAction};const first=await emit(clients[0]!.socket,env);assert(first.ok);
    const duplicate=await emit(clients[0]!.socket,env);assert(duplicate.ok&&duplicate.duplicate);assert.equal(duplicate.version,first.version);
    assert.equal((await emit(clients[0]!.socket,{...env,action:{type:'roll'}})).ok,false);
    assert.equal((await emit(clients[1]!.socket,{actionId:randomUUID(),expectedVersion,action:{type:'roll'}})).ok,false);
    assert.equal(app.rooms.get(code).game.phase,'draft');
    while(app.rooms.get(code).game.phase==='draft'){const room=app.rooms.get(code),d=room.game.draft!;const r=app.rooms.act(code,d.order[d.cursor]!,{actionId:randomUUID(),expectedVersion:room.version,action:{type:'draft',characterId:d.market[0]!}});assert(r.ok,r.error);}
    const state=app.rooms.get(code);assert.equal(state.game.phase,'selection');const p=state.game.players[0]!,selection=p.hand.slice(0,n===2?2:1);const before=app.rooms.view(state,identities[1]!.playerId);
    assert(app.rooms.act(code,p.id,{actionId:randomUUID(),expectedVersion:state.version,action:{type:'select',characterIds:selection}}).ok);
    const after=app.rooms.view(app.rooms.get(code),identities[1]!.playerId);assert.equal(after.players[0]!.hand,undefined);assert.equal(after.players[0]!.selection,undefined);assert.deepEqual(after.players[0]!.used,before.players[0]!.used);assert.equal(after.racers.length,0);assert(after.players[0]!.selected);
    assert.equal((await post(app.url,`/api/rooms/${code}/join`,{name:'中途'})).status,400);
    for(const c of clients)c.socket.disconnect();
  }}finally{for(const s of sockets)s.disconnect();await app.close();}
});

test('持久化、重连认证、待处理选择、去重在服务重启后仍保留',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'athlete-persist-'));let app=await running(join(dir,'rooms.sqlite'));
  try{const c=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0}),j=await post(app.url,`/api/rooms/${c.body.identity.roomCode}/join`,{name:'朋友'});const identities:Identity[]=[c.body.identity,j.body.identity];
    for(const i of identities){const p=app.rooms.get(i.roomCode).game.players.find(p=>p.id===i.playerId)!;p.connected=true;}
    const identity=identities[0]!;const env={actionId:randomUUID(),expectedVersion:app.rooms.get(identity.roomCode).version,action:{type:'ready',ready:true} as GameAction};assert(app.rooms.act(identity.roomCode,identity.playerId,env).ok);
    const apply=(id:string,action:GameAction)=>{const room=app.rooms.get(identity.roomCode);const result=app.rooms.act(room.code,id,{actionId:randomUUID(),expectedVersion:room.version,action});assert(result.ok,result.error);};
    apply(identities[1]!.playerId,{type:'ready',ready:true});apply(identity.playerId,{type:'start'});
    let budget=0;while(!app.rooms.get(identity.roomCode).game.pending){assert(++budget<1000);const a=automaticAction(app.rooms.get(identity.roomCode).game);assert(a);apply(a.playerId,a.action);}
    const before=structuredClone(app.rooms.get(identity.roomCode));await app.close();app=await running(join(dir,'rooms.sqlite'));
    const restored=app.rooms.authenticate(identity);assert.deepEqual(restored.game.players.map(p=>p.score),before.game.players.map(p=>p.score));assert.equal(restored.version,before.version);assert.equal(restored.game.players[0]!.ready,true);assert(app.rooms.act(identity.roomCode,identity.playerId,env).duplicate);
    const json=(v:unknown)=>JSON.parse(JSON.stringify(v));
    assert.deepEqual(restored.game.pending,json(before.game.pending));assert.deepEqual(restored.game.queue,json(before.game.queue));assert.deepEqual(restored.game.randomLog,before.game.randomLog);
    const expectedGame=structuredClone(before.game),actualGame=structuredClone(restored.game);expectedGame.players.forEach(p=>p.connected=false);const a=automaticAction(actualGame);assert(a);applyGameAction(expectedGame,a.playerId,a.action);applyGameAction(actualGame,a.playerId,a.action);assert.deepEqual(json(actualGame),json(expectedGame));
    assert.throws(()=>app.rooms.authenticate({...identity,token:'x'.repeat(43)}),/凭据/);
    const client=await connect(app.url,identity);assert.equal(client.view.selfId,identity.playerId);client.socket.disconnect();
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('提交失败不能确认成功或改变内存状态',async()=>{
  const app=await running();try {const c=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0});const i=c.body.identity as Identity;const before=structuredClone(app.rooms.get(i.roomCode));const commit=app.store.commitAction.bind(app.store);app.store.commitAction=()=>{throw Error('模拟磁盘写入失败');};const r=app.rooms.act(i.roomCode,i.playerId,{actionId:randomUUID(),expectedVersion:before.version,action:{type:'ready',ready:true}});assert.equal(r.ok,false);assert.deepEqual(app.rooms.get(i.roomCode),before);app.store.commitAction=commit;}finally{await app.close();}
});
