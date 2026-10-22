import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../src/engine/index.js';
import { decideAI } from '../src/engine/ai.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameEvent, Player, Room, RoomView } from '../src/shared/types.js';
function fixture():RoomView {
  const players:Player[]=Array.from({length:3},(_,i)=>({id:`p${i}`,name:`P${i}`,seat:i,color:'#000',ready:true,connected:true,isAI:true,score:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,28,'ai','mixed');s.phase='race';s.round=2;s.track='wild';s.currentRacerId='r0';
  s.racers=['kingtripper','le-saboteur','diva'].map((characterId,i)=>({id:`r${i}`,playerId:`p${i}`,characterId,position:[26,26,5][i]!,tripped:false,finished:false,eliminated:false,flags:{}}));
  s.pending={id:'choice',playerId:'p0',racerId:'r0',kind:'kingtripper',title:'选择领跑者',optional:true,context:{},options:[{id:'r0',label:'自己'},{id:'r1',label:'对方'},{id:'skip',label:'放弃'}]};
  const room:Room={code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:3,timeoutSeconds:0,deadline:null,game:s};return projectRoom(room,'p0',{authorityId:'p0',authorityOnline:true});
}
function cycle():GameEvent[] { return [
  {id:1,type:'power',text:'国王发动',source:'r0',cause:'kingtripper'},
  {id:2,type:'trip',text:'绊倒对方',source:'r0',targets:['r1']},
  {id:3,type:'warp',text:'交换',targets:['r0','r2'],before:[26,5],after:[5,26]},
  {id:4,type:'warp',text:'换回',targets:['r0','r2'],before:[5,26],after:[26,5]},
  {id:5,type:'turn',text:'国王回合',source:'r0'},
]; }
test('public AI declines Kingtripper repeating the same target on the same returned board',()=>{
  const v=fixture();v.logs=cycle();assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'skip'});
});
test('public AI still trips a target when there is no repeated same-board history',()=>{
  const v=fixture();assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'r1'});
  v.logs=cycle();v.racers[2]!.position=6;assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'r1'});
});
test('a different target or new race does not suppress an ordinary AI Kingtripper choice',()=>{
  const v=fixture();v.logs=cycle();v.logs[1]!.targets=['r2'];assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'r1'});
  v.logs=cycle();v.logs.push({id:6,type:'phase',text:'新一场'});assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'r1'});
});
test('the AI hint has no authority over a human and cannot act for another player',()=>{
  const v=fixture();v.logs=cycle();v.selfId='p1';assert.equal(decideAI(v),undefined);
  v.selfId='p0';v.pending!.options=v.pending!.options.filter(o=>o.id!=='skip');v.pending!.optional=false;assert.deepEqual(decideAI(v),{type:'choose',choiceId:'choice',optionId:'r1'});
});

function hypnotistView():RoomView {
 const view=fixture();view.racers[0]!.characterId='hypnotist';view.racers[0]!.position=1;view.racers[0]!.flags.publicAbilities={powers:['hypnotist']};
 view.racers[1]!.characterId='baba-yaga';view.racers[1]!.position=5;view.racers[1]!.flags.publicAbilities={powers:['baba-yaga']};
 view.pending={id:'hypnotist',playerId:'p0',racerId:'r0',kind:'hypnotist',title:'召唤目标',optional:true,options:[{id:'r1',label:'芭芭雅嘎'},{id:'skip',label:'不使用'}]};return view;
}
test('public AI avoids voluntarily summoning an effective Baba Yaga that would repeatedly trip itself before main movement',()=>{const view=hypnotistView(),before=JSON.stringify(view);assert.deepEqual(decideAI(view),{type:'choose',choiceId:'hypnotist',optionId:'skip'});assert.equal(JSON.stringify(view),before);});
test('AI can still summon a publicly disabled Baba Yaga or resist its trip with a visible immunity',()=>{const disabled=hypnotistView();disabled.racers[1]!.flags.publicAbilities={powers:[],disabledBy:['null-id']};assert.deepEqual(decideAI(disabled),{type:'choose',choiceId:'hypnotist',optionId:'r1'});const immune=hypnotistView();immune.racers[0]!.flags.publicAbilities={powers:['hypnotist','leaf-catfish']};assert.deepEqual(decideAI(immune),{type:'choose',choiceId:'hypnotist',optionId:'r1'});});
