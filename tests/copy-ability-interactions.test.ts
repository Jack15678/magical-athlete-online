import assert from 'node:assert/strict';
import test from 'node:test';
import { abilityState, applyGameAction, createGame, effectivePower, effectivePowers, enqueueMove, resolveTasks } from '../src/engine/index.js';
import type { GameState, Player } from '../src/shared/types.js';

function fixture(ids:string[],positions=ids.map((_,i)=>2+i*8)):GameState {
  const players:Player[]=ids.map((_,i)=>({id:`p${i}`,name:`玩家${i}`,seat:i,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
  const s=createGame(players,456,'multiplayer','mixed');
  s.config={version:'room-config-v1',characterPacks:{original:true,'second-wind':true,'extra-mile':true,'leaf-fan':true},optionalRules:[]};
  Object.assign(s,{phase:'race',round:1,currentRacerId:'r0'});
  s.racers=ids.map((characterId,i)=>({id:`r${i}`,identityPlayerId:`p${i}`,playerId:`p${i}`,characterId,position:positions[i]!,finished:false,eliminated:false,tripped:false,flags:{}}));
  s.baseTurnOrder=s.racers.map(r=>r.id);return s;
}
const r=(s:GameState,i=0)=>s.racers[i]!;
function task(s:GameState,kind:string,index=0,extra:Record<string,unknown>={}){s.queue.push({kind,racerId:`r${index}`,...extra});resolveTasks(s);}
function before(s:GameState,index=0){task(s,'beforeRace',index);}
function begin(s:GameState,index=0){s.currentRacerId=`r${index}`;s.flags.needsBegin=false;task(s,'beginTurn',index);}
function choose(s:GameState,optionId:string){assert(s.pending,`missing choice ${optionId}`);applyGameAction(s,s.pending.playerId,{type:'choose',choiceId:s.pending.id,optionId});}
function roll(s:GameState,...faces:number[]){s.flags.testDice=faces;applyGameAction(s,r(s).playerId,{type:'roll'});}
function move(s:GameState,index:number,distance:number){enqueueMove(s,`r${index}`,distance);resolveTasks(s);}

test('Copycat never opens a copied before-race window in any pack',()=>{
  for(const source of ['sisyphus','hog-knight','leaf-filmmaker','leaf-race-car','extra-mile-honey-pot','extra-mile-dom-and-gary']){
    const s=fixture(['copycat',source,'coach'],[0,15,5]);s.deck=['banana','blimp','hare'];before(s);
    assert.equal(s.pending,undefined,source);assert.equal(s.players[0]!.score,0,source);
    assert.equal(r(s).flags.secretLeafHand,undefined,source);assert.equal(r(s).flags.hogOwnerId,undefined,source);
    assert.equal(s.flags.honeyPot,undefined,source);assert.equal(s.racers.length,3,source);
    assert.equal(effectivePower(s,r(s)),source);
  }
});

test('Egg choosing Copycat obeys its restriction while an independent Sisyphus grant keeps its own race-start window',()=>{
  const egg=fixture(['egg','sisyphus','coach'],[0,15,5]);egg.deck=['copycat','blimp','hare'];before(egg);choose(egg,'copycat');
  assert.equal(effectivePower(egg,r(egg)),'sisyphus');assert.equal(egg.players[0]!.score,0);
  const independent=fixture(['copycat','sisyphus','coach'],[0,15,5]);r(independent).flags.acquiredPowers=['sisyphus'];before(independent);
  assert.equal(independent.players[0]!.score,4);assert.deepEqual(effectivePowers(independent,r(independent)),['sisyphus']);
});

test('Understudy to Egg to Twin to Understudy closes only the already-used race-start instruction',()=>{
  const s=fixture(['understudy','egg','coach']);s.deck=['twin','blimp','banana'];
  s.results=[{round:1,placements:[{racerId:'past',playerId:'p1',characterId:'understudy',rank:1,points:3}]}];
  s.flags.historyPowers={understudy:'understudy'};before(s);choose(s,'r1');choose(s,'twin');choose(s,'understudy');
  assert.equal(effectivePower(s,r(s)),'understudy');assert.equal(s.pending,undefined);assert.equal(s.queue.length,0);
  assert.equal(s.phase,'race');assert.equal(s.logs.filter(event=>event.type==='copy').length,3);
});

test('Egg uses the actual one or zero remaining cards and never manufactures a three-card offer',()=>{
  const one=fixture(['egg','coach','legs']);one.deck=['blimp'];before(one);
  assert.deepEqual(one.pending?.options.map(option=>option.id),['blimp']);assert.deepEqual(one.discard,[]);
  const restored=JSON.parse(JSON.stringify(one)) as GameState;choose(restored,'blimp');assert.deepEqual(restored.discard,['blimp']);
  const empty=fixture(['egg','coach','legs']);before(empty);assert.equal(empty.pending,undefined);assert.equal(effectivePower(empty,r(empty)),'egg');
  assert.equal(empty.deck.length,0);assert(empty.logs.some(event=>event.type==='draw'&&event.cause==='egg'));
});

test('Mush and Egg cannot redraw disabled, private, displayed or assigned cards from a recovered duplicated deck',()=>{
  for(const identity of ['mush','egg']){
    const s=fixture([identity,'coach','legs']);s.config!.characterPacks['extra-mile']=false;
    r(s,1).flags.secretLeafHand=['banana'];r(s,2).flags.leafDisplayedCard='hare';
    s.deck=['extra-mile-cletus','banana','hare','coach','blimp','blimp'];s.discard=['banana','hare','legs'];
    if(identity==='mush'){begin(s);roll(s,1);assert(effectivePowers(s,r(s)).includes('blimp'));}
    else{before(s);assert.deepEqual(s.pending?.options.map(option=>option.id),['blimp']);choose(s,'blimp');}
    assert.deepEqual(s.deck,[]);assert.deepEqual(s.discard,['blimp']);
    assert.deepEqual(r(s,1).flags.secretLeafHand,['banana']);assert.equal(r(s,2).flags.leafDisplayedCard,'hare');
  }
});

test('Thespian and Filmmaker keep independent simultaneous temporary powers and displays across turns',()=>{
  const s=fixture(['leaf-thespian','coach','legs']);r(s).flags.acquiredPowers=['leaf-filmmaker'];
  r(s).flags.secretLeafHand=['banana','hare'];s.deck=['blimp','sisyphus'];begin(s);
  assert.equal(s.pending?.kind,'leaf-film-card');choose(s,'banana');
  assert.deepEqual(effectivePowers(s,r(s)),['leaf-thespian','leaf-filmmaker','blimp','banana']);
  assert.equal(abilityState(s,r(s)).entries.filter(entry=>entry.origin==='temporary').length,2);
  roll(s,3);assert.equal(r(s).position,8);begin(s);assert.equal(s.pending?.kind,'leaf-film-card');choose(s,'hare');
  assert.deepEqual(effectivePowers(s,r(s)),['leaf-thespian','leaf-filmmaker','sisyphus','hare']);
  assert(s.discard.includes('blimp')&&s.discard.includes('banana'));assert.equal(s.players[0]!.score,0);
  assert.equal(s.pending,undefined);assert.equal(s.flags.awaitRoll,true);
});

test('a permanent Doppel grant made during a matching temporary borrow survives its expiry and recovery turn',()=>{
  const s=fixture(['doppelgangster','mush','legs'],[2,29,20]);r(s).flags.acquiredPowers=['leaf-thespian'];r(s,1).flags.acquiredPowers=['coach'];
  s.deck=['coach','blimp'];begin(s);assert(effectivePowers(s,r(s)).includes('coach'));move(s,1,1);
  assert(r(s,1).eliminated);r(s).tripped=true;begin(s);
  assert(effectivePowers(s,r(s)).includes('coach'));assert(abilityState(s,r(s)).acquired.includes('coach'));
  assert(!abilityState(s,r(s)).entries.some(entry=>entry.id==='coach'&&entry.origin==='temporary'));
  assert.equal(r(s).flags.leafDisplayedCard,'coach');assert(!s.discard.includes('coach'));
});

test('legacy single-slot temporary grants migrate without deleting a later permanent identical grant',()=>{
  const s=fixture(['doppelgangster','mush','legs'],[2,29,20]);
  Object.assign(r(s).flags,{acquiredPowers:['coach'],leafBorrowedPower:'coach',leafBorrowAlreadyPresent:false,leafDisplayedCard:'coach'});
  r(s,1).flags.acquiredPowers=['coach'];move(s,1,1);r(s).tripped=true;begin(s);
  assert(effectivePowers(s,r(s)).includes('coach'));assert(abilityState(s,r(s)).acquired.includes('coach'));
});

test('Doppel snapshots a self-finishing racer once for every receiver without copying spent resources or unrelated receiver powers',()=>{
  const s=fixture(['doppelgangster','doppelgangster','legs','coach'],[29,2,12,20]);
  Object.assign(r(s).flags,{acquiredPowers:['kraken'],krakenUsed:true,leafBorrowedPowers:[{power:'blimp',source:'leaf-thespian'}]});
  r(s,1).flags.acquiredPowers=['banana'];move(s,0,1);
  assert(r(s).eliminated&&r(s).flags.doppelUsed&&r(s,1).flags.doppelUsed);
  assert(effectivePowers(s,r(s,1)).includes('kraken'));assert(effectivePowers(s,r(s,1)).includes('blimp'));
  assert.equal(r(s,1).flags.krakenUsed,undefined);assert(!abilityState(s,r(s)).acquired.includes('banana'));
  assert.equal(abilityState(s,r(s,1)).krakenRemaining,1);assert.deepEqual(s.flags.placements,[]);
});

test('Doppel takes no effective powers from a Null-disabled first finisher',()=>{
  const s=fixture(['doppelgangster','mush','null','legs'],[0,29,2,20]);r(s,1).flags.acquiredPowers=['kraken','coach'];
  move(s,1,1);assert(r(s,1).eliminated);assert(r(s).flags.doppelUsed);assert.deepEqual(abilityState(s,r(s)).acquired,[]);
});

test('a receiver does not reset its own spent Kraken when acquiring a new source of Kraken',()=>{
  const s=fixture(['doppelgangster','mush','legs'],[0,29,20]);r(s).flags.krakenUsed=true;r(s,1).flags.acquiredPowers=['kraken'];
  move(s,1,1);assert(effectivePowers(s,r(s)).includes('kraken'));assert.equal(abilityState(s,r(s)).krakenRemaining,0);
  begin(s);assert.notEqual(s.pending?.kind,'kraken');
});

test('Twin freezes the champion primary ability before finish and a same-identity runner-up cannot overwrite it',()=>{
  const raced=fixture(['egg','egg','legs'],[29,28,10]);r(raced).flags.power='sisyphus';r(raced,1).flags.power='blimp';
  move(raced,0,1);move(raced,1,2);assert.equal((raced.flags.historyPowers as Record<string,string>).egg,'sisyphus');
  const next=fixture(['twin','coach','legs']);next.results=raced.results;next.flags.championPowers=raced.flags.championPowers;next.flags.historyPowers=raced.flags.historyPowers;
  before(next);choose(next,'egg');assert.equal(effectivePower(next,r(next)),'sisyphus');assert.equal(next.players[0]!.score,4);
});

test('Twin separately offers different championship snapshots of the same identity after serialization',()=>{
  for(const selected of [1,2]){
    let s=fixture(['twin','coach','legs']);
    s.results=[1,2].map(round=>({round,placements:[{racerId:`old-${round}`,playerId:'p1',characterId:'egg',rank:1,points:3}]}));
    s.flags.championPowers=[{round:1,racerId:'old-1',characterId:'egg',power:'sisyphus'},{round:2,racerId:'old-2',characterId:'egg',power:'blimp'}];
    s.flags.historyPowers={egg:'blimp'};before(s);assert.equal(s.pending?.options.length,3);
    const option=s.pending!.options.find(item=>item.id.includes(`:race:${selected}:`))!;assert.match(option.label,new RegExp(`第${selected}场`));
    s=JSON.parse(JSON.stringify(s));choose(s,option.id);assert.equal(effectivePower(s,r(s)),selected===1?'sisyphus':'blimp');assert.equal(r(s).flags.twinCardId,'egg');
  }
});

test('a Null-disabled champion stores its owned primary text rather than a fictitious disabled card',()=>{
  const s=fixture(['egg','null','legs'],[29,2,10]);r(s).flags.power='blimp';move(s,0,1);
  assert.equal((s.flags.historyPowers as Record<string,string>).egg,'blimp');
});

test('Null suppresses a tied Copycat choice without deleting its owned abilities or renewing resources',()=>{
  const s=fixture(['copycat','null','coach','legs'],[5,2,20,20]);r(s).flags.acquiredPowers=['kraken'];r(s).flags.krakenUsed=true;
  task(s,'refreshCopies');assert.equal(s.pending,undefined);assert.deepEqual(effectivePowers(s,r(s)),[]);
  assert(abilityState(s,r(s)).ownedPowers.includes('copycat'));assert.equal(abilityState(s,r(s)).krakenRemaining,0);
  r(s).position=1;task(s,'refreshCopies');assert.equal((s as GameState).pending?.kind,'copycat');assert.equal(abilityState(s,r(s)).krakenRemaining,0);
});

test('temporary Mastermind expiry clears its prediction, while Null alone preserves an owned prediction',()=>{
  const lost=fixture(['mush','coach','legs']);Object.assign(r(lost).flags,{leafBorrowedPowers:[{power:'mastermind',source:'leaf-thespian'}],prediction:'r2'});
  begin(lost);assert.equal(r(lost).flags.prediction,undefined);
  const suppressed=fixture(['mastermind','null','legs'],[5,2,20]);r(suppressed).flags.prediction='r2';begin(suppressed);
  assert.equal(r(suppressed).flags.prediction,'r2');assert.deepEqual(effectivePowers(suppressed,r(suppressed)),[]);
});

test('an independent acquired Mastermind awards second place and original text precedes Egg-acquired Copycat',()=>{
  const s=fixture(['egg','mastermind','legs','mush'],[2,10,29,5]);
  Object.assign(r(s).flags,{power:'copycat',copyPower:'mastermind',prediction:'r2'});r(s,1).flags.prediction='r2';
  move(s,2,1);assert.equal(r(s,1).rank,2);assert.equal(r(s).rank,undefined);
  const acquired=fixture(['mush','coach','legs'],[2,29,5]);r(acquired).flags.acquiredPowers=['mastermind'];r(acquired).flags.prediction='r1';
  move(acquired,1,1);assert.equal(r(acquired).rank,2);
});

test('Mush gains later passive text without replaying a missed race-start or turn-start window',()=>{
  for(const card of ['sisyphus','leaf-filmmaker','mastermind']){
    const s=fixture(['mush','coach','legs']);s.deck=[card];begin(s);roll(s,1);
    assert(effectivePowers(s,r(s)).includes(card));assert.equal(s.players[0]!.score,0);assert.equal(s.pending,undefined);
    assert.equal(r(s).flags.secretLeafHand,undefined);assert.equal(r(s).flags.prediction,undefined);
  }
});

test('temporary Copycat reports its outer expiry, owned suppression, public source and no private hand',()=>{
  const s=fixture(['leaf-filmmaker','coach','legs'],[2,15,10]);r(s).flags.secretLeafHand=['copycat','sisyphus'];begin(s);choose(s,'copycat');
  const state=abilityState(s,r(s)),borrow=state.entries.find(entry=>entry.origin==='temporary')!;
  assert.equal(borrow.id,'coach');assert.equal(borrow.duration,'next-turn');assert.equal(borrow.sourceCardId,'copycat');assert.equal(borrow.sourceRacerId,'r1');assert.equal(borrow.via,'leaf-filmmaker');
  assert(!JSON.stringify(state).includes('sisyphus'));assert(state.ownedPowers.includes('coach'));
});

test('race end returns unused private and displayed cards without exposing their identities in events',()=>{
  const s=fixture(['leaf-filmmaker','legs','coach'],[2,29,28]);
  Object.assign(r(s).flags,{secretLeafHand:['banana','hare'],leafDisplayedCards:[{power:'blimp',source:'leaf-filmmaker'}],leafBorrowedPowers:[{power:'blimp',source:'leaf-filmmaker'}]});
  move(s,1,1);move(s,2,2);assert.equal(s.phase,'results');assert.deepEqual([...s.discard].sort(),['banana','blimp','hare']);
  assert.equal(r(s).flags.secretLeafHand,undefined);assert.equal(r(s).flags.leafDisplayedCard,undefined);
  assert(!s.logs.some(event=>event.selectedCardId==='banana'||event.selectedCardId==='hare'));
});

test('Thespian borrowing Thespian does not recursively draw or refresh the once-per-turn mechanism',()=>{
  const s=fixture(['mush','coach','legs']);r(s).flags.acquiredPowers=['leaf-thespian'];s.deck=['leaf-thespian','blimp'];
  begin(s);assert.deepEqual(s.deck,['blimp']);assert.equal(s.pending,undefined);assert.equal(s.flags.awaitRoll,true);
  assert.equal(s.logs.filter(event=>event.type==='copy'&&event.cause==='leaf-thespian').length,1);
  assert.deepEqual(effectivePowers(s,r(s)),['mush','leaf-thespian']);
  assert.equal(abilityState(s,r(s)).entries.filter(entry=>entry.id==='leaf-thespian').length,2);
  r(s).tripped=true;begin(s);assert(effectivePowers(s,r(s)).includes('leaf-thespian'));
  assert(!abilityState(s,r(s)).entries.some(entry=>entry.origin==='temporary'));
});

test('Filmmaker borrowing Filmmaker consumes just its selected card and does not refill its hand or discard again',()=>{
  const s=fixture(['egg','coach','legs']);r(s).flags.power='leaf-filmmaker';r(s).flags.secretLeafHand=['leaf-filmmaker','blimp'];s.deck=['hare'];
  begin(s);choose(s,'leaf-filmmaker');assert.deepEqual(r(s).flags.secretLeafHand,['blimp']);assert.deepEqual(s.deck,['hare']);
  assert.equal(s.pending,undefined);assert.equal(s.flags.awaitRoll,true);assert.equal(s.logs.filter(event=>event.type==='copy').length,1);
});

test('Thespian borrowing Filmmaker without an existing film hand neither draws seven nor invents another selection',()=>{
  const s=fixture(['mush','coach','legs']);r(s).flags.acquiredPowers=['leaf-thespian'];s.deck=['leaf-filmmaker','blimp'];
  begin(s);assert.deepEqual(s.deck,['blimp']);assert.equal(r(s).flags.secretLeafHand,undefined);
  assert.equal(s.pending,undefined);assert.equal(s.flags.awaitRoll,true);assert(effectivePowers(s,r(s)).includes('leaf-filmmaker'));
});

test('Filmmaker to Thespian to Filmmaker performs each distinct mechanism once and the entire chain expires together',()=>{
  let s=fixture(['egg','coach','legs']);r(s).flags.power='leaf-filmmaker';r(s).flags.secretLeafHand=['leaf-thespian','banana'];s.deck=['leaf-filmmaker','blimp'];
  begin(s);assert.equal(s.pending?.kind,'leaf-film-card');s=JSON.parse(JSON.stringify(s));choose(s,'leaf-thespian');
  assert.deepEqual(r(s).flags.secretLeafHand,['banana']);assert.deepEqual(s.deck,['blimp']);assert.equal(s.pending,undefined);
  assert.equal(s.logs.filter(event=>event.type==='copy'&&event.cause==='leaf-filmmaker').length,1);
  assert.equal(s.logs.filter(event=>event.type==='copy'&&event.cause==='leaf-thespian').length,1);
  const entries=abilityState(s,r(s)).entries.filter(entry=>entry.origin==='temporary');assert.equal(entries.length,2);assert(entries.every(entry=>entry.duration==='next-turn'));
  roll(s,3);r(s).tripped=true;begin(s);assert.deepEqual(effectivePowers(s,r(s)),['leaf-filmmaker']);
  assert.equal(abilityState(s,r(s)).entries.filter(entry=>entry.origin==='temporary').length,0);
  assert.deepEqual(s.deck,['blimp']);assert.deepEqual(r(s).flags.secretLeafHand,['banana']);
  assert.deepEqual((r(s).flags.leafDisplayedCards as {power:string}[]).map(item=>item.power).sort(),['leaf-filmmaker','leaf-thespian']);
});

test('a duplicated Thespian card already displayed by Filmmaker is skipped instead of redrawn into its own descendant slot',()=>{
  const s=fixture(['egg','coach','legs']);r(s).flags.power='leaf-filmmaker';r(s).flags.secretLeafHand=['leaf-thespian','banana'];s.deck=['leaf-thespian','blimp'];
  begin(s);choose(s,'leaf-thespian');assert.deepEqual(effectivePowers(s,r(s)),['leaf-filmmaker','leaf-thespian','blimp']);
  assert.deepEqual(s.deck,[]);assert.deepEqual(r(s).flags.secretLeafHand,['banana']);assert.equal(s.logs.filter(event=>event.type==='copy').length,2);
});

test('Thespian to Filmmaker to Thespian may use an existing private hand once, including after a resumed pending choice',()=>{
  let s=fixture(['mush','coach','legs']);r(s).flags.acquiredPowers=['leaf-thespian'];r(s).flags.secretLeafHand=['leaf-thespian','banana'];s.deck=['leaf-filmmaker','blimp'];
  begin(s);assert.equal(s.pending?.kind,'leaf-film-card');assert.deepEqual(s.deck,['blimp']);const pendingId=s.pending!.id;
  s=JSON.parse(JSON.stringify(s));assert.equal(s.pending?.id,pendingId);choose(s,'leaf-thespian');
  assert.deepEqual(s.deck,['blimp']);assert.deepEqual(r(s).flags.secretLeafHand,['banana']);assert.equal(s.logs.filter(event=>event.type==='copy').length,2);
  assert.equal(s.pending,undefined);assert.equal(s.flags.awaitRoll,true);
  roll(s,3);r(s).tripped=true;begin(s);assert.deepEqual(effectivePowers(s,r(s)),['mush','leaf-thespian']);
  assert.equal(abilityState(s,r(s)).entries.filter(entry=>entry.origin==='temporary').length,0);
});

test('an empty draw pile cannot recycle the current Thespian display before a real replacement exists',()=>{
  const s=fixture(['leaf-thespian','coach','legs']);s.deck=['blimp'];begin(s);roll(s,3);
  assert.equal(r(s).flags.leafDisplayedCard,'blimp');begin(s);
  assert.equal(r(s).flags.leafDisplayedCard,'blimp');assert(!s.discard.includes('blimp'));
  assert(!effectivePowers(s,r(s)).includes('blimp'));assert.equal(s.flags.awaitRoll,true);
});

test('an exhausted film hand retains the expired display until the next real discard or race end',()=>{
  const s=fixture(['leaf-filmmaker','coach','legs']);r(s).flags.secretLeafHand=['blimp'];begin(s);choose(s,'blimp');roll(s,3);begin(s);
  assert.equal(s.pending,undefined);assert.equal(r(s).flags.leafDisplayedCard,'blimp');assert(!s.discard.includes('blimp'));
  assert(!effectivePowers(s,r(s)).includes('blimp'));assert.equal(s.flags.awaitRoll,true);
});

test('restored Filmmaker choices and continuations cannot acquire a now-disabled pack',()=>{
  const s=fixture(['leaf-filmmaker','coach','legs']);s.config!.characterPacks['extra-mile']=false;
  r(s).flags.secretLeafHand=['extra-mile-cletus','blimp'];begin(s);assert.deepEqual(s.pending?.options.map(option=>option.id),['blimp']);
  const queued=fixture(['leaf-filmmaker','coach','legs']);queued.config!.characterPacks['extra-mile']=false;r(queued).flags.secretLeafHand=['extra-mile-cletus'];
  task(queued,'leaf',0,{step:'film-copy',characterId:'extra-mile-cletus'});
  assert(!effectivePowers(queued,r(queued)).includes('extra-mile-cletus'));assert.deepEqual(r(queued).flags.secretLeafHand,['extra-mile-cletus']);
  assert(queued.logs.some(event=>event.type==='cancel'&&event.cause==='leaf-filmmaker'));
});

test('Shuffler redistributes real racer card text while Gary remains an unchanged extra object',()=>{
  const s=fixture(['extra-mile-shuffler','extra-mile-dom-and-gary','legs']);before(s,1);
  const gary=s.racers.find(item=>item.flags.gary)!;assert(gary);const previous=structuredClone(gary);
  before(s);assert.deepEqual(gary,previous);assert.equal(s.racers.length,4);
  assert.deepEqual(s.racers.filter(item=>!item.flags.gary).map(item=>item.flags.power).sort(),['extra-mile-shuffler','extra-mile-dom-and-gary','legs'].sort());
});

test('public grant events freeze the awarded text and expiry without reconstructing it from later powers',()=>{
  const film=fixture(['leaf-filmmaker','coach','legs']);r(film).flags.secretLeafHand=['blimp','sisyphus'];begin(film);choose(film,'blimp');
  const borrowed=film.logs.find(event=>event.type==='copy'&&event.cause==='leaf-filmmaker')!;
  assert.deepEqual(borrowed.grantedPowerIds,['blimp']);assert.equal(borrowed.grantDuration,'next-turn');
  roll(film,3);r(film).tripped=true;begin(film);assert(!effectivePowers(film,r(film)).includes('blimp'));assert.deepEqual(borrowed.grantedPowerIds,['blimp']);
  assert(!JSON.stringify(borrowed).includes('sisyphus'));
  const doppel=fixture(['doppelgangster','mush','legs'],[0,29,20]);r(doppel,1).flags.acquiredPowers=['coach','kraken'];move(doppel,1,1);
  const acquired=doppel.logs.find(event=>event.type==='copy'&&event.cause==='doppelgangster')!;
  assert.deepEqual(acquired.grantedPowerIds,['mush','coach','kraken']);assert.equal(acquired.grantDuration,'race');
  const copy=fixture(['copycat','coach','legs'],[0,10,5]);task(copy,'refreshCopies');r(copy,2).position=15;task(copy,'refreshCopies');
  assert.deepEqual(copy.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['coach'],['legs']]);
  assert(copy.logs.filter(event=>event.cause==='copycat').every(event=>event.grantDuration==='source-change'));
});

test('the first tied Copycat choice exposes no unconfirmed candidate ability, source or grant event',()=>{
  const s=fixture(['copycat','coach','legs'],[0,15,15]);
  assert.equal(effectivePower(s,r(s)),'copycat');assert.deepEqual(abilityState(s,r(s)).ownedPowers,['copycat']);
  assert.equal(abilityState(s,r(s)).entries[0]!.sourceRacerId,undefined);task(s,'refreshCopies');
  assert.equal(s.pending?.kind,'copycat');assert.equal(r(s).flags.copyPower,undefined);
  assert.deepEqual(abilityState(s,r(s)).powers,['copycat']);assert.equal(abilityState(s,r(s)).entries[0]!.sourceRacerId,undefined);
  assert.equal(s.logs.filter(event=>event.cause==='copycat').length,0);
  choose(s,'r2');assert.equal(effectivePower(s,r(s)),'legs');assert.equal(abilityState(s,r(s)).entries[0]!.sourceRacerId,'r2');
  assert.deepEqual(s.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['legs']]);
});

test('a new unresolved leader tie preserves the previous confirmed Copycat text without guessing a new source',()=>{
  const s=fixture(['copycat','coach','legs','blimp'],[0,15,10,5]);task(s,'refreshCopies');assert.equal(r(s).flags.copyTarget,'r1');
  r(s,2).position=20;r(s,3).position=20;task(s,'refreshCopies');assert.equal(s.pending?.kind,'copycat');
  assert.equal(r(s).flags.copyPower,'coach');assert.equal(effectivePower(s,r(s)),'coach');
  assert.deepEqual(abilityState(s,r(s)).ownedPowers,['coach']);assert.equal(abilityState(s,r(s)).entries[0]!.sourceRacerId,undefined);
  assert.deepEqual(s.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['coach']]);
  choose(s,'r3');assert.equal(effectivePower(s,r(s)),'blimp');
  assert.deepEqual(s.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['coach'],['blimp']]);
});

test('a serialized Copycat choice and replayed old choice ID cannot duplicate the confirmed grant event',()=>{
  let s=fixture(['copycat','coach','legs'],[0,15,15]);task(s,'refreshCopies');const pending=structuredClone(s.pending!);
  s=JSON.parse(JSON.stringify(s));choose(s,'r2');assert.equal(s.logs.filter(event=>event.cause==='copycat').length,1);
  s=JSON.parse(JSON.stringify(s));assert.throws(()=>applyGameAction(s,pending.playerId,{type:'choose',choiceId:pending.id,optionId:'r2'}));
  task(s,'refreshCopies');assert.equal(s.logs.filter(event=>event.cause==='copycat').length,1);
  assert.deepEqual(s.logs.find(event=>event.cause==='copycat')?.grantedPowerIds,['legs']);
});

test('a legacy Filmmaker borrowing Thespian migrates the old display to the film source and returns it on replacement',()=>{
  let s=fixture(['leaf-filmmaker','coach','legs']);
  Object.assign(r(s).flags,{acquiredPowers:['leaf-thespian'],leafBorrowedPower:'leaf-thespian',leafBorrowAlreadyPresent:false,leafDisplayedCard:'leaf-thespian',leafBorrowTurn:0,secretLeafHand:['blimp']});
  s=JSON.parse(JSON.stringify(s));begin(s);assert.equal(s.pending?.kind,'leaf-film-card');
  assert.deepEqual(effectivePowers(s,r(s)),['leaf-filmmaker']);assert(!s.discard.includes('leaf-thespian'));
  choose(s,'blimp');assert(s.discard.includes('leaf-thespian'));assert.equal(r(s).flags.leafDisplayedCard,'blimp');
  assert.deepEqual(r(s).flags.leafDisplayedCards,[{power:'blimp',source:'leaf-filmmaker'}]);
  assert.deepEqual(effectivePowers(s,r(s)),['leaf-filmmaker','blimp']);
});

test('Mush confirms a newly drawn Copycat target before its still-pending main movement and discards expired target caches',()=>{
  for(const expiredCache of [false,true]){
    let s=fixture(['mush','coach','blimp'],[2,10,10]);s.deck=['copycat'];
    if(expiredCache)Object.assign(r(s).flags,{leafBorrowedPowers:[],copyPower:'coach',copyTarget:'r1',lastCopyPower:'coach'});
    begin(s);roll(s,2);assert.equal(s.pending?.kind,'copycat');assert.equal(r(s).position,2);
    assert.deepEqual(effectivePowers(s,r(s)),['mush','copycat']);assert.equal(r(s).flags.copyPower,undefined);
    assert.equal(abilityState(s,r(s)).entries.find(entry=>entry.sourceCardId==='copycat')?.sourceRacerId,undefined);
    s=JSON.parse(JSON.stringify(s));choose(s,'r2');assert.equal(r(s).position,7);
    assert.deepEqual(s.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['blimp']]);
  }
});

test('redrawing Copycat preserves a legal already-owned confirmed source instead of opening a duplicate target choice',()=>{
  const s=fixture(['mush','coach','blimp'],[2,10,10]);s.deck=['copycat'];
  Object.assign(r(s).flags,{acquiredPowers:['copycat'],copyPower:'blimp',copyTarget:'r2',lastCopyPower:'blimp'});
  begin(s);roll(s,2);assert.equal(s.pending,undefined);assert.equal(r(s).position,7);
  assert.equal(r(s).flags.copyTarget,'r2');assert.equal(r(s).flags.copyPower,'blimp');
  assert.equal(s.logs.filter(event=>event.type==='acquire'&&event.cause==='mush').length,1);
  assert.equal(s.logs.filter(event=>event.cause==='copycat').length,0);
});

test('a new Leaf Copycat borrow cannot reuse an expired previous borrow target',()=>{
  for(const identity of ['leaf-thespian','leaf-filmmaker']){
    const s=fixture([identity,'coach','blimp'],[2,10,10]);
    Object.assign(r(s).flags,{leafBorrowedPowers:[],copyPower:'coach',copyTarget:'r1',lastCopyPower:'coach'});
    if(identity==='leaf-thespian')s.deck=['copycat'];else r(s).flags.secretLeafHand=['copycat'];
    begin(s);if(identity==='leaf-filmmaker')choose(s,'copycat');
    assert.equal(s.pending?.kind,'copycat');assert.equal(r(s).flags.copyPower,undefined);assert.equal(r(s).position,2);
    choose(s,'r2');roll(s,3);assert.equal(r(s).position,8);
    assert.deepEqual(s.logs.filter(event=>event.cause==='copycat').map(event=>event.grantedPowerIds),[['blimp']]);
  }
});
