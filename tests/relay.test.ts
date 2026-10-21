import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { ActionEnvelope, Identity, RoomView } from '../src/shared/types.js';
import type { RelayJoinReply } from '../src/shared/relay.js';
import { MAX_SPECTATORS } from '../src/shared/constants.js';
import { PERSONAL_ROOM_AWAY_MS } from '../src/shared/room-lifecycle.js';

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
  let rooms=await listedRooms(ns.env);assert.equal(rooms.length,2);assert(rooms.every(room=>!room.authorityOnline));assert.deepEqual(rooms.map(room=>room.mode).sort(),['ai','multiplayer']);
  assert.equal(rooms.find(room=>room.mode==='ai')!.expiresAt-rooms.find(room=>room.mode==='ai')!.createdAt,PERSONAL_ROOM_AWAY_MS);
  assert.equal(rooms.find(room=>room.mode==='multiplayer')!.expiresAt-rooms.find(room=>room.mode==='multiplayer')!.createdAt,PERSONAL_ROOM_AWAY_MS);
  const first=created[0]!,active=ns.instances.get(first.identity.roomCode)!,env={...active,created:first},host=await authenticate(env,first.identity,true);
  const spectatorResponse=await worker.default.fetch(new Request(`https://game.test/api/browser/rooms/${first.identity.roomCode}/join`,{method:'POST',body:'{"name":"观众","role":"spectator"}'}),ns.env);assert.equal(spectatorResponse.status,201);
  assert.equal((await listedRooms(ns.env)).find(room=>room.code===first.identity.roomCode)!.spectatorCount,0);
  const spectator=await spectatorResponse.json() as RelayJoinReply;await authenticate(env,spectator.identity);
  rooms=await listedRooms(ns.env);assert.equal(rooms.find(room=>room.code===first.identity.roomCode)!.spectatorCount,1);assert.equal(rooms.find(room=>room.code===first.identity.roomCode)!.authorityOnline,true);assert(!JSON.stringify(rooms).includes(first.identity.token));assert(!JSON.stringify(rooms).includes('tokenHash'));
  const state=host.deserializeAttachment() as any;state.authorityLeaseAt=Date.now()-40_000;host.serializeAttachment(state);
  assert.equal((await listedRooms(ns.env)).find(room=>room.code===first.identity.roomCode)!.authorityOnline,false);
  const recovered=await authenticate(env,first.identity,true),requestId='directory-close';await closeIntent(env,recovered,requestId);await deliver(env,recovered,first.identity.playerId,{...first.room,version:2,closedAt:Date.now()},requestId);
  assert(!(await listedRooms(ns.env)).some(room=>room.code===first.identity.roomCode));
  const expired=created[2]!,old=ns.instances.get(expired.identity.roomCode)!,record=await old.ctx.storage.get<any>('room');record.hostLeftAt=Date.now()-PERSONAL_ROOM_AWAY_MS;await old.ctx.storage.put('room',record);
  const restored=new worker.RoomRelay(old.ctx,ns.env);await old.ctx.ready();old.relay=restored;
  assert(!(await listedRooms(ns.env)).some(room=>room.code===expired.identity.roomCode));
});

test('directory listing cannot deadlock with a room publishing presence',async()=>{
  const ns=await namespace(),response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:'{"name":"并发房间"}'}),ns.env),created=await response.json() as RelayJoinReply;
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},publishing=deferred(),release=deferred(),reading=deferred();
  ns.hooks.before=async(_code,request)=>{const path=new URL(request.url).pathname;if(path==='/directory/upsert'){publishing.resolve();await release.promise;}if(path.startsWith('/summary/'))reading.resolve();};
  const auth=authenticate(env,created.identity,true);await publishing.promise;const listing=listedRooms(ns.env);await reading.promise;release.resolve();
  const [,rooms]=await bounded(Promise.all([auth,listing]));assert.equal(rooms.length,1);assert.equal(rooms[0]!.authorityOnline,true);
});

test('directory summary refresh cannot resurrect a room removed after the summary was read',async()=>{
  const ns=await namespace(),response=await worker.default.fetch(new Request('https://game.test/api/browser/rooms',{method:'POST',body:'{"name":"并发关闭"}'}),ns.env),created=await response.json() as RelayJoinReply;
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},host=await authenticate(env,created.identity,true),reading=deferred(),release=deferred();
  ns.hooks.after=async(_code,request)=>{if(new URL(request.url).pathname.startsWith('/summary/')){reading.resolve();await release.promise;}};
  const listing=listedRooms(ns.env);await reading.promise;await closeIntent(env,host,'raced-close');await deliver(env,host,created.identity.playerId,{...created.room,version:2,closedAt:Date.now()},'raced-close');release.resolve();await bounded(listing);
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
  const current=ns.instances.get(created.identity.roomCode)!,env={...current,created},host=await authenticate(env,created.identity,true);
  assert.deepEqual(await listedRooms(ns.env),[]);await deliver(env,host,created.identity.playerId,{...created.room,phase:'draft',version:2});assert.deepEqual(await listedRooms(ns.env),[]);
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

test('multiplayer relay owner is stable through management takeover and guest activity cannot cancel absence',async()=>controlledClock(async clock=>{
  const env=await create(),owner=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  await env.relay.webSocketMessage(owner,JSON.stringify({type:'deliver',to:guest.identity.playerId,room:{...guest.room,hostId:guest.identity.playerId},phase:'lobby',adminHostId:guest.identity.playerId}));
  assert.equal((await env.ctx.storage.get<any>('room')).ownerId,env.created.identity.playerId);
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
  assert(host.sent.some(message=>message.type==='ack'&&message.requestId==='replayed-self-transfer'&&message.result.duplicate));
  clock.now=departed+PERSONAL_ROOM_AWAY_MS;peer.lastAutoResponseAt=new Date(clock.now);await env.relay.alarm();assert.equal((await env.ctx.storage.get<any>('closed')).closedAt,departed+PERSONAL_ROOM_AWAY_MS);
}));

test('a departing pending transfer target retains its identity and a recovered receipt owns it even after automatic management takeover',async()=>controlledClock(async clock=>{
  const env=await create(),host=await authenticate(env,env.created.identity,true),guest=await join(env),peer=await authenticate(env,guest.identity);
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'transfer',playerId:guest.identity.playerId}};
  await env.relay.webSocketMessage(host,JSON.stringify({type:'action',requestId:'pending-transfer',envelope}));
  const response=await env.relay.fetch(new Request('https://room.internal/leave/ABC234',{method:'POST',body:JSON.stringify(guest.identity)}));assert.equal(response.status,200);assert.equal((await response.json()).retainIdentity,true);assert.equal(peer.closeCode,4401);
  const restored={...env,...await instance(env.ctx.storage,env.ctx.sockets)};
  const deliverReceipt=(result:unknown)=>restored.relay.webSocketMessage(host,JSON.stringify({type:'deliver',to:env.created.identity.playerId,requestId:'pending-transfer',result,room:{...env.created.room,version:4,hostId:env.created.identity.playerId},phase:'lobby',adminHostId:env.created.identity.playerId}));
  await deliverReceipt({ok:true});assert.match(host.sent.at(-1).message,/移交确认版本/);assert(await env.ctx.storage.get<any>('room').then(record=>record.pendingOwnerTransfer));
  await deliverReceipt({ok:true,duplicate:true,version:2});const record=await env.ctx.storage.get<any>('room');assert.equal(record.ownerId,guest.identity.playerId);assert.equal(record.adminHostId,env.created.identity.playerId);assert.equal(record.pendingOwnerTransfer,undefined);assert.equal(record.hostLeftAt,clock.now);
  const returning=await authenticate(restored,guest.identity);assert.equal(returning.readyState,1);assert.equal((await env.ctx.storage.get<any>('room')).hostLeftAt,undefined);
}));
