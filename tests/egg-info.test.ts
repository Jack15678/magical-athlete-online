import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameAction, createGame, effectivePower, resolveTasks } from '../src/engine/index.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameState, Player, Room } from '../src/shared/types.js';

const players = (): Player[] => ['owner', 'friend'].map((id, seat) => ({ id, name:id, seat, color:'#000', ready:true, connected:true, score:0, hand:[], used:[], selection:[] }));
function fixture(cards = ['legs', 'banana', 'romantic']): GameState {
  const s = createGame(players(), 1234);
  Object.assign(s, { phase:'race', round:1, currentRacerId:'egg-racer', deck:cards });
  s.racers = ['egg', 'coach', 'alchemist'].map((characterId, i) => ({ id:['egg-racer', 'leader', 'next-leader'][i]!, playerId:i===0?'owner':'friend', characterId, position:[2, 10, 6][i]!, tripped:false, finished:false, eliminated:false, flags:{} }));
  return s;
}
function beforeRace(s: GameState) { s.queue.push({kind:'beforeRace', racerId:'egg-racer'}); resolveTasks(s); }
function choose(s: GameState, optionId: string) {
  assert(s.pending);
  applyGameAction(s, s.pending.playerId, {type:'choose', choiceId:s.pending.id, optionId});
}
const room = (game: GameState): Room => ({ code:'ABC234', hostId:'owner', createdAt:1000, updatedAt:1000, version:1, maxPlayers:2, timeoutSeconds:0, deadline:null, game, spectators:[{id:'viewer', name:'Viewer', connected:true}] });
const view = (s: GameState, id = 'friend') => projectRoom(room(s), id, {authorityId:'owner', authorityOnline:true});

test('Egg reveals only its selected card to every role and preserves it on reconnect', () => {
  const s = fixture(); beforeRace(s);
  assert.deepEqual(view(s, 'owner').pending?.options.map(o => o.id), ['legs', 'banana', 'romantic']);
  for (const id of ['friend', 'viewer']) {
    const before = view(s, id);
    assert.equal(before.pending, undefined);
    assert.equal(before.racers[0]!.flags.eggCardId, undefined);
    assert(!JSON.stringify(before).includes('romantic'), 'offered cards remain private before selection');
  }
  choose(s, 'legs');
  const reconnected = JSON.parse(JSON.stringify(s)) as GameState;
  for (const id of ['owner', 'friend', 'viewer']) {
    const publicState = view(reconnected, id), flags = publicState.racers[0]!.flags;
    assert.equal(flags.eggCardId, 'legs'); assert.equal(flags.power, 'legs');
    assert.equal(publicState.logs.find(event => event.type==='copy')?.selectedCardId, 'legs');
    assert(!JSON.stringify(publicState).includes('banana')); assert(!JSON.stringify(publicState).includes('romantic'));
  }
});

test('Egg choosing Twin retains the drawn Twin separately from its champion and effective ability', () => {
  const s = fixture(['twin', 'banana', 'romantic']); s.round=2;
  s.results=[{round:1, placements:[{racerId:'old-egg', playerId:'friend', characterId:'egg', rank:1, points:2}]}];
  s.flags.historyPowers={egg:'sisyphus'}; beforeRace(s); choose(s, 'twin');
  assert.equal(s.pending?.kind, 'twin'); assert.equal(s.racers[0]!.flags.eggCardId, 'twin');
  choose(s, 'egg');
  const egg = s.racers[0]!;
  assert.equal(egg.flags.eggCardId, 'twin'); assert.equal(egg.flags.twinCardId, 'egg');
  assert.equal(effectivePower(s, egg), 'sisyphus'); assert.equal(s.players[0]!.score, 4);
  assert.deepEqual(view(JSON.parse(JSON.stringify(s))).racers[0]!.flags, egg.flags);
  assert.deepEqual(s.logs.filter(event=>event.type==='copy').map(event=>event.selectedCardId), ['twin', 'egg']);
});

test('Egg choosing Copycat keeps its card while the current leader and effective ability change', () => {
  const s = fixture(['copycat', 'banana', 'romantic']); beforeRace(s); choose(s, 'copycat');
  s.queue.push({kind:'refreshCopies'}); resolveTasks(s);
  assert.equal(s.racers[0]!.flags.copyTarget, 'leader'); assert.equal(effectivePower(s, s.racers[0]!), 'coach');
  s.racers[2]!.position=12; s.queue.push({kind:'refreshCopies'}); resolveTasks(s);
  const restored = JSON.parse(JSON.stringify(s)) as GameState, egg=view(restored).racers[0]!;
  assert.equal(egg.flags.eggCardId, 'copycat'); assert.equal(egg.flags.power, 'copycat');
  assert.equal(egg.flags.copyTarget, 'next-leader'); assert.equal(egg.flags.copyPower, 'alchemist');
  assert.equal(effectivePower(restored, restored.racers[0]!), 'alchemist');
});

test('a new race creates fresh Egg card state instead of reusing the preceding selection', () => {
  const s=fixture(); beforeRace(s); choose(s, 'legs');
  s.phase='results'; s.queue=[]; s.pending=undefined;
  s.players[0]!.hand=['coach','blimp']; s.players[1]!.hand=['alchemist','romantic'];
  applyGameAction(s, 'owner', {type:'next'});
  applyGameAction(s, 'owner', {type:'select', characterIds:['coach','blimp']});
  applyGameAction(s, 'friend', {type:'select', characterIds:['alchemist','romantic']});
  assert.equal(s.round, 2); assert(s.racers.every(r=>r.flags.eggCardId===undefined && r.flags.twinCardId===undefined));
  assert(s.racers.every(r=>r.id!=='egg-racer'));
});

test('legacy public copy history recovers Egg and Twin cards even outside the last 120 events', () => {
  const s=fixture(); s.racers[0]!.flags.power='sisyphus';
  s.logs=[{id:1,type:'copy',text:'蛋本场复制双胞胎',source:'egg-racer',cause:'egg'}, {id:2,type:'copy',text:'蛋本场复制蛋',source:'egg-racer',cause:'twin'}, ...Array.from({length:130},(_,i)=>({id:i+3,type:'turn',text:'A later turn'}))];
  const publicState=view(s), flags=publicState.racers[0]!.flags;
  assert.equal(publicState.logs.length, 120); assert.equal(flags.eggCardId, 'twin'); assert.equal(flags.twinCardId, 'egg');
  assert.equal(flags.power, 'sisyphus'); assert.equal(s.racers[0]!.flags.eggCardId, undefined, 'projection does not mutate a restored save');
  flags.eggCardId='legs'; assert.equal(s.racers[0]!.flags.eggCardId, undefined);
});

test('legacy projection never guesses the original Egg card from a current inherited ability or ambiguous log', () => {
  const s=fixture(); s.racers[0]!.flags.power='sisyphus';
  s.logs=[{id:1,type:'copy',text:'蛋本场复制双胞胎（推测）',source:'egg-racer',cause:'egg'}, {id:2,type:'copy',text:'蛋本场复制双胞胎',source:'another-racer',cause:'egg'}];
  assert.equal(view(s).racers[0]!.flags.eggCardId, undefined);
  s.logs=[{id:3,type:'copy',text:'A structured, language-independent choice',source:'egg-racer',cause:'egg',selectedCardId:'copycat'}];
  assert.equal(view(s).racers[0]!.flags.eggCardId, 'copycat');
});
