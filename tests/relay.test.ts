import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { ActionEnvelope, Identity, RoomView } from '../src/shared/types.js';
import { legacyRoomConfig } from '../src/shared/room-config.js';
import type { RelayJoinReply } from '../src/shared/relay.js';
import { MAX_SPECTATORS } from '../src/shared/constants.js';
import { PERSONAL_ROOM_AWAY_MS, ownerAwayMs } from '../src/shared/room-lifecycle.js';

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
  async list<T>(options:{prefix:string;limit?:number;startAfter?:string}){return new Map([...this.values.entries()].filter(([key])=>key.startsWith(options.prefix)&&(!options.startAfter||key>options.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,options.limit??1000).map(([key,value])=>[key,structuredClone(value) as T]));}
  async put(key:string,value:unknown){if(this.failPut===key){this.failPut=undefined;throw Error('simulated storage write failure');}this.values.set(key,structuredClone(value));}
  async delete(keys:string|string[]){let removed=0;for(const key of Array.isArray(keys)?keys:[keys])if(this.values.delete(key))removed++;return removed;}
  async getAlarm(){return this.alarmAt;}
  async setAlarm(at:number){if(at>Date.UTC(2189,11,31))throw TypeError('This API does not support dates after 2189');if(this.failAlarm){this.failAlarm=false;throw Error('simulated alarm write failure');}this.alarmAt=at;}
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
async function workerAction(env:Awaited<ReturnType<typeof create>>,socket:Socket,action:import('../src/shared/types.js').GameAction,requestId:string=crypto.randomUUID(),envelope?:ActionEnvelope){
  await env.relay.webSocketMessage(socket,JSON.stringify({type:'sync',requestId:'get-current'}));
  const current=socket.sent.filter(message=>message.type==='snapshot').at(-1)?.room as RoomView;
  const request=envelope??{actionId:crypto.randomUUID(),expectedVersion:current.version,action};
  await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId,envelope:request}));
  return {envelope:request,result:socket.sent.findLast(message=>message.type==='ack'&&message.requestId===requestId)?.result};
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
  assert.equal(guest.meta.members[0]!.name,'同名');assert.equal(guest.meta.members[1]!.name,'同名1');
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
  const record=await env.ctx.storage.get<any>('room');record.hostLeftAt=Date.now()-PERSONAL_ROOM_AWAY_MS;await env.ctx.storage.put('room',record);
  const restored=await instance(env.ctx.storage,env.ctx.sockets);await restored.relay.alarm();assert.equal(env.ctx.storage.values.size,1);assert.equal(socket.closeCode,4410);assert.equal((await env.ctx.storage.get<any>('closed')).reason,'host-away');
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
  const stored=await env.ctx.storage.get<any>('closed');assert.equal(stored.closedAt,closedAt);assert.equal(stored.reason,'dismissed');assert.equal(await env.ctx.storage.get('room'),undefined);
  assert.equal(await env.ctx.storage.get('view:'+guest.identity.playerId),undefined);
  assert.equal(env.ctx.storage.values.size,1);assert.equal(env.ctx.storage.alarmAt,null);
  for(const socket of [host,peer,viewer]){assert.equal(socket.closeCode,4410);assert.equal(socket.sent.find(m=>m.type==='room-closed').closedAt,closedAt);}
  const ack=host.sent.findIndex(m=>m.type==='ack');assert.ok(ack>=0);assert.equal(host.sent[ack].result.ok,true);
  assert.ok(ack<host.sent.findIndex(m=>m.type==='room-closed'));
  assert.ok(!host.sent.some(m=>m.type==='snapshot'));
  assert.ok(!peer.sent.some(m=>m.type==='ack'));
});
test('relay close permission follows the current management host rather than the browser authority',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'explicit-admin-transfer',envelope:{actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'transfer',playerId:guest.identity.playerId}}}));
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,requestId:'explicit-admin-transfer',result:{ok:true,version:2},room:{...env.created.room,hostId:guest.identity.playerId,version:2},phase:'lobby',adminHostId:guest.identity.playerId}));
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
  const pending=await closeIntent(env,host,'close-commit-fails');host.clear();env.ctx.storage.failPut='closed';
  const projection={...env.created.room,version:3,closedAt:Date.now()};await deliver(env,host,env.created.identity.playerId,projection,pending.requestId);
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.closedAt,undefined);assert.equal(stored.pendingClose.requestId,pending.requestId);
  assert.equal((await env.ctx.storage.get<any>('view:'+guest.identity.playerId)).version,2);
  for(const socket of [host,peer]){assert.equal(socket.readyState,1);assert.ok(!socket.sent.some(m=>m.type==='room-closed'||(m.type==='ack'&&m.result.ok)));}
  host.clear();await env.relay.webSocketMessage(host,JSON.stringify({type:'sync',requestId:'recover-failed-close'}));
  const replay=host.sent.find(m=>m.type==='request');
  assert.deepEqual(replay,{type:'request',playerId:env.created.identity.playerId,requestId:pending.requestId,operation:'action',envelope:pending.envelope});
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:replay.playerId,requestId:replay.requestId,result:{ok:true,duplicate:true,version:projection.version},room:projection,phase:projection.phase,adminHostId:env.created.identity.playerId}));
  assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,projection.closedAt);assert.equal(await env.ctx.storage.get('room'),undefined);
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
  assert.equal(next.sent.find(m=>m.type==='ack').result.duplicate,true);assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,closedAt);assert.equal(next.closeCode,4410);assert.equal(peer.closeCode,4410);
});
test('relay close retransmission preserves the original confirmation and rejects a conflicting action payload',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),first=await closeIntent(env,host,'close-original');
  await closeIntent(env,host,'close-retry',first.envelope);
  let stored=await env.ctx.storage.get<any>('room');assert.equal(stored.pendingClose.requestId,'close-original');assert.deepEqual(stored.pendingClose.duplicateRequestIds,['close-retry']);
  const forwarded=host.sent.filter(m=>m.type==='request').length;
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'conflicting-payload',envelope:{...first.envelope,action:{type:'ready',ready:true}}}));
  assert.match(host.sent.at(-1).message,/房间正在解散/);assert.equal(host.sent.filter(m=>m.type==='request').length,forwarded);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'close-transfer-conflict',envelope:{...first.envelope,action:{type:'transfer',playerId:env.created.identity.playerId}}}));
  assert.match(host.sent.at(-1).message,/房间正在解散/);assert.equal((await env.ctx.storage.get<any>('room')).pendingOwnerTransfer,undefined);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'extra-close-field',envelope:{...first.envelope,action:{type:'close',ready:true}}}));
  assert.match(host.sent.at(-1).message,/操作格式/);assert.equal(host.sent.filter(m=>m.type==='request').length,forwarded);
  host.clear();await deliver(env,host,env.created.identity.playerId,{...env.created.room,version:2,closedAt:Date.now()},'close-original');
  stored=await env.ctx.storage.get<any>('closed');assert.ok(stored.closedAt!==undefined);assert.equal(await env.ctx.storage.get('room'),undefined);
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
  const ns=await namespace();
  for(const mode of [undefined,null,'multiplayer','practice','ai']){
    const request=new Request('https://game.test/api/browser/rooms',{method:'POST',body:JSON.stringify({name:'玩家',mode,aiCount:1})});
    const response=await worker.default.fetch(request,ns.env);assert.equal(response.status,201);assert.equal((await response.json()).meta.mode,mode??'multiplayer');
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

async function spectate(env:Awaited<ReturnType<typeof create>>,nickname='观众'){
  const response=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:JSON.stringify({name:nickname,role:'spectator'})}));
  assert.equal(response.status,201);return await response.json() as RelayJoinReply;
}
async function leave(env:Awaited<ReturnType<typeof create>>,identity:Identity){return env.relay.fetch(new Request('https://room.internal/leave/ABC234',{method:'POST',body:JSON.stringify(identity)}));}

test('spectators join ongoing full rooms separately, receive public state/events, and cannot act or host',async()=>{
  const env=await create(2),host=await authenticate(env,env.created.identity,true),guest=await join(env);
  const active={...guest.room,phase:'race' as const,version:9,players:guest.room.players.map(player=>({...player,hand:['secret'],selection:['private']})),pending:{id:'secret-choice',playerId:guest.identity.playerId,title:'秘密选项',options:[{id:'secret',label:'隐藏'}],optional:false,kind:'test'}};
  await deliver(env,host,guest.identity.playerId,active);
  const spectator=await spectate(env);assert.equal(spectator.identity.role,'spectator');assert.equal(spectator.meta.members.length,2);assert.equal(spectator.meta.spectators?.length,1);
  assert.equal(spectator.room.phase,'race');assert.equal(spectator.room.version,9);assert.equal(spectator.room.role,'spectator');assert(!JSON.stringify(spectator.room).includes('secret'));assert.equal(spectator.room.pending,undefined);
  const socket=await authenticate(env,spectator.identity);host.clear();
  await env.relay.webSocketMessage(socket,JSON.stringify({type:'sync',requestId:'spectator-sync'}));assert.equal(host.sent.at(-1).playerId,spectator.identity.playerId);
  await deliver(env,host,spectator.identity.playerId,{...active,selfId:spectator.identity.playerId},'spectator-sync');
  assert.equal(socket.sent.find(message=>message.type==='snapshot').room.role,'spectator');assert(!JSON.stringify(socket.sent.find(message=>message.type==='snapshot')).includes('secret'));
  host.clear();await env.relay.webSocketMessage(socket,JSON.stringify({type:'events',requestId:'spectator-events',afterId:0}));assert.equal(host.sent.at(-1).operation,'events');
  const batch={afterId:0,latestId:1,events:[{id:1,type:'move',text:'公开动作'}]};await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver-events',to:spectator.identity.playerId,requestId:'spectator-events',batch}));assert.deepEqual(socket.sent.at(-1).batch,batch);
  host.clear();await env.relay.webSocketMessage(socket,JSON.stringify({type:'action',requestId:'spectator-action',envelope:act()}));assert.match(socket.sent.at(-1).message,/观战者/);assert.equal(host.sent.length,0);
  const impostor=await authenticate(env,spectator.identity,true);assert.equal(impostor.closeCode,4401);
});

test('spectators may watch solo and offline rooms without consuming player seats, up to the spectator limit',async()=>{
  const env=await create(),record=await env.ctx.storage.get<any>('room');record.mode='practice';record.maxPlayers=1;await env.ctx.storage.put('room',record);
  const restored={...env,...await instance(env.ctx.storage)};
  for(let index=0;index<MAX_SPECTATORS;index++){const spectator=await spectate(restored,'观众'+index);assert.equal(spectator.meta.members.length,1);}
  const full=await restored.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"满员观众","role":"spectator"}'}));assert.equal(full.status,409);
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.members.length,1);assert.equal(stored.spectators.length,MAX_SPECTATORS);assert.match(stored.spectators[0].tokenHash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(restored.created.meta).includes('tokenHash'));
});

test('explicit leave removes lobby guests and spectators, closes all their tabs, and rejects credentials afterwards',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),nextGuest=await join(env),spectator=await spectate(env);
  const tabs=await Promise.all([authenticate(env,guest.identity),authenticate(env,guest.identity)]),viewer=await authenticate(env,spectator.identity);
  const denied=await leave(env,{...guest.identity,token:'A'.repeat(43)});assert.equal(denied.status,401);assert.equal((await env.ctx.storage.get<any>('room')).members.length,3);
  host.clear();assert.deepEqual(await (await leave(env,guest.identity)).json(),{ok:true,retainIdentity:false});assert(tabs.every(socket=>socket.closeCode===4401));assert.equal((await authenticate(env,guest.identity)).closeCode,4401);
  const replacement=await join(env);assert.equal(replacement.meta.members.find(player=>player.id===replacement.identity.playerId)!.seat,1);assert.equal(replacement.meta.members.find(player=>player.id===nextGuest.identity.playerId)!.seat,2);
  assert.deepEqual(await (await leave(env,spectator.identity)).json(),{ok:true,retainIdentity:false});assert.equal(viewer.closeCode,4401);assert.equal((await authenticate(env,spectator.identity)).closeCode,4401);assert.equal((await env.ctx.storage.get<any>('room')).spectators.length,0);
  assert(host.sent.some(message=>message.type==='roster'&&message.meta.spectators.length===0));
});

test('explicit leave preserves active players and creator credentials while pausing an exiting authority',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await deliver(env,host,guest.identity.playerId,{...guest.room,phase:'race',version:2});
  assert.deepEqual(await (await leave(env,guest.identity)).json(),{ok:true,retainIdentity:true});assert.equal(peer.closeCode,4401);assert.equal((await authenticate(env,guest.identity)).readyState,1);
  const viewer=await authenticate(env,env.created.identity);assert.deepEqual(await (await leave(env,env.created.identity)).json(),{ok:true,retainIdentity:true});assert.equal(host.closeCode,4401);assert.equal(viewer.closeCode,4401);
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.members.length,2);assert.equal(stored.expiresAt,stored.createdAt+PERSONAL_ROOM_AWAY_MS);assert.equal(typeof stored.hostLeftAt,'number');
  assert.equal((await authenticate(env,env.created.identity,true)).sent.find(message=>message.type==='auth-ok').authority,true);
  const lobby=await create();await authenticate(lobby,lobby.created.identity,true);assert.deepEqual(await (await leave(lobby,lobby.created.identity)).json(),{ok:true,retainIdentity:true});assert.equal((await authenticate(lobby,lobby.created.identity,true)).readyState,1);
});

test('owner absence closes multiplayer rooms on HTTP, WebSocket and alarms while ignoring legacy lifetime fields',async()=>{
  for(const entry of ['http','socket','alarm'] as const){
    const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),socket=await authenticate(env,guest.identity);await env.relay.webSocketClose(host,1000,'owner left',true);const record=await env.ctx.storage.get<any>('room');
    record.createdAt=Date.now()-12*60*60*1000;record.hostLeftAt=Date.now()-PERSONAL_ROOM_AWAY_MS;record.expiresAt=Date.now()+30*86_400_000;await env.ctx.storage.put('room',record);
    const restored=await instance(env.ctx.storage,env.ctx.sockets);socket.clear();
    if(entry==='http')assert.equal((await restored.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:'{"name":"过期"}'}))).status,410);
    if(entry==='socket')await restored.relay.webSocketMessage(socket,JSON.stringify({type:'sync',requestId:'expired-sync'}));
    if(entry==='alarm')await restored.relay.alarm();
    assert.equal(socket.closeCode,4410);assert.equal(socket.sent.find(message=>message.type==='room-closed').reason,'host-away');assert.equal(await env.ctx.storage.get('room'),undefined);assert.equal(env.ctx.storage.values.size,1);
  }
});

test('expired and missing room WebSocket upgrades deliver a terminal notice rather than an unreadable handshake error',async()=>{
  const NativeResponse=globalThis.Response;
  class UpgradeResponse extends NativeResponse {constructor(value:BodyInit|null,init:ResponseInit&{webSocket?:unknown}){super(value,{...init,status:init.status===101?200:init.status});if(init.status===101)Object.defineProperty(this,'status',{value:101});}}
  try{
    globalThis.Response=UpgradeResponse as typeof Response;
    for(const exists of [true,false]){
      const env=exists?await create():await instance();
      if(exists){const record=await env.ctx.storage.get<any>('room');record.hostLeftAt=Date.now()-PERSONAL_ROOM_AWAY_MS;await env.ctx.storage.put('room',record);}
      const restored=await instance(env.ctx.storage),response=await restored.relay.fetch(new Request('https://room.internal/ws/ABC234',{headers:{Upgrade:'websocket'}}));
      assert.equal(response.status,101);const socket=restored.ctx.sockets.at(-1)!;assert.equal(socket.closeCode,exists?4410:4404);assert.equal(socket.sent[0].type,'room-closed');assert.equal(socket.sent[0].reason,exists?'host-away':'expired');assert.equal(await restored.ctx.storage.get('room'),undefined);
    }
  }finally{globalThis.Response=NativeResponse;}
});

async function namespace(){
  const instances=new Map<string,{ctx:Context;relay:any}>(),hooks:{before?:(code:string,request:Request)=>Promise<void>;after?:(code:string,request:Request,response:Response)=>Promise<void>}={};
  const env:any={ASSETS:{fetch:()=>new Response('asset')},ROOMS:{idFromName:(code:string)=>code,get:(code:string)=>({fetch:async(input:string|Request,init?:RequestInit)=>{
    const request=new Request(input,init);await hooks.before?.(code,request);
    let instance=instances.get(code);if(!instance){const ctx=new Context(),relay=new worker.RoomRelay(ctx,env);instance={ctx,relay};instances.set(code,instance);await ctx.ready();}
    const response=await instance.relay.fetch(request);await hooks.after?.(code,request,response);return response;
  }})}};
  return {env,instances,hooks};
}
async function listedRooms(env:any){const response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms'),env);assert.equal(response.status,200);return (await response.json()).rooms as import('../src/shared/types.js').RoomSummary[];}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
async function bounded<T>(operation:Promise<T>):Promise<T>{let timeout:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('directory operation deadlocked')),1000);})]);}finally{clearTimeout(timeout);}}

test('worker room directory excludes practice rooms and lists fresh public presence, hiding closed/expired rooms',async()=>{
  const ns=await namespace(),created:RelayJoinReply[]=[];
  for(const mode of ['multiplayer','practice','ai']){const response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:JSON.stringify({name:mode,mode,aiCount:1})}),ns.env);assert.equal(response.status,201);created.push(await response.json() as RelayJoinReply);}
  let rooms=await listedRooms(ns.env);assert.equal(rooms.length,2);assert(rooms.every(room=>room.authorityOnline));assert.deepEqual(rooms.map(room=>room.mode).sort(),['ai','multiplayer']);
  assert.equal(rooms.find(room=>room.mode==='ai')!.expiresAt-rooms.find(room=>room.mode==='ai')!.createdAt,PERSONAL_ROOM_AWAY_MS);
  assert.equal(rooms.find(room=>room.mode==='multiplayer')!.expiresAt-rooms.find(room=>room.mode==='multiplayer')!.createdAt,PERSONAL_ROOM_AWAY_MS);
  const first=created[0]!,active=ns.instances.get(first.identity.roomCode)!,env={...active,created:first},host=await authenticate(env,first.identity);
  const spectatorResponse=await worker.default.fetch(new Request(`https://game.test/api/browser/rooms/${first.identity.roomCode}/join`,{method:'POST',body:'{"name":"观众","role":"spectator"}'}),ns.env);assert.equal(spectatorResponse.status,201);
  assert.equal((await listedRooms(ns.env)).find(room=>room.code===first.identity.roomCode)!.spectatorCount,0);
  const spectator=await spectatorResponse.json() as RelayJoinReply;await authenticate(env,spectator.identity);
  rooms=await listedRooms(ns.env);assert.equal(rooms.find(room=>room.code===first.identity.roomCode)!.spectatorCount,1);assert.equal(rooms.find(room=>room.code===first.identity.roomCode)!.authorityOnline,true);assert(!JSON.stringify(rooms).includes(first.identity.token));assert(!JSON.stringify(rooms).includes('tokenHash'));
  const state=host.deserializeAttachment() as any;state.authorityLeaseAt=Date.now()-40_000;host.serializeAttachment(state);
  assert.equal((await listedRooms(ns.env)).find(room=>room.code===first.identity.roomCode)!.authorityOnline,true);
  const recovered=await authenticate(env,first.identity),requestId='directory-close';assert.equal((await workerAction(env,recovered,{type:'close'},requestId)).result.ok,true);
  assert(!(await listedRooms(ns.env)).some(room=>room.code===first.identity.roomCode));
  const expired=created[2]!,old=ns.instances.get(expired.identity.roomCode)!,record=await old.ctx.storage.get<any>('room');record.hostLeftAt=Date.now()-PERSONAL_ROOM_AWAY_MS;await old.ctx.storage.put('room',record);
  const restored=new worker.RoomRelay(old.ctx,ns.env);await old.ctx.ready();old.relay=restored;
  assert(!(await listedRooms(ns.env)).some(room=>room.code===expired.identity.roomCode));
});

test('directory listing cannot deadlock with a room publishing presence',async()=>{
  const ns=await namespace(),response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:'{"name":"并发房间"}'}),ns.env),created=await response.json() as RelayJoinReply;
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},publishing=deferred(),release=deferred(),reading=deferred();
  ns.hooks.before=async(_code,request)=>{const path=new URL(request.url).pathname;if(path==='/directory/upsert'){publishing.resolve();await release.promise;}if(path.startsWith('/summary/'))reading.resolve();};
  const auth=authenticate(env,created.identity);await publishing.promise;const listing=listedRooms(ns.env);await reading.promise;release.resolve();
  const [,rooms]=await bounded(Promise.all([auth,listing]));assert.equal(rooms.length,1);assert.equal(rooms[0]!.authorityOnline,true);
});

test('directory summary refresh cannot resurrect a room removed after the summary was read',async()=>{
  const ns=await namespace(),response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:'{"name":"并发关闭"}'}),ns.env),created=await response.json() as RelayJoinReply;
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},host=await authenticate(env,created.identity),reading=deferred(),release=deferred();
  ns.hooks.after=async(_code,request)=>{if(new URL(request.url).pathname.startsWith('/summary/')){reading.resolve();await release.promise;}};
  const listing=listedRooms(ns.env);await reading.promise;assert.equal((await workerAction(env,host,{type:'close'},'raced-close')).result.ok,true);release.resolve();await bounded(listing);
  const directory=ns.instances.get('__room_directory__')!;assert.equal(await directory.ctx.storage.get('directory:'+created.identity.roomCode),undefined);assert.equal((await listedRooms(ns.env)).length,0);
});

async function personal(mode:'ai'|'practice'='ai'){
  const env=await instance(),response=await env.relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:JSON.stringify({name:'房主',mode,aiCount:1,maxPlayers:mode==='practice'?1:2,timeoutSeconds:0})}));
  assert.equal(response.status,201);return{...env,created:await response.json() as RelayJoinReply};
}
async function controlledClock(work:(clock:{now:number})=>Promise<void>){
  const original=Date.now,clock={now:original()};Date.now=()=>clock.now;
  try{await work(clock);}finally{Date.now=original;}
}
test('personal relay closes an unattended room thirty minutes after creation without any browser task',async()=>controlledClock(async clock=>{
  const env=await personal(),code=env.created.identity.roomCode,at=clock.now;
  assert.equal(env.ctx.storage.alarmAt,at+PERSONAL_ROOM_AWAY_MS);
  clock.now=at+PERSONAL_ROOM_AWAY_MS-1;await env.relay.alarm();assert(await env.ctx.storage.get('room'));
  clock.now++;await env.relay.alarm();assert.equal(await env.ctx.storage.get('room'),undefined);assert.equal(env.ctx.storage.alarmAt,null);
  const closed=await env.ctx.storage.get<any>('closed');assert.deepEqual(closed,{code,closedAt:clock.now,reason:'host-away'});assert.equal(env.ctx.storage.values.size,1);
  await env.relay.alarm();assert.deepEqual(await env.ctx.storage.get('closed'),closed);
  const restored=await instance(env.ctx.storage),response=await restored.relay.fetch(new Request('https://room.internal/summary/ABC234'));
  assert.equal(response.status,410);const socket=connect(restored.ctx);await restored.relay.webSocketMessage(socket,JSON.stringify({type:'auth',identity:env.created.identity}));
  assert.equal(socket.closeCode,4410);assert.equal(socket.sent[0].reason,'host-away');
}));
test('personal relay counts all valid owner tabs, preserves idle online rooms beyond three hours, and restarts absence on reconnect',async()=>controlledClock(async clock=>{
  const env=await personal(),one=await authenticate(env,env.created.identity,true),two=await authenticate(env),viewerIdentity=await spectate(env),viewer=await authenticate(env,viewerIdentity.identity);
  assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  clock.now+=4*60*60*1000;one.lastAutoResponseAt=new Date(clock.now);two.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();
  assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);assert.equal(one.readyState,1);
  await env.relay.webSocketClose(one,1000,'关闭标签页',true);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  await env.relay.webSocketClose(two,1000,'最后标签页关闭',true);const left=clock.now;assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,left);
  clock.now+=PERSONAL_ROOM_AWAY_MS-1;viewer.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,left);
  const restored=await authenticate(env,env.created.identity,true);assert.equal(restored.readyState,1);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  clock.now+=60_000;restored.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  await env.relay.webSocketClose(restored,1000,'再次离开',true);const next=clock.now;
  clock.now+=PERSONAL_ROOM_AWAY_MS;await env.relay.alarm();assert.equal(await env.ctx.storage.get('room'),undefined);
  assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,next+PERSONAL_ROOM_AWAY_MS);assert.equal(viewer.closeCode,4410);assert.equal(viewer.sent.at(-1).reason,'host-away');
}));
test('personal relay owner heartbeat timeout and object reconstruction retain the original absence deadline',async()=>controlledClock(async clock=>{
  const env=await personal(),host=await authenticate(env,env.created.identity,true),start=clock.now;
  clock.now+=35_000;await env.relay.alarm();assert.equal(host.closeCode,4408);
  assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,start+35_000);
  clock.now+=PERSONAL_ROOM_AWAY_MS-1;const restored=await instance(env.ctx.storage);await restored.relay.alarm();assert(await env.ctx.storage.get('room'));
  clock.now++;await restored.relay.alarm();assert.equal(await env.ctx.storage.get('room'),undefined);
  assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,start+35_000+PERSONAL_ROOM_AWAY_MS);
}));
test('personal relay dismissal enforces owner control without an authority, atomically clears work and retries a failed close safely',async()=>controlledClock(async()=>{
  const env=await personal(),owner=await authenticate(env),spectator=await spectate(env),viewer=await authenticate(env,spectator.identity);
  const close=act('close');await env.relay.webSocketMessage(viewer,JSON.stringify({type:'action',requestId:'denied',envelope:close}));
  assert.match(viewer.sent.at(-1).message,/只有当前管理房主/);assert.equal(owner.readyState,1);
  await env.ctx.storage.put('view:'+env.created.identity.playerId,env.created.room);env.ctx.storage.failPut='closed';
  await env.relay.webSocketMessage(owner,JSON.stringify({type:'action',requestId:'retry-close',envelope:close}));
  assert.equal(owner.readyState,1);assert(await env.ctx.storage.get('room'));assert.equal(await env.ctx.storage.get('closed'),undefined);
  assert(!owner.sent.some(message=>message.type==='ack'&&message.result.ok));
  await env.relay.webSocketMessage(owner,JSON.stringify({type:'action',requestId:'retry-close',envelope:close}));
  assert.equal(owner.closeCode,4410);assert.equal(viewer.closeCode,4410);assert.equal(owner.sent.at(-1).reason,'dismissed');
  assert(owner.sent.findIndex(message=>message.type==='ack')<owner.sent.findIndex(message=>message.type==='room-closed'));
  assert.equal(env.ctx.storage.values.size,1);assert.equal(env.ctx.storage.alarmAt,null);assert.equal(await env.ctx.storage.get('room'),undefined);
  const closed=await env.ctx.storage.get('closed');await env.relay.alarm();assert.deepEqual(await env.ctx.storage.get('closed'),closed);
}));
test('practice directory exclusion survives creation, roster pushes, delivered state and object reconstruction',async()=>{
  const ns=await namespace(),response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:JSON.stringify({name:'练习',mode:'practice'})}),ns.env),created=await response.json() as RelayJoinReply;
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},host=await authenticate(env,created.identity);
  assert.deepEqual(await listedRooms(ns.env),[]);await env.relay.webSocketMessage(host,JSON.stringify({type:'sync',requestId:'practice-sync'}));assert.deepEqual(await listedRooms(ns.env),[]);
  const restored=new worker.RoomRelay(current.ctx,ns.env);await current.ctx.ready();current.relay=restored;
  assert.deepEqual(await listedRooms(ns.env),[]);assert.equal(await ns.instances.get('__room_directory__')!.ctx.storage.get('directory:'+created.identity.roomCode),undefined);
});

test('legacy closed personal relay records migrate without retaining private views or an infinity alarm',async()=>{
  const env=await personal('practice'),record=await env.ctx.storage.get<any>('room');record.closedAt=Date.now();
  await env.ctx.storage.put('room',record);await env.ctx.storage.put('view:'+env.created.identity.playerId,env.created.room);
  const restored=await instance(env.ctx.storage);assert.equal(await env.ctx.storage.get('room'),undefined);assert.equal(env.ctx.storage.values.size,1);assert.equal(env.ctx.storage.alarmAt,null);
  assert.equal((await env.ctx.storage.get<any>('closed')).reason,'dismissed');
  const response=await restored.relay.fetch(new Request('https://room.internal/summary/ABC234'));assert.equal(response.status,410);
});

test('multiplayer relay rejects automatic management takeover and guest activity cannot cancel owner absence',async()=>controlledClock(async clock=>{
  const env=await create(),owner=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await env.relay.webSocketMessage(owner,JSON.stringify({type:'deliver',to:guest.identity.playerId,room:{...guest.room,hostId:guest.identity.playerId},phase:'lobby',adminHostId:guest.identity.playerId}));
  assert.equal((await env.ctx.storage.get<any>('room')).ownerId,env.created.identity.playerId);
  assert.equal((await env.ctx.storage.get<any>('room')).adminHostId,env.created.identity.playerId);
  assert.equal(peer.sent.findLast(message=>message.type==='snapshot').room.hostId,env.created.identity.playerId);
  await env.relay.webSocketClose(owner,1000,'owner away',true);const departed=clock.now;
  clock.now+=PERSONAL_ROOM_AWAY_MS-1;peer.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,departed);
  clock.now++;await env.relay.alarm();assert.equal(peer.closeCode,4410);assert.equal((await env.ctx.storage.get<any>('closed')).reason,'host-away');
}));
test('explicit multiplayer transfer commits lifecycle owner only after its matching successful receipt and survives reconstruction',async()=>controlledClock(async clock=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'transfer',playerId:guest.identity.playerId}};
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'owner-transfer',envelope}));
  assert.equal((await env.ctx.storage.get<any>('room')).ownerId,env.created.identity.playerId);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,room:{...env.created.room,version:2,hostId:guest.identity.playerId},requestId:'owner-transfer',result:{ok:true,version:2},phase:'lobby',adminHostId:guest.identity.playerId}));
  const stored=await env.ctx.storage.get<any>('room');assert.equal(stored.ownerId,guest.identity.playerId);assert.equal(stored.pendingOwnerTransfer,undefined);
  await env.relay.webSocketClose(host,1000,'former owner left',true);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  const restored=await instance(env.ctx.storage,env.ctx.sockets);assert.equal((await env.ctx.storage.get<any>('room')).ownerId,guest.identity.playerId);
  clock.now+=4*60*60*1000;peer.lastAutoResponseAt=new Date(clock.now);await restored.relay.alarm();assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  await restored.relay.webSocketClose(peer,1000,'new owner left',true);const at=clock.now;clock.now+=PERSONAL_ROOM_AWAY_MS;await restored.relay.alarm();assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,at+PERSONAL_ROOM_AWAY_MS);
}));

test('an old successful transfer receipt cannot replace a newer absent owner or reset its deadline after reconstruction',async()=>controlledClock(async clock=>{
  let env=await create();const creator=env.created.identity,host=await authenticate(env,creator,true),second=await join(env),peer=await authenticate(env,second.identity),third=await join(env),other=await authenticate(env,third.identity);
  const transfer=async(actor:Socket,actorId:string,targetId:string,actionId:string,expectedVersion:number,requestId:string,duplicate=false)=>{
    const envelope:ActionEnvelope={actionId,expectedVersion,action:{type:'transfer',playerId:targetId}};
    await env.relay.webSocketMessage(actor,JSON.stringify({type:'action',requestId,envelope}));
    await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:actorId,requestId,result:{ok:true,version:expectedVersion+1,...(duplicate?{duplicate:true}:{})},room:{...env.created.room,selfId:actorId,version:20,hostId:targetId},phase:'lobby',adminHostId:targetId}));
  };
  const oldAction=crypto.randomUUID();await transfer(host,creator.playerId,creator.playerId,oldAction,1,'self-transfer');
  await transfer(host,creator.playerId,third.identity.playerId,crypto.randomUUID(),2,'new-owner');
  await env.relay.webSocketClose(other,1000,'lifecycle owner left',true);const departed=clock.now;
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:creator.playerId,room:{...env.created.room,version:21,hostId:creator.playerId},phase:'lobby',adminHostId:creator.playerId}));
  env={...env,...await instance(env.ctx.storage,env.ctx.sockets)};
  clock.now+=10_000;await transfer(host,creator.playerId,creator.playerId,oldAction,1,'replayed-self-transfer',true);
  const record=await env.ctx.storage.get<any>('room');assert.equal(record.ownerId,third.identity.playerId);assert.equal(record.ownerTransferVersion,3);assert.equal(record.hostLeftAt,departed);assert.equal(record.pendingOwnerTransfer,undefined);
  assert(host.sent.some(message=>message.type==='error'&&message.requestId==='replayed-self-transfer'&&/只有当前管理房主/.test(message.message)));
  assert.equal(record.adminHostId,third.identity.playerId);
  clock.now=departed+PERSONAL_ROOM_AWAY_MS;peer.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,departed+PERSONAL_ROOM_AWAY_MS);
}));

test('a departing pending transfer target retains its identity and a recovered explicit receipt sets both host identities',async()=>controlledClock(async clock=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'transfer',playerId:guest.identity.playerId}};
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'pending-transfer',envelope}));
  const response=await env.relay.fetch(new Request('https://room.internal/leave/ABC234',{method:'POST',body:JSON.stringify(guest.identity)}));assert.equal(response.status,200);assert.equal((await response.json()).retainIdentity,true);assert.equal(peer.closeCode,4401);
  const restored={...env,...await instance(env.ctx.storage,env.ctx.sockets)};
  const deliverReceipt=(result:unknown)=>restored.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,requestId:'pending-transfer',result,room:{...env.created.room,version:4,hostId:env.created.identity.playerId},phase:'lobby',adminHostId:env.created.identity.playerId}));
  await deliverReceipt({ok:true});assert.match(host.sent.at(-1).message,/移交确认版本/);assert(await env.ctx.storage.get<any>('room').then(record=>record.pendingOwnerTransfer));
  await deliverReceipt({ok:true,duplicate:true,version:2});const record=await env.ctx.storage.get<any>('room');assert.equal(record.ownerId,guest.identity.playerId);assert.equal(record.adminHostId,guest.identity.playerId);assert.equal(record.pendingOwnerTransfer,undefined);assert.equal(record.hostLeftAt,clock.now);
  const returning=await authenticate(restored,guest.identity);assert.equal(returning.readyState,1);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
}));

test('resume-status authenticates without opening sockets or renewing the mode-specific departure deadline in every mode',async()=>controlledClock(async clock=>{
  for(const mode of ['multiplayer','ai','practice'] as const){
    const ns=await namespace(),createdResponse=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:JSON.stringify({name:'原房主',mode,aiCount:1})}),ns.env),created=await createdResponse.json() as RelayJoinReply;
    const status=(identity:Identity)=>worker.default.fetch(new Request(`https://game.test/api/browser/rooms/${created.identity.roomCode}/resume-status`,{method:'POST',body:JSON.stringify(identity)}),ns.env);
    const at=clock.now;clock.now+=60_000;
    const response=await status(created.identity);assert.equal(response.status,200);const data=await response.json();
    assert.deepEqual(data,{ok:true,ownerId:created.identity.playerId,mode,phase:created.room.phase,createdAt:at,hostLeftAt:at,expiresAt:at+ownerAwayMs({mode})});
    const current=ns.instances.get(created.identity.roomCode)!;assert.equal(current.ctx.sockets.length,0);assert.equal((await current.ctx.storage.get<any>('room')).hostLeftAt,at);
    assert.equal((await status({...created.identity,token:'A'.repeat(43)})).status,401);
    assert.equal((await listedRooms(ns.env)).some(room=>room.code===created.identity.roomCode),mode!=='practice');
    clock.now=at+ownerAwayMs({mode})-1;assert.equal((await status(created.identity)).status,200);
    clock.now++;assert.equal((await status(created.identity)).status,410);assert(!(await listedRooms(ns.env)).some(room=>room.code===created.identity.roomCode));
  }
  const ns=await namespace(),missing=await worker.default.fetch(new Request('https://game.test/api/browser/rooms/ABC234/resume-status',{method:'POST',body:JSON.stringify({roomCode:'ABC234',playerId:crypto.randomUUID(),token:'B'.repeat(43)})}),ns.env);assert.equal(missing.status,404);
}));

test('multiplayer owner tabs, refresh and legacy archive restoration never promote an online guest',async()=>controlledClock(async clock=>{
  const env=await create(),ownerId=env.created.identity.playerId,host=await authenticate(env,env.created.identity,true),duplicate=await authenticate(env),guest=await join(env),peer=await authenticate(env,guest.identity);
  await env.relay.webSocketClose(duplicate,1000,'one owner tab exits',true);let record=await env.ctx.storage.get<any>('room');assert.equal(record.hostLeftAt,undefined);assert.equal(record.adminHostId,ownerId);
  await env.relay.webSocketClose(host,1000,'last owner tab exits',true);const at=clock.now;record=await env.ctx.storage.get<any>('room');assert.equal(record.ownerId,ownerId);assert.equal(record.adminHostId,ownerId);assert.equal(record.hostLeftAt,at);
  assert(peer.sent.some(message=>message.type==='roster'&&message.meta.adminHostId===ownerId&&message.meta.hostLeftAt===at));
  // Heal pre-upgrade archives that automatically handed management to a guest.
  record.adminHostId=guest.identity.playerId;await env.ctx.storage.put('room',record);
  const restored={...env,...await instance(env.ctx.storage,env.ctx.sockets)};assert.equal((await env.ctx.storage.get<any>('room')).adminHostId,ownerId);
  clock.now+=60_000;const returned=await authenticate(restored,env.created.identity,true),meta=returned.sent.find(message=>message.type==='auth-ok').meta;
  assert.equal(meta.ownerId,ownerId);assert.equal(meta.adminHostId,ownerId);assert.equal(meta.hostLeftAt,undefined);
  const response=await restored.relay.fetch(new Request('https://room.internal/resume-status/ABC234',{method:'POST',body:JSON.stringify(env.created.identity)}));assert.equal((await response.json()).ownerId,ownerId);
}));

test('relay chat is authenticated, idempotent, isolated, persisted, rate-limited and available while authority is offline',async()=>controlledClock(async clock=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  const elsewhere=await create(),other=await authenticate(elsewhere,elsewhere.created.identity,true);other.clear();host.clear();peer.clear();
  const send=(id:string,text='你好')=>env.relay.webSocketMessage(peer,JSON.stringify({type:'chat-send',requestId:id,clientMessageId:id,text}));
  await send('one','<b>纯文本</b>');const accepted=peer.sent.find(message=>message.requestId==='one').result;assert.equal(accepted.ok,true);assert.equal(accepted.message.senderName,'同名1');assert.equal(accepted.message.id,1);
  assert(host.sent.some(message=>message.type==='chat'&&message.messages[0]?.text==='<b>纯文本</b>'));assert.equal(other.sent.length,0);
  await send('one','<b>纯文本</b>');assert.equal(peer.sent.filter(message=>message.requestId==='one').at(-1).result.duplicate,true);
  await send('one','篡改');assert.equal(peer.sent.filter(message=>message.requestId==='one').at(-1).result.ok,false);
  for(let i=0;i<5;i++)await send(`rate${i}`);await send('too-fast');assert.match(peer.sent.at(-1).message,/频繁/);
  await env.relay.webSocketClose(host,1000,'离线',true);clock.now+=10_001;await send('offline');assert.equal(peer.sent.find(message=>message.requestId==='offline').result.ok,true);
  for(let i=0;i<101;i++){clock.now+=10_001;await send(`history${i}`,`第${i}条`);}
  const restored=await instance(env.ctx.storage,env.ctx.sockets),reconnect=connect(restored.ctx);await restored.relay.webSocketMessage(reconnect,JSON.stringify({type:'auth',identity:guest.identity}));
  const history=reconnect.sent.find(message=>message.type==='chat');assert.equal(history.messages.length,100);assert.equal(history.messages.at(-1).text,'第100条');
  await restored.relay.webSocketMessage(reconnect,JSON.stringify({type:'chat-send',requestId:'replay-one',clientMessageId:'one',text:'<b>纯文本</b>'}));assert.equal(reconnect.sent.at(-1).result.duplicate,true);
  await restored.relay.webSocketMessage(reconnect,JSON.stringify({type:'chat-sync',requestId:'after',afterId:history.latestId-1}));assert.equal(reconnect.sent.at(-1).messages.length,1);
  const invalid=connect(restored.ctx);await restored.relay.webSocketMessage(invalid,JSON.stringify({type:'chat-sync'}));assert.equal(invalid.closeCode,4401);
}));

test('relay allocates concurrent same-name joins and renames across spectators, preserves old chat and enforces once per game through reconnect',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);
  const joined=await Promise.all([join(env),join(env),join(env)]);assert.deepEqual(joined.at(-1)!.meta.members.map(person=>person.name),['同名','同名1','同名2','同名3']);
  const spectatorResponse=await env.relay.fetch(new Request('https://room.internal/join/ABC234',{method:'POST',body:JSON.stringify({name:'同名',role:'spectator'})}));const spectator=await spectatorResponse.json() as RelayJoinReply;assert.equal(spectator.room.spectators![0]!.name,'同名4');
  const peers=await Promise.all(joined.slice(0,2).map(person=>authenticate(env,person.identity)));
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,version:2,phase:'race'});
  await env.relay.webSocketMessage(peers[0]!,JSON.stringify({type:'chat-send',requestId:'before',clientMessageId:'before',text:'旧名'}));
  await env.relay.webSocketMessage(peers[0]!,JSON.stringify({type:'rename',requestId:'failed',name:' '}));
  assert.equal((await env.ctx.storage.get<any>('room')).members.find((p:any)=>p.id===joined[0]!.identity.playerId).renameUsed,undefined);
  await Promise.all(peers.map((socket,index)=>env.relay.webSocketMessage(socket,JSON.stringify({type:'rename',requestId:`rename${index}`,name:'同名4'}))));
  const record=await env.ctx.storage.get<any>('room');assert.equal(record.members[1].name,'同名41');assert.equal(record.members[2].name,'同名42');assert.equal(new Set([...record.members,...record.spectators].map(p=>p.name)).size,5);
  assert.equal(record.chat.messages[0].senderName,'同名1');assert.equal(record.chat.messages[1].kind,'system');
  const restored=await instance(env.ctx.storage,env.ctx.sockets),peer=connect(restored.ctx);await restored.relay.webSocketMessage(peer,JSON.stringify({type:'auth',identity:joined[0]!.identity}));
  assert.equal(peer.sent.find(m=>m.type==='auth-ok').meta.members[1].renameUsed,true);
  await restored.relay.webSocketMessage(peer,JSON.stringify({type:'rename',requestId:'again',name:'其他'}));assert.match(peer.sent.at(-1).message,/本局已修改/);
  await restored.relay.webSocketMessage(peer,JSON.stringify({type:'rename',requestId:'rename0',name:'同名4'}));assert.equal(peer.sent.at(-1).result.duplicate,true);
  const viewer=await authenticate({...env,...restored},spectator.identity);await restored.relay.webSocketMessage(viewer,JSON.stringify({type:'rename',requestId:'spectator',name:'试试'}));assert.match(viewer.sent.at(-1).message,/真人参赛/);
});

test('relay confirmed rematch resets rename quota exactly once and keeps chat across races',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);await join(env);
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'race',version:4});
  await env.relay.webSocketMessage(host,JSON.stringify({type:'rename',requestId:'first-game',name:'新名'}));
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'results',version:5});assert.equal((await env.ctx.storage.get<any>('room')).members[0].renameUsed,true);
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'finished',version:6});
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:6,action:{type:'rematch'}};
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'new-game',envelope}));
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'lobby',version:7},'new-game');
  let record=await env.ctx.storage.get<any>('room');assert.equal(record.members[0].renameUsed,false);assert.equal(record.chat.messages.length,1);
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'race',version:8});
  await env.relay.webSocketMessage(host,JSON.stringify({type:'rename',requestId:'second-game',name:'又改名'}));assert.equal((await env.ctx.storage.get<any>('room')).members[0].renameUsed,true);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'repeat-new-game',envelope}));
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,phase:'race',adminHostId:env.created.identity.playerId,requestId:'repeat-new-game',result:{ok:true,version:7,duplicate:true}}));
  record=await env.ctx.storage.get<any>('room');assert.equal(record.members[0].renameUsed,true);assert.equal(record.chat.messages.length,2);
});

test('relay chat/rename disk failures expose no success and preserve quota, then retry commits',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);
  await deliver(env,host,env.created.identity.playerId,{...env.created.room,phase:'race',version:2});
  env.ctx.storage.failPut='room';await env.relay.webSocketMessage(host,JSON.stringify({type:'chat-send',requestId:'fail',clientMessageId:'fail',text:'测试'}));assert.equal((await env.ctx.storage.get<any>('room')).chat,undefined);
  env.ctx.storage.failPut='room';await env.relay.webSocketMessage(host,JSON.stringify({type:'rename',requestId:'rename-fail',name:'新名'}));assert.equal((await env.ctx.storage.get<any>('room')).members[0].renameUsed,undefined);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'rename',requestId:'rename-fail',name:'新名'}));assert.equal(host.sent.at(-3)?.result?.ok??host.sent.find(m=>m.type==='rename-result')?.result.ok,true);
});

test('relay heals legacy duplicate display names durably without consuming manual rename quota',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true);const guest=await join(env);
  const record=await env.ctx.storage.get<any>('room');record.members[1].name=record.members[0].name;await env.ctx.storage.put('room',record);
  const restored=await instance(env.ctx.storage,env.ctx.sockets),reconnect=connect(restored.ctx);await restored.relay.webSocketMessage(reconnect,JSON.stringify({type:'auth',identity:guest.identity}));
  const meta=reconnect.sent.find(message=>message.type==='auth-ok').meta;assert.deepEqual(meta.members.map((person:any)=>person.name),['同名','同名1']);assert.equal(meta.members[1].renameUsed,false);
  assert.equal((await env.ctx.storage.get<any>('room')).members[1].name,'同名1');assert.equal(host.readyState,1);
});

test('relay closure deletes actual chat history and durable resend receipt; reconstruction cannot read them',async()=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),id=env.created.identity.playerId;
  await env.relay.webSocketMessage(host,JSON.stringify({type:'chat-send',requestId:'chat-before-close',clientMessageId:'close-chat',text:'正式关闭后删除'}));
  const receiptKey=`chat-receipt:${id}:close-chat`;assert(await env.ctx.storage.get(receiptKey));assert.equal((await env.ctx.storage.get<any>('room')).chat.messages.length,1);
  await closeIntent(env,host,'close-with-chat');await deliver(env,host,id,{...env.created.room,version:2,closedAt:Date.now()},'close-with-chat');
  assert.deepEqual([...env.ctx.storage.values.keys()],['closed']);assert.equal(await env.ctx.storage.get(receiptKey),undefined);assert.equal(await env.ctx.storage.get('room'),undefined);
  const restored=await instance(env.ctx.storage),socket=connect(restored.ctx);await restored.relay.webSocketMessage(socket,JSON.stringify({type:'auth',identity:env.created.identity}));
  assert.equal(socket.closeCode,4410);assert(socket.sent.some(message=>message.type==='room-closed'));assert(!socket.sent.some(message=>message.type==='chat'||message.type==='snapshot'));
  const status=await restored.relay.fetch(new Request('https://room.internal/resume-status/ABC234',{method:'POST',body:JSON.stringify(env.created.identity)}));assert.equal(status.status,410);
  assert.deepEqual([...env.ctx.storage.values.keys()],['closed']);
});

test('global directory admits only one concurrent request at 29, preserves creation idempotence and releases close exactly once',async()=>{
  const ns=await namespace();
  const createRoom=(requestId=crypto.randomUUID(),mode='multiplayer')=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'capacity-admission'},body:JSON.stringify({name:'容量测试',maxPlayers:2,timeoutSeconds:0,mode,aiCount:1,requestId})}),ns.env);
  const created:RelayJoinReply[]=[];
  for(let i=0;i<29;i++){const response=await createRoom();assert.equal(response.status,201);created.push(await response.json() as RelayJoinReply);}
  const attempts=await Promise.all(Array.from({length:10},()=>createRoom()));assert.equal(attempts.filter(response=>response.status===201).length,1);
  for(const response of attempts.filter(response=>response.status!==201)){assert.equal(response.status,409);assert.match((await response.json()).error,/实时对战房间已满/);}
  const requestId=crypto.randomUUID(),solo=await createRoom(requestId,'practice'),soloReply=await solo.json();assert.equal(solo.status,201);
  const duplicate=await createRoom(requestId,'practice');assert.equal(duplicate.status,201);assert.deepEqual(await duplicate.json(),soloReply);
  assert.equal((await createRoom(crypto.randomUUID(),'ai')).status,201);
  const directory=ns.instances.get('__room_directory__')!;assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,30);
  const first=created[0]!,instance=ns.instances.get(first.identity.roomCode)!,env={...instance,created:first},host=await authenticate(env,first.identity);
  assert.equal((await workerAction(env,host,{type:'close'},'capacity-close')).result.ok,true);
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,29);
  const closeAgain=await directory.relay.fetch(new Request('https://room.internal/directory/remove',{method:'POST',body:JSON.stringify({code:first.identity.roomCode})}));assert.equal(closeAgain.status,200);
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,29);
  const lastId=crypto.randomUUID(),last=await createRoom(lastId);assert.equal(last.status,201);const lastReply=await last.json();
  const repeat=await Promise.all([createRoom(lastId),createRoom(lastId)]);for(const response of repeat){assert.equal(response.status,201);assert.deepEqual(await response.json(),lastReply);}
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,30);
  const listing=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{headers:{'CF-Connecting-IP':'capacity-list'}}),ns.env);assert.deepEqual((await listing.json()).capacity,{used:30,limit:30});
});

test('global admission immediately reclaims a failed create and reaps an abandoned reservation after reconstruction',async()=>controlledClock(async clock=>{
  const ns=await namespace();let failNext=true;
  ns.hooks.before=async(code,request)=>{if(failNext&&new URL(request.url).pathname.startsWith('/create/')){
    failNext=false;const ctx=new Context(),relay=new worker.RoomRelay(ctx,ns.env);await ctx.ready();ctx.storage.failPut='room';ns.instances.set(code,{ctx,relay});
  }};
  const requestId=crypto.randomUUID(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'capacity-failure'},body:JSON.stringify({name:'失败回收',requestId})}),ns.env);
  assert.equal((await createRoom()).status,503);const directory=ns.instances.get('__room_directory__')!;
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,0);assert.equal((await createRoom()).status,201);
  const abandoned=crypto.randomUUID();await directory.relay.fetch(new Request('https://room.internal/directory/reserve',{method:'POST',body:JSON.stringify({requestId:abandoned,request:'abandoned',mode:'multiplayer'})}));
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,2);clock.now+=60_001;
  const restored=new worker.RoomRelay(directory.ctx,ns.env);await directory.ctx.ready();directory.relay=restored;
  const next=await restored.fetch(new Request('https://room.internal/directory/reserve',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),request:'replacement',mode:'multiplayer'})}));assert.equal(next.status,200);
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,2);assert.equal(await directory.ctx.storage.get('creation:'+abandoned),undefined);
}));

test('practice uses ten minutes with multi-tab owner presence and preserved deadlines across object reconstruction',async()=>controlledClock(async clock=>{
  const env=await personal('practice'),one=await authenticate(env,env.created.identity,true),two=await authenticate(env);
  await env.relay.webSocketClose(one,1000,'first tab closes',true);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  await env.relay.webSocketClose(two,1000,'last tab closes',true);const departed=clock.now;
  assert(env.ctx.storage.alarmAt!<=departed+ownerAwayMs({mode:'practice'}));
  clock.now+=ownerAwayMs({mode:'practice'})-1;const restored=await instance(env.ctx.storage);assert.equal((await restored.ctx.storage.get<any>('room')).hostLeftAt,departed);
  const returned=await authenticate({...restored,created:env.created},env.created.identity,true);await restored.relay.alarm();assert(await restored.ctx.storage.get('room'));
  await restored.relay.webSocketClose(returned,1000,'second departure',true);const next=clock.now+ownerAwayMs({mode:'practice'});
  clock.now=departed+ownerAwayMs({mode:'practice'});await restored.relay.alarm();assert(await restored.ctx.storage.get('room'));
  clock.now=next;await restored.relay.alarm();assert.equal(await restored.ctx.storage.get('room'),undefined);assert.equal((await restored.ctx.storage.get<any>('closed')).closedAt,next);
}));

async function modern(mode:'multiplayer'|'practice'|'ai'='multiplayer',config=legacyRoomConfig()){
  const env=await instance();
  const response=await env.relay.fetch(new Request('https://room.internal/create/ABC234',{method:'POST',body:JSON.stringify({name:'服务端房主',mode,aiCount:1,maxPlayers:mode==='practice'?1:2,timeoutSeconds:0,config,authorityMode:'worker'})}));
  assert.equal(response.status,201);return {...env,created:await response.json() as RelayJoinReply};
}
test('new worker rooms settle authoritatively without a browser computer, reject forged results and preserve private drafting',async()=>{
  const env=await modern(),host=await authenticate(env),guest=await join(env),peer=await authenticate(env,guest.identity);
  assert.equal(env.created.meta.authorityMode,'worker');assert.equal(env.created.room.hosting,'worker');
  assert.equal(host.sent.find(message=>message.type==='auth-ok').authority,false);
  const forbidden=await authenticate(env,env.created.identity,true);assert.equal(forbidden.closeCode,4401);
  assert.equal((await workerAction(env,host,{type:'ready',ready:true})).result.ok,true);
  assert.equal((await workerAction(env,peer,{type:'ready',ready:true})).result.ok,true);
  const config=legacyRoomConfig('mixed');
  const change=await workerAction(env,host,{type:'configure',config});assert.equal(change.result.ok,true);
  assert((await env.ctx.storage.get<any>('room')).serverRoom.game.players.every((player:any)=>!player.ready));
  const repeated=await workerAction(env,host,{type:'configure',config},crypto.randomUUID(),change.envelope);assert.equal(repeated.result.duplicate,true);
  for(const socket of [host,peer])assert.equal((await workerAction(env,socket,{type:'ready',ready:true})).result.ok,true);
  assert.equal((await workerAction(env,host,{type:'start'})).result.ok,true);
  let record=await env.ctx.storage.get<any>('room');assert.equal(record.serverRoom.game.phase,'draft');assert.equal(record.configFrozen,true);
  const draft=record.serverRoom.game.draft,actor=draft.order[draft.cursor],socket=actor===env.created.identity.playerId?host:peer;
  assert.equal((await workerAction(env,socket,{type:'draft',characterId:draft.market[0]})).result.ok,true);
  record=await env.ctx.storage.get<any>('room');
  for(const client of [host,peer]){const snapshot=client.sent.filter(message=>message.type==='snapshot').at(-1).room;assert(snapshot.players.filter((player:any)=>player.id!==snapshot.selfId).every((player:any)=>player.hand===undefined&&player.selection===undefined));assert(!JSON.stringify(snapshot).includes('randomStream'));assert(!JSON.stringify(snapshot).includes('rngState'));}
  const before=JSON.stringify(record.serverRoom);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:guest.identity.playerId,room:{...guest.room,version:999},phase:'finished',adminHostId:env.created.identity.playerId}));
  assert.equal(JSON.stringify((await env.ctx.storage.get<any>('room')).serverRoom),before);
  assert.match(host.sent.at(-1).message,/只有当前主持|权威/);
  assert.equal((await workerAction(env,host,{type:'configure',config:legacyRoomConfig()})).result.ok,false);
  await env.relay.webSocketClose(host,1000,'owner refresh',true);
  const restored=await instance(env.ctx.storage,env.ctx.sockets),returned=await authenticate({...restored,created:env.created});
  assert.equal(returned.sent.find(message=>message.type==='auth-ok').authorityOnline,true);
  assert.equal(returned.sent.filter(message=>message.type==='snapshot').at(-1).room.phase,'draft');
  assert.equal((await restored.ctx.storage.get<any>('room')).serverRoom.game.randomStream.algorithm,'chacha20-v1');
});
test('worker commits a rule action and resend receipt atomically; failed storage neither consumes the action nor acknowledges success',async()=>{
  const env=await modern(),host=await authenticate(env),before=(await env.ctx.storage.get<any>('room')).serverRoom;
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:before.version,action:{type:'ready',ready:true}};
  env.ctx.storage.failPut=`action-receipt:${env.created.identity.playerId}:${envelope.actionId}`;
  const failed=await workerAction(env,host,envelope.action,'disk-failed',envelope);assert.equal(failed.result,undefined);
  assert.equal((await env.ctx.storage.get<any>('room')).serverRoom.game.players[0].ready,false);
  const succeeded=await workerAction(env,host,envelope.action,'disk-retry',envelope);assert.equal(succeeded.result.ok,true);
  const again=await workerAction(env,host,envelope.action,'disk-repeat',envelope);assert.equal(again.result.duplicate,true);
  assert.equal((await env.ctx.storage.get<any>('room')).serverRoom.version,succeeded.result.version);
});

test('worker preserves a private Leaf choice through last-tab disconnect, reconstruction and duplicate retry',async()=>controlledClock(async clock=>{
  const config=legacyRoomConfig('mixed');config.characterPacks['leaf-fan']=true;
  let env=await modern('practice',config),host=await authenticate(env);
  assert((await workerAction(env,host,{type:'practice-team',characterIds:['leaf-filmmaker','leaf-philanthropist','leaf-toucan','leaf-triangle-man']})).result.ok);
  assert((await workerAction(env,host,{type:'select',characterIds:['leaf-filmmaker']})).result.ok);
  let saved=await env.ctx.storage.get<any>('room'),pending=saved.serverRoom.game.pending;assert.equal(pending.kind,'leaf-film-card');
  const hand=[...saved.serverRoom.game.racers[0].flags.secretLeafHand],chosen=pending.options[0].id;
  await env.relay.webSocketClose(host,1000,'last tab disconnects',true);clock.now+=1_000;
  const restored=await instance(env.ctx.storage);env={...restored,created:env.created};host=await authenticate(env);
  assert.equal((await env.ctx.storage.get<any>('room')).serverRoom.game.pending.id,pending.id);
  const current=host.sent.filter(message=>message.type==='snapshot').at(-1).room;assert.equal(current.pending.id,pending.id);assert.equal(current.pending.options.length,7);
  const acted=await workerAction(env,host,{type:'choose',choiceId:pending.id,optionId:chosen});assert(acted.result.ok);
  saved=await env.ctx.storage.get<any>('room');assert.equal(saved.serverRoom.game.racers[0].flags.secretLeafHand.length,hand.length-1);
  const second=await instance(env.ctx.storage,env.ctx.sockets);env={...second,created:env.created};host=await authenticate(env);
  const duplicate=await workerAction(env,host,acted.envelope.action,'resend-choice',{...acted.envelope,expectedVersion:999});assert.equal(duplicate.result.duplicate,true);
  assert.equal((await env.ctx.storage.get<any>('room')).serverRoom.game.racers[0].flags.secretLeafHand.length,hand.length-1);
  const spectator=await spectate(env),viewer=await authenticate(env,spectator.identity),view=viewer.sent.filter(message=>message.type==='snapshot').at(-1).room;
  assert(!JSON.stringify(view).includes('secretLeafHand'));assert.equal(view.pending,undefined);assert(!JSON.stringify(view).includes('randomStream'));
}));

test('worker AI uses ordinary legal actions while connected and pauses without the personal owner',async()=>controlledClock(async clock=>{
  const env=await modern('ai'),host=await authenticate(env);let progressed=false;
  for(let step=0;step<250;step++){
    clock.now+=1_300;host.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();
    const saved=await env.ctx.storage.get<any>('room'),game=saved.serverRoom.game,self=env.created.identity.playerId;
    if(game.phase==='race'&&game.logs.some((event:any)=>['roll','die'].includes(event.type)&&game.racers.find((racer:any)=>racer.id===event.source)?.playerId!==self)){progressed=true;break;}
    const view=host.sent.filter(message=>message.type==='snapshot').at(-1)?.room as RoomView;
    let action:import('../src/shared/types.js').GameAction|undefined;
    if(view.phase==='draft'&&view.draft?.order[view.draft.cursor]===self)action={type:'draft',characterId:view.draft.market[0]!};
    else if(view.phase==='selection'&&!view.players.find(player=>player.id===self)!.selected)action={type:'select',characterIds:view.players.find(player=>player.id===self)!.hand!.slice(0,2)};
    else if(view.pending)action={type:'choose',choiceId:view.pending.id,optionId:(view.pending.options.find(option=>option.id==='skip')??view.pending.options[0]!).id};
    else if(view.phase==='race'&&view.turnStage==='roll'&&view.racers.find(racer=>racer.id===view.currentRacerId)?.playerId===self)action={type:'roll'};
    if(action)assert((await workerAction(env,host,action)).result.ok);
  }
  assert(progressed,'AI must progress through draft, selection and an actual race die using alarms');
  await env.relay.webSocketClose(host,1000,'personal owner leaves',true);const before=(await env.ctx.storage.get<any>('room')).serverRoom.game;
  clock.now+=10_000;await env.relay.alarm();const after=(await env.ctx.storage.get<any>('room')).serverRoom.game;assert.deepEqual(after,before);
}));

test('worker background rule exception persists a diagnostic pause instead of retrying every 10ms',async()=>controlledClock(async clock=>{
  let env=await modern('practice'),host=await authenticate(env);
  await workerAction(env,host,{type:'practice-team',characterIds:['blimp','banana','coach','alchemist']});await workerAction(env,host,{type:'select',characterIds:['blimp']});
  const broken=await env.ctx.storage.get<any>('room');broken.serverRoom.game.flags.awaitRoll=false;broken.serverRoom.game.flags.continuation=true;broken.serverRoom.game.queue=[{kind:'intentional-test-fault'}];await env.ctx.storage.put('room',broken);
  const restored=await instance(env.ctx.storage,env.ctx.sockets);env={...restored,created:env.created};host=await authenticate(env);clock.now+=10;host.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();
  const paused=await env.ctx.storage.get<any>('room');assert.equal(paused.phase,'paused');assert.equal(paused.serverRoom.game.phase,'paused');assert(paused.serverRoom.game.flags.workerFault);assert.equal(paused.serverRoom.game.queue[0].kind,'intentional-test-fault');assert.equal(paused.serverRoom.game.results.length,0);assert(paused.serverRoom.game.players.every((player:any)=>player.score===0));
  const version=paused.serverRoom.version,receipts=(await env.ctx.storage.list({prefix:'action-receipt:'})).size;
  for(let i=0;i<4;i++){clock.now+=10;host.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();}
  assert.equal((await env.ctx.storage.get<any>('room')).serverRoom.version,version);assert.equal((await env.ctx.storage.list({prefix:'action-receipt:'})).size,receipts);assert(env.ctx.storage.alarmAt!>clock.now+1_000);
  const publicView=host.sent.filter(message=>message.type==='snapshot').at(-1).room;assert.match(publicView.rulesStatus,/暂停/);assert(!JSON.stringify(publicView).includes('intentional-test-fault'));
  assert((await workerAction(env,host,{type:'close'})).result.ok);assert.deepEqual([...env.ctx.storage.values.keys()],['closed']);
}));

test('worker refuses an insufficient independent role pool before reserving capacity or persisting a ghost room',async()=>{
  const ns=await namespace(),config=legacyRoomConfig();config.characterPacks.original=false;config.characterPacks['leaf-fan']=true;
  const response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'insufficient-role-pool'},body:JSON.stringify({name:'资料验证',maxPlayers:8,config,requestId:crypto.randomUUID()})}),ns.env);
  assert.equal(response.status,400);assert.match((await response.json()).error,/至少需要32名/);assert.equal(ns.instances.size,0);
});

test('directory returns JSON 400 and 409 across a DO boundary that strips uncaught exception types',async()=>{
  const ns=await namespace(),get=ns.env.ROOMS.get;
  ns.env.ROOMS.get=(code:string)=>{const stub=get(code);return {fetch:async(input:string|Request,init?:RequestInit)=>{try{return await stub.fetch(input,init);}catch{return Response.json({error:'Remote Durable Object exception'},{status:503});}}};};
  const directory=ns.env.ROOMS.get('__room_directory__');
  const invalid=await directory.fetch('https://room.internal/directory/reserve',{method:'POST',body:JSON.stringify({requestId:'short',request:'invalid',mode:'multiplayer'})});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/建房请求格式/);
  const createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'cross-do-boundary'},body:JSON.stringify({name:'跨DO容量',maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()})}),ns.env);
  for(let index=0;index<30;index++){const response=await createRoom();assert.equal(response.status,201);await response.body?.cancel();}
  const full=await createRoom();assert.equal(full.status,409);assert.deepEqual(await full.json(),{error:'当前实时对战房间已满，请稍后重试。'});
});

test('capacity reaping after an unreported expiry retains completed create receipts across restart',async()=>controlledClock(async clock=>{
  const ns=await namespace(),requestId=crypto.randomUUID(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'retained-create-receipt'},body:JSON.stringify({name:'幂等期限',maxPlayers:2,requestId})}),ns.env);
  const response=await createRoom();assert.equal(response.status,201);const original=await response.json() as RelayJoinReply,directory=ns.instances.get('__room_directory__')!;
  // Simulate an unavailable directory while an idle room closes. The durable
  // slot remains and must be reclaimed by the next admission, not by a socket.
  ns.hooks.before=async(_code,request)=>{if(new URL(request.url).pathname==='/directory/remove')throw Error('directory temporarily unavailable');};
  clock.now+=ownerAwayMs({mode:'multiplayer'})+1;const current=ns.instances.get(original.identity.roomCode)!;await current.relay.alarm();assert(await directory.ctx.storage.get('capacity:'+original.identity.roomCode));
  ns.hooks.before=undefined;const restarted=new worker.RoomRelay(directory.ctx,ns.env);await directory.ctx.ready();directory.relay=restarted;
  const admitted=await restarted.fetch(new Request('https://room.internal/directory/reserve',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),request:'new creation',mode:'multiplayer'})}));assert.equal(admitted.status,200);
  assert.equal(await directory.ctx.storage.get('capacity:'+original.identity.roomCode),undefined);assert((await directory.ctx.storage.get<any>('creation:'+requestId)).reply);
  const retry=await createRoom();assert.equal(retry.status,201);assert.deepEqual(await retry.json(),original);assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,1);
}));

test('admission counts pre-limit legacy directory entries before accepting any new multiplayer room',async()=>{
  const ns=await namespace(),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let i=0;i<30;i++){
    const code='AAAA'+alphabet[Math.floor(i/32)]+alphabet[i%32];
    const response=await ns.env.ROOMS.get(code).fetch('https://room.internal/create/'+code,{method:'POST',body:JSON.stringify({name:'旧房间'+i,maxPlayers:2,timeoutSeconds:0})});
    assert.equal(response.status,201);await response.body?.cancel();
  }
  const directory=ns.instances.get('__room_directory__')!;
  await directory.ctx.storage.delete([...(await directory.ctx.storage.list({prefix:'capacity:'})).keys()]);
  assert.equal((await directory.ctx.storage.list({prefix:'directory:'})).size,30);
  const response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'legacy-directory-admission'},body:JSON.stringify({name:'第31间',maxPlayers:2,requestId:crypto.randomUUID()})}),ns.env);
  assert.equal(response.status,409);assert.match((await response.json()).error,/实时对战房间已满/);
  const listing=await directory.relay.fetch(new Request('https://room.internal/directory/list'));
  const listed=await listing.json();assert.equal(listed.rooms.length,30);assert.deepEqual(listed.capacity,{used:30,limit:30});
  assert.equal((await directory.ctx.storage.list({prefix:'creation:'})).size,0);
});

test('admission periodically reclaims an online-owner slot after a lost close publication without a directory listing',async()=>controlledClock(async clock=>{
  const ns=await namespace(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'lost-online-close'},body:JSON.stringify({name:'在线房主',maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()})}),ns.env);
  const created=await(await createRoom()).json() as RelayJoinReply,instance=ns.instances.get(created.identity.roomCode)!,env={...instance,created},host=await authenticate(env);
  const directory=ns.instances.get('__room_directory__')!,key='capacity:'+created.identity.roomCode;
  assert.equal((await directory.ctx.storage.get<any>(key)).expiresAt,Number.MAX_SAFE_INTEGER);
  ns.hooks.before=async(code,request)=>{if(code==='__room_directory__'&&new URL(request.url).pathname==='/directory/remove')throw Error('directory temporarily unreachable');};
  assert((await workerAction(env,host,{type:'close'})).result.ok);
  assert(await directory.ctx.storage.get(key));assert(await directory.ctx.storage.get('directory:'+created.identity.roomCode));
  ns.hooks.before=undefined;clock.now+=60_001;
  const replacement=await createRoom();assert.equal(replacement.status,201);await replacement.body?.cancel();
  assert.equal(await directory.ctx.storage.get(key),undefined);assert.equal(await directory.ctx.storage.get('directory:'+created.identity.roomCode),undefined);
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,1);
}));

test('capacity remote checks do not block a room that is already waiting to publish to the directory',async()=>controlledClock(async clock=>{
  const ns=await namespace(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'capacity-publish-interleave'},body:JSON.stringify({name:'容量并发',maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()})}),ns.env);
  const created=await(await createRoom()).json() as RelayJoinReply,instance=ns.instances.get(created.identity.roomCode)!,env={...instance,created};await authenticate(env);
  clock.now+=60_001;
  const publishing=deferred(),releasePublication=deferred(),checking=deferred();let hold=true;
  ns.hooks.before=async(code,request)=>{
    const path=new URL(request.url).pathname;
    if(hold&&code==='__room_directory__'&&path==='/directory/upsert'){hold=false;publishing.resolve();await releasePublication.promise;}
    if(code===created.identity.roomCode&&path.startsWith('/summary/'))checking.resolve();
  };
  const joining:Promise<Response>=ns.env.ROOMS.get(created.identity.roomCode).fetch('https://room.internal/join/'+created.identity.roomCode,{method:'POST',body:JSON.stringify({name:'并发加入'})});
  await bounded(publishing.promise);
  const reserving=createRoom();await bounded(checking.promise);releasePublication.resolve();
  const replies=await bounded(Promise.all([joining,reserving]));for(const response of replies){assert.equal(response.status,201);await response.body?.cancel();}
  assert.equal((await ns.instances.get('__room_directory__')!.ctx.storage.list({prefix:'capacity:'})).size,2);
}));

test('a delayed capacity summary cannot replace a newer owner-presence publication',async()=>controlledClock(async clock=>{
  const ns=await namespace(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'capacity-stale-summary'},body:JSON.stringify({name:'重连竞态',maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()})}),ns.env);
  const created=await(await createRoom()).json() as RelayJoinReply,instance=ns.instances.get(created.identity.roomCode)!,env={...instance,created},directory=ns.instances.get('__room_directory__')!;
  clock.now+=60_001;
  const checked=deferred(),release=deferred();let hold=true;
  ns.hooks.after=async(code,request)=>{if(hold&&code===created.identity.roomCode&&new URL(request.url).pathname.startsWith('/summary/')){hold=false;checked.resolve();await release.promise;}};
  const pending:Promise<Response>=createRoom();await bounded(checked.promise);await authenticate(env);
  const key='capacity:'+created.identity.roomCode,confirmed=await directory.ctx.storage.get<any>(key);assert.equal(confirmed.expiresAt,Number.MAX_SAFE_INTEGER);
  release.resolve();const response=await bounded(pending);assert.equal(response.status,201);await response.body?.cancel();
  assert.deepEqual(await directory.ctx.storage.get(key),confirmed);
}));

test('worker stale readiness uses the transport retry policy when another player prepared first',async()=>{
  const env=await modern(),host=await authenticate(env),guest=await join(env),peer=await authenticate(env,guest.identity);
  const common=(peer.sent.filter(message=>message.type==='snapshot').at(-1)!.room as RoomView).version;
  assert((await workerAction(env,host,{type:'ready',ready:true})).result.ok);
  const latest=peer.sent.filter(message=>message.type==='snapshot').at(-1)!.room as RoomView;
  const {BrowserRelayConnection}=await import('../src/client/browser-connection.js');let calls=0;
  const connection=Object.assign(Object.create(BrowserRelayConnection.prototype),{latestRoom:latest,requestOnce:async(envelope:ActionEnvelope)=>{calls++;return(await workerAction(env,peer,envelope.action,crypto.randomUUID(),envelope)).result;}}) as InstanceType<typeof BrowserRelayConnection>;
  const result=await connection.request({actionId:crypto.randomUUID(),expectedVersion:common,action:{type:'ready',ready:true}});
  assert(result.ok);assert.equal(calls,2);assert((await env.ctx.storage.get<any>('room')).serverRoom.game.players.every((player:any)=>player.ready));
});

test('a late room creation cannot revive an abandoned reservation after all thirty slots were reassigned',async()=>controlledClock(async clock=>{
  const ns=await namespace(),createRoom=()=>worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',headers:{'CF-Connecting-IP':'late-reservation-create'},body:JSON.stringify({name:'延迟建房',maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()})}),ns.env);
  const delayed=deferred(),release=deferred();let originalCode:string|undefined;
  ns.hooks.before=async(code,request)=>{if(!originalCode&&new URL(request.url).pathname.startsWith('/create/')){originalCode=code;delayed.resolve();await release.promise;}};
  const original:Promise<Response>=createRoom();await bounded(delayed.promise);clock.now+=60_001;
  for(let i=0;i<30;i++){const response=await createRoom();assert.equal(response.status,201);await response.body?.cancel();}
  const directory=ns.instances.get('__room_directory__')!;assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,30);
  release.resolve();const rejected=await bounded(original);assert.equal(rejected.status,409);assert.match((await rejected.json()).error,/实时对战房间已满/);
  assert.equal(await ns.instances.get(originalCode!)!.ctx.storage.get('room'),undefined);
  assert.equal((await directory.ctx.storage.list({prefix:'capacity:'})).size,30);assert.equal((await directory.ctx.storage.list({prefix:'directory:'})).size,30);
}));

test('idle authoritative room never schedules the no-deadline sentinel as an alarm date',async()=>controlledClock(async clock=>{
  const env=await modern(),host=await authenticate(env),original=env.ctx.storage.alarmAt;
  await env.relay.webSocketMessage(host,JSON.stringify({type:'sync',requestId:'idle-owner-sync'}));assert.equal(env.ctx.storage.alarmAt,original);
  clock.now+=35_000;host.lastAutoResponseAt=new Date(clock.now);env.ctx.storage.alarmAt=null; // Platform consumes the current alarm before invocation.
  await env.relay.alarm();assert.equal(env.ctx.storage.alarmAt,clock.now+35_000);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
  await env.relay.webSocketMessage(host,JSON.stringify({type:'sync',requestId:'second-idle-sync'}));assert.equal(env.ctx.storage.alarmAt,clock.now+35_000);
  assert(!host.sent.some(message=>message.type==='error'&&/2189|Invalid.*date/.test(message.message)));
}));
