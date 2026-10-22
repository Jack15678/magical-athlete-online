import * as historicalV2 from '../src/engine/rules-v2.js';
import { SECOND_WIND_V2_RULES_VERSION } from '../src/engine/runtime.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameAction, automaticAction, createGame, resolveTasks, systemAction } from '../src/engine/index.js';
import { createRandomStream } from '../src/shared/random.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameState, Player, Room } from '../src/shared/types.js';

/** Minimal seed21/mixed/3-player race2 state: Critic is already champion.
 * Both live racers stand on Wild trip spaces; Diva's only target is Hopfrog. */
function fixture():GameState {
  const players:Player[]=Array.from({length:3},(_,i)=>({id:`p${i}`,name:`P${i}`,seat:i,color:'#000',ready:true,connected:true,score:i===1?4:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,21,'multiplayer','mixed');s.phase='race';s.round=2;s.track='wild';s.currentRacerId='r2';s.turn=2;s.turnCount=8;
  s.racers=['hopfrog','critic','diva'].map((characterId,i)=>({id:`r${i}`,playerId:`p${i}`,identityPlayerId:`p${i}`,characterId,position:[5,30,26][i]!,tripped:false,finished:i===1,eliminated:false,flags:{turnsTaken:2},...(i===1?{rank:1}:{})}));
  s.baseTurnOrder=['r0','r1','r2'];s.flags={needsBegin:true,placements:[{racerId:'r1',playerId:'p1',characterId:'critic',rank:1,points:4}],nextOverride:[]};return s;
}
function historicalFixture(){const s=fixture();s.rulesVersion=SECOND_WIND_V2_RULES_VERSION;return s;}
function historicalStunnedFixture(){const s=stunnedFixture();s.rulesVersion=SECOND_WIND_V2_RULES_VERSION;return s;}
function apply(s:GameState,playerId:string,action:Parameters<typeof applyGameAction>[2]){return(s.rulesVersion===SECOND_WIND_V2_RULES_VERSION?historicalV2.applyGameAction:applyGameAction)(s,playerId,action);}
function step(s:GameState):void {
  const action=(s.rulesVersion===SECOND_WIND_V2_RULES_VERSION?historicalV2.systemAction:systemAction)(s);
  if(action){apply(s,action.playerId,action.action);return;}
  const pending=s.pending;assert(pending,'expected a pending forced choice');
  const option=pending.options.find(o=>o.id==='skip')??pending.options[0]!;
  apply(s,pending.playerId,{type:'choose',choiceId:pending.id,optionId:option.id});
}
function drive(s:GameState,count=60) { for(let i=0;i<count&&s.phase==='race';i++)step(s); }
function view(s:GameState) { return projectRoom({code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:3,timeoutSeconds:0,deadline:null,game:s} as Room,'p0',{authorityId:'p0',authorityOnline:true}); }
function stunnedFixture():GameState {
  const s=fixture();s.currentRacerId='r0';s.turn=0;s.flags.placements=[];s.players.forEach(p=>p.score=0);
  s.racers[0]!.position=9;s.racers[1]!.characterId='huge-baby';s.racers[1]!.position=10;s.racers[1]!.finished=false;delete s.racers[1]!.rank;s.racers[2]!.characterId='stunner';s.racers[2]!.position=9;return s;
}
function play(s:GameState) { if(s.flags.awaitRoll&&!s.pending)apply(s,s.racers.find(r=>r.id===s.currentRacerId)!.playerId,{type:'roll'});else step(s); }

test('v2 historical Stunner overriding every raw die allows an exact Hopfrog/Huge Baby cycle draw with either RNG',()=>{
  for(const secure of [false,true]){
    const s=historicalStunnedFixture();if(secure)s.randomStream=createRandomStream(Array.from({length:11},(_,i)=>i+1));const rng=s.rngState;
    for(let i=0;i<60&&s.phase==='race';i++)play(s);
    assert.equal(s.phase,'results');assert.equal(s.results[0]!.drawReason,'forced-cycle');assert(s.randomLog.length>=2);assert.notEqual(s.rngState,rng);assert(s.logs.filter(e=>e.type==='roll').every(e=>e.text.includes('1')));assert(s.players.every(p=>p.score===0));
    assert(s.logs.some(e=>e.type==='die-modified'));assert(s.logs.some(e=>e.type==='place'&&e.cause==='huge-baby'));
  }
});
test('a voluntary choice still prevents a Stunner-masked random cycle from drawing',()=>{
  const s=stunnedFixture();s.racers[0]!.flags.acquiredPowers=['kingtripper'];for(let i=0;i<80;i++){play(s);assert.equal(s.phase,'race');}
  assert(s.randomLog.length>10);assert(!s.logs.some(e=>e.type==='cycle-draw'));
});
test('a new ordinary die after Stunner leaves breaks the semantic interval',()=>{
  const s=stunnedFixture();s.flags.testDice=[6,4];play(s);play(s);assert.equal(s.racers[0]!.position,9);s.racers[2]!.position=20;play(s);play(s);
  assert.equal(s.racers[0]!.position,13);assert.equal(s.lastRoll?.face,4);assert.equal(s.phase,'race');assert(!s.logs.some(e=>e.type==='cycle-draw'));
});
test('unexpected secure RNG cursor/cache changes invalidate even a Stunner-only interval',()=>{
  const s=stunnedFixture();s.randomStream=createRandomStream(Array.from({length:11},(_,i)=>i+1));
  for(let i=0;i<60;i++){s.randomStream.counter++;s.randomStream.words[0]=i;play(s);assert.equal(s.phase,'race');}assert(!s.logs.some(e=>e.type==='cycle-draw'));
});

test('v2 historical project ruling draws an exact forced cycle without inventing a second place or altering RNG',()=>{
  const s=historicalFixture(),scores=s.players.map(p=>p.score),rng=s.rngState;drive(s);
  assert.equal(s.phase,'results');assert.equal(s.flags.ruleHold,undefined);assert.equal(s.randomLog.length,0);assert.equal(s.rngState,rng);
  assert.deepEqual(s.players.map(p=>p.score),scores);assert.equal(s.racers[1]!.rank,1);assert(!s.racers.some(r=>r.rank===2));assert.equal(s.results.length,1);assert.equal(s.results[0]!.placements.length,1);assert.equal(s.results[0]!.drawReason,'forced-cycle');
  assert.deepEqual(s.queue,[]);assert.equal(s.pending,undefined);assert.equal(s.flags.needsBegin,false);assert.equal(systemAction(s),undefined);
  assert(!JSON.stringify(view(s)).includes('forcedCycleTrace'));assert(!('randomStream' in view(s)));assert.equal(s.logs.filter(e=>e.type==='cycle-draw').length,1);
  assert(!s.racers.some(r=>r.eliminated));assert(!s.logs.some(e=>e.type==='cancel-race'||e.type==='eliminate'));applyGameAction(s,'p0',{type:'next'});assert.equal(s.round,3);assert.equal(s.phase,'selection');
});
test('v2 historical cycle draw does not grant Gloth or predicted-champion rewards; fourth race finishes normally',()=>{
  const s=historicalFixture();s.round=4;s.racers[0]!.flags.acquiredPowers=['gloth','mastermind','re-runner'];s.racers[0]!.flags.prediction='r0';s.racers[0]!.flags.mindUsed=true;
  const scores=s.players.map(p=>p.score);drive(s);assert.equal(s.phase,'finished');assert.deepEqual(s.players.map(p=>p.score),scores);assert.equal(s.results[0]!.drawReason,'forced-cycle');
  assert(!s.logs.some(e=>e.type==='score'||e.type==='prediction'));assert(!s.racers.some(r=>r.rank===2));assert((s.flags.reRunners as any[]).some(entry=>entry.playerId==='p0'));
});
test('v2 historical cycle draw without an existing champion leaves the placement list empty',()=>{
  const s=historicalFixture();s.racers=s.racers.filter(r=>r.id!=='r1');s.baseTurnOrder=['r0','r2'];s.players[1]!.score=0;s.flags.placements=[];drive(s);
  assert.equal(s.phase,'results');assert.deepEqual(s.results[0]!.placements,[]);assert.equal(s.results[0]!.drawReason,'forced-cycle');assert(s.players.every(p=>p.score===0));assert(s.racers.every(r=>!r.finished&&!r.eliminated&&r.rank===undefined));
});
test('human mandatory single target is never auto-selected while waiting',()=>{
  const s=fixture();step(s);assert.equal(s.pending?.kind,'diva');assert.equal(s.pending.options.length,1);assert.equal(s.pending.optional,false);
  const saved=JSON.stringify(s);for(let i=0;i<50;i++){assert.equal(systemAction(s),undefined);assert.equal(automaticAction(s),undefined);resolveTasks(s);}
  assert.equal(JSON.stringify(s),saved);assert.equal(s.phase,'race');assert.equal(s.flags.ruleHold,undefined);
});
test('v2 historical a repeated forced state survives JSON reconnect and draws at the same boundary',()=>{
  let s=historicalFixture();for(let i=0;i<5;i++)step(s);assert(s.flags.forcedCycleTrace);s=JSON.parse(JSON.stringify(s));drive(s);
  assert.equal(s.phase,'results');assert.deepEqual(s.queue,[]);
  const restored=JSON.parse(JSON.stringify(s));assert.equal(view(restored).phase,'results');assert.deepEqual(restored.flags.placements,s.flags.placements);assert.deepEqual(restored.results,s.results);
});
test('optional skill declined on every identical cycle prevents a forced-cycle hold',()=>{
  const s=fixture();s.racers[0]!.flags.acquiredPowers=['kingtripper'];let optional=0;
  for(let i=0;i<80;i++){if(s.pending?.optional){optional++;assert(s.pending.options.some(o=>o.id==='skip'));assert.equal(s.flags.forcedCycleTrace,undefined);}step(s);assert.equal(s.phase,'race');}
  assert(optional>10);assert.equal(s.flags.ruleHold,undefined);assert.equal(s.randomLog.length,0);
});
test('multiple mandatory legal targets clear the trace even when no pass exists',()=>{
  const s=fixture();s.racers[1]!.finished=false;s.racers[1]!.position=5;s.racers[1]!.rank=undefined;
  step(s);assert.equal(s.pending?.kind,'diva');assert.equal(s.pending.optional,false);assert.deepEqual(s.pending.options.map(o=>o.id),['r0','r1']);assert.equal(s.flags.forcedCycleTrace,undefined);
  for(let i=0;i<20;i++){assert.equal(automaticAction(s),undefined);assert.equal(systemAction(s),undefined);}assert.equal(s.phase,'race');
});
test('ordinary manual roll waiting clears trace and repeated polling cannot pause',()=>{
  const s=fixture();s.racers[2]!.characterId='alchemist';step(s);assert.equal(s.flags.awaitRoll,true);assert.equal(s.flags.forcedCycleTrace,undefined);
  const saved=JSON.stringify(s);for(let i=0;i<50;i++){view(s);assert.equal(systemAction(s),undefined);}assert.equal(JSON.stringify(s),saved);assert.equal(s.flags.ruleHold,undefined);
});
test('ability dice break the forced interval even on the same spatial cycle',()=>{
  const s=fixture();s.racers[0]!.flags.acquiredPowers=['the-hose'];s.flags.testDice=Array(80).fill(1);let rolls=0;
  for(let i=0;i<100;i++){const rolling=s.pending?.kind==='the-hose-roll';step(s);if(rolling){rolls++;assert.equal(s.flags.forcedCycleTrace,undefined);}assert.equal(s.phase,'race');}
  assert(rolls>10);assert.equal(s.randomLog.length,rolls);assert.equal(s.flags.ruleHold,undefined);
});
test('fresh numeric or secure random draws cannot be mistaken for a forced spatial cycle',()=>{
  for(const secure of [false,true]){
    const s=fixture();s.racers[0]!.flags.acquiredPowers=['the-hose'];if(secure)s.randomStream=createRandomStream(Array.from({length:11},(_,i)=>i+1));let rolls=0;
    for(let i=0;i<100;i++){const rolling=s.pending?.kind==='the-hose-roll',old=s.rngState;step(s);if(rolling){rolls++;assert.notEqual(s.rngState,old);assert.equal(s.flags.forcedCycleTrace,undefined);}assert.equal(s.phase,'race');}
    assert(rolls>10);assert.equal(s.randomLog.length,rolls);assert.equal(s.flags.ruleHold,undefined);
  }
});
test('every executable racer flag is compared instead of just positions and visible powers',()=>{
  const s=fixture();for(let i=0;i<80;i++){s.racers[0]!.flags.futureRuleCharge=i;step(s);assert.equal(s.phase,'race');}assert.equal(s.flags.ruleHold,undefined);
});
test('full secure RNG key and cached words belong to the signature, not just its cursor',()=>{
  const s=fixture();s.randomStream=createRandomStream(Array.from({length:11},(_,i)=>i));s.randomStream.words=Array(16).fill(7);
  for(let i=0;i<80;i++){s.randomStream.key[0]=i;s.randomStream.words[1]=i;step(s);assert.equal(s.phase,'race');}assert.equal(s.randomLog.length,0);assert.equal(s.flags.ruleHold,undefined);
});
test('changing deck or score is not a repeated executable state',()=>{
  for(const change of ['deck','score'] as const){
    const s=fixture();for(let i=0;i<50;i++){
      if(change==='deck')s.deck=Array(i).fill('alchemist');else s.players[0]!.score=i;
      step(s);assert.equal(s.phase,'race',change);
    }assert.equal(s.flags.ruleHold,undefined);
  }
});


test('v3 a proven cross-turn forced loop pauses with its exact continuation and never invents a draw result',()=>{
 const s=fixture(),scores=s.players.map(p=>p.score);drive(s);assert.equal(s.phase,'paused');assert(s.flags.ruleHold);assert.equal((s.flags.ruleHold as {kind:string}).kind,'forced-cycle');assert.deepEqual(s.players.map(p=>p.score),scores);assert.equal(s.results.length,0);assert.equal(s.queue[0]?.kind,'beginTurn');assert(!s.logs.some(e=>e.type==='cycle-draw'||e.type==='finish'));assert(s.logs.some(e=>e.type==='cycle-paused'));
});
