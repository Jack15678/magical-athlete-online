import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyGameAction, createGame, effectivePowers, enqueueMove, enqueueWarp, resolveTasks, startGame } from '../src/engine/index.js';
import { roomRules, SECOND_WIND_RULES_VERSION } from '../src/engine/runtime.js';
import { CHARACTERS, characterPool } from '../src/shared/characters.js';
import { WURSTII_CHARACTERS } from '../src/shared/wurstii.js';
import { Avatar } from '../src/client/avatars.js';
import type { GameState, Player } from '../src/shared/types.js';

const card=(id:string)=>`wurstii-${id}`;
function fixture(ids:string[],positions=ids.map((_,i)=>1+i*10)):GameState {
  const players:Player[]=ids.map((_,i)=>({id:`p${i}`,name:`玩家${i}`,seat:i,color:'#123456',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,456,'multiplayer','all');s.phase='race';s.round=1;s.currentRacerId='r0';
  s.racers=ids.map((id,i)=>({id:`r${i}`,playerId:`p${i}`,characterId:CHARACTERS.some(c=>c.id===id)?id:card(id),position:positions[i]!,tripped:false,finished:false,eliminated:false,flags:{}}));
  s.baseTurnOrder=s.racers.map(r=>r.id);return s;
}
const standard=(id:string,positions=[1,11,21])=>fixture([id,'magikarp','magikarp'],positions);
const racer=(s:GameState,i=0)=>s.racers[i]!;
const pendingKind=(s:GameState)=>s.pending?.kind;
function before(s:GameState,i=0){s.queue.push({kind:'beforeRace',racerId:`r${i}`});resolveTasks(s);}
function begin(s:GameState,i=0){s.currentRacerId=`r${i}`;s.flags.needsBegin=false;s.flags.awaitRoll=false;s.queue=[{kind:'beginTurn',racerId:`r${i}`}];resolveTasks(s);}
function end(s:GameState,i=0){s.currentRacerId=`r${i}`;s.flags.awaitRoll=false;s.queue=[{kind:'endTurn',racerId:`r${i}`}];resolveTasks(s);}
function choose(s:GameState,id:string){assert(s.pending);applyGameAction(s,s.pending.playerId,{type:'choose',choiceId:s.pending.id,optionId:id});}
function roll(s:GameState,...faces:number[]){s.flags.testDice=faces;applyGameAction(s,racer(s,s.racers.findIndex(r=>r.id===s.currentRacerId)).playerId,{type:'roll'});}
function move(s:GameState,i:number,n:number){s.flags.awaitRoll=false;s.queue=[];enqueueMove(s,`r${i}`,n);resolveTasks(s);}
function warp(s:GameState,i:number,n:number){s.flags.awaitRoll=false;s.queue=[];enqueueWarp(s,`r${i}`,n);resolveTasks(s);}
function firstFinisher(s:GameState,i=2){racer(s,i).finished=true;racer(s,i).rank=1;racer(s,i).position=30;s.flags.placements=[{racerId:`r${i}`,playerId:`p${i}`,characterId:racer(s,i).characterId,rank:1,points:3}];}

test('Wurstii A contains exactly the selected 30 distinct named cards and playable pools',()=>{
  assert.equal(WURSTII_CHARACTERS.length,30);assert.equal(CHARACTERS.length,102);
  assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,102);
  assert.equal(new Set(WURSTII_CHARACTERS.map(c=>c.nameZh)).size,30);
  assert.deepEqual(['original','second-wind','mixed','wurstii','all'].map(p=>characterPool(p as any).length),[36,36,72,66,102]);
  for(const c of WURSTII_CHARACTERS){assert.match(c.nameZh,/[\u4e00-\u9fff]/);assert(c.ability&&c.sources.length);assert.equal(c.edition,'wurstii');assert.equal(c.verified,false);assert.match(renderToStaticMarkup(createElement(Avatar,{id:c.id})),new RegExp(c.nameZh.slice(0,2)));}
});
test('WA01 Bart targets a Racer, retains the choice on reload and only boosts while it is ahead',()=>{
  let s=standard('bart-simpson');racer(s,1).playerId='p0';begin(s);
  assert.deepEqual(s.pending?.options.map(o=>o.id),['r1','r2']);assert.equal(s.randomLog.length,0);
  s=JSON.parse(JSON.stringify(s));choose(s,'r1');roll(s,3);assert.equal(racer(s).position,6);
  racer(s,1).position=0;begin(s);assert(!s.pending);roll(s,3);assert.equal(racer(s).position,9);
});
test('WA02 Bucky responds once to another milestone turn, never its own',()=>{
  const s=standard('bucky-ohare',[1,10,21]);end(s,1);assert.equal(racer(s).position,2);
  racer(s).position=5;end(s);assert.equal(racer(s).position,5);
});
test('WA03 Bullet Bill is once per race after an actual finisher, including while tripped',()=>{
  const s=standard('bullet-bill');begin(s);assert.equal(racer(s).position,1);
  firstFinisher(s);racer(s).tripped=true;begin(s);assert.equal(racer(s).position,9);assert(!racer(s).tripped);
  begin(s);assert.equal(racer(s).position,9);assert.equal(s.flags.awaitRoll,true);
});
test('WA04 Chip and Dale modifies movement, not the final die face',()=>{
  const s=standard('chip-n-dale');begin(s);roll(s,5);assert.equal(racer(s).position,8);assert.equal(s.lastRoll?.face,5);assert.equal(s.lastRoll?.distance,7);
});
test('WA05 Diddy has three optional rerolls and stops overshoots at29, then finishes exactly',()=>{
  const s=standard('diddy-kong',[25,10,15]);begin(s);roll(s,2,3,4,6);for(let i=0;i<3;i++)choose(s,'reroll');
  assert(!s.pending);assert.equal(s.randomLog.length,4);assert.equal(racer(s).position,29);assert(!racer(s).finished);
  begin(s);roll(s,1);choose(s,'keep');assert(racer(s).finished);assert.equal(racer(s).rank,1);
});
test('WA05 Diddy also limits forced movement and copied powers; teleport remains teleport',()=>{
  const s=standard('diddy-kong',[27,10,15]);move(s,0,6);assert.equal(racer(s).position,29);
  const copied=fixture(['mush','magikarp','magikarp'],[27,10,15]);racer(copied).flags.acquiredPowers=[card('diddy-kong')];move(copied,0,6);assert.equal(racer(copied).position,29);
  warp(s,0,30);assert(racer(s).finished);
});

test('WA05 exact-finish restriction is an ability event, but Stickler cancels before it',()=>{
  const s=fixture(['diddy-kong','mr-game-and-watch','magikarp'],[27,1,15]);move(s,0,6);
  assert.equal(racer(s).position,29);assert.equal(racer(s,1).position,2);
  const blocked=fixture(['diddy-kong','mr-game-and-watch','stickler'],[27,1,15]);move(blocked,0,6);
  assert.equal(racer(blocked).position,27);assert.equal(racer(blocked,1).position,2);
});
test('WA06 Dixie has one reroll independent of Dicemonger and resets next turn',()=>{
  const s=fixture(['dixie-kong','dicemonger','magikarp'],[1,12,22]);begin(s);roll(s,1,2,3);choose(s,'reroll');choose(s,'reroll');assert(!s.pending);assert.equal(s.randomLog.length,3);assert.equal(racer(s,1).position,13);
  begin(s);roll(s,2);assert.equal(pendingKind(s),'reroll');choose(s,'keep');
});
test('WA07 Wily predicts second place before the race and earns3 once even after elimination',()=>{
  const s=standard('dr-wily',[1,28,29]);before(s);assert.equal(s.pending?.kind,card('dr-wily'));choose(s,'r1');
  racer(s).eliminated=true;move(s,2,1);assert.equal(s.phase,'results');assert.equal(s.players[0]!.score,3);assert.equal(s.results[0]!.placements[1]?.racerId,'r1');assert.equal(racer(s).flags.wilyPaid,true);
});
test('WA08 Dry Bones charges once per target Racer, includes teammates and floors score at0',()=>{
  const s=fixture(['dry-bones','magikarp','magikarp','magikarp'],[1,10,15,20]);racer(s,1).playerId='p0';racer(s,2).playerId='p0';s.players[0]!.score=3;
  end(s,1);end(s,1);assert.equal(s.players[0]!.score,2);end(s,2);assert.equal(s.players[0]!.score,1);
  end(s,3);assert.equal(s.players[3]!.score,0);
});
test('WA09 Eric replaces the die with6 only from a milestone; recovery takes precedence',()=>{
  const s=standard('eric',[5,15,21]);begin(s);assert.equal(racer(s).position,11);assert.equal(s.randomLog.length,0);
  racer(s).position=10;racer(s).tripped=true;begin(s);assert.equal(racer(s).position,10);assert(!racer(s).tripped);assert.equal(s.randomLog.length,0);
  racer(s).position=4;begin(s);assert.equal(s.flags.awaitRoll,true);
});
test('WA10 Falco counts every active Racer ahead, including teammates',()=>{
  const s=fixture(['falco-lombardi','magikarp','magikarp','magikarp'],[10,12,20,10]);racer(s,1).playerId='p0';begin(s);roll(s,2);assert.equal(racer(s).position,14);
});
test('WA11 Frogger skips numbered milestones forwards and backwards but never teleports or the finish',()=>{
  const s=standard('frogger',[4,13,22]);move(s,0,1);assert.equal(racer(s).position,6);move(s,0,-1);assert.equal(racer(s).position,4);
  warp(s,0,5);assert.equal(racer(s).position,5);racer(s).position=29;move(s,0,1);assert(racer(s).finished);
});
test('WA12 Hoagie starts at24 without board triggers and replaces every main die with1',()=>{
  const s=standard('hoagie');s.track='wild';before(s);assert.equal(racer(s).position,24);assert(!s.logs.some(e=>e.type==='move'||e.type==='warp'));
  s.track='mild';begin(s);assert.equal(racer(s).position,25);assert.equal(s.randomLog.length,0);
});
test('WA13 Jason sends another turn ending at28/29 to20 but does not affect himself',()=>{
  const s=standard('jason-vorhees',[1,28,21]);end(s,1);assert.equal(racer(s,1).position,20);racer(s).position=29;end(s);assert.equal(racer(s).position,29);
});
test('WA14 Knuckles gets exactly two consecutive extra turns, once, with a recovery turn first',()=>{
  const s=standard('knuckles');racer(s).tripped=true;begin(s);assert.equal(s.currentRacerId,'r0');assert.equal(racer(s).flags.turnsTaken,1);
  applyGameAction(s,'p0',{type:'next'});roll(s,1);assert.equal(s.currentRacerId,'r0');
  applyGameAction(s,'p0',{type:'next'});roll(s,1);assert.equal(s.currentRacerId,'r1');assert.equal(racer(s).flags.turnsTaken,3);
  begin(s);roll(s,1);assert.equal(s.currentRacerId,'r1');
});
test('WA15 Lakitu requires its controller to choose, including teammates, before recovery',()=>{
  let s=standard('lakitu');racer(s,1).playerId='p0';racer(s).tripped=true;begin(s);assert(!s.pending?.optional);assert(!s.pending?.options.some(o=>o.id==='skip'));
  assert.throws(()=>applyGameAction(s,'p1',{type:'choose',choiceId:s.pending!.id,optionId:'r1'}),/对应玩家/);
  s=JSON.parse(JSON.stringify(s));choose(s,'r1');assert.equal(racer(s,1).position,1);assert(!racer(s).tripped);assert.equal(s.randomLog.length,0);
});
test('WA16 Lizzie replaces a low final roll with nearest-ahead teleport or moves normally with no target',()=>{
  const s=standard('lizzie',[1,11,21]);begin(s);roll(s,2);assert.equal(racer(s).position,11);assert.equal(s.lastRoll?.face,2);assert(s.logs.some(e=>e.type==='warp'));
  const no=standard('lizzie',[22,11,21]);begin(no);roll(no,2);assert.equal(racer(no).position,24);
});
test('WA17 Magikarp moves normally and has no ability events',()=>{
  const s=standard('magikarp');begin(s);roll(s,4);assert.equal(racer(s).position,5);assert(!s.logs.some(e=>e.type==='power'));
});
test('WA18 Mario skips occupied spaces in either direction, while warps do not skip',()=>{
  const s=standard('mario',[1,2,21]);move(s,0,1);assert.equal(racer(s).position,3);move(s,0,-1);assert.equal(racer(s).position,1);warp(s,0,2);assert.equal(racer(s).position,2);
});
test('WA19 Game and Watch responds to each other completed ability, never its own',()=>{
  const s=standard('mr-game-and-watch');s.queue=[{kind:'powerDone',racerId:'r1',power:'coach'},{kind:'powerDone',racerId:'r1',power:'coach'}];resolveTasks(s);assert.equal(racer(s).position,3);
  s.queue=[{kind:'powerDone',racerId:'r0',power:card('mr-game-and-watch')}];resolveTasks(s);assert.equal(racer(s).position,3);
});
test('WA20 Olaf warps at both start and end boundaries, not merely when passing5',()=>{
  const s=standard('olaf',[5,11,21]);begin(s);assert.equal(racer(s).position,20);assert.equal(s.flags.awaitRoll,true);
  racer(s).position=10;end(s);assert.equal(racer(s).position,20);racer(s).position=4;move(s,0,2);assert.equal(racer(s).position,6);
});
test('WA21 Harry optionally replaces main movement, and has no prompt when tripped or alone ahead',()=>{
  const s=standard('pitfall-harry');begin(s);choose(s,'use');assert.equal(racer(s).position,11);assert.equal(s.randomLog.length,0);
  racer(s).tripped=true;begin(s);assert(!s.pending);assert(!racer(s).tripped);
  racer(s).position=25;begin(s);assert(!s.pending);assert.equal(s.flags.awaitRoll,true);
});
test('WA22 Simon gains an extra turn at milestones, without recursively ending that same turn',()=>{
  const s=standard('simon-belmont',[4,11,21]);begin(s);roll(s,1);assert.equal(s.currentRacerId,'r0');assert.equal(s.flags.needsBegin,true);assert.equal(racer(s).flags.turnsTaken,1);
  applyGameAction(s,'p0',{type:'next'});roll(s,1);assert.equal(s.currentRacerId,'r1');
});
test('WA23 Tails starts at8 without movement/landing events and can be inherited before a race',()=>{
  const s=standard('tails');before(s);assert.equal(racer(s).position,8);assert(!s.logs.some(e=>e.type==='move'||e.type==='warp'));
  const copy=fixture(['understudy','tails','magikarp']);before(copy);choose(copy,'r1');assert.equal(racer(copy).position,8);assert.equal(racer(copy).characterId,'understudy');
});
test('WA24 Yoshi triggers once for a shared ending square regardless of occupant count',()=>{
  const s=fixture(['yoshi','magikarp','magikarp','magikarp'],[1,10,10,10]);end(s,1);assert.equal(racer(s).position,3);
  racer(s).position=10;end(s);assert.equal(racer(s).position,12);
});
test('WA25 Theme Park Guest earns1 only at its own milestone turn end',()=>{
  const s=standard('rollercoaster-tycoon-guest',[10,15,21]);end(s,1);assert.equal(s.players[0]!.score,0);end(s);assert.equal(s.players[0]!.score,1);
});
test('WA26 Spot resolves the backward teleport before checking if the target remains ahead',()=>{
  const s=standard('spot',[2,10,21]);end(s,1);assert.equal(racer(s,1).position,5);assert.equal(racer(s).position,4);
  const no=standard('spot',[6,10,21]);end(no,1);assert.equal(racer(no,1).position,5);assert.equal(racer(no).position,6);
});
test('WA27 Rockford includes itself, teammates and both adjacent spaces',()=>{
  const s=fixture(['rockford','magikarp','magikarp','magikarp','magikarp'],[10,9,10,11,13]);racer(s,1).playerId='p0';begin(s);roll(s,2);assert.equal(racer(s).position,16);assert.equal(s.lastRoll?.distance,6);
});
test('WA28 Burt predicts before RNG, then adds a separate5-space movement after the main movement',()=>{
  let s=standard('burt');begin(s);assert.equal(s.randomLog.length,0);assert.equal(s.pending?.options.length,6);
  s=JSON.parse(JSON.stringify(s));choose(s,'3');roll(s,3);assert.equal(racer(s).position,9);assert.equal(s.lastRoll?.distance,3);
  assert.deepEqual(s.logs.filter(e=>e.type==='move').map(e=>e.cause),['main',card('burt')]);
});
test('WA28 discarded dice never grant Burt or Lizzie a final-result effect',()=>{
  const s=standard('burt');racer(s).flags.acquiredPowers=[card('dixie-kong')];begin(s);choose(s,'3');roll(s,3,4);choose(s,'reroll');assert.equal(racer(s).position,5);
  const l=standard('lizzie');racer(l).flags.acquiredPowers=[card('dixie-kong')];begin(l);roll(l,1,6);choose(l,'reroll');assert.equal(racer(l).position,7);assert(!l.logs.some(e=>e.type==='warp'));
});
test('WA29 Piranha Plant follows only a strictly-ahead milestone turn end',()=>{
  const s=standard('piranha-plant',[2,15,21]);end(s,1);assert.equal(racer(s).position,15);racer(s,1).position=10;end(s,1);assert.equal(racer(s).position,15);
});
test('WA30 Puffins scores on at most three own turn starts after a finisher',()=>{
  const s=standard('fluffin-puffins');begin(s);assert.equal(s.players[0]!.score,0);firstFinisher(s);
  for(let i=0;i<4;i++)begin(s);assert.equal(s.players[0]!.score,3);assert.equal(racer(s).flags.puffinUses,3);
});
test('Wurstii passive reactions use one ending snapshot and the established player order',()=>{
  const s=fixture(['spot','bucky-ohare','magikarp','piranha-plant'],[1,2,5,0]);end(s,2);
  assert.equal(racer(s,2).position,0);assert.equal(racer(s,1).position,3);assert.equal(racer(s,3).position,5);
});
test('Null suppresses new modifiers, choices, jumps and end reactions, then restores them',()=>{
  const s=fixture(['rockford','null','magikarp'],[10,0,21]);begin(s);roll(s,2);assert.equal(racer(s).position,11); // Null -1, no Rockford bonus.
  const m=fixture(['mario','null','magikarp'],[10,0,11]);move(m,0,1);assert.equal(racer(m).position,11);
  const l=fixture(['lakitu','null','magikarp'],[10,0,21]);begin(l);assert(!l.pending);racer(l,1).position=20;begin(l);assert.equal(pendingKind(l),card('lakitu'));
  const y=fixture(['yoshi','null','magikarp'],[10,0,0]);end(y,2);assert.equal(racer(y).position,10);assert.deepEqual(effectivePowers(y,racer(y)),[]);
});
test('current practice has102 cards while persisted Second Wind practice stays at72 and rejects new IDs',()=>{
  const players=standard('magikarp').players.slice(0,1);
  const current=createGame(players,1,'practice');startGame(current);assert.equal(current.draft!.market.length,102);
  const old=createGame(players,1,'practice');old.rulesVersion=SECOND_WIND_RULES_VERSION;roomRules(old).startGame(old);assert.equal(old.draft!.market.length,72);
  assert.throws(()=>roomRules(old).applyGameAction(old,'p0',{type:'practice-team',characterIds:[card('mario'),'coach','legs','blimp']}),/4张不同/);
  assert.equal(old.phase,'draft');
});
