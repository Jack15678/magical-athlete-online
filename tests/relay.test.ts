import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { ActionEnvelope, Identity, RoomView } from '../src/shared/types.js';
import type { RelayJoinReply } from '../src/shared/relay.js';

// Exercise the real relay handlers. Only the platform base class, persistent
// storage, and socket transport are substituted; rule/network logic is not.
const platformUrl='data:text/javascript,'+encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx=ctx; this.env=env; } }');
registerHooks({ resolve(specifier,context,nextResolve) {
  return specifier==='cloudflare:workers' ? {url:platformUrl,shortCircuit:true} : nextResolve(specifier,context);
} });
const workerPath=new URL('../src/worker/index.ts',import.meta.url).href;
const worker=await import(workerPath);
(globalThis as Record<string,unknown>).WebSocketRequestResponsePair=class { constructor(readonly request:string,readonly response:string){} };

class Socket {
  readyState=1; attachment:unknown; sent:any[]=[]; closeCode?:number;lastAutoResponseAt:Date|null=null;
  serializeAttachment(value:unknown){this.attachment=structuredClone(value);}
  deserializeAttachment(){return structuredClone(this.attachment);}
  send(value:string){if(this.readyState!==1)throw Error('socket closed');this.sent.push(JSON.parse(value));}
  close(code:number){this.closeCode=code;this.readyState=3;}
  clear(){this.sent=[];}
}
(globalThis as Record<string,unknown>).WebSocketPair=class {0=new Socket();1=new Socket();};
class Storage {
  values=new Map<string,unknown>();alarmAt:number|null=null;failPut?:string;failAlarm=false;
  async get<T>(key:string):Promise<T|undefined>{return structuredClone(this.values.get(key)) as T|undefined;}
  async put(key:string,value:unknown){if(this.failPut===key){this.failPut=undefined;throw Error('simulated storage write failure');}this.values.set(key,structuredClone(value));}
  async delete(keys:string|string[]){let removed=0;for(const key of Array.isArray(keys)?keys:[keys])if(this.values.delete(key))removed++;return removed;}
  async getAlarm(){return this.alarmAt;}
  async setAlarm(at:number){if(this.failAlarm){this.failAlarm=false;throw Error('simulated alarm write failure');}this.alarmAt=at;}
  async deleteAlarm(){this.alarmAt=null;}
  async deleteAll(){this.values.clear();this.alarmAt=null;}
  async transaction<T>(callback:(tx:Storage)=>Promise<T>):Promise<T>{
    const before=structuredClone(this.values),alarm=this.alarmAt;
    try{return await callback(this);}catch(error){this.values=before;this.alarmAt=alarm;throw error;}
  }
}
class Context {
  sockets:Socket[]=[];pending:Promise<unknown>[]=[];autoResponse:unknown;
  constructor(readonly storage=new Storage()){}
  blockConcurrencyWhile(callback:()=>Promise<unknown>){const pending=callback();this.pending.push(pending);return pending;}
  getWebSockets(){return this.sockets;}
  acceptWebSocket(socket:Socket){this.sockets.push(socket);}
  setWebSocketAutoResponse(value:unknown){this.autoResponse=value;}
  getWebSocketAutoResponseTimestamp(socket:Socket){return socket.lastAutoResponseAt;}
  async ready(){await Promise.all(this.pending);}
}
async function instance(storage=new Storage(),sockets:Socket[]=[]){const ctx=new Context(storage);ctx.sockets=sockets;const relay=new worker.RoomRelay(ctx,{});await ctx.ready();return {ctx,relay};}
async function create(maxPlayers=8){
  const env=await instance();const response=await env.relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:JSON.stringify({name:'同名',maxPlayers,timeoutSeconds:120})}));
  assert.equal(response.status,201);return {...env,created:await response.json() as RelayJoinReply};
}
function connect(ctx:Context,acceptedAt=Date.now()){
  const socket=new Socket();socket.serializeAttachment({connectionId:crypto.randomUUID(),acceptedAt,windowAt:Date.now(),count:0});ctx.acceptWebSocket(socket);return socket;
}
async function authenticate(env:Awaited<ReturnType<typeof create>>,identity=env.created.identity,authority=false){
  const socket=connect(env.ctx);await env.relay.webSocketMessage(socket,JSON.stringify({type:'auth',identity,authority}));return socket;
}
async function join(env:Awaited<ReturnType<typeof create>>){
  const response=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:JSON.stringify({name:'同名'})}));
  assert.equal(response.status,201);return await response.json() as RelayJoinReply;
}
const act=(type:'start'|'roll'|'close'='roll'):ActionEnvelope=>({actionId:crypto.randomUUID(),expectedVersion:1,action:{type}});
async function deliver(env:Awaited<ReturnType<typeof create>>,host:Socket,to:string,view:RoomView,requestId?:string){
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to,room:view,phase:view.phase,adminHostId:env.created.identity.playerId,...(requestId?{requestId,result:{ok:true,version:view.version}}:{})}));
}

test('relay creates distinct opaque identities for duplicate names and enforces capacity',async()=>{
  const env=await create(2);await authenticate(env,env.created.identity,true);const guest=await join(env);
  assert.equal(guest.identity.token.length,43);assert.notEqual(guest.identity.playerId,env.created.identity.playerId);
  assert.equal(guest.meta.members[0]!.name,guest.meta.members[1]!.name);
  assert.ok(!JSON.stringify(guest.meta).includes(env.created.identity.token));
  const stored=await env.ctx.storage.get<any>('room');assert.notEqual(stored.members[0].tokenHash,env.created.identity.token);assert.match(stored.members[0].tokenHash,/^[a-f0-9]{64}$/);
  const full=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"三号"}'}));assert.equal(full.status,409);
});
test('relay rejects invalid credentials, non-creator authority, and unauthenticated actions',async()=>{
  const env=await create();await authenticate(env,env.created.identity,true);const guest=await join(env);
  const invalid=await authenticate(env,{...guest.identity,token:'A'.repeat(43)});assert.equal(invalid.closeCode,4401);
  const impostor=await authenticate(env,guest.identity,true);assert.equal(impostor.closeCode,4401);
  const missing=connect(env.ctx);await env.relay.webSocketMessage(missing,JSON.stringify({type:'action',requestId:'unauthed',envelope:act()}));assert.equal(missing.closeCode,4401);
});
test('relay derives actor from authenticated connection and rejects actor injection',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);
  host.clear();await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId:'legal',envelope:act()}));
  assert.equal(host.sent.find(m=>m.type==='request').playerId,guest.identity.playerId);
  host.clear();await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId:'forged',playerId:env.created.identity.playerId,envelope:act()}));
  assert.equal(host.sent.length,0);assert.match(socket.sent.at(-1).message,/格式/);
});
test('relay targets private snapshots by identity, rejects guest delivery, and preserves viewer connections',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity),viewer=await authenticate(env);
  const privateView={...guest.room,version:2,players:guest.room.players.map(p=>p.id===guest.identity.playerId?{...p,hand:['secret-card'],handCount:1}:p)};
  host.clear();viewer.clear();socket.clear();await deliver(env,host,guest.identity.playerId,privateView,'private-sync');
  assert.equal(socket.sent.find(m=>m.type==='snapshot').requestId,'private-sync');
  assert.equal(socket.sent.find(m=>m.type==='snapshot').room.players.find((p:any)=>p.id===guest.identity.playerId).hand[0],'secret-card');
  assert.ok(!JSON.stringify(host.sent).includes('secret-card'));assert.ok(!JSON.stringify(viewer.sent).includes('secret-card'));assert.equal(host.readyState,1);
  host.clear();await deliver(env,socket,env.created.identity.playerId,{...env.created.room,version:2});assert.equal(host.sent.length,0);assert.match(socket.sent.at(-1).message,/只有当前主持/);
  socket.clear();await deliver(env,host,guest.identity.playerId,{...privateView,selfId:env.created.identity.playerId});assert.ok(!socket.sent.some(m=>m.type==='snapshot'));
  socket.clear();await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:guest.identity.playerId,room:privateView,requestId:'fresh-sync',phase:'lobby',adminHostId:env.created.identity.playerId}));
  assert.equal(socket.sent.find(m=>m.type==='snapshot').requestId,'fresh-sync');assert.ok(!socket.sent.some(m=>m.type==='ack'));
});
test('relay restores identity routing and private cached state after hibernation reconstruction',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);
  await deliver(env,host,guest.identity.playerId,{...guest.room,version:7});
  const restored=await instance(env.ctx.storage,env.ctx.sockets);host.clear();
  await restored.relay.webSocketMessage(socket,JSON.stringify({type:'sync',requestId:'wake'}));assert.equal(host.sent.at(-1).playerId,guest.identity.playerId);
  const reconnect=connect(restored.ctx);await restored.relay.webSocketMessage(reconnect,JSON.stringify({type:'auth',identity:guest.identity}));
  assert.equal(reconnect.sent.find(m=>m.type==='snapshot').room.version,7);
  assert.equal(reconnect.sent.find(m=>m.type==='snapshot').requestId,undefined);
});
test('relay admits no new seat between start intent and its matching confirmation',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);await join(env);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'start-game',envelope:act('start')}));
  const admission=()=>env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"新玩家"}'}));
  assert.equal((await admission()).status,409);
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,version:2});assert.equal((await admission()).status,409);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,phase:'lobby',adminHostId:env.created.identity.playerId,requestId:'start-game',result:{ok:false,error:'未准备'}}));
  assert.equal((await admission()).status,201);
});
test('relay replaces an authority session without granting a viewer authority',async()=>{
  const env=await create(),old=await authenticate(env,env.created.identity,true),viewer=await authenticate(env),next=await authenticate(env,env.created.identity,true);
  assert.equal(old.closeCode,4409);assert.equal(viewer.readyState,1);assert.equal(next.sent.find(m=>m.type==='auth-ok').authority,true);
  await deliver(env,viewer,env.created.identity.playerId,{...env.created.room,version:2});assert.match(viewer.sent.at(-1).message,/只有当前主持/);
});
test('relay storage failure leaves no ghost seat or misleading success',async()=>{
  const env=await create();await authenticate(env,env.created.identity,true);env.ctx.storage.failPut='room';
  const response=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"失败席位"}'}));assert.equal(response.status,503);
  assert.equal((await env.ctx.storage.get<any>('room')).members.length,1);
  const guest=await join(env);assert.equal(guest.meta.members.length,2);assert.equal(guest.meta.members[1]!.seat,1);
});
test('relay room creation atomically commits its metadata and expiry alarm',async()=>{
  const {ctx,relay}=await instance();ctx.storage.failAlarm=true;
  const response=await relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:'{"name":"创建者","maxPlayers":8,"timeoutSeconds":120}'}));
  assert.equal(response.status,503);assert.equal(await ctx.storage.get('room'),undefined);assert.equal(ctx.storage.alarmAt,null);
  const retry=await relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:'{"name":"创建者","maxPlayers":8,"timeoutSeconds":120}'}));assert.equal(retry.status,201);
});
test('relay does not accept a socket if its authentication deadline cannot be stored',async()=>{
  const env=await create();env.ctx.storage.failAlarm=true;
  const response=await env.relay.fetch(new Request('https://room.internal/ws/ABC234',{headers:{Upgrade:'websocket'}}));
  assert.equal(response.status,503);assert.equal(env.ctx.sockets.filter(s=>s.readyState===1).length,0);
});
test('relay snapshot write failure rolls back accompanying phase and admission changes',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);
  socket.clear();env.ctx.storage.failPut='view:'+guest.identity.playerId;
  await deliver(env,host,guest.identity.playerId,{...guest.room,phase:'draft',version:2});
  assert.equal((await env.ctx.storage.get<any>('room')).phase,'lobby');assert.ok(!socket.sent.some(m=>m.type==='snapshot'));
  assert.equal((await join(env)).meta.phase,'lobby');
});
test('relay expires unauthenticated sockets, pauses without authority, and clears expired room data',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity),pending=connect(env.ctx,Date.now()-20_000);
  await env.relay.alarm();assert.equal(pending.closeCode,4401);
  socket.clear();await env.relay.webSocketClose(host,1000,'close',true);assert.equal(socket.sent.find(m=>m.type==='host-status').online,false);
  await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId:'offline',envelope:act()}));assert.match(socket.sent.at(-1).message,/主持网页离线/);
  const record=await env.ctx.storage.get<any>('room');record.expiresAt=1;await env.ctx.storage.put('room',record);
  const restored=await instance(env.ctx.storage,env.ctx.sockets);await restored.relay.alarm();assert.equal(env.ctx.storage.values.size,0);assert.equal(socket.closeCode,4404);
});
test('worker rejects cross-origin access and oversized or invalid room parameters',async()=>{
  const env={ASSETS:{fetch:()=>new Response('asset')},ROOMS:{}};
  const post=(payload:unknown,origin='https://game.test')=>new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{Origin:origin},body:JSON.stringify(payload)});
  assert.equal((await worker.default.fetch(post({name:'玩家'},'https://elsewhere.test'),env)).status,403);
  assert.equal((await worker.default.fetch(post({name:'玩家',maxPlayers:9}),env)).status,400);
  assert.equal((await worker.default.fetch(post({name:'玩家',timeoutSeconds:1}),env)).status,400);
  for(const mode of [[],['ai'],['practice'],{},1,true,'AI'])assert.equal((await worker.default.fetch(post({name:'玩家',mode}),env)).status,400,JSON.stringify(mode));
  assert.equal((await worker.default.fetch(post({name:'a'.repeat(5000)}),env)).status,413);
  assert.equal((await worker.default.fetch(new Request('https://game.test/room/ABC234'),env)).status,200);
});
test('relay retires a ghost authority and broadcasts pause when its heartbeat lease expires',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);
  const state=host.deserializeAttachment() as any;state.authorityLeaseAt=Date.now()-40_000;host.serializeAttachment(state);socket.clear();
  await env.relay.alarm();assert.equal(host.closeCode,4408);assert.equal(socket.sent.find(m=>m.type==='host-status').online,false);
  const response=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"稍候"}'}));assert.equal(response.status,409);
  await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId:'ghost',envelope:act()}));assert.match(socket.sent.at(-1).message,/主持网页离线/);
});
test('relay uses platform auto-response timestamps after hibernation to preserve a healthy authority lease',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);
  const state=host.deserializeAttachment() as any;state.authorityLeaseAt=Date.now()-40_000;host.serializeAttachment(state);host.lastAutoResponseAt=new Date(Date.now()-5_000);
  const restored=await instance(env.ctx.storage,env.ctx.sockets);await restored.relay.alarm();
  assert.equal(host.readyState,1);assert.ok(env.ctx.storage.alarmAt!>Date.now()+29_000);assert.ok(env.ctx.storage.alarmAt!<=Date.now()+30_000);
  const next=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"在线加入"}'}));assert.equal(next.status,201);
});
test('relay refuses authority authentication if its lease expiry cannot be scheduled',async()=>{
  const env=await create();env.ctx.storage.failAlarm=true;const host=await authenticate(env,env.created.identity,true);
  assert.equal(host.closeCode,1013);assert.ok(!host.sent.some(m=>m.type==='auth-ok'));
  const response=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"不能加入"}'}));assert.equal(response.status,409);
});
test('relay alarm storage failure cannot leave an authority online with an unguarded lease',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);
  socket.clear();host.lastAutoResponseAt=new Date();env.ctx.storage.failAlarm=true;
  await assert.rejects(env.relay.alarm(),/simulated alarm write failure/);
  assert.equal(host.closeCode,1013);assert.equal(socket.sent.find(m=>m.type==='host-status').online,false);
});

async function closeIntent(env:Awaited<ReturnType<typeof create>>,actor:Socket,requestId='close-room',envelope=act('close')){
  await env.relay.webSocketMessage(actor,JSON.stringify({type:'action',requestId,envelope}));return {requestId,envelope};
}
for(const phase of ['lobby','race'] as const)test(`relay close in ${phase} commits a tombstone before ack and closes every identity`,async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity),viewer=await authenticate(env);
  await deliver(env,host,guest.identity.playerId,{...guest.room,phase,version:2});
  host.clear();peer.clear();viewer.clear();await closeIntent(env,host);
  const closedAt=Date.now(),closedView={...env.created.room,phase,version:3,closedAt};
  await deliver(env,host,env.created.identity.playerId,closedView,'close-room');
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.closedAt,closedAt);assert.equal(stored.pendingClose,undefined);
  assert.equal(await env.ctx.storage.get('view:'+guest.identity.playerId),undefined);
  assert.ok(stored.expiresAt>=closedAt+30*86_400_000);assert.equal(env.ctx.storage.alarmAt,stored.expiresAt);
  for(const socket of [host,peer,viewer]){assert.equal(socket.closeCode,4410);assert.equal(socket.sent.find(m=>m.type==='room-closed').closedAt,closedAt);}
  const ack=host.sent.findIndex(m=>m.type==='ack');assert.ok(ack>=0);assert.equal(host.sent[ack].result.ok,true);
  assert.ok(ack<host.sent.findIndex(m=>m.type==='room-closed'));
  assert.equal(host.sent.find(m=>m.type==='snapshot').room.authorityOnline,false);
  assert.ok(!peer.sent.some(m=>m.type==='ack'));
});
test('relay close permission follows the current management host rather than the browser authority',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:guest.identity.playerId,room:{...guest.room,hostId:guest.identity.playerId,version:2},phase:'lobby',adminHostId:guest.identity.playerId}));
  host.clear();await closeIntent(env,host,'creator-is-not-admin');
  assert.match(host.sent.at(-1).message,/只有当前管理房主/);assert.ok(!host.sent.some(m=>m.type==='request'));assert.equal((await env.ctx.storage.get<any>('room')).pendingClose,undefined);
  host.clear();await closeIntent(env,peer,'admin-close');assert.equal(host.sent.find(m=>m.type==='request').playerId,guest.identity.playerId);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:guest.identity.playerId,requestId:'admin-close',result:{ok:true,version:3},room:{...guest.room,hostId:guest.identity.playerId,version:3,closedAt:Date.now()},phase:'lobby',adminHostId:guest.identity.playerId}));
  assert.equal(peer.sent.find(m=>m.type==='ack').result.ok,true);assert.equal(peer.closeCode,4410);
});
test('relay close requires the exact authorized pending receipt and failed intent unlocks the room',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env);host.clear();
  const projection={...env.created.room,version:2,closedAt:Date.now()};
  await deliver(env,host,env.created.identity.playerId,projection,'forged-close');
  assert.equal((await env.ctx.storage.get<any>('room')).closedAt,undefined);assert.ok(!host.sent.some(m=>m.type==='room-closed'||m.type==='ack'));
  const intent=await closeIntent(env,host,'legitimate-close');await closeIntent(env,host,'negative-retry',intent.envelope);host.clear();
  await deliver(env,host,env.created.identity.playerId,projection,'wrong-confirmation');
  assert.equal((await env.ctx.storage.get<any>('room')).closedAt,undefined);assert.equal(host.readyState,1);
  const blocked=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"等待"}'}));assert.equal(blocked.status,409);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,requestId:'legitimate-close',result:{ok:false,error:'画面已更新'},phase:'lobby',adminHostId:env.created.identity.playerId}));
  assert.equal(host.sent.find(m=>m.type==='ack').result.ok,false);assert.equal((await env.ctx.storage.get<any>('room')).pendingClose,undefined);
  assert.deepEqual(host.sent.filter(m=>m.type==='ack').map(m=>m.requestId).sort(),['legitimate-close','negative-retry']);
  assert.equal((await join(env)).meta.members.length,3);assert.equal(guest.identity.roomCode,'ABC234');
});
test('relay close storage failures never announce success or partially delete private caches',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await deliver(env,host,guest.identity.playerId,{...guest.room,version:2});host.clear();peer.clear();
  env.ctx.storage.failPut='room';await closeIntent(env,host,'intent-write-fails');
  assert.equal((await env.ctx.storage.get<any>('room')).pendingClose,undefined);assert.ok(!host.sent.some(m=>m.type==='request'));
  const pending=await closeIntent(env,host,'close-commit-fails');host.clear();env.ctx.storage.failAlarm=true;
  const projection={...env.created.room,version:3,closedAt:Date.now()};await deliver(env,host,env.created.identity.playerId,projection,pending.requestId);
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.closedAt,undefined);assert.equal(stored.pendingClose.requestId,pending.requestId);
  assert.equal((await env.ctx.storage.get<any>('view:'+guest.identity.playerId)).version,2);
  for(const socket of [host,peer]){assert.equal(socket.readyState,1);assert.ok(!socket.sent.some(m=>m.type==='room-closed'||(m.type==='ack'&&m.result.ok)));}
  host.clear();await env.relay.webSocketMessage(host,JSON.stringify({type:'sync',requestId:'recover-failed-close'}));
  const replay=host.sent.find(m=>m.type==='request');
  assert.deepEqual(replay,{type:'request',playerId:env.created.identity.playerId,requestId:pending.requestId,operation:'action',envelope:pending.envelope});
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:replay.playerId,requestId:replay.requestId,result:{ok:true,duplicate:true,version:projection.version},room:projection,phase:projection.phase,adminHostId:env.created.identity.playerId}));
  assert.equal((await env.ctx.storage.get<any>('room')).closedAt,projection.closedAt);
  assert.ok(host.sent.some(m=>m.type==='ack'&&m.requestId===pending.requestId&&m.result.ok&&m.result.duplicate));
  for(const socket of [host,peer]){assert.equal(socket.readyState,3);assert.ok(socket.sent.some(m=>m.type==='room-closed'&&m.closedAt===projection.closedAt));}
});
test('relay close survives reconstruction and returning sockets receive the explicit closed terminal state',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);await closeIntent(env,host);const closedAt=Date.now();
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,version:2,closedAt},'close-room');
  const restored=await instance(env.ctx.storage);
  const joining=await restored.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"回来"}'}));assert.equal(joining.status,410);assert.match((await joining.json()).error,/房间已解散/);
  for(const message of [{type:'auth',identity:env.created.identity,authority:true},{type:'sync',requestId:'closed-sync'},{type:'action',requestId:'closed-action',envelope:act()},{type:'deliver',to:env.created.identity.playerId,room:env.created.room,phase:'lobby',adminHostId:env.created.identity.playerId}]){
    const socket=connect(restored.ctx);await restored.relay.webSocketMessage(socket,JSON.stringify(message));assert.equal(socket.closeCode,4410);assert.equal(socket.sent.find(m=>m.type==='room-closed').closedAt,closedAt);assert.ok(!socket.sent.some(m=>m.type==='auth-ok'||m.type==='snapshot'||m.type==='ack'));
  }
  // Node's standard Response rejects 101; substitute only that platform response
  // shape to exercise the real closed-upgrade handler and its queued close.
  const NativeResponse=globalThis.Response;
  class UpgradeResponse extends NativeResponse {constructor(value:BodyInit|null,init:ResponseInit&{webSocket?:unknown}){super(value,{...init,status:init.status===101?200:init.status});if(init.status===101){Object.defineProperty(this,'status',{value:101});Object.defineProperty(this,'webSocket',{value:init.webSocket});}}}
  try{globalThis.Response=UpgradeResponse as typeof Response;
    const upgrade=await restored.relay.fetch(new Request('https://room.internal/ws/ABC234',{headers:{Upgrade:'websocket'}}));assert.equal(upgrade.status,101);
    const socket=restored.ctx.sockets.at(-1)!;assert.equal(socket.closeCode,4410);assert.equal(socket.sent[0].type,'room-closed');
  }finally{globalThis.Response=NativeResponse;}
});
test('relay close replays its durable pending receipt after authority recovery before final shutdown',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  const pending=await closeIntent(env,host,'recover-close');
  const restored={...env,...await instance(env.ctx.storage,env.ctx.sockets)},next=await authenticate(restored,env.created.identity,true);
  const replay=next.sent.find(m=>m.type==='request'&&m.requestId===pending.requestId);assert.equal(replay.playerId,env.created.identity.playerId);assert.deepEqual(replay.envelope,pending.envelope);
  const closedAt=Date.now();next.clear();peer.clear();
  // Recovered BrowserAuthority may broadcast closed projections before replay.
  await deliver(restored,next,guest.identity.playerId,{...guest.room,version:2,closedAt});assert.equal(next.readyState,1);assert.ok(!next.sent.some(m=>m.type==='error'));assert.ok(!peer.sent.some(m=>m.type==='room-closed'));
  await restored.relay.webSocketMessage(next,JSON.stringify({type:'deliver',to:env.created.identity.playerId,requestId:pending.requestId,result:{ok:true,duplicate:true,version:2},room:{...env.created.room,version:2,closedAt},phase:'lobby',adminHostId:env.created.identity.playerId}));
  assert.equal(next.sent.find(m=>m.type==='ack').result.duplicate,true);assert.equal((await env.ctx.storage.get<any>('room')).closedAt,closedAt);assert.equal(next.closeCode,4410);assert.equal(peer.closeCode,4410);
});
test('relay close retransmission preserves the original confirmation and rejects a conflicting action payload',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),first=await closeIntent(env,host,'close-original');
  await closeIntent(env,host,'close-retry',first.envelope);
  let stored=await env.ctx.storage.get<any>('room');assert.equal(stored.pendingClose.requestId,'close-original');assert.deepEqual(stored.pendingClose.duplicateRequestIds,['close-retry']);
  const forwarded=host.sent.filter(m=>m.type==='request').length;
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'conflicting-payload',envelope:{...first.envelope,action:{type:'ready',ready:true}}}));
  assert.match(host.sent.at(-1).message,/房间正在解散/);assert.equal(host.sent.filter(m=>m.type==='request').length,forwarded);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'extra-close-field',envelope:{...first.envelope,action:{type:'close',ready:true}}}));
  assert.match(host.sent.at(-1).message,/操作格式/);assert.equal(host.sent.filter(m=>m.type==='request').length,forwarded);
  host.clear();await deliver(env,host,env.created.identity.playerId,{...env.created.room,version:2,closedAt:Date.now()},'close-original');
  stored=await env.ctx.storage.get<any>('room');assert.ok(stored.closedAt!==undefined);
  assert.deepEqual(host.sent.filter(m=>m.type==='ack').map(m=>m.requestId).sort(),['close-original','close-retry']);
  assert.ok(host.sent.filter(m=>m.type==='ack').every(m=>m.result.ok));assert.equal(host.closeCode,4410);
});

test('relay solo creation reserves AI seats without login identities and keeps AI presence online',async()=>{
  for(const count of [1,2,8]){
    const env=await instance();const response=await env.relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:JSON.stringify({name:'自己',mode:count===1?'practice':'ai',aiCount:count-1,maxPlayers:count,timeoutSeconds:0})}));
    assert.equal(response.status,201);const created=await response.json() as RelayJoinReply;
    assert.equal(created.meta.mode,count===1?'practice':'ai');assert.equal(created.meta.members.length,count);
    assert(created.meta.members.slice(1).every(p=>p.isAI&&p.connected));assert(!created.meta.members[0]!.isAI);
    const stored=env.ctx.storage.values.get('room') as {members:{id:string;tokenHash:string;isAI?:boolean}[]};
    assert(stored.members.slice(1).every(p=>p.isAI&&p.tokenHash===''));
    const joined=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:JSON.stringify({name:'访客'})}));assert.equal(joined.status,409);
  }
});

test('worker mode accepts only exact strings and preserves the nullish multiplayer default',async()=>{
  let forwarded:Record<string,unknown>|undefined;
  const env={ASSETS:{fetch:()=>new Response('asset')},ROOMS:{idFromName:(code:string)=>code,get:()=>({fetch:async(_url:string,init:RequestInit)=>{forwarded=JSON.parse(String(init.body)) as Record<string,unknown>;return Response.json({ok:true},{status:201});}})}};
  for(const mode of [undefined,null,'multiplayer','practice','ai']){
    const request=new Request('https://game.test/api/browser/rooms',{method:'POST',body:JSON.stringify({name:'玩家',mode,aiCount:1})});
    const response=await worker.default.fetch(request,env);assert.equal(response.status,201);assert.equal(forwarded?.mode,mode??'multiplayer');
  }
});

test('relay event backfill derives the reader identity and only the authenticated authority may deliver public pages',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity),other=await authenticate(env);
  host.clear();peer.clear();other.clear();
  await env.relay.webSocketMessage(peer,JSON.stringify({type:'events',requestId:'missing-events',afterId:120}));
  assert.deepEqual(host.sent.find(message=>message.type==='request'),{type:'request',operation:'events',playerId:guest.identity.playerId,requestId:'missing-events',afterId:120});
  const batch={afterId:120,latestId:122,events:[{id:121,type:'power',text:'公开技能'},{id:122,type:'move',text:'公开位移'}]};
  await env.relay.webSocketMessage(peer,JSON.stringify({type:'deliver-events',to:guest.identity.playerId,requestId:'forged-events',batch}));assert.match(peer.sent.at(-1).message,/只有当前主持/);
  peer.clear();await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver-events',to:guest.identity.playerId,requestId:'missing-events',batch}));
  assert.deepEqual(peer.sent.find(message=>message.type==='events'),{type:'events',requestId:'missing-events',batch});assert(!other.sent.some(message=>message.type==='events'));
  peer.clear();other.clear();await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver-events',to:guest.identity.playerId,requestId:'event-error',error:'无法读取动画记录。'}));assert.deepEqual(peer.sent.at(-1),{type:'error',requestId:'event-error',message:'无法读取动画记录。'});assert.equal(other.sent.length,0);assert.equal(host.readyState,1);
  host.clear();await env.relay.webSocketMessage(peer,JSON.stringify({type:'events',requestId:'injected-reader',afterId:120,playerId:env.created.identity.playerId}));assert.equal(host.sent.length,0);assert.match(peer.sent.at(-1).message,/格式/);
});
