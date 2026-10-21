import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBDatabase, IDBObjectStore } from 'fake-indexeddb';
import { BrowserAuthority, type AuthorityOptions } from '../src/browser/authority.js';
import { automaticAction } from '../src/engine/index.js';
import { createBrowserRoom, projectRoom, reduceRoomAction } from '../src/shared/room-core.js';
import { PLAYER_COLORS } from '../src/shared/constants.js';
import { ROOM_OWNER_AWAY_MS } from '../src/shared/room-lifecycle.js';
import type { ActionEnvelope, GameAction, Room } from '../src/shared/types.js';
import type { RelayMetadata } from '../src/shared/relay.js';

function metadata(count=2,timeoutSeconds=120):RelayMetadata {
  return { code:'ABC234',authorityId:'p0',adminHostId:'p0',maxPlayers:8,timeoutSeconds,phase:'lobby',createdAt:1_000,
    members:Array.from({length:count},(_,seat)=>({id:`p${seat}`,name:'同名同学',seat,connected:true})) };
}
function environment(seed=19) {
  const indexedDB=new IDBFactory();const databaseName=`authority-${crypto.randomUUID()}`;const clock={now:10_000};
  const options:AuthorityOptions={indexedDB,databaseName,now:()=>clock.now,randomSeed:()=>seed};
  return {indexedDB,databaseName,clock,options};
}
async function raw(env:ReturnType<typeof environment>,code='ABC234'):Promise<{code:string;authorityId:string;room:Room}> {
  return new Promise((resolve,reject)=>{
    const open=env.indexedDB.open(env.databaseName);open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result;const tx=db.transaction('rooms','readonly');const get=tx.objectStore('rooms').get(code);let result:unknown;
      get.onsuccess=()=>{result=get.result;};tx.oncomplete=()=>{db.close();resolve(result as {code:string;authorityId:string;room:Room});};tx.onabort=()=>{db.close();reject(tx.error);};};
  });
}
async function replace(env:ReturnType<typeof environment>,record:Awaited<ReturnType<typeof raw>>):Promise<void> {
  await new Promise<void>((resolve,reject)=>{const request=env.indexedDB.open(env.databaseName);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
    const db=request.result;const tx=db.transaction('rooms','readwrite');tx.objectStore('rooms').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
}
async function command(authority:BrowserAuthority,playerId:string,action:GameAction,actionId=crypto.randomUUID(),version=authority.view(playerId).version){
  const envelope:ActionEnvelope={actionId,expectedVersion:version,action};return{reply:await authority.action(playerId,envelope),envelope};
}
async function readyAndStart(authority:BrowserAuthority,meta:RelayMetadata) {
  for(const m of meta.members)assert.equal((await command(authority,m.id,{type:'ready',ready:true})).reply.ok,true);
  assert.equal((await command(authority,'p0',{type:'start'})).reply.ok,true);
}

test('close: only the current management host can dissolve a started room, and its receipt survives reload',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  assert.match((await command(a,'p1',{type:'close'})).reply.error??'',/只有房主/);
  await readyAndStart(a,meta);
  assert.equal((await command(a,'p0',{type:'transfer',playerId:'p1'})).reply.ok,true);
  assert.match((await command(a,'p0',{type:'close'})).reply.error??'',/只有房主/);
  const before=await raw(env);
  assert.match((await command(a,'p1',{type:'close'},crypto.randomUUID(),before.room.version-1)).reply.error??'',/画面已更新/);
  assert.deepEqual(await raw(env),before);
  const close=await command(a,'p1',{type:'close'});assert.equal(close.reply.ok,true);
  const closed=await raw(env);assert.equal(closed.room.closedAt,env.clock.now);assert.equal(closed.room.deadline,null);
  assert.equal(closed.room.version,before.room.version+1);assert.deepEqual(closed.room.game,before.room.game);
  assert.equal(a.view('p0').closedAt,env.clock.now);assert.equal(a.view('p0').authorityOnline,false);
  assert.match((await command(a,'p1',{type:'start'})).reply.error??'',/房间已解散/);
  a.dispose();env.clock.now+=900_000;
  const loaded=await BrowserAuthority.load(meta,env.options);
  const replay=await loaded.action('p1',close.envelope);assert.equal(replay.ok,true);assert.equal(replay.duplicate,true);
  assert.match((await loaded.action('p1',{...close.envelope,action:{type:'rematch'}})).error??'',/不同操作/);
  await loaded.resume({...meta,members:meta.members.map(m=>({...m,connected:false}))});
  await loaded.roster({...meta,adminHostId:'p0'});assert.equal(await loaded.tick(),false);
  assert.deepEqual(await raw(env),closed);loaded.dispose();
});

test('close: the lobby can be dissolved before any other player joins',async()=>{
  const env=environment();const meta=metadata(1);const a=await BrowserAuthority.create(meta,env.options);
  assert.equal((await command(a,'p0',{type:'close'})).reply.ok,true);
  assert.equal(a.view('p0').closedAt,env.clock.now);assert.equal(a.view('p0').phase,'lobby');
  assert.match((await command(a,'p0',{type:'ready',ready:true})).reply.error??'',/房间已解散/);a.dispose();
});

test('close: a failed receipt write rolls back dissolution and allows the same close request to retry',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  const before=await raw(env);const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:before.room.version,action:{type:'close'}};
  const originalPut=IDBObjectStore.prototype.put;let failOnce=true;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
    if(this.name==='receipts'&&failOnce){failOnce=false;throw new DOMException('模拟回执写入失败','QuotaExceededError');}
    return originalPut.apply(this,args);
  };
  try {await assert.rejects(a.action('p0',envelope),/未能保存本次操作/);}
  finally {IDBObjectStore.prototype.put=originalPut;}
  assert.deepEqual(await raw(env),before);assert.equal(a.view('p0').closedAt,undefined);
  const retry=await a.action('p0',envelope);assert.equal(retry.ok,true);assert.equal(retry.duplicate,undefined);
  assert.equal((await raw(env)).room.closedAt,env.clock.now);a.dispose();
});

test('Browser authority initializes relay identities once, preserves duplicate nicknames and refuses missing started archives',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  assert.deepEqual(a.view('p0').players.map(p=>[p.id,p.color]),[['p0',PLAYER_COLORS[0]],['p1',PLAYER_COLORS[1]]]);
  const before=(await raw(env)).room.game.rngState;
  const again=await BrowserAuthority.create(meta,{...env.options,randomSeed:()=>999});assert.equal((await raw(env)).room.game.rngState,before);
  a.dispose();again.dispose();
  await assert.rejects(BrowserAuthority.load({...meta,code:'ABC235',phase:'race'},env.options),/没有这局的本地存档/);
  await assert.rejects(BrowserAuthority.create({...meta,code:'ABC236',phase:'race'},env.options),/没有这局的本地存档/);
  await assert.rejects(BrowserAuthority.load({...meta,authorityId:'p1'},env.options),/主持身份/);
});

test('Browser actions enforce ready/start/admin/actor validation without changing a rejected state',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  const initial=a.view('p0').version;
  assert.match((await command(a,'p1',{type:'start'})).reply.error??'',/只有房主/);
  assert.match((await command(a,'p0',{type:'start'})).reply.error??'',/全员在线并准备/);
  assert.match((await command(a,'visitor',{type:'ready',ready:true},crypto.randomUUID(),initial)).reply.error??'',/参赛席位/);
  assert.equal(a.view('p0').version,initial);
  await readyAndStart(a,meta);const view=a.view('p0');assert.equal(view.phase,'draft');
  const turn=view.draft!.order[view.draft!.cursor]!;const other=turn==='p0'?'p1':'p0';
  assert.match((await command(a,other,{type:'draft',characterId:view.draft!.market[0]!})).reply.error??'',/还没有轮到/);
  assert.equal((await command(a,turn,{type:'draft',characterId:view.draft!.market[0]!})).reply.ok,true);
  assert.equal((await command(a,'p0',{type:'transfer',playerId:'p1'})).reply.ok,true);
  assert.equal(a.view('p0').hostId,'p1');assert.equal(a.view('p0').authorityId,'p0');a.dispose();
});

test('Concurrent duplicate clicks commit once, conflicting IDs and stale versions are rejected, and receipts survive reload',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'ready',ready:true}};
  const [one,two]=await Promise.all([a.action('p0',envelope),a.action('p0',envelope)]);
  assert.equal(one.ok,true);assert.equal(two.ok,true);assert.equal(two.duplicate,true);assert.equal(a.view('p0').version,2);
  assert.match((await a.action('p0',{...envelope,action:{type:'ready',ready:false}})).error??'',/不同操作/);
  assert.match((await command(a,'p1',{type:'ready',ready:true},crypto.randomUUID(),1)).reply.error??'',/画面已更新/);
  a.dispose();const loaded=await BrowserAuthority.load(meta,env.options);const replay=await loaded.action('p0',envelope);
  assert.equal(replay.ok,true);assert.equal(replay.duplicate,true);assert.equal(loaded.view('p0').version,2);loaded.dispose();
});

test('Two accidentally opened instances cannot overwrite each other because the version check is inside the IDB transaction',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options),b=await BrowserAuthority.load(meta,env.options);
  const results=await Promise.all([a.action('p0',{actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'ready',ready:true}}),b.action('p1',{actionId:crypto.randomUUID(),expectedVersion:1,action:{type:'ready',ready:true}})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal((await raw(env)).room.version,2);a.dispose();b.dispose();
});

test('A successful acknowledgement is delivered after transaction complete, and an aborted room/receipt write rolls back both',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);
  const originalTransaction=IDBDatabase.prototype.transaction;let completed=false;
  IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){const tx=originalTransaction.apply(this,args);if(tx.mode==='readwrite'&&tx.objectStoreNames.contains('receipts'))tx.addEventListener('complete',()=>{completed=true;});return tx;};
  try { const result=await command(a,'p0',{type:'ready',ready:true});assert.equal(result.reply.ok,true);assert.equal(completed,true); }
  finally { IDBDatabase.prototype.transaction=originalTransaction; }
  const before=await raw(env);const originalPut=IDBObjectStore.prototype.put;let abortNext=true;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
    if(this.name==='rooms'&&abortNext){abortNext=false;this.transaction.abort();throw new DOMException('模拟存储失败','QuotaExceededError');}
    return originalPut.apply(this,args);
  };
  const failedEnvelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:before.room.version,action:{type:'ready',ready:true}};
  try { await assert.rejects(a.action('p1',failedEnvelope),/未能保存本次操作/); }
  finally { IDBObjectStore.prototype.put=originalPut; }
  assert.deepEqual(await raw(env),before);assert.equal(a.view('p0').version,before.room.version);
  const retry=await a.action('p1',failedEnvelope);assert.equal(retry.ok,true);assert.equal(retry.duplicate,undefined);assert.equal(retry.version,before.room.version+1);a.dispose();
});

test('Roster adds only lobby members and connected status, with per-player private projections and locked post-start seats',async()=>{
  const env=environment();const meta=metadata(2);const a=await BrowserAuthority.create({...meta,members:meta.members.slice(0,1)},env.options);
  await a.roster(meta);assert.equal(a.view('p0').players.length,2);assert.equal(a.view('p0').version,2);
  await readyAndStart(a,meta);
  for(;;){const record=await raw(env);if(record.room.game.phase!=='draft')break;const auto=automaticAction(record.room.game)!;assert.equal((await command(a,auto.playerId,auto.action)).reply.ok,true);}
  const self=a.view('p0').players.find(p=>p.id==='p0')!;const selection=self.hand!.slice(0,2);
  const beforeUsed=a.view('p1').players.find(p=>p.id==='p0')!.used;
  assert.equal((await command(a,'p0',{type:'select',characterIds:selection})).reply.ok,true);
  const peer=a.view('p1');const projected=peer.players.find(p=>p.id==='p0')!;
  assert.equal(projected.selected,true);assert.equal(projected.hand,undefined);assert.equal(projected.selection,undefined);assert.deepEqual(projected.used,beforeUsed);
  assert.equal(peer.racers.length,0);assert.equal(peer.pending,undefined);assert.equal('rngState' in peer,false);assert.equal('queue' in peer,false);assert.equal('deck' in peer,false);
  const late={...meta,members:[...meta.members,{id:'late',name:'新访客',seat:2,connected:true}]};await assert.rejects(a.roster(late),/不能加入锁定/);
  await a.roster({...meta,members:meta.members.map(m=>({...m,connected:m.id!=='p0'}))});
  assert.equal(a.view('p1').authorityOnline,false);assert.equal(a.view('p1').hostId,'p1');assert.equal(a.view('p1').authorityId,'p0');a.dispose();
});

test('Pending choices, queue, random history and receipts recover exactly; the host closure resets only the timeout window',async()=>{
  const env=environment(19);const meta=metadata(6);const a=await BrowserAuthority.create(meta,env.options);await readyAndStart(a,meta);
  let last: {playerId:string;envelope:ActionEnvelope}|undefined;
  for(let guard=0;guard<1000;guard++){
    const state=(await raw(env)).room.game;if(state.pending)break;
    const next=automaticAction(state)!;const sent=await command(a,next.playerId,next.action);assert.equal(sent.reply.ok,true);last={playerId:next.playerId,envelope:sent.envelope};
  }
  const before=await raw(env);assert.ok(before.room.game.pending);assert.ok(before.room.game.randomLog.length);a.dispose();
  env.clock.now+=900_000;
  const loaded=await BrowserAuthority.load({...meta,phase:before.room.game.phase},env.options);const restored=await raw(env);
  assert.deepEqual(restored.room.game,before.room.game);assert.equal(restored.room.version,before.room.version);assert.equal(restored.room.deadline,env.clock.now+120_000);
  assert.equal((await loaded.action(last!.playerId,last!.envelope)).duplicate,true);
  const next=automaticAction(restored.room.game)!;
  const expected=reduceRoomAction(restored.room,next.playerId,next.action,{now:env.clock.now,rematchSeed:0});
  assert.equal((await command(loaded,next.playerId,next.action)).reply.ok,true);assert.deepEqual((await raw(env)).room.game,expected.game);loaded.dispose();
});

test('Timeout defaults are durable, unlimited rooms stay still, and execution continuations resume without a timeout',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);await readyAndStart(a,meta);
  assert.equal(await a.tick(),false);env.clock.now+=120_001;const version=a.view('p0').version;
  assert.equal(await a.tick(),true);assert.equal(a.view('p0').version,version+1);assert.ok(a.view('p0').logs.some(e=>e.type==='timeout'));a.dispose();
  const other=environment();const unlimited=await BrowserAuthority.create(metadata(2,0),other.options);await readyAndStart(unlimited,metadata(2,0));
  other.clock.now+=999_999;assert.equal(await unlimited.tick(),false);
  const record=await raw(other);record.room.game.phase='race';record.room.game.racers=[{id:'r0',playerId:'p0',characterId:'alchemist',position:0,tripped:false,finished:false,eliminated:false,flags:{}}];
  record.room.game.currentRacerId='r0';record.room.game.flags.continuation=true;record.room.game.queue=[{kind:'gain',racerId:'r0',amount:1}];await replace(other,record);unlimited.dispose();
  const resumed=await BrowserAuthority.load({...metadata(2,0),phase:'race'},other.options);const logs=resumed.view('p0').logs.length;
  assert.equal(await resumed.tick(),true);assert.equal(resumed.view('p0').players[0]!.score,1);assert.equal(resumed.view('p0').logs.slice(logs).some(e=>e.type==='timeout'),false);resumed.dispose();
});

test('Same-instance authority reconnect grants a fresh durable deadline, while ordinary roster changes never extend it',async()=>{
  const env=environment();const meta=metadata();const a=await BrowserAuthority.create(meta,env.options);await readyAndStart(a,meta);
  const before=await raw(env);assert.equal(before.room.deadline,env.clock.now+120_000);
  env.clock.now+=900_000;
  const connected={...meta,phase:before.room.game.phase};
  await a.resume(connected);
  const after=await raw(env),deadline=env.clock.now+120_000;
  assert.equal(after.room.deadline,deadline);assert.equal(a.view('p0').deadline,deadline);
  assert.equal(after.room.version,before.room.version);assert.deepEqual(after.room.game,before.room.game);
  assert.equal(await a.tick(),false);assert.equal((await raw(env)).room.version,before.room.version);
  env.clock.now+=20_000;
  await a.roster({...connected,members:connected.members.map(m=>({...m,connected:m.id!=='p1'}))});
  env.clock.now+=20_000;await a.roster(connected);
  assert.equal((await raw(env)).room.deadline,deadline);assert.equal(a.view('p0').deadline,deadline);
  env.clock.now=deadline-1;assert.equal(await a.tick(),false);
  env.clock.now=deadline;const version=a.view('p0').version;
  assert.equal(await a.tick(),true);assert.equal(a.view('p0').version,version+1);
  assert.ok(a.view('p0').logs.some(e=>e.type==='timeout'));a.dispose();
});

test('Pure room projection returns independent objects and never exposes pending context or another hand',()=>{
  const room=createBrowserRoom(metadata(),123,10_000);room.game.phase='race';room.game.players[1]!.hand=['egg'];
  room.game.pending={id:'c1',playerId:'p1',racerId:'r1',title:'私有选择',options:[{id:'egg',label:'蛋'}],optional:true,kind:'egg',context:{futureSecret:'do not reveal'}};
  const view=projectRoom(room,'p0',{authorityId:'p0',authorityOnline:true});assert.equal(view.pending,undefined);assert.equal(JSON.stringify(view).includes('futureSecret'),false);
  const own=projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true});assert.ok(own.pending);assert.equal('context' in own.pending!,false);
  own.players[1]!.hand!.push('twin');assert.deepEqual(room.game.players[1]!.hand,['egg']);
});

test('spectators join a running match with public views and animation events, but cannot act or take management',async()=>{
  const env=environment(),meta=metadata(),a=await BrowserAuthority.create(meta,env.options);
  await readyAndStart(a,meta);
  while((await raw(env)).room.game.phase==='draft'){
    const next=automaticAction((await raw(env)).room.game)!;
    assert.equal((await command(a,next.playerId,next.action)).reply.ok,true);
  }
  const spectator={id:'watcher',name:'观众',connected:true};
  const watching={...meta,phase:'selection' as const,spectators:[spectator]};
  await a.roster(watching);
  const record=(await raw(env)).room;
  record.game.pending={id:'private-choice',playerId:'p0',title:'私密选择',options:[{id:'secret',label:'秘密'}],optional:true,kind:'test',context:{secret:'secret-context'}};
  await replace(env,{...(await raw(env)),room:record});
  await a.roster(watching);
  const view=a.view('watcher');assert.equal(view.role,'spectator');assert.equal(view.players.length,2);
  assert(view.players.every(p=>p.hand===undefined&&p.selection===undefined));assert.equal(view.pending,undefined);
  assert(!JSON.stringify(view).match(/secret-context|rngState|randomLog|"deck"/));
  assert(a.events('watcher',0).events.length>0);
  const before=(await raw(env)).room;
  for(const action of [{type:'ready',ready:true},{type:'roll'},{type:'close'},{type:'transfer',playerId:'watcher'}] as GameAction[]){
    assert.equal((await a.action('watcher',{actionId:crypto.randomUUID(),expectedVersion:before.version,action})).ok,false);
  }
  assert.deepEqual((await raw(env)).room,before);
  assert.equal((await command(a,'p0',{type:'transfer',playerId:'watcher'})).reply.ok,false);
  await a.roster({...watching,spectators:[]});
  assert.throws(()=>a.view('watcher'),/参赛席位/);assert.throws(()=>a.events('watcher',0),/参赛席位/);a.dispose();
});

test('explicit lobby departures free seats before a replacement joins, without changing retained identities',async()=>{
  const env=environment(),meta=metadata(),a=await BrowserAuthority.create(meta,env.options);
  await command(a,'p0',{type:'ready',ready:true});
  const replacement={...meta,members:[meta.members[0]!,{id:'replacement',name:'后来者',seat:1,connected:true}]};
  await a.roster(replacement);
  assert.deepEqual(a.view('p0').players.map(p=>p.id),['p0','replacement']);
  assert.equal(a.view('p0').players[0]!.ready,true);assert.throws(()=>a.view('p1'),/参赛席位/);a.dispose();
});

test('online rooms survive old age and rematch; only owner absence applies the exact thirty-minute limit',async()=>{
  const env=environment(),meta=metadata(),a=await BrowserAuthority.create(meta,env.options);
  assert.equal(a.view('p0').expiresAt,undefined);env.clock.now=meta.createdAt+12*60*60*1000;await a.resume(meta);assert.equal(a.view('p0').expiresAt,undefined);
  assert.equal((await command(a,'p0',{type:'ready',ready:true})).reply.ok,true);
  const finished=await raw(env);finished.room.game.phase='finished';await replace(env,finished);await a.roster({...meta,phase:'finished'});
  assert.equal((await command(a,'p0',{type:'rematch'})).reply.ok,true);assert.equal(a.view('p0').expiresAt,undefined);
  const absent={...meta,hostLeftAt:env.clock.now};await a.roster(absent);assert.equal(a.view('p0').expiresAt,env.clock.now+ROOM_OWNER_AWAY_MS);
  env.clock.now+=ROOM_OWNER_AWAY_MS;assert.equal((await command(a,'p0',{type:'ready',ready:false})).reply.ok,false);
  assert.equal(await a.tick(),false);a.dispose();
  await assert.rejects(BrowserAuthority.load(absent,env.options),/30分钟/);
});

test('browser authority persists explicit lifecycle ownership and never substitutes an automatic management successor',async()=>{
  const env=environment(),meta={...metadata(),ownerId:'p0'},authority=await BrowserAuthority.create(meta,env.options);
  const away={...meta,adminHostId:'p1',hostLeftAt:env.clock.now,members:meta.members.map(member=>({...member,connected:member.id!=='p0'}))};
  await authority.roster(away);assert.equal(authority.view('p1').hostId,'p1');assert.equal(authority.view('p1').ownerId,'p0');authority.dispose();
  const restored=await BrowserAuthority.load(away,env.options);assert.equal(restored.view('p1').ownerId,'p0');
  assert.equal((await command(restored,'p1',{type:'transfer',playerId:'p1'})).reply.ok,true);assert.equal(restored.view('p1').ownerId,'p1');restored.dispose();
  const transferred={...away,ownerId:'p1',hostLeftAt:undefined},again=await BrowserAuthority.load(transferred,env.options);
  assert.equal(again.view('p1').ownerId,'p1');assert.equal(again.view('p1').expiresAt,undefined);again.dispose();
});
