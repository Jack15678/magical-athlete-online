import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAF_CHARACTERS } from '../src/shared/leaf-expansion.js';
import { applyGameAction, createGame, effectivePowers, enqueueMove, resolveTasks } from '../src/engine/index.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameState, Player, Room } from '../src/shared/types.js';
const id=(value:string)=>`leaf-${value}`;
function fixture(ids:string[],positions=ids.map((_,i)=>2+i*8)):GameState{
  const players:Player[]=ids.map((_,i)=>({id:`p${i}`,name:`玩家${i}`,seat:i,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,456);s.config={version:'room-config-v1',characterPacks:{original:true,'second-wind':true,'extra-mile':true,'leaf-fan':true},optionalRules:[]};s.phase='race';s.round=1;s.currentRacerId='r0';
  s.racers=ids.map((characterId,i)=>({id:`r${i}`,identityPlayerId:`p${i}`,playerId:`p${i}`,characterId,position:positions[i]!,finished:false,eliminated:false,tripped:false,flags:{}}));s.baseTurnOrder=s.racers.map(r=>r.id);return s;
}
const r=(s:GameState,i=0)=>s.racers.find(item=>item.id===`r${i}`)!;
function before(s:GameState,index=0){s.queue.push({kind:'beforeRace',racerId:`r${index}`});resolveTasks(s);}
function begin(s:GameState,index=0){s.currentRacerId=`r${index}`;s.flags.needsBegin=false;s.queue.push({kind:'beginTurn',racerId:`r${index}`});resolveTasks(s);}
function choose(s:GameState,optionId:string){assert(s.pending,`missing choice ${optionId}`);applyGameAction(s,s.pending.playerId,{type:'choose',choiceId:s.pending.id,optionId});}
function roll(s:GameState,...faces:number[]){s.flags.testDice=faces;applyGameAction(s,r(s,Number(s.currentRacerId!.slice(1))).playerId,{type:'roll'});}
function move(s:GameState,index:number,distance:number){enqueueMove(s,`r${index}`,distance);resolveTasks(s);}

test('Leaf source manifest has 18 distinct versioned identities, including its own Nepo Baby',()=>{
  assert.equal(LEAF_CHARACTERS.length,18);assert.equal(new Set(LEAF_CHARACTERS.map(c=>c.id)).size,18);
  for(const card of LEAF_CHARACTERS){assert.equal(card.edition,'leaf');assert(card.sources[0]!.locator.includes('PNG')||card.sources[0]!.locator.includes('ZIP'));assert(card.adaptation&&card.artworkReference);}
  assert(LEAF_CHARACTERS.some(card=>card.id==='leaf-nepo-baby'));assert(!LEAF_CHARACTERS.some(card=>card.id==='nepo-baby'));
});
test('LEAF01 Catfish prevents trips and responds only to a strict forward pass',()=>{
  const s=fixture([id('catfish'),'coach','legs'],[5,2,20]);s.queue.push({kind:'trip',racerId:'r0',source:'r1'});resolveTasks(s);assert.equal(r(s).tripped,false);
  move(s,1,6);assert.equal(r(s).position,6);move(s,1,-6);assert.equal(r(s).position,6);move(s,1,4);assert.equal(r(s).position,6);
});
test('LEAF02 Crash Dummy begins tripped and trips a main-move collision before Romantic reacts',()=>{
  const s=fixture([id('crash-dummy'),'romantic','legs'],[2,7,20]);before(s);assert(r(s).tripped);r(s).tripped=false;begin(s);roll(s,3);
  assert(r(s).tripped&&r(s,1).tripped);assert.equal(r(s).position,7);
  const trip=s.logs.findIndex(event=>event.type==='trip'&&event.targets?.includes('r1')),romance=s.logs.findIndex(event=>event.type==='move'&&event.cause==='romantic');assert(trip>=0&&romance>trip);
});
test('LEAF03 Dark Horse doubles the rolled base before additive powers and requires untied last at turn start',()=>{
  const s=fixture([id('dark-horse'),'coach','legs'],[2,15,20]);r(s).flags.acquiredPowers=['blimp'];begin(s);roll(s,3);assert.equal(r(s).position,11);
  const tied=fixture([id('dark-horse'),'coach','legs'],[2,2,20]);begin(tied);roll(tied,3);assert.equal(r(tied).position,6);
});
test('LEAF04 Kangaroo reacts to any stop exactly one space ahead, including forced movement',()=>{
  const s=fixture([id('kangaroo'),'coach','legs'],[5,2,20]);move(s,1,4);assert.equal(r(s).position,7);move(s,1,3);assert.equal(r(s).position,7);
});
test('LEAF05 Loan Shark excludes the same controller and collects only its placed token once',()=>{
  const s=fixture([id('loan-shark'),'coach','legs','banana'],[2,10,10,20]);r(s,1).playerId='p0';before(s);
  assert.equal(r(s,1).flags.leafLoanTokens,undefined);assert.deepEqual(r(s,2).flags.leafLoanTokens,{r0:true});
  move(s,0,8);assert.equal(s.players[0]!.score,1);move(s,0,-1);move(s,0,1);assert.equal(s.players[0]!.score,1);
  const end=fixture([id('loan-shark'),'coach','legs','banana'],[2,10,29,28]);before(end);move(end,0,8);move(end,2,1);move(end,3,2);
  assert.equal(end.phase,'results');assert.equal(end.players[0]!.score,1);assert.equal(end.players[2]!.score,4);assert.equal(end.players[3]!.score,2);
});
test('LEAF06 Lonely Wolf checks sharing before its roll and never triggers Scoocher',()=>{
  const shared=fixture([id('lonely-wolf'),'coach','scoocher'],[2,2,20]);begin(shared);roll(shared,2);assert.equal(r(shared).position,7);assert.equal(r(shared,2).position,21); // Coach use still triggers Scoocher.
  const alone=fixture([id('lonely-wolf'),'legs','scoocher'],[2,10,20]);begin(alone);roll(alone,2);assert.equal(r(alone).position,5);assert.equal(r(alone,2).position,20);
});
test('LEAF07 Nepo Baby counts prior trophy/ribbon awards for its current stable controller',()=>{
  const s=fixture([id('nepo-baby'),'coach','legs'],[2,15,20]);s.results=[{round:1,placements:[{racerId:'old1',playerId:'p0',characterId:'banana',rank:1,points:3},{racerId:'old2',playerId:'p0',characterId:'blimp',rank:2,points:1}]}];begin(s);roll(s,2);assert.equal(r(s).position,6);
});
test('LEAF08 Philanthropist lets its controller select both dice and grants a non-roll next main move',()=>{
  const s=fixture([id('philanthropist'),'legs','coach'],[2,10,20]);begin(s);roll(s,2,5);assert.equal(s.pending?.kind,'leaf-philanthropist-die');assert.equal(s.pending?.playerId,'p0');choose(s,'0');assert.equal(s.pending?.kind,'leaf-philanthropist-target');choose(s,'r1');assert.equal(r(s).position,4);
  const draws=s.randomLog.length;begin(s,1);assert.equal(r(s,1).position,15);assert.equal(s.randomLog.length,draws);assert.equal(r(s,1).flags.leafGiftDice,undefined);
});
test('LEAF09 Race Car spends one real point once after its roll to add three to main movement',()=>{
  const s=fixture([id('race-car'),'coach','legs'],[2,15,20]);before(s);assert.equal(s.players[0]!.score,2);begin(s);roll(s,3);assert.equal(s.pending?.kind,'leaf-race-car');choose(s,'use');assert.equal(s.players[0]!.score,1);assert.equal(r(s).position,8);
});
test('LEAF10 Revolutionary warps to the leading space before rolling only when alone last',()=>{
  const s=fixture([id('revolutionary'),'coach','legs'],[2,10,20]);begin(s);assert.equal(r(s).position,20);roll(s,2);assert.equal(r(s).position,22);
});
test('LEAF11 Survivor counts this racer current-race income and one new trip, rather than the controller shared score',()=>{
  const s=fixture([id('sole-survivor'),'coach','legs'],[2,15,20]);r(s,1).playerId='p0';s.queue.push({kind:'gain',racerId:'r1',amount:5},{kind:'trip',racerId:'r0',source:'r1'},{kind:'trip',racerId:'r0',source:'r1'});resolveTasks(s);
  assert.equal(s.players[0]!.score,6);assert.equal(r(s).flags.leafRaceIncome,1);begin(s);begin(s);roll(s,2);assert.equal(r(s).position,5);
});
test('LEAF12 Sore Loser awards exactly three for untied last at an actual race end',()=>{
  const s=fixture([id('sore-loser'),'coach','legs','banana'],[2,5,29,28]);move(s,2,1);move(s,3,2);assert.equal(s.phase,'results');assert.equal(s.players[0]!.score,3);
  const tie=fixture([id('sore-loser'),'coach','legs','banana'],[2,2,29,28]);move(tie,2,1);move(tie,3,2);assert.equal(tie.players[0]!.score,0);
});
test('LEAF13 Spiteful Spirit recovery moves once and trips every other racer including its teammate',()=>{
  const s=fixture([id('spiteful-spirit'),'coach','legs'],[2,10,20]);r(s).tripped=true;r(s,1).playerId='p0';begin(s);assert.equal(r(s).position,3);assert.equal(r(s).tripped,false);assert(r(s,1).tripped&&r(s,2).tripped);
});
test('LEAF14 Toucan adjusts two without creating a new raw three; Triangle moves before a real three main move',()=>{
  const s=fixture([id('toucan'),id('triangle-man'),'legs'],[2,10,20]);begin(s);roll(s,2);choose(s,'3');assert.equal(r(s).position,5);assert.equal(r(s,1).position,10);
  begin(s);roll(s,3);assert.equal(r(s).position,8);assert.equal(r(s,1).position,11);
  const moves=s.logs.filter(event=>event.type==='move').slice(-2);assert.equal(moves[0]!.cause,id('triangle-man'));assert.equal(moves[1]!.cause,'main');
});
test('LEAF15 Triangle Man responds separately to each raw three in a two-die skill',()=>{
  const s=fixture([id('philanthropist'),id('triangle-man'),'legs'],[2,10,20]);begin(s);roll(s,3,3);assert.equal(r(s,1).position,12);assert.equal(s.pending?.kind,'leaf-philanthropist-die');assert.equal(s.randomLog.length,2);
});
test('LEAF16 Zombie copies a previous loser and executes the copied before-race power while retaining identity',()=>{
  const s=fixture([id('zombie'),'coach','legs'],[2,15,20]);s.flags.leafPastLosers=['sisyphus'];before(s);assert.equal(s.pending?.kind,'leaf-zombie');choose(s,'sisyphus');assert.equal(s.players[0]!.score,4);assert.equal(r(s).characterId,id('zombie'));assert(effectivePowers(s,r(s)).includes('sisyphus'));
});
test('LEAF17 Thespian replaces rather than stacks borrowed powers and skips copied before-race effects',()=>{
  const s=fixture([id('thespian'),'coach','legs'],[2,15,20]);s.deck=['blimp','hare','sisyphus'];begin(s);roll(s,3);assert.equal(r(s).position,8);begin(s);roll(s,2);assert.equal(r(s).position,12);assert(!effectivePowers(s,r(s)).includes('blimp'));assert(s.discard.includes('blimp'));begin(s);assert.equal(s.players[0]!.score,0);
});
test('LEAF18 Filmmaker keeps all seven hand identities secret and publishes only the chosen discarded card',()=>{
  const s=fixture([id('filmmaker'),'coach','legs'],[2,15,20]);s.deck=['blimp','hare','banana','egg','genius','magician','sisyphus'];before(s);assert.equal((r(s).flags.secretLeafHand as string[]).length,7);begin(s);assert.equal(s.pending?.kind,'leaf-film-card');
  const room={code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:3,timeoutSeconds:0,deadline:null,game:s} as Room;
  const other=projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true});assert(!JSON.stringify(other).includes('secretLeafHand'));assert.equal(other.pending,undefined);assert.equal(other.waitingPrompt?.kind,'leaf-film-card');assert(!other.logs.some(event=>event.selectedCardId));
  choose(s,'blimp');assert.equal((r(s).flags.secretLeafHand as string[]).length,6);roll(s,2);assert.equal(r(s).position,7);assert(s.logs.some(event=>event.selectedCardId==='blimp'));
});

test('Leaf granted dice are discarded when the recipient stands up instead of taking its next main move',()=>{
  const s=fixture([id('philanthropist'),'legs','coach'],[2,10,20]);begin(s);roll(s,2,5);choose(s,'0');choose(s,'r1');r(s,1).tripped=true;
  const draws=s.randomLog.length;begin(s,1);assert.equal(r(s,1).position,10);assert.equal(r(s,1).tripped,false);assert.equal(r(s,1).flags.leafGiftDice,undefined);assert.equal(s.randomLog.length,draws);
});
test('Triangle observes the original physical three even when Stunner replaces that die with one',()=>{
  const s=fixture(['coach','stunner',id('triangle-man'),'legs'],[5,5,15,25]);begin(s);roll(s,3);assert.equal(s.lastRoll?.face,1);assert.equal(r(s,2).position,16);
  const triangle=s.logs.findIndex(event=>event.type==='move'&&event.cause===id('triangle-man')),main=s.logs.findIndex(event=>event.type==='move'&&event.cause==='main');assert(triangle>=0&&main>triangle);
});
test('Triangle responds to a human duel die before the opposing human roll and survives serialized pending state',()=>{
  let s=fixture(['duelist','coach',id('triangle-man'),'legs'],[5,5,15,25]);s.queue.push({kind:'duelCheck',racerId:'r0'});resolveTasks(s);choose(s,'r1');s.flags.testDice=[3,2];choose(s,'roll');
  assert.equal(r(s,2).position,16);assert.equal(s.pending?.kind,'duel-roll');assert.equal(s.pending?.playerId,'p1');s=JSON.parse(JSON.stringify(s));choose(s,'roll');assert.equal(r(s,2).position,16);assert.deepEqual(s.logs.find(event=>event.type==='duel-dice')?.faces,[3,2]);
});

test('temporary borrowed powers expire at the next turn boundary even when recovery skips the replacement draw',()=>{
  const s=fixture([id('thespian'),'coach','legs'],[2,15,20]);s.deck=['leaf-revolutionary','blimp'];begin(s);roll(s,2);assert(effectivePowers(s,r(s)).includes('leaf-revolutionary'));
  r(s).position=0;r(s).tripped=true;begin(s);assert.equal(r(s).position,0);assert.equal(r(s).tripped,false);assert(!effectivePowers(s,r(s)).includes('leaf-revolutionary'));
  assert.equal(r(s).flags.leafDisplayedCard,'leaf-revolutionary');assert(!s.discard.includes('leaf-revolutionary'));
  begin(s);assert.equal(r(s).flags.leafDisplayedCard,'blimp');assert(s.discard.includes('leaf-revolutionary'));assert.equal(s.pending,undefined);
});
test('Mr Fox blocks a Race Car activation before spending or adding speed, with a single reaction window',()=>{
  const s=fixture([id('race-car'),'extra-mile-mr-fox','legs'],[2,15,20]);s.players[0]!.score=2;begin(s);roll(s,3);assert.equal(s.pending?.kind,'leaf-race-car');choose(s,'use');assert.equal(s.pending?.kind,'em-fox');choose(s,'block');assert.equal(s.players[0]!.score,2);assert.equal(r(s).position,5);assert.equal(r(s,1).flags.foxUsed,1);assert.equal(s.pending,undefined);
  const allowed=fixture([id('race-car'),'extra-mile-mr-fox','legs'],[2,15,20]);allowed.players[0]!.score=2;begin(allowed);roll(allowed,3);choose(allowed,'use');choose(allowed,'allow');assert.equal(allowed.players[0]!.score,1);assert.equal(r(allowed).position,8);assert.equal(allowed.pending,undefined);
});
test('Mr Fox blocks Toucan adjustment using the original two without reroll or invented movement',()=>{
  const s=fixture([id('toucan'),'extra-mile-mr-fox','legs'],[2,15,20]);begin(s);roll(s,2);choose(s,'6');assert.equal(s.pending?.kind,'em-fox');choose(s,'block');assert.equal(r(s).position,4);assert.equal(s.lastRoll?.face,2);assert.equal(s.randomLog.length,1);assert.equal(r(s,1).flags.foxUsed,1);
});
test('Zombie copying and Filmmaker discarding each expose a single real reaction before changing cards',()=>{
  const zombie=fixture([id('zombie'),'extra-mile-mr-fox','legs'],[2,15,20]);zombie.flags.leafPastLosers=['sisyphus'];before(zombie);assert.equal(zombie.pending?.kind,'leaf-zombie');choose(zombie,'sisyphus');assert.equal(zombie.pending?.kind,'em-fox');choose(zombie,'block');assert(!effectivePowers(zombie,r(zombie)).includes('sisyphus'));assert.equal(zombie.players[0]!.score,0);assert.equal(zombie.pending,undefined);
  const film=fixture([id('filmmaker'),'extra-mile-mr-fox','legs'],[2,15,20]);r(film).flags.secretLeafHand=['blimp','hare'];begin(film);assert.equal(film.pending?.kind,'leaf-film-card');choose(film,'blimp');assert.equal(film.pending?.kind,'em-fox');choose(film,'block');assert.deepEqual(r(film).flags.secretLeafHand,['blimp','hare']);assert(!effectivePowers(film,r(film)).includes('blimp'));assert.equal(film.pending,undefined);assert.equal(film.flags.awaitRoll,true);
});

test('recovered v3 deck and historical-copy continuations discard disabled sources while preserving legal card order',()=>{
  const saved=fixture([id('thespian'),id('zombie'),id('filmmaker')],[2,15,20]);
  saved.config!.characterPacks['extra-mile']=false;saved.config!.characterPacks['second-wind']=false;
  saved.deck=['extra-mile-cletus','blimp','icarus','hare','sisyphus'];
  saved.flags.leafPastLosers=['extra-mile-cletus','blimp','icarus','hare','sisyphus'];
  const acting=JSON.parse(JSON.stringify(saved)) as GameState;begin(acting);
  assert.equal(r(acting).flags.leafDisplayedCard,'blimp');assert.deepEqual(acting.deck,['hare','sisyphus']);
  assert(!effectivePowers(acting,r(acting)).includes('extra-mile-cletus'));assert.equal(acting.randomLog.length,0);
  const film=JSON.parse(JSON.stringify(saved)) as GameState;before(film,2);
  assert.deepEqual(r(film,2).flags.secretLeafHand,['blimp','hare','sisyphus']);assert.equal(film.randomLog.length,0);
  const zombie=JSON.parse(JSON.stringify(saved)) as GameState;before(zombie,1);
  assert.deepEqual(zombie.pending?.options.map(option=>option.id),['blimp','hare','sisyphus','skip']);
  choose(zombie,'hare');assert(effectivePowers(zombie,r(zombie,1)).includes('hare'));
  assert(!effectivePowers(zombie,r(zombie,1)).includes('extra-mile-cletus'));
  const queued=JSON.parse(JSON.stringify(saved)) as GameState;
  queued.queue=[{kind:'leaf',racerId:'r1',step:'zombie-copy',characterId:'extra-mile-cletus'}];resolveTasks(queued);
  assert(!effectivePowers(queued,r(queued,1)).includes('extra-mile-cletus'));assert.equal(queued.queue.length,0);
  assert(queued.logs.some(event=>event.type==='cancel'&&event.cause===id('zombie')));
});
