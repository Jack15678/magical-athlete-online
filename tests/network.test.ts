import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.js';
import type { Identity, RoomView, ActionEnvelope, ActionReply, GameAction } from '../src/shared/types.js';
import { automaticAction,applyGameAction } from '../src/engine/index.js';
import { ROOM_TTL_MS } from '../src/shared/constants.js';

async function running(db=':memory:') {const a=createApplication(db);await new Promise<void>(r=>a.http.listen(0,'127.0.0.1',r));const addr=a.http.address();assert(addr&&typeof addr==='object');return {...a,url:`http://127.0.0.1:${addr.port}`};}
async function post(url:string,path:string,data:unknown) {const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
async function connect(url:string,identity:Identity) {const socket=io(url,{auth:identity,transports:['websocket'],reconnection:false,forceNew:true});let view:RoomView|undefined;socket.on('snapshot',s=>view=s);await new Promise<void>((r,j)=>{socket.once('connect',()=>r());socket.once('connect_error',j);});await new Promise<void>((r,j)=>{if(view)return r();const t=setTimeout(()=>j(Error('snapshot timeout')),3000);socket.once('snapshot',()=>{clearTimeout(t);r();});});return {socket,get view(){assert(view);return view;}};}
async function emit(socket:Socket,envelope:unknown):Promise<ActionReply> {return await new Promise((r,j)=>socket.timeout(4000).emit('action',envelope,(e:Error|null,a:ActionReply)=>e?j(e):r(a)));}
function event<T>(socket:Socket,name:string):Promise<T> {return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`${name} timeout`)),3000);socket.once(name,(value:T)=>{clearTimeout(timer);resolve(value);});});}
async function rejectedConnection(url:string,identity:Identity):Promise<string> {const socket=io(url,{auth:identity,transports:['websocket'],reconnection:false,forceNew:true});try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('connect rejection timeout')),3000);socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message);});socket.once('connect',()=>{clearTimeout(timer);reject(Error('closed room accepted connection'));});});}finally{socket.disconnect();}}

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

test('Node关闭：仅当前房主可解散大厅，先确认再通知全部标签并断开，不影响其他房间',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const created=await post(app.url,'/api/rooms',{name:'创建者',maxPlayers:2,timeoutSeconds:30});const host=created.body.identity as Identity;
    const joined=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'朋友'});const guest=joined.body.identity as Identity;
    const one=await connect(app.url,host),two=await connect(app.url,host),three=await connect(app.url,guest);sockets.push(one.socket,two.socket,three.socket);
    const elsewhere=await post(app.url,'/api/rooms',{name:'另一房间',maxPlayers:2,timeoutSeconds:0});const other=await connect(app.url,elsewhere.body.identity);sockets.push(other.socket);
    let unrelatedNotices=0;other.socket.on('room-closed',()=>unrelatedNotices++);const otherBefore=structuredClone(app.rooms.get(elsewhere.body.identity.roomCode));
    const command=(socket:Socket,action:GameAction)=>emit(socket,{actionId:randomUUID(),expectedVersion:app.rooms.get(host.roomCode).version,action});
    const denied=await command(three.socket,{type:'close'});assert.equal(denied.ok,false);assert.match(denied.error??'',/只有房主/);
    assert.equal(app.rooms.get(host.roomCode).closedAt,undefined);assert.ok(sockets.every(s=>s.connected));
    assert.equal((await command(one.socket,{type:'transfer',playerId:guest.playerId})).ok,true);
    const former=await command(one.socket,{type:'close'});assert.equal(former.ok,false);assert.match(former.error??'',/只有房主/);
    const sequence:string[]=[];three.socket.once('room-closed',()=>sequence.push('closed'));
    const clients=[one.socket,two.socket,three.socket];const notices=clients.map(s=>event<{code:string;closedAt:number}>(s,'room-closed'));const disconnected=clients.map(s=>event(s,'disconnect'));
    const envelope:ActionEnvelope={actionId:randomUUID(),expectedVersion:app.rooms.get(host.roomCode).version,action:{type:'close'}};
    const result=await new Promise<ActionReply>((resolve,reject)=>three.socket.timeout(4000).emit('action',envelope,(error:Error|null,reply:ActionReply)=>{sequence.push('ack');if(error)reject(error);else resolve(reply);}));
    assert.equal(result.ok,true);const received=await Promise.all(notices);await Promise.all(disconnected);
    const sealed=structuredClone(app.rooms.get(host.roomCode));assert.equal(sealed.game.phase,'lobby');assert.equal(typeof sealed.closedAt,'number');assert.equal(sealed.deadline,null);
    assert.deepEqual(sequence,['ack','closed']);assert.deepEqual(received,clients.map(()=>({code:host.roomCode,closedAt:sealed.closedAt})));
    assert.equal(app.rooms.view(sealed,host.playerId).closedAt,sealed.closedAt);assert.ok(clients.every(s=>!s.connected));
    assert.equal(other.socket.connected,true);assert.equal(unrelatedNotices,0);assert.deepEqual(app.rooms.get(otherBefore.code),otherBefore);
    assert.equal(app.rooms.act(host.roomCode,guest.playerId,envelope).duplicate,true);
    const again=app.rooms.act(host.roomCode,guest.playerId,{actionId:randomUUID(),expectedVersion:sealed.version,action:{type:'ready',ready:true}});assert.equal(again.ok,false);assert.match(again.error??'',/房间已解散/);
    app.rooms.presence(host.roomCode,guest.playerId,false);assert.deepEqual(app.rooms.tick(Date.now()+60_000),[]);assert.deepEqual(app.rooms.get(host.roomCode),sealed);
    const late=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'迟到者'});assert.equal(late.status,400);assert.match(late.body.error,/房间已解散/);
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node关闭：比赛和排队结算立即封存，重启不能通过旧凭据或邀请复活',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'athlete-closed-'));const path=join(dir,'rooms.sqlite');let app=await running(path);
  try {
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:30});const host=created.body.identity as Identity;
    const joined=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'朋友'});const guest=joined.body.identity as Identity;
    for(const identity of [host,guest])app.rooms.presence(host.roomCode,identity.playerId,true);
    const command=(id:string,action:GameAction)=>{const room=app.rooms.get(host.roomCode);const result=app.rooms.act(room.code,id,{actionId:randomUUID(),expectedVersion:room.version,action});assert.equal(result.ok,true,result.error);};
    command(host.playerId,{type:'ready',ready:true});command(guest.playerId,{type:'ready',ready:true});command(host.playerId,{type:'start'});
    for(let guard=0;app.rooms.get(host.roomCode).game.phase!=='race';guard++){assert.ok(guard<100);const next=automaticAction(app.rooms.get(host.roomCode).game);assert.ok(next);command(next.playerId,next.action);}
    const racing=app.rooms.get(host.roomCode);assert.ok(racing.game.racers.length);
    // Preserve runnable work to catch both timer and startup-continuation revival.
    racing.game.pending=undefined;racing.game.flags.continuation=true;racing.game.queue=[{kind:'gain',racerId:racing.game.racers[0]!.id,amount:99}];racing.deadline=Date.now()-1;
    const game=structuredClone(racing.game);const envelope:ActionEnvelope={actionId:randomUUID(),expectedVersion:racing.version,action:{type:'close'}};
    assert.equal(app.rooms.act(host.roomCode,host.playerId,envelope).ok,true);const sealed=structuredClone(app.rooms.get(host.roomCode));assert.deepEqual(sealed.game,game);assert.equal(sealed.deadline,null);
    assert.deepEqual(app.rooms.tick(Date.now()+60_000),[]);app.rooms.presence(host.roomCode,host.playerId,false);assert.deepEqual(app.rooms.get(host.roomCode),sealed);
    await app.close();app=await running(path);await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual(app.rooms.get(host.roomCode),JSON.parse(JSON.stringify(sealed)));
    for(const identity of [host,guest]){assert.throws(()=>app.rooms.authenticate(identity),/房间已解散/);assert.match(await rejectedConnection(app.url,identity),/房间已解散/);}
    const late=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'回来的人'});assert.equal(late.status,400);assert.match(late.body.error,/房间已解散/);
    assert.equal(app.rooms.act(host.roomCode,host.playerId,envelope).duplicate,true);
    const denied=app.rooms.act(host.roomCode,host.playerId,{actionId:randomUUID(),expectedVersion:sealed.version,action:{type:'next'}});assert.equal(denied.ok,false);assert.match(denied.error??'',/房间已解散/);
    assert.deepEqual(app.rooms.tick(Date.now()+60_000),[]);assert.deepEqual(app.rooms.get(host.roomCode),JSON.parse(JSON.stringify(sealed)));
  } finally {await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('Node关闭：SQLite提交失败不确认、不通知、不断线，重试原编号才真正关闭',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0});const host=created.body.identity as Identity;
    const joined=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'朋友'});const guest=joined.body.identity as Identity;
    for(const identity of [host,guest])sockets.push((await connect(app.url,identity)).socket);
    let notices=0;for(const socket of sockets)socket.on('room-closed',()=>notices++);
    const before=structuredClone(app.rooms.get(host.roomCode));const envelope:ActionEnvelope={actionId:randomUUID(),expectedVersion:before.version,action:{type:'close'}};
    const save=app.store.save.bind(app.store);app.store.save=room=>{save(room);if(room.closedAt!==undefined)throw Error('模拟关闭提交失败');};
    try {const failed=await emit(sockets[0]!,envelope);assert.equal(failed.ok,false);assert.match(failed.error??'',/模拟关闭提交失败/);}
    finally {app.store.save=save;}
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(notices,0);assert.ok(sockets.every(s=>s.connected));assert.deepEqual(app.rooms.get(host.roomCode),before);assert.deepEqual(app.store.load().find(room=>room.code===host.roomCode),JSON.parse(JSON.stringify(before)));
    assert.equal(app.store.receipt(host.roomCode,host.playerId,envelope.actionId),undefined);
    const closed=sockets.map(socket=>event(socket,'room-closed'));const disconnected=sockets.map(socket=>event(socket,'disconnect'));
    const success=await emit(sockets[0]!,envelope);assert.equal(success.ok,true);assert.equal(success.duplicate,undefined);await Promise.all(closed);await Promise.all(disconnected);assert.equal(notices,2);
    assert.equal(app.store.receipt(host.roomCode,host.playerId,envelope.actionId)?.result.ok,true);assert.equal(typeof app.rooms.get(host.roomCode).closedAt,'number');
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node public event backfill is authenticated, byte-bounded and independent from private room state',async()=>{
  const app=await running();let socket:Socket|undefined;
  try{
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0});const identity=created.body.identity as Identity;
    const client=await connect(app.url,identity);socket=client.socket;const room=app.rooms.get(identity.roomCode);
    room.game.players[0]!.hand=['private-hand'];room.game.pending={id:'secret',playerId:identity.playerId,title:'选择',kind:'test',optional:false,options:[],context:{secret:'private-context'}};
    room.game.logs=Array.from({length:500},(_,index)=>({id:index+1,type:'power',text:'公开技能说明'.repeat(200)}));
    const read=(query:unknown)=>new Promise<any>((resolve,reject)=>socket!.timeout(4000).emit('events',query,(error:Error|null,reply:unknown)=>error?reject(error):resolve(reply)));
    const reply=await read({afterId:0});assert.equal(reply.ok,true);assert(reply.batch.events.length>0&&reply.batch.events.length<500);
    assert(Buffer.byteLength(JSON.stringify(reply.batch))<=96*1024);assert(!JSON.stringify(reply).match(/private-hand|private-context|rngState/));
    assert.equal((await read({afterId:0,playerId:'outsider'})).ok,false);assert.equal((await read({afterId:-1})).ok,false);
  }finally{socket?.disconnect();await app.close();}
});

test('Node room directory lists safe live metadata and lobby departures free the original seat',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:3,timeoutSeconds:0});const host=created.body.identity as Identity;
    const first=(await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'先加入'})).body.identity as Identity;
    const second=(await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'后加入'})).body.identity as Identity;
    for(const id of [host,first,second])sockets.push((await connect(app.url,id)).socket);
    const disconnected=event(sockets[1]!,'disconnect');
    assert.deepEqual((await post(app.url,`/api/rooms/${host.roomCode}/leave`,first)).body,{ok:true,retainIdentity:false});await disconnected;
    assert.equal(app.store.identity(host.roomCode,first.playerId),undefined);assert.throws(()=>app.rooms.authenticate(first),/身份已失效/);
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,first)).status,401);
    assert.equal(app.rooms.get(host.roomCode).game.players.find(p=>p.id===second.playerId)?.seat,2);
    const replacement=(await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'补位'})).body.identity as Identity;
    assert.equal(app.rooms.get(host.roomCode).game.players.find(p=>p.id===replacement.playerId)?.seat,1);
    const listed=await (await fetch(app.url+'/api/rooms')).json();assert.equal(listed.rooms.length,1);
    const summary=listed.rooms[0];assert.equal(summary.code,host.roomCode);assert.equal(summary.hostName,'房主');assert.equal(summary.playerCount,3);assert.equal(summary.spectatorCount,0);assert.equal(summary.expiresAt-summary.createdAt,ROOM_TTL_MS);
    assert(!JSON.stringify(listed).match(/token|playerId|rngState|hand|deck/));
    assert.deepEqual((await post(app.url,`/api/rooms/${host.roomCode}/leave`,host)).body,{ok:true,retainIdentity:false});
    assert.equal(app.rooms.get(host.roomCode).hostId,second.playerId);assert.equal(sockets[2]!.connected,true);
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node spectators can join a full running match, receive only public state, and leave without affecting players',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0});const host=created.body.identity as Identity;
    const guest=(await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'选手'})).body.identity as Identity;
    for(const id of [host,guest])sockets.push((await connect(app.url,id)).socket);
    const command=(id:string,action:GameAction)=>{const room=app.rooms.get(host.roomCode);assert.equal(app.rooms.act(room.code,id,{actionId:randomUUID(),expectedVersion:room.version,action}).ok,true);};
    command(host.playerId,{type:'ready',ready:true});command(guest.playerId,{type:'ready',ready:true});command(host.playerId,{type:'start'});
    while(app.rooms.get(host.roomCode).game.phase==='draft'){const room=app.rooms.get(host.roomCode),next=automaticAction(room.game);assert(next);command(next.playerId,next.action);}
    const before=structuredClone(app.rooms.get(host.roomCode));assert.equal(before.game.phase,'selection');
    const watched=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'观众',role:'spectator'});assert.equal(watched.status,201);const identity=watched.body.identity as Identity;
    assert.equal(identity.role,'spectator');assert.equal(watched.body.room.role,'spectator');assert.equal(watched.body.room.players.length,2);
    const viewer=await connect(app.url,identity);sockets.push(viewer.socket);assert.equal(viewer.view.role,'spectator');assert(viewer.view.players.every(p=>p.hand===undefined&&p.selection===undefined));assert.equal(viewer.view.pending,undefined);
    assert.equal(app.rooms.list().find(room=>room.code===host.roomCode)?.spectatorCount,1);
    assert.equal(app.rooms.get(host.roomCode).hostId,before.hostId);assert.deepEqual(app.rooms.get(host.roomCode).game,before.game);
    const game=app.rooms.get(host.roomCode).game;game.logs.push({id:(game.logs.at(-1)?.id??0)+1,type:'notice',text:'公开播报'});
    const events=await new Promise<any>((resolve,reject)=>viewer.socket.timeout(4000).emit('events',{afterId:0},(error:Error|null,reply:unknown)=>error?reject(error):resolve(reply)));
    assert.equal(events.ok,true);assert(events.batch.events.some((e:any)=>e.text==='公开播报'));assert(!JSON.stringify(events).match(/rngState|selection|hand/));
    const version=app.rooms.get(host.roomCode).version;
    for(const action of [{type:'ready',ready:true},{type:'close'},{type:'transfer',playerId:host.playerId}] as GameAction[]){const reply=await emit(viewer.socket,{actionId:randomUUID(),expectedVersion:version,action});assert.equal(reply.ok,false);}
    assert.equal(app.rooms.get(host.roomCode).version,version);assert.throws(()=>app.rooms.authenticate({...identity,role:'player'}),/身份已失效/);
    const disconnected=event(viewer.socket,'disconnect');assert.deepEqual((await post(app.url,`/api/rooms/${host.roomCode}/leave`,identity)).body,{ok:true,retainIdentity:false});await disconnected;
    assert.equal(app.rooms.get(host.roomCode).spectators?.length,0);assert.equal(app.rooms.get(host.roomCode).game.players.length,2);assert.equal(app.store.identity(host.roomCode,identity.playerId),undefined);assert.throws(()=>app.rooms.authenticate(identity),/身份已失效/);
    const beforeLeave=structuredClone(app.rooms.get(host.roomCode).game);
    assert.deepEqual((await post(app.url,`/api/rooms/${host.roomCode}/leave`,guest)).body,{ok:true,retainIdentity:true});
    assert.equal(app.rooms.get(host.roomCode).game.players.find(p=>p.id===guest.playerId)?.connected,false);
    assert.equal(app.rooms.get(host.roomCode).game.players.find(p=>p.id===guest.playerId)?.hand.length,beforeLeave.players.find(p=>p.id===guest.playerId)?.hand.length);
    const resumed=await connect(app.url,guest);sockets.push(resumed.socket);assert.equal(resumed.view.selfId,guest.playerId);assert(resumed.view.players.find(p=>p.id===guest.playerId)?.hand?.length);
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node solo matches accept spectators but never give them a participant seat or control',async()=>{
  const app=await running();
  try {
    for(const mode of ['practice','ai']) {
      const created=await post(app.url,'/api/rooms',{name:'练习者',mode,aiCount:1,timeoutSeconds:0});const host=created.body.identity as Identity;
      const watched=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'观众',role:'spectator'});assert.equal(watched.status,201);assert.equal(watched.body.room.role,'spectator');
      assert.equal(watched.body.room.players.length,mode==='practice'?1:2);assert.equal(app.rooms.get(host.roomCode).hostId,host.playerId);
      assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,watched.body.identity)).body.retainIdentity,false);
    }
  } finally {await app.close();}
});

test('Node rooms expire exactly three hours after creation, purge credentials, and notify connected spectators and players',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const created=await post(app.url,'/api/rooms',{name:'房主',maxPlayers:2,timeoutSeconds:0});const host=created.body.identity as Identity;
    const spectator=(await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'观众',role:'spectator'})).body.identity as Identity;
    for(const id of [host,spectator])sockets.push((await connect(app.url,id)).socket);
    const room=app.rooms.get(host.roomCode),expiresAt=room.createdAt+ROOM_TTL_MS;room.updatedAt=expiresAt-1;app.store.save(room);
    assert.equal(app.rooms.list(expiresAt-1).length,1);
    const notices=sockets.map(socket=>event(socket,'room-closed'));const disconnections=sockets.map(socket=>event(socket,'disconnect'));
    assert.deepEqual(app.rooms.tick(expiresAt),[]);
    assert.deepEqual(await Promise.all(notices),sockets.map(()=>({code:host.roomCode,closedAt:expiresAt,reason:'expired'})));await Promise.all(disconnections);
    assert.equal(app.rooms.rooms.has(host.roomCode),false);assert.deepEqual(app.store.load(),[]);for(const id of [host,spectator])assert.equal(app.store.identity(host.roomCode,id.playerId),undefined);
    assert.equal((await (await fetch(app.url+'/api/rooms')).json()).rooms.length,0);assert.throws(()=>app.rooms.authenticate(host),/过期/);
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'迟到'})).status,400);
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node startup and get purge expired rooms even when their last update was recent',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'athlete-expiry-'));const path=join(dir,'rooms.sqlite');let app=await running(path);
  try {
    const old=app.rooms.create('旧房间',2,0),fresh=app.rooms.create('新房间',2,0);
    const room=app.rooms.get(old.identity.roomCode);room.createdAt=Date.now()-ROOM_TTL_MS;room.updatedAt=Date.now();app.store.save(room);
    await app.close();app=await running(path);assert.equal(app.rooms.rooms.has(old.identity.roomCode),false);assert.equal(app.store.identity(old.identity.roomCode,old.identity.playerId),undefined);assert.equal(app.store.load().length,1);
    const loaded=app.rooms.get(fresh.identity.roomCode);loaded.createdAt=Date.now()-ROOM_TTL_MS;assert.throws(()=>app.rooms.get(loaded.code),/过期/);assert.deepEqual(app.store.load(),[]);
  } finally {await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('Node lobby departure only disconnects clients after the identity removal transaction commits',async()=>{
  const app=await running();const sockets:Socket[]=[];
  try {
    const host=app.rooms.create('房主',2,0).identity,guest=app.rooms.join(host.roomCode,'朋友').identity;
    for(const id of [host,guest])sockets.push((await connect(app.url,id)).socket);
    const before=structuredClone(app.rooms.get(host.roomCode));const save=app.store.save.bind(app.store);
    app.store.save=room=>{save(room);throw Error('模拟退出提交失败');};
    try {const failed=await post(app.url,`/api/rooms/${host.roomCode}/leave`,guest);assert.equal(failed.status,400);assert.match(failed.body.error,/模拟退出提交失败/);} finally {app.store.save=save;}
    assert.deepEqual(app.rooms.get(host.roomCode),before);assert.deepEqual(app.store.load()[0],JSON.parse(JSON.stringify(before)));assert(app.store.identity(host.roomCode,guest.playerId));assert(sockets.every(socket=>socket.connected));
  } finally {for(const socket of sockets)socket.disconnect();await app.close();}
});

test('Node leave distinguishes stale credentials, expired or closed rooms, and input errors so local exit can recover',async()=>{
  const app=await running();
  try {
    const host=app.rooms.create('房主',2,0).identity,spectator=app.rooms.join(host.roomCode,'观众','spectator').identity;
    assert.equal(app.rooms.list()[0]?.spectatorCount,0);
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,{...spectator,token:'x'.repeat(43)})).status,401);
    assert.deepEqual((await post(app.url,`/api/rooms/${host.roomCode}/leave`,spectator)).body,{ok:true,retainIdentity:false});
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,spectator)).status,401);
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,{...host,extra:true})).status,400);
    const closed=app.rooms.create('解散房主',2,0).identity;const room=app.rooms.get(closed.roomCode);
    assert.equal(app.rooms.act(room.code,closed.playerId,{actionId:randomUUID(),expectedVersion:room.version,action:{type:'close'}}).ok,true);
    assert.equal((await post(app.url,`/api/rooms/${closed.roomCode}/leave`,closed)).status,410);
    app.rooms.get(host.roomCode).createdAt=Date.now()-ROOM_TTL_MS;
    assert.equal((await post(app.url,`/api/rooms/${host.roomCode}/leave`,host)).status,404);
  } finally {await app.close();}
});

test('Node personal room counts concurrent owner sockets, restores absence on reconnect, and dismisses through the authenticated action',async()=>{
  const app=await running(),sockets:Socket[]=[];
  const settled=async(predicate:()=>boolean)=>{for(let attempt=0;!predicate();attempt++){assert(attempt<100,'server presence did not settle');await new Promise(resolve=>setTimeout(resolve,5));}};
  try{
    const created=await post(app.url,'/api/rooms',{name:'练习者',mode:'practice',timeoutSeconds:0}),identity=created.body.identity as Identity;
    const one=await connect(app.url,identity),two=await connect(app.url,identity);sockets.push(one.socket,two.socket);
    assert.equal((await (await fetch(app.url+'/api/rooms')).json()).rooms.some((room:{code:string})=>room.code===identity.roomCode),false);
    one.socket.disconnect();await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(app.rooms.get(identity.roomCode).game.players[0]!.connected,true);assert.equal(app.rooms.get(identity.roomCode).hostLeftAt,undefined);
    two.socket.disconnect();await settled(()=>app.rooms.get(identity.roomCode).hostLeftAt!==undefined);
    const leftAt=app.rooms.get(identity.roomCode).hostLeftAt!;assert.equal(app.rooms.view(app.rooms.get(identity.roomCode),identity.playerId).expiresAt,leftAt+30*60*1000);
    const returned=await connect(app.url,identity);sockets.push(returned.socket);assert.equal(returned.view.hostLeftAt,undefined);assert.equal(app.rooms.get(identity.roomCode).hostLeftAt,undefined);
    const notice=event<{reason:string}>(returned.socket,'room-closed'),disconnected=event(returned.socket,'disconnect');
    const result=await emit(returned.socket,{actionId:randomUUID(),expectedVersion:app.rooms.get(identity.roomCode).version,action:{type:'close'}});
    assert.equal(result.ok,true);assert.equal((await notice).reason,'dismissed');await disconnected;
    assert.equal(app.rooms.rooms.has(identity.roomCode),false);assert.deepEqual(app.rooms.tick(),[]);assert.match(await rejectedConnection(app.url,identity),/房间已关闭/);
    assert.equal((await post(app.url,`/api/rooms/${identity.roomCode}/leave`,identity)).status,410);
  }finally{for(const socket of sockets)socket.disconnect();await app.close();}
});
