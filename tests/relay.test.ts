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
  readyState=1; attachment:unknown; sent:any[]=[]; closeCode?:number;
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
const act=(type:'start'|'roll'='roll'):ActionEnvelope=>({actionId:crypto.randomUUID(),expectedVersion:1,action:{type}});
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
  assert.equal((await worker.default.fetch(post({name:'a'.repeat(5000)}),env)).status,413);
  assert.equal((await worker.default.fetch(new Request('https://game.test/room/ABC234'),env)).status,200);
});
