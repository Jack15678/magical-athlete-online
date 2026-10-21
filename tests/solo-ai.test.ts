import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../src/server/rooms.js';
import { Store } from '../src/server/store.js';
import { CHARACTERS } from '../src/shared/characters.js';
import { IDBFactory } from 'fake-indexeddb';
import { automaticAction, applyGameAction, createGame, startGame, systemAction } from '../src/engine/index.js';
import { decideAI } from '../src/engine/ai.js';
import { BrowserAuthority } from '../src/browser/authority.js';
import { immediateRoomAction } from '../src/shared/automation.js';
import { createBrowserRoom, projectRoom, reduceRoomAction } from '../src/shared/room-core.js';
import type { RelayMetadata } from '../src/shared/relay.js';
import type { GameAction, Player, Room, RoomView } from '../src/shared/types.js';

function metadata(count:number):RelayMetadata{
  return{mode:count===1?'practice':'ai',code:'ABC234',authorityId:'p0',adminHostId:'p0',maxPlayers:count,timeoutSeconds:0,phase:'lobby',createdAt:1000,
    members:Array.from({length:count},(_,seat)=>({id:`p${seat}`,name:seat?`电脑${seat}`:'自己',seat,connected:true,...(seat?{isAI:true}:{})}))};
}
for(const count of [1,2,3,4,5,6,7,8])test(`${count===1?'单人练习':`${count-1} AI`} 通过权威裁定完成两批选秀和四场比赛`,()=>{
  let now=2000,room=createBrowserRoom(metadata(count),2051+count,now),steps=0;
  while(room.game.phase!=='finished'){
    assert(++steps<10000,`stalled ${count}/${room.game.phase}/${room.game.pending?.kind}`);now+=4000;
    const auto=immediateRoomAction(room,now);
    if(auto){room=reduceRoomAction(room,auto.playerId,auto.action,{now,rematchSeed:0});continue;}
    // Simulated human sees only their private projection, exactly like the AI.
    const action=decideAI(projectRoom(room,'p0',{authorityId:'p0',authorityOnline:true}));
    assert(action,`human has no legal action ${room.game.phase}/${room.game.pending?.kind}`);
    room=reduceRoomAction(room,'p0',action,{now,rematchSeed:0});
  }
  assert.equal(room.game.results.length,4);assert(room.game.players.every(p=>p.hand.length===0));
  assert(room.game.players.every(p=>p.used.length===(count===2?8:4)));
  assert(!room.game.logs.some(e=>e.type==='timeout'));assert(room.game.randomLog.length>0);
  assert(room.game.results.every(r=>r.placements.some(p=>p.rank===1)));
});

test('AI decisions are independent of deck order, future dice and opponents hidden hands',()=>{
  const room=createBrowserRoom(metadata(4),17,2000),bot=room.game.draft!.order[room.game.draft!.cursor]!;
  const first=projectRoom(room,bot,{authorityId:'p0',authorityOnline:true}),intent=decideAI(first);
  const changed=structuredClone(room);changed.game.deck.reverse();changed.game.rngState=999999;changed.game.flags.testDice=[6,6,6];
  for(const p of changed.game.players)if(p.id!==bot){p.hand=['hare','legs'];p.selection=['legs'];}
  const second=projectRoom(changed,bot,{authorityId:'p0',authorityOnline:true});
  assert.deepEqual(decideAI(second),intent);assert(!('deck' in first));assert(!('rngState' in first));
  assert(first.players.filter(p=>p.id!==bot).every(p=>p.hand===undefined&&p.selection===undefined));
});

test('AI cannot consume a human choice, or act before its public pacing delay',()=>{
  const room=createBrowserRoom(metadata(2),5,2000);assert.equal(immediateRoomAction(room,3199),undefined);
  while(room.game.phase==='draft'){const a=automaticAction(room.game)!;applyGameAction(room.game,a.playerId,a.action);}
  assert.equal(room.game.phase,'selection');assert(immediateRoomAction(room,10000)?.playerId==='p1');
  room.game.phase='race';room.game.currentRacerId='r1';room.game.racers=[{id:'r1',playerId:'p1',characterId:'coach',position:4,finished:false,eliminated:false,tripped:false,flags:{}}];
  room.game.pending={id:'human',playerId:'p0',title:'真人选择',kind:'genius',options:[{id:'4',label:'4'}],optional:false,context:{}};
  assert.equal(immediateRoomAction(room,10000),undefined);
  assert.equal(projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true}).pending,undefined);
});

test('Turn setup presents Cheerleader choice before any roll and leaves the die untouched',()=>{
  const p=(id:string,seat:number):Player=>({id,name:id,seat,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]});
  const s=createGame([p('p0',0),p('p1',1)],99);s.phase='race';s.round=1;
  s.racers=['cheerleader','coach'].map((characterId,i)=>({id:`r${i}`,playerId:`p${i}`,characterId,position:i,finished:false,eliminated:false,tripped:false,flags:{}}));
  s.currentRacerId='r0';s.flags.needsBegin=true;
  assert.throws(()=>applyGameAction(s,'p0',{type:'roll'}),/系统处理/);
  const setup=systemAction(s)!;assert.equal(setup.action.type,'next');applyGameAction(s,setup.playerId,setup.action);
  assert.equal(s.pending?.kind,'cheerleader');assert.equal(s.randomLog.length,0);
  const c=s.pending!;applyGameAction(s,'p0',{type:'choose',choiceId:c.id,optionId:'skip'});
  assert.equal(s.flags.awaitRoll,true);assert.equal(s.randomLog.length,0);
});

test('Practice Hare still advances alone, while official AI races retain the alone-leading skip',()=>{
  for(const practice of [true,false]){
    const meta=metadata(practice?1:2),room=createBrowserRoom(meta,99,2000),s=room.game;
    s.phase='race';s.round=1;s.racers=s.players.map((p,i)=>({id:`r${i}`,playerId:p.id,characterId:i?'coach':'hare',position:i?0:5,finished:false,eliminated:false,tripped:false,flags:{}}));
    s.currentRacerId='r0';s.flags.needsBegin=true;s.queue=[];s.pending=undefined;
    applyGameAction(s,'p0',{type:'next'});
    assert.equal(s.flags.awaitRoll,practice);assert.equal(s.currentRacerId,practice?'r0':'r1');
  }
});

test('Browser authority automatically advances setup and AI without timeouts; persisted session resumes the same match',async()=>{
  const meta=metadata(3),clock={now:2000},options={indexedDB:new IDBFactory(),databaseName:'ai-resume',now:()=>clock.now,randomSeed:()=>91};
  let authority=await BrowserAuthority.create(meta,options),steps=0;
  while(authority.view('p0').phase!=='finished'){
    assert(++steps<10000);clock.now+=4000;
    if(await authority.tick())continue;
    const view=authority.view('p0'),action=decideAI(view);assert(action,`${view.phase}/${view.pending?.kind}`);
    const reply=await authority.action('p0',{actionId:crypto.randomUUID(),expectedVersion:view.version,action});assert(reply.ok,reply.error);
    if(steps===25){const before=authority.view('p0');authority.dispose();authority=await BrowserAuthority.load({...meta,phase:before.phase},options);assert.deepEqual(authority.view('p0').racers,before.racers);}
  }
  assert.equal(authority.view('p0').results.length,4);assert(!authority.view('p0').logs.some(e=>e.type==='timeout'));authority.dispose();
});

test('All 36 printed characters can complete a solo practice race, including no-target powers',()=>{
  for(const character of CHARACTERS){
    let now=2000,room=createBrowserRoom(metadata(1),19,now);room.game.phase='selection';room.game.draft=undefined;room.game.round=1;
    room.game.players[0]!.hand=[character.id];room.game.players[0]!.selection=[];
    room=reduceRoomAction(room,'p0',{type:'select',characterIds:[character.id]},{now,rematchSeed:0});
    let steps=0;
    while(room.game.phase==='race'){
      assert(++steps<1500,`practice stalled for ${character.id}`);now+=4000;
      const system=immediateRoomAction(room,now),action=system?.action??decideAI(projectRoom(room,'p0',{authorityId:'p0',authorityOnline:true}));
      assert(action,`no practice action for ${character.id}`);room=reduceRoomAction(room,system?.playerId??'p0',action,{now,rematchSeed:0});
    }
    assert.equal(room.game.phase,'results',character.id);assert(room.game.results[0]?.placements.some(p=>p.rank===1),character.id);
  }
});

test('AI declines a publicly predictable no-progress duel on the wild backward arrow',()=>{
  const room=createBrowserRoom(metadata(3),9,2000);room.game.phase='race';room.game.track='wild';room.game.currentRacerId='r1';
  room.game.racers=room.game.players.map((p,i)=>({id:`r${i}`,playerId:p.id,characterId:i===1?'duelist':'coach',position:i===0?20:22,finished:false,eliminated:false,tripped:false,flags:{}}));
  room.game.pending={id:'c1',playerId:'p1',racerId:'r1',title:'决斗',kind:'duelist',optional:true,options:[{id:'r2',label:'教练'},{id:'skip',label:'不决斗'}],context:{}};
  assert.deepEqual(decideAI(projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true})),{type:'choose',choiceId:'c1',optionId:'skip'});
});

test('Node authority completes a full AI match, owns bot identities and pauses unattended bot play',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);try{
    const created=rooms.create('真人',8,0,'ai',3),code=created.identity.roomCode,self=created.identity.playerId;
    assert.equal(created.room.mode,'ai');assert.equal(created.room.players.length,4);assert.equal(created.room.phase,'draft');
    const bot=created.room.players.find(p=>p.isAI)!;
    assert.throws(()=>rooms.authenticate({...created.identity,playerId:bot.id}),/身份已失效/);
    assert.throws(()=>rooms.join(code,'旁观'),/自己练习或人机/);
    assert.deepEqual(rooms.tick(Date.now()+10000),[]);
    rooms.presence(code,self,true);let steps=0,now=Date.now();
    while(rooms.get(code).game.phase!=='finished'){
      assert(++steps<1500);now+=4000;
      if(rooms.tick(now).length)continue;
      const view=rooms.view(rooms.get(code),self),action=decideAI(view);assert(action,view.phase);
      const reply=rooms.act(code,self,{actionId:crypto.randomUUID(),expectedVersion:view.version,action});assert(reply.ok,reply.error);
    }
    assert.equal(rooms.get(code).game.results.length,4);assert(!rooms.get(code).game.logs.some(e=>e.type==='timeout'));
    const view=rooms.view(rooms.get(code),self);
    assert(rooms.act(code,self,{actionId:crypto.randomUUID(),expectedVersion:view.version,action:{type:'rematch'}}).ok);
    assert.equal(rooms.get(code).game.phase,'draft');assert.equal(rooms.get(code).game.players.length,4);
    assert.equal(rooms.act(code,self,{actionId:crypto.randomUUID(),expectedVersion:rooms.get(code).version,action:{type:'transfer',playerId:bot.id}}).ok,false);
  }finally{store.close();}
});
