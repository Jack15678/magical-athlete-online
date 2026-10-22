import assert from 'node:assert/strict';
import test from 'node:test';
import { abilityState, applyGameAction, automaticAction, createGame, effectivePowers, enqueueMove, enqueueWarp, resolveTasks, stepdadTarget } from '../src/engine/index.js';
import { projectRoom } from '../src/shared/room-core.js';
import { decideAI } from '../src/engine/ai.js';
import type { GameState, Player, Room } from '../src/shared/types.js';

// Card-transcription + updated CMYK base p14/p15/p23 acceptance oracles.
// These tests do not promote the fan site's Interactions to official rulings.
function fixture(ids:string[],positions:number[]=ids.map((_,i)=>i*7)):GameState {
  const players:Player[]=ids.map((_,i)=>({id:`p${i}`,name:`玩家${i}`,seat:i,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,928,'multiplayer','mixed');s.phase='race';s.round=1;s.currentRacerId='r0';
  s.racers=ids.map((characterId,i)=>({id:`r${i}`,identityPlayerId:`p${i}`,playerId:`p${i}`,characterId,position:positions[i]!,finished:false,eliminated:false,tripped:false,flags:{}}));s.baseTurnOrder=s.racers.map(r=>r.id);return s;
}
const r=(s:GameState,i=0)=>s.racers.find(x=>x.id===`r${i}`)!;
function begin(s:GameState,i=0){s.currentRacerId=`r${i}`;s.flags.needsBegin=false;s.queue.push({kind:'beginTurn',racerId:`r${i}`});resolveTasks(s);}
function choose(s:GameState,id:string){assert(s.pending,`missing choice ${id}`);applyGameAction(s,s.pending.playerId,{type:'choose',choiceId:s.pending.id,optionId:id});}
function roll(s:GameState,...faces:number[]){s.flags.testDice=faces;applyGameAction(s,s.racers.find(x=>x.id===s.currentRacerId)!.playerId,{type:'roll'});}
function move(s:GameState,i:number,distance:number,cause='test'){enqueueMove(s,`r${i}`,distance,cause);resolveTasks(s);}
function view(s:GameState,id:string){return projectRoom({code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:s.players.length,timeoutSeconds:0,deadline:null,game:s} as Room,id,{authorityId:'p0',authorityOnline:true});}

test('Mr Dice all-distinct reroll waits for the human and survives reconnect without consuming extra turn',()=>{
  let s=fixture(['mr-dice-guy','alchemist','legs'],[2,10,20]);begin(s);r(s).flags.extraTurn=true;s.flags.testDice=[1,2,3,4,5,6];choose(s,'roll');
  assert.equal(s.pending?.kind,'mr-dice-reroll');assert.equal(automaticAction(s),undefined);assert.equal(s.randomLog.length,6);assert.equal(r(s).position,2);assert.equal(r(s).flags.extraTurn,true);assert(!s.logs.some(e=>e.type==='move'));
  s=JSON.parse(JSON.stringify(s));assert.throws(()=>applyGameAction(s,'p1',{type:'choose',choiceId:s.pending!.id,optionId:'roll'}),/对应玩家/);assert.equal(s.randomLog.length,6);
  const action=decideAI(view(s,'p0'));assert.deepEqual(action,{type:'choose',choiceId:s.pending!.id,optionId:'roll'});s.flags.testDice=[2,2,3,3,4,5];applyGameAction(s,'p0',action!);
  assert.equal(s.pending?.kind,'mr-dice-pick');assert.equal(r(s).position,2);assert.equal(r(s).flags.extraTurn,true);assert.equal(r(s).flags.turnsTaken,1);choose(s,'3');
  assert.equal(r(s).position,5);assert.equal(s.currentRacerId,'r0');assert.equal(s.flags.needsBegin,true);assert.equal(s.logs.filter(e=>e.type==='multi-dice').length,2);assert.equal(s.logs.filter(e=>e.type==='move'&&e.cause==='main').length,1);
});
test('Mr Dice all-distinct can repeat, and the explicit full reroll keeps Party Pooper processing',()=>{
  const s=fixture(['mr-dice-guy','alchemist','legs'],[2,10,20]);begin(s);s.flags.testDice=[1,2,3,4,5,6,6,5,4,3,2,1];choose(s,'roll');choose(s,'roll');assert.equal(s.pending?.kind,'mr-dice-reroll');assert.equal(s.randomLog.length,12);assert.equal(r(s).position,2);
  r(s,1).flags.acquiredPowers=['party-pooper'];s.flags.testDice=[6,2,2,3,4,5,1];choose(s,'roll');assert.equal(s.pending?.kind,'mr-dice-pick');assert.equal(r(s,1).position,11);assert.deepEqual(s.logs.filter(e=>e.type==='multi-dice').at(-1)?.faces,[2,2,3,4,5,1]);
  choose(s,'2');assert.equal(r(s).position,4);assert.equal(s.randomLog.length,19);assert.equal(s.flags.ruleHold,undefined);
});

test('Nemesis secondary die log compares the public main face and explains the resulting extra move',()=>{
  for(const matching of [true,false]){
    const s=fixture(['nemesis','alchemist','legs'],[2,10,20]);begin(s,1);roll(s,3,matching?3:2);assert.equal(s.pending?.kind,'nemesis');choose(s,'use');
    const event=s.logs.find(e=>e.type==='ability-dice'&&e.cause==='nemesis');assert(event);assert.match(event.text,/对比已公开主骰3/);
    assert.match(event.text,matching?/相同，发动3格额外移动/:/不同，本次不移动/);assert.equal(r(s).position,matching?5:2);
    assert.deepEqual(s.randomLog.map(x=>x.value),[3,matching?3:2]);
  }
});

test('Stepdad left neighbor is the next fixed racer instance and can be the same controller teammate',()=>{
  const s=fixture(['stepdad','alchemist','legs','blimp'],[21,2,17,8]);r(s,1).playerId='p0';s.baseTurnOrder=['r2','r3','r0','r1'];
  assert.equal(stepdadTarget(s,r(s))?.id,'r1');assert.equal(abilityState(s,r(s)).stepTargetControllerId,'p0');
  s.players.reverse();s.racers.reverse();assert.equal(stepdadTarget(s,r(s))?.id,'r1');
  assert.equal(abilityState(s,r(s)).stepTargetId,'r1');
});
test('Stepdad wraps the fixed order without using on-board position or player seat direction',()=>{
  const s=fixture(['alchemist','legs','stepdad'],[2,25,10]);s.baseTurnOrder=['r0','r1','r2'];
  assert.equal(stepdadTarget(s,r(s,2))?.id,'r0');r(s).position=28;r(s,1).position=1;assert.equal(stepdadTarget(s,r(s,2))?.id,'r0');
});
test('Stepdad adds2 only to its fixed teammate main move and does not change the final die',()=>{
  const s=fixture(['stepdad','alchemist','legs'],[2,5,20]);r(s,1).playerId='p0';begin(s,1);roll(s,3);
  assert.equal(r(s,1).position,10);assert.equal(s.lastRoll?.face,3);assert.equal(s.lastRoll?.distance,5);
  move(s,1,2,'centaur');assert.equal(r(s,1).position,12);
});
test('Stepdad fixed teammate champion gives normal first prize plus Stepdad3 to stable current controller',()=>{
  const s=fixture(['stepdad','alchemist','legs'],[2,26,20]);r(s,1).playerId='p0';begin(s,1);roll(s,3);
  assert.equal(r(s,1).rank,1);assert.equal(s.players[0]!.score,6);assert.equal(s.logs.filter(e=>e.type==='score'&&e.source==='r0').length,1);
});
test('Stepdad does not award3 for the fixed left racer finishing second',()=>{
  const s=fixture(['stepdad','alchemist','legs'],[2,28,29]);move(s,2,1);move(s,1,2);
  assert.equal(s.players[0]!.score,0);assert.equal(r(s,1).rank,2);
});
test('Stepdad gained mid-race through Mush works without reopening a before-race window',()=>{
  const s=fixture(['mush','alchemist','legs'],[2,26,20]);r(s).flags.acquiredPowers=['stepdad'];
  assert.equal(r(s).flags.stepTarget,undefined);assert.equal(abilityState(s,r(s)).stepTargetId,'r1');begin(s,1);roll(s,3);
  assert.equal(r(s,1).rank,1);assert.equal(s.players[0]!.score,3);
});
test('Copycat copying Stepdad derives its own left neighbor rather than the source neighbor',()=>{
  const s=fixture(['copycat','alchemist','stepdad'],[2,5,20]);assert.deepEqual(effectivePowers(s,r(s)),['stepdad']);
  assert.equal(abilityState(s,r(s)).stepTargetId,'r1');assert.equal(abilityState(s,r(s,2)).stepTargetId,'r0');begin(s,1);roll(s,3);assert.equal(r(s,1).position,10);
});
test('Stepdad target stays the same instance across controller transfer and reward follows new controller',()=>{
  const s=fixture(['stepdad','alchemist','legs'],[2,28,20]);r(s).playerId='p2';r(s,1).playerId='p0';
  assert.equal(stepdadTarget(s,r(s))?.id,'r1');move(s,1,2);assert.equal(s.players[2]!.score,3);assert.equal(s.players[0]!.score,3);
});
test('Null disables both Stepdad bonus and champion award while fixed target remains inspectable',()=>{
  const s=fixture(['stepdad','alchemist','null'],[5,26,2]);assert.deepEqual(effectivePowers(s,r(s)),[]);assert.equal(abilityState(s,r(s)).stepTargetId,'r1');begin(s,1);roll(s,3);
  assert.equal(s.lastRoll?.distance,2);assert.equal(r(s,1).position,28);move(s,1,2);assert.equal(s.players[0]!.score,0);
});
test('Stepdad does not retarget around a finished or eliminated fixed neighbor',()=>{
  const s=fixture(['stepdad','alchemist','legs'],[2,30,20]);r(s,1).finished=true;
  assert.equal(stepdadTarget(s,r(s))?.id,'r1');begin(s,2);choose(s,'use');assert.equal(r(s,2).position,25);
});
test('solo Stepdad has no left neighbor and cannot buff or award itself',()=>{
  const s=fixture(['stepdad'],[2]);s.mode='practice';assert.equal(stepdadTarget(s,r(s)),undefined);begin(s);roll(s,3);assert.equal(r(s).position,5);
  move(s,0,25);assert.equal(s.players[0]!.score,3);
});

test('Switcharoo with no nearby other live instance does not create a skip-only prompt',()=>{
  const s=fixture(['switcharoo','alchemist','legs'],[2,10,20]);begin(s);roll(s,3);
  assert.equal(s.pending,undefined);assert.equal(s.currentRacerId,'r1');assert.equal(s.flags.needsBegin,true);
});
test('Switcharoo ignores finished and eliminated neighbors while preserving another-vs-opposing semantics',()=>{
  const s=fixture(['switcharoo','alchemist','legs'],[2,5,5]);r(s,1).finished=true;r(s,2).eliminated=true;begin(s);roll(s,3);assert.equal(s.pending,undefined);
  const friendly=fixture(['switcharoo','alchemist','legs'],[2,5,20]);r(friendly,1).playerId='p0';begin(friendly);roll(friendly,3);assert(friendly.pending?.options.some(o=>o.id==='r1'));
});
test('a successful actual Switcharoo control transfer triggers Scoocher once; declining does not',()=>{
  const s=fixture(['switcharoo','alchemist','scoocher'],[2,5,20]);begin(s);roll(s,3);choose(s,'r1');assert.equal(r(s,2).position,21);
  const no=fixture(['switcharoo','alchemist','scoocher'],[2,5,20]);begin(no);roll(no,3);choose(no,'skip');assert.equal(r(no,2).position,20);
});
test('Switcharoo rejects a stale out-of-range target before mutating stable ownership',()=>{
  const s=fixture(['switcharoo','alchemist','legs'],[2,5,20]);begin(s);roll(s,3);r(s,1).position=10;
  assert.throws(()=>choose(s,'r1'),/邻近范围/);assert.equal(r(s).playerId,'p0');assert.equal(r(s,1).playerId,'p1');
});

test('Hose waits for an explicit mandatory controller die after main movement and reconnect resumes it',()=>{
  let s=fixture(['the-hose','alchemist','legs'],[2,7,15]);begin(s);roll(s,2,3);
  assert.equal(s.pending?.kind,'the-hose-roll');assert.equal(s.pending?.optional,false);assert.deepEqual(s.randomLog.map(x=>x.value),[2]);assert(!r(s,1).tripped);assert.equal(automaticAction(s),undefined);
  assert.equal(view(s,'p1').pending,undefined);assert.equal(view(s,'p0').pending?.kind,'the-hose-roll');s=JSON.parse(JSON.stringify(s));
  assert.throws(()=>applyGameAction(s,'p1',{type:'choose',choiceId:s.pending!.id,optionId:'roll'}),/对应玩家/);choose(s,'roll');assert(r(s,1).tripped);assert.deepEqual(s.randomLog.map(x=>x.value),[2,3]);
});
test('Hose trip range excludes same and rear spaces but includes the far boundary and teammates',()=>{
  const s=fixture(['the-hose',...Array(7).fill('alchemist')],[5,7,6,8,11,12,30,9]);r(s,4).playerId='p0';r(s,6).finished=true;r(s,7).eliminated=true;
  begin(s);roll(s,2,4);choose(s,'roll');assert.deepEqual(s.racers.map(x=>x.tripped),[false,false,false,true,true,false,false,false]);
  assert.deepEqual(s.logs.find(e=>e.type==='ability-dice'&&e.cause==='the-hose')?.targets,['r4','r3']);
});
test('Hose recovery-only turn still gets its end-of-turn die; it is not a main roll',()=>{
  const s=fixture(['the-hose','alchemist','legs'],[5,7,15]);r(s).tripped=true;s.flags.testDice=[2];begin(s);
  assert.equal(s.pending?.kind,'the-hose-roll');assert.equal(s.randomLog.length,0);assert(!r(s).tripped);choose(s,'roll');assert(r(s,1).tripped);assert.equal(s.lastRoll,undefined);assert(!s.logs.some(e=>e.type==='roll'));
});
test('Hose trip is not blocked by Penguin: Penguin remains tripped and uses doubled next main die',()=>{
  const s=fixture(['the-hose','penguin','legs'],[2,6,20]);begin(s);roll(s,2,2);choose(s,'roll');assert(r(s,1).tripped);begin(s,1);roll(s,3);assert.equal(r(s,1).position,12);assert(r(s,1).tripped);
});
test('Hose never rolls after finishing, elimination or Null disabling its end-of-turn power',()=>{
  for(const status of ['finished','eliminated'] as const){const s=fixture(['the-hose','alchemist','legs'],[30,7,15]);r(s)[status]=true;s.queue.push({kind:'endTurn',racerId:'r0'});resolveTasks(s);assert.equal(s.pending,undefined);assert.equal(s.randomLog.length,0);}
  const s=fixture(['the-hose','null','legs'],[5,2,20]);begin(s);roll(s,2);assert.equal(s.pending,undefined);assert.equal(s.randomLog.length,1);
});
test('Stunner sets only the Hose range die to1 without overwriting the recorded main roll',()=>{
  const s=fixture(['the-hose','stunner','alchemist'],[5,7,8]);begin(s);roll(s,1,6);choose(s,'roll');
  assert.deepEqual(s.logs.find(e=>e.type==='ability-dice'&&e.cause==='the-hose')?.faces,[1]);assert(r(s,1).tripped);assert(!r(s,2).tripped);assert.equal(s.lastRoll?.face,1);assert.equal(s.lastRoll?.distance,1);assert.deepEqual(s.randomLog.map(x=>x.value),[1,6]);
});
test('Hose forced six reroll resolves Party Pooper movement before publishing range and trips',()=>{
  const s=fixture(['the-hose','party-pooper','alchemist'],[5,0,10]);begin(s);roll(s,2,6,3);choose(s,'roll');assert.equal(r(s,1).position,1);assert(r(s,2).tripped);
  const moveIndex=s.logs.findIndex(e=>e.type==='move'&&e.cause==='party-pooper'),rangeIndex=s.logs.findIndex(e=>e.type==='ability-dice'&&e.cause==='the-hose');assert(moveIndex>=0&&rangeIndex>moveIndex);assert.deepEqual(s.logs[rangeIndex]!.faces,[3]);
});

test('Suckerfish preview shows controller, racer, modified actual main distance and endpoints',()=>{
  const s=fixture(['legs','suckerfish','gunk','coach'],[2,2,18,2]);begin(s);choose(s,'use');
  assert.equal(s.pending?.kind,'suckerfish');assert.match(s.pending!.title,/玩家0的大长腿/);assert.match(s.pending!.title,/主要移动：第2格 → 第7格（前进5格/);assert.equal(s.randomLog.length,0);choose(s,'use');assert.equal(r(s).position,7);assert.equal(r(s,1).position,7);
});
test('Suckerfish preview reports clamped backward progress rather than an unattainable distance',()=>{
  const s=fixture(['alchemist','suckerfish','legs'],[2,2,20]);move(s,0,-5,'centaur');assert.match(s.pending!.title,/人马额外移动：第2格 → 第0格（后退2格/);choose(s,'use');assert.equal(r(s,1).position,0);
});
test('Suckerfish preview separates arrow extra movement from the preceding main movement',()=>{
  const s=fixture(['alchemist','suckerfish','legs'],[6,7,20]);s.track='wild';move(s,0,1,'main');assert.match(s.pending!.title,/赛道箭头额外移动：第7格 → 第10格（前进3格/);choose(s,'use');assert.equal(r(s,1).position,10);
});
test('Suckerfish preview honors acquired Leaptoad skips, and acquired Suckerfish receives choices',()=>{
  const s=fixture(['mush','mush','alchemist','legs'],[2,2,3,4]);r(s).flags.acquiredPowers=['leaptoad'];r(s,1).flags.acquiredPowers=['suckerfish'];move(s,0,2,'main');
  assert.equal(s.pending?.playerId,'p1');assert.match(s.pending!.title,/第2格 → 第6格（前进4格；移动2步并跳过2个占用格/);choose(s,'use');assert.equal(r(s).position,6);assert.equal(r(s,1).position,6);
});
test('Suckerfish gets no preview for a warp, zero progress or Stickler-cancelled overshoot',()=>{
  const warp=fixture(['alchemist','suckerfish','legs'],[2,2,20]);enqueueWarp(warp,'r0',5);resolveTasks(warp);assert.equal(warp.pending,undefined);
  const zero=fixture(['alchemist','suckerfish','legs'],[0,0,20]);move(zero,0,-3);assert.equal(zero.pending,undefined);
  const blocked=fixture(['alchemist','suckerfish','stickler'],[28,28,2]);move(blocked,0,5,'main');assert.equal(blocked.pending,undefined);
});
test('Cheatah secret stays private until reveal, then the now-public Suckerfish preview can show its distance',()=>{
  const s=fixture(['cheatah','suckerfish','alchemist'],[2,2,20]);begin(s);choose(s,'5');assert.equal(s.pending?.kind,'cheatah-guess');
  const fishView=view(s,'p1');assert.equal(fishView.pending,undefined);assert(!JSON.stringify(fishView).includes('cheatahSecret'));assert(!fishView.logs.some(e=>e.type==='secret-reveal'));
  choose(s,'1');assert(s.logs.some(e=>e.type==='secret-reveal'));assert.equal(s.pending?.kind,'suckerfish');assert.match(s.pending!.title,/主要移动：第2格 → 第7格（前进5格/);assert.equal((view(s,'p1').pending as unknown as Record<string,unknown>).context,undefined);
});


test('same-controller Switcharoo exchange preserves both printed cards without duplicating used history',()=>{
  const s=fixture(['switcharoo','alchemist','legs'],[2,5,20]);r(s,1).playerId='p0';s.players[0]!.used=['switcharoo','alchemist'];begin(s);roll(s,3);choose(s,'r1');
  assert.deepEqual(s.players[0]!.used,['switcharoo','alchemist']);assert.equal(r(s).playerId,'p0');assert.equal(r(s,1).playerId,'p0');
});
test('Hose mandatory secondary die belongs to the new controller after an earlier end-turn Switcharoo exchange',()=>{
  const s=fixture(['switcharoo','alchemist','legs'],[2,5,20]);r(s).flags.acquiredPowers=['the-hose'];begin(s);roll(s,3,2);assert.equal(s.pending?.kind,'switcharoo');choose(s,'r1');
  assert.equal(s.pending?.kind,'the-hose-roll');assert.equal(s.pending?.playerId,'p1');assert.throws(()=>applyGameAction(s,'p0',{type:'choose',choiceId:s.pending!.id,optionId:'roll'}),/对应玩家/);choose(s,'roll');assert.deepEqual(s.logs.find(e=>e.type==='ability-dice'&&e.cause==='the-hose')?.faces,[2]);
});

test('a Penguin-like exception is not generalized into immunity, and a tripped Null keeps its passive',()=>{
  const s=fixture(['the-hose','null','alchemist'],[2,5,6]);begin(s);roll(s,2,2);choose(s,'roll');assert(r(s,1).tripped);assert(r(s,2).tripped);assert.deepEqual(effectivePowers(s,r(s,1)),['null']);assert.deepEqual(effectivePowers(s,r(s,2)),[]);
});
