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
    app.rooms.presence(host.roomCode,guest.playerId,false);assert.deepEqual(app.rooms.tick(Date.now()+86_400_000),[]);assert.deepEqual(app.rooms.get(host.roomCode),sealed);
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
    assert.deepEqual(app.rooms.tick(Date.now()+86_400_000),[]);app.rooms.presence(host.roomCode,host.playerId,false);assert.deepEqual(app.rooms.get(host.roomCode),sealed);
    await app.close();app=await running(path);await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual(app.rooms.get(host.roomCode),JSON.parse(JSON.stringify(sealed)));
    for(const identity of [host,guest]){assert.throws(()=>app.rooms.authenticate(identity),/房间已解散/);assert.match(await rejectedConnection(app.url,identity),/房间已解散/);}
    const late=await post(app.url,`/api/rooms/${host.roomCode}/join`,{name:'回来的人'});assert.equal(late.status,400);assert.match(late.body.error,/房间已解散/);
    assert.equal(app.rooms.act(host.roomCode,host.playerId,envelope).duplicate,true);
    const denied=app.rooms.act(host.roomCode,host.playerId,{actionId:randomUUID(),expectedVersion:sealed.version,action:{type:'next'}});assert.equal(denied.ok,false);assert.match(denied.error??'',/房间已解散/);
    assert.deepEqual(app.rooms.tick(Date.now()+86_400_000),[]);assert.deepEqual(app.rooms.get(host.roomCode),JSON.parse(JSON.stringify(sealed)));
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
