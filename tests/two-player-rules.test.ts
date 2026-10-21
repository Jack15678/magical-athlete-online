import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, automaticAction, createGame, resolveTasks, systemAction } from '../src/engine/index.js';
import { immediateRoomAction } from '../src/shared/automation.js';
import { projectRoom, reduceRoomAction, setRoomDeadline, validateActionEnvelope } from '../src/shared/room-core.js';
import { CHARACTERS } from '../src/shared/characters.js';
import { BrowserAuthority } from '../src/browser/authority.js';
import { IDBFactory } from 'fake-indexeddb';
import type { RelayMetadata } from '../src/shared/relay.js';
import type { GameState, Player, Room } from '../src/shared/types.js';

const players=():Player[]=>['p0','p1'].map((id,seat)=>({id,name:id,seat,color:'#000',ready:true,connected:true,score:0,hand:['alchemist','banana','coach','blimp'],used:[],selection:[]}));
const projection={authorityId:'p0',authorityOnline:true};
const room=(game:GameState,timeoutSeconds=0):Room=>({code:'ABC234',hostId:'p0',createdAt:1000,updatedAt:1000,version:1,maxPlayers:2,timeoutSeconds,deadline:null,game});
function select(first:string[],second:string[]) {
  const s=createGame(players(),19);s.phase='selection';s.round=1;s.flags.testDice=[6,1];
  applyGameAction(s,'p0',{type:'select',characterIds:first});applyGameAction(s,'p1',{type:'select',characterIds:second});return s;
}
function choose(s:GameState,id:string){assert(s.pending);applyGameAction(s,s.pending.playerId,{type:'choose',choiceId:s.pending.id,optionId:id});}
function next(s:GameState){const a=systemAction(s);assert(a);applyGameAction(s,a.playerId,a.action);}
function race(characters=['alchemist','banana','coach','blimp']):GameState {
  const s=createGame(players(),19);s.phase='race';s.round=1;s.currentRacerId='a0';
  s.racers=characters.map((characterId,i)=>({id:['a0','a1','b0','b1'][i]!,playerId:i<2?'p0':'p1',characterId,position:5+i*5,tripped:false,finished:false,eliminated:false,flags:{}}));
  s.baseTurnOrder=s.racers.map(r=>r.id);return s;
}

test('both selected orders are locked per race, each actor rolls only its own die after the preceding effects',()=>{
  for(const own of [['alchemist','banana'],['banana','alchemist']])for(const other of [['coach','blimp'],['blimp','coach']]){
    const s=select(own,other),fixed=[...s.baseTurnOrder!];
    assert.deepEqual(fixed,s.racers.map(r=>r.id));assert.deepEqual(s.racers.slice(0,2).map(r=>r.characterId),own);
    assert.equal(s.currentRacerId,fixed[0]);assert.equal(s.randomLog.filter(r=>r.reason.endsWith('主移动')).length,0);
    s.flags.testDice=[3,3,3,3];
    for(let i=0;i<4;i++){
      const actor=s.racers.find(r=>r.id===fixed[i])!;assert.equal(s.currentRacerId,actor.id);
      assert.equal(s.flags.awaitRoll,true);assert.throws(()=>applyGameAction(s,actor.playerId==='p0'?'p1':'p0',{type:'roll'}),/还没有轮到/);
      applyGameAction(s,actor.playerId,{type:'roll'});
      assert.equal(s.randomLog.filter(r=>r.reason.endsWith('主移动')).length,i+1,'never preroll or allocate a teammate die');
      assert.equal(s.currentRacerId,fixed[(i+1)%4]);assert.equal(s.flags.needsBegin,true);next(s);
    }
    assert.deepEqual(s.baseTurnOrder,fixed);assert.throws(()=>applyGameAction(s,'p0',{type:'select',characterIds:own.toReversed()}),/不是暗选/);
    const restored=JSON.parse(JSON.stringify(room(s))) as Room;
    assert.deepEqual(projectRoom(restored,'p0',projection).baseTurnOrder,fixed);
    // New round resets the lock and lets the player reverse the remaining pair.
    s.phase='results';s.pending=undefined;s.queue=[];s.players.forEach(p=>p.hand=['banana','alchemist']);
    applyGameAction(s,'p0',{type:'next'});assert.equal(s.baseTurnOrder,undefined);
    applyGameAction(s,'p0',{type:'select',characterIds:['banana','alchemist']});applyGameAction(s,'p1',{type:'select',characterIds:['alchemist','banana']});
    assert.deepEqual(s.racers.slice(0,2).map(r=>r.characterId),['banana','alchemist']);assert((s as GameState).baseTurnOrder!.every(id=>id.includes(':2:')));
  }
});

test('automatic setup opens the second racer turn-start choice before a die; persisted order survives storage array reordering',()=>{
  const s=race(['alchemist','cheerleader','coach','blimp']);s.flags.testDice=[3];s.queue=[{kind:'beginTurn',racerId:'a0'}];resolveTasks(s);
  s.racers.reverse();applyGameAction(s,'p0',{type:'roll'});assert.equal(s.currentRacerId,'a1');assert.equal(s.pending,undefined);
  const saved=JSON.parse(JSON.stringify(s)) as GameState;next(saved);
  assert.equal(saved.pending?.kind,'cheerleader');assert.equal(saved.pending?.racerId,'a1');assert.equal(saved.pending?.playerId,'p0');
  assert.equal(saved.randomLog.length,1);assert.throws(()=>applyGameAction(saved,'p0',{type:'roll'}),/待处理选择/);
});

test('same-owner simultaneous powers use the locked racer order even during the later teammate turn',()=>{
  const s=race(['duelist','twin','coach','blimp']);s.racers[1]!.flags.power='duelist';s.racers.forEach(r=>r.position=5);s.racers.reverse();
  s.queue=[{kind:'beginTurn',racerId:'a1'}];resolveTasks(s);
  assert.equal(s.pending?.racerId,'a0');choose(s,'skip');assert.equal(s.pending?.racerId,'a1');
});

test('explicit Skipper and Genius turn changes supersede the base order without changing its lock',()=>{
  const skipper=race(['alchemist','banana','coach','skipper']);skipper.flags.testDice=[1];skipper.queue=[{kind:'beginTurn',racerId:'a0'}];resolveTasks(skipper);
  applyGameAction(skipper,'p0',{type:'roll'});choose(skipper,'skip');assert.equal(skipper.currentRacerId,'b1');assert.deepEqual(skipper.baseTurnOrder,['a0','a1','b0','b1']);
  const genius=race(['genius','banana','coach','blimp']);genius.flags.testDice=[4];genius.queue=[{kind:'beginTurn',racerId:'a0'}];resolveTasks(genius);choose(genius,'4');
  applyGameAction(genius,'p0',{type:'roll'});assert.equal(genius.currentRacerId,'a0');next(genius);assert.equal(genius.pending?.racerId,'a0');
  assert.equal(genius.racers.find(r=>r.id==='a1')!.flags.turnsTaken,undefined);
});

test('custom two-player Slime modifier spares all teammates, slows both opposing slots, and leaves other powers unchanged',()=>{
  for(const target of ['a1','b0','b1']){
    const s=race(['gunk','alchemist','alchemist','alchemist']);s.flags.testDice=[3];s.queue=[{kind:'beginTurn',racerId:target}];resolveTasks(s);
    const r=s.racers.find(r=>r.id===target)!,before=r.position;applyGameAction(s,r.playerId,{type:'roll'});
    assert.equal(r.position-before,target==='a1'?3:2,target);assert.equal(s.lastRoll?.face,3);
  }
  const s=race(['gunk','inchworm','alchemist','blimp']);s.flags.testDice=[1];s.queue=[{kind:'beginTurn',racerId:'a0'}];resolveTasks(s);
  const before=s.racers[0]!.position,teammate=s.racers[1]!.position;applyGameAction(s,'p0',{type:'roll'});
  assert.equal(s.racers[0]!.position,before,'Inchworm still treats its teammate as another racer');assert.equal(s.racers[1]!.position,teammate+1);
});

test('all cross-player duel slots retain actual controller, private roll, reconnect state and exactly-once choice semantics',()=>{
  for(const source of ['a0','a1','b0','b1'])for(const target of ['a0','a1','b0','b1'].filter(id=>id[0]!==source[0])){
    let s=race();s.racers.forEach(r=>{r.characterId=r.id===source?'duelist':'alchemist';r.position=r.id===source||r.id===target?5:20;});
    s.flags.testDice=[6,2];s.queue=[{kind:'beginTurn',racerId:source}];resolveTasks(s);choose(s,target);
    for(const participant of [source,target]){
      const control=s.racers.find(r=>r.id===participant)!.playerId,other=control==='p0'?'p1':'p0',c=s.pending!;
      assert.equal(c.racerId,participant);assert.equal(c.playerId,control);assert.equal(projectRoom(room(s),'p0',projection).pending?.racerId,control==='p0'?participant:undefined);
      assert.equal(projectRoom(room(s),'p1',projection).pending?.racerId,control==='p1'?participant:undefined);
      assert.equal(automaticAction(s),undefined);const timed=room(s,30);setRoomDeadline(timed,5000);assert.equal(timed.deadline,null);
      assert.equal(immediateRoomAction(timed,1e9),undefined);assert.throws(()=>reduceRoomAction(timed,control,{type:'choose',choiceId:c.id,optionId:'roll'},{now:5000,rematchSeed:0,automatic:true}),/本人点击/);
      assert.throws(()=>applyGameAction(s,other,{type:'choose',choiceId:c.id,optionId:'roll'}),/对应玩家/);
      s=JSON.parse(JSON.stringify(s)) as GameState;choose(s,'roll');const count=s.randomLog.length;
      assert.throws(()=>applyGameAction(s,control,{type:'choose',choiceId:c.id,optionId:'roll'}),/已经过期/);assert.equal(s.randomLog.length,count);
    }
    assert.equal(s.randomLog.length,2);assert.deepEqual(s.logs.find(e=>e.type==='duel-dice')?.targets,[source,target]);
  }
});

test('AI rolls either controlled duel slot automatically, and never consumes the human opposing slot',()=>{
  for(const aiPlayer of ['p0','p1'])for(const source of ['a0','a1','b0','b1'])for(const target of ['a0','a1','b0','b1'].filter(id=>id[0]!==source[0])){
    const s=race();s.players.find(p=>p.id===aiPlayer)!.isAI=true;s.racers.forEach(r=>{r.characterId=r.id===source?'duelist':'alchemist';r.position=r.id===source||r.id===target?5:20;});
    s.flags.testDice=[6,2];s.queue=[{kind:'beginTurn',racerId:source}];resolveTasks(s);choose(s,target);
    for(const participant of [source,target]){
      const pending=s.pending!;assert.equal(pending.racerId,participant);const scheduled=immediateRoomAction(room(s),5000);
      if(pending.playerId===aiPlayer){assert(scheduled);assert.equal(scheduled.playerId,aiPlayer);applyGameAction(s,scheduled.playerId,scheduled.action);}
      else{assert.equal(scheduled,undefined);choose(s,'roll');}
    }
    assert.equal(s.randomLog.length,2);assert(s.logs.some(e=>e.type==='duel-dice'));
  }
});

test('browser IndexedDB authority persists and projects the race order identically after a fresh reload',async()=>{
  const meta:RelayMetadata={mode:'ai',code:'ABC234',authorityId:'p0',adminHostId:'p0',maxPlayers:2,timeoutSeconds:0,phase:'lobby',createdAt:1000,members:[{id:'p0',name:'自己',seat:0,connected:true},{id:'p1',name:'电脑',seat:1,connected:true,isAI:true}]};
  const options={indexedDB:new IDBFactory(),databaseName:'duo-order-reload',now:()=>2000,randomSeed:()=>97};let authority=await BrowserAuthority.create(meta,options);
  async function send(id:string,action:Parameters<BrowserAuthority['action']>[1]['action']){const view=authority.view(id);const reply=await authority.action(id,{actionId:crypto.randomUUID(),expectedVersion:view.version,action});assert(reply.ok,reply.error);}
  try{
    while(authority.view('p0').phase==='draft'){
      const draft=authority.view('p0').draft!;await send(draft.order[draft.cursor]!,{type:'draft',characterId:draft.market[0]!});
    }
    const own=authority.view('p0').players.find(p=>p.id==='p0')!.hand!.slice(0,2).reverse(),other=authority.view('p1').players.find(p=>p.id==='p1')!.hand!.slice(0,2);
    await send('p0',{type:'select',characterIds:own});await send('p1',{type:'select',characterIds:other});
    const before=authority.view('p0');assert.equal(before.baseTurnOrder?.length,4);assert.deepEqual(before.racers.filter(r=>r.playerId==='p0').map(r=>r.characterId),own);
    authority.dispose();authority=await BrowserAuthority.load({...meta,phase:'race'},options);
    const after=authority.view('p0');assert.deepEqual(after.baseTurnOrder,before.baseTurnOrder);assert.equal(after.currentRacerId,before.currentRacerId);assert.deepEqual(after.pending,before.pending);
    assert.deepEqual(authority.view('p1').baseTurnOrder,before.baseTurnOrder);
  }finally{authority.dispose();}
});

test('practice starts with the complete pool, validates four unique cards atomically and uses exactly those cards across four races',()=>{
  let s=createGame(players().slice(0,1),41,'practice');applyGameAction(s,'p0',{type:'start'});
  assert.equal(s.phase,'draft');assert.deepEqual(new Set(s.draft?.market),new Set(CHARACTERS.map(c=>c.id)));assert.equal(s.players[0]!.hand.length,0);
  for(const cards of [['hare','hare','legs','coach'],['hare','legs','coach'],['hare','legs','coach','unknown']]){
    assert.throws(()=>applyGameAction(s,'p0',{type:'practice-team',characterIds:cards}),/4张不同/);assert.equal(s.players[0]!.hand.length,0);assert.equal(s.phase,'draft');
  }
  const selected=['hare','legs','hypnotist','mastermind'];const envelope=validateActionEnvelope({actionId:'team',expectedVersion:1,action:{type:'practice-team',characterIds:selected}});
  applyGameAction(s,'p0',envelope.action);assert.equal(s.phase,'selection');assert.deepEqual(s.players[0]!.hand,selected);assert(!s.deck.some(id=>selected.includes(id)));
  s=JSON.parse(JSON.stringify(s));assert.deepEqual(projectRoom(room(s),'p0',projection).players[0]!.hand,selected);
  for(const characterId of selected){
    applyGameAction(s,'p0',{type:'select',characterIds:[characterId]});assert.equal(s.racers[0]!.characterId,characterId);
    s.phase='results';s.pending=undefined;s.queue=[];if(s.round<4)applyGameAction(s,'p0',{type:'next'});
  }
  assert.deepEqual(s.players[0]!.used,selected);assert.equal(s.players[0]!.hand.length,0);
  assert.throws(()=>applyGameAction(s,'p0',{type:'practice-team',characterIds:selected}),/现在不能/);
});

test('a reloaded legacy partial practice draft replaces the old hand without losing cards or random history',async()=>{
  for(const partial of [1,2,3]){
    const meta:RelayMetadata={mode:'practice',code:'ABC234',authorityId:'p0',adminHostId:'p0',maxPlayers:1,timeoutSeconds:0,phase:'lobby',createdAt:1000,members:[{id:'p0',name:'自己',seat:0,connected:true}]};
    const options={indexedDB:new IDBFactory(),databaseName:`legacy-practice-${partial}`,now:()=>2000,randomSeed:()=>97};
    let authority=await BrowserAuthority.create(meta,options);authority.dispose();
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=options.indexedDB.open(options.databaseName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const oldHand=['banana','egg','duelist'].slice(0,partial),discardedMarket=['coach','alchemist'];let randomBefore:GameState['randomLog']=[],rngBefore=0;
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('rooms','readwrite'),store=tx.objectStore('rooms'),read=store.get(meta.code);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
      read.onsuccess=()=>{const record=read.result,game=record.room.game as GameState;game.players[0]!.hand=oldHand;game.draft={market:discardedMarket,order:['p0','p0'],cursor:partial%2,batch:partial>1?1:0};game.deck=game.deck.filter(id=>!oldHand.includes(id)&&!discardedMarket.includes(id));randomBefore=structuredClone(game.randomLog);rngBefore=game.rngState;store.put(record);};
    });db.close();
    authority=await BrowserAuthority.load({...meta,phase:'draft'},options);
    try{
      const view=authority.view('p0');assert.deepEqual(view.players[0]!.hand,oldHand);
      const selected=['genius','legs','gunk','rocket-scientist'];
      const reply=await authority.action('p0',{actionId:`replace-${partial}`,expectedVersion:view.version,action:{type:'practice-team',characterIds:selected}});assert(reply.ok,reply.error);
      assert.equal(authority.view('p0').phase,'selection');assert.deepEqual(authority.view('p0').players[0]!.hand,selected);
      const verify=await new Promise<IDBDatabase>((resolve,reject)=>{const r=options.indexedDB.open(options.databaseName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const game=await new Promise<GameState>((resolve,reject)=>{const r=verify.transaction('rooms').objectStore('rooms').get(meta.code);r.onsuccess=()=>resolve(r.result.room.game);r.onerror=()=>reject(r.error);});verify.close();
      assert.equal(game.deck.length,CHARACTERS.length-selected.length);assert.deepEqual(new Set([...game.deck,...selected]),new Set(CHARACTERS.map(c=>c.id)));assert.deepEqual(game.randomLog,randomBefore);assert.equal(game.rngState,rngBefore);
      const selectionVersion=authority.view('p0').version;assert.equal((await authority.action('p0',{actionId:'cannot-repick',expectedVersion:selectionVersion,action:{type:'practice-team',characterIds:oldHand}})).ok,false);
    }finally{authority.dispose();}
  }
});
