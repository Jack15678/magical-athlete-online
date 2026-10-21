import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTERS } from '../src/shared/characters.js';
import { TRACKS } from '../src/shared/tracks.js';
import type { GameState, GameAction, Racer } from '../src/shared/types.js';
import { applyGameAction, effectivePower, enqueueMove, enqueueWarp, resolveTasks } from '../src/engine/index.js';
import { ABILITY_SPECS, COMBINATION_SPECS } from './ability-specs.js';

/** Test fixtures intentionally bypass drafting, networking and rendering. Oracles
 * are documented in ability-specs.ts and the current publisher FAQ. */
function fixture(ids: string[], positions: number[] = ids.map(() => 0)): GameState {
  return {
    phase: 'race', round: 1,
    players: ids.map((_, i) => ({ id: `p${i}`, name: `Player ${i}`, seat: i, color: '#000', ready: true, connected: true, score: 0, hand: [], used: [], selection: [] })),
    deck: ['alchemist', 'sisyphus', 'coach'], discard: [],
    racers: ids.map((characterId, i) => ({ id: `r${i}`, playerId: `p${i}`, characterId, position: positions[i]!, tripped: false, finished: false, eliminated: false, flags: {} })),
    turn: 0, turnCount: 0, currentRacerId: 'r0', queue: [], logs: [], results: [], rngState: 1234, randomLog: [], track: 'mild', flags: {},
  };
}
const racer = (s: GameState, i = 0): Racer => s.racers.find(r => r.id === `r${i}`)!;
function dice(s: GameState, ...faces: number[]) { s.flags.testDice = faces; }
function act(s: GameState, action: GameAction, playerId = s.pending?.playerId ?? racer(s, Number((s.currentRacerId ?? 'r0').slice(1))).playerId) {
  applyGameAction(s, playerId, action);
}
function choose(s: GameState, option: string) {
  assert.ok(s.pending, `Expected a choice with option ${option}`);
  const found = s.pending.options.find(o => o.id === option || o.label === option);
  assert.ok(found, `Missing option ${option} in ${s.pending.kind}: ${s.pending.options.map(o => o.id).join(', ')}`);
  act(s, { type: 'choose', choiceId: s.pending.id, optionId: found.id }, s.pending.playerId);
}
function begin(s: GameState, i = 0) {
  s.currentRacerId = `r${i}`; s.turn = i;
  s.queue.push({ kind: 'beginTurn', racerId: `r${i}` }); resolveTasks(s);
}
function beforeRace(s: GameState, i = 0) {
  s.queue.push({ kind: 'beforeRace', racerId: `r${i}` }); resolveTasks(s);
}
function move(s: GameState, i: number, distance: number) { enqueueMove(s, `r${i}`, distance, 'test'); resolveTasks(s); }

test('All 36 base racers have independent publisher-backed acceptance oracles', () => {
  assert.equal(CHARACTERS.length, 36);
  assert.equal(new Set(CHARACTERS.map(c => c.id)).size, 36);
  assert.deepEqual(new Set(ABILITY_SPECS.map(s => s.characterId)), new Set(CHARACTERS.map(c => c.id)));
  assert.equal(COMBINATION_SPECS.length, 10);
  for (const c of CHARACTERS) {
    assert.equal(c.translation, '本项目译名');
    assert.ok(c.verified && c.sources.length >= 2);
    assert.equal(ABILITY_SPECS.find(s => s.characterId === c.id)?.id, c.testId);
  }
});

test('CHAR-01 Alchemist changes distance while keeping the final die face', () => {
  const s = fixture(['alchemist', 'legs'], [5, 14]); dice(s, 1); begin(s); act(s, { type: 'roll' }); choose(s, 'use');
  assert.equal(racer(s).position, 9); assert.equal(s.lastRoll?.face, 1); assert.equal(s.lastRoll?.distance, 4);
});
test('CHAR-02 Baba Yaga trips a single arriving racer', () => {
  const s = fixture(['baba-yaga', 'alchemist'], [7, 4]); move(s, 1, 3);
  assert.equal(racer(s, 1).position, 7); assert.equal(racer(s, 1).tripped, true); assert.equal(racer(s).tripped, false);
});
test('CHAR-02 Baba Yaga still trips an already-triggered Duelist after a prioritized duel', () => {
  const s = fixture(['duelist', 'baba-yaga', 'alchemist'], [2, 5, 14]); dice(s, 4, 2); move(s, 0, 3); choose(s, 'r1');
  assert.equal(racer(s).position, 7); assert.equal(racer(s).tripped, true);
});
test('CHAR-03 Banana trips after the full move, including backward passes', () => {
  const s = fixture(['banana', 'alchemist'], [5, 3]); move(s, 1, 4);
  assert.equal(racer(s, 1).position, 7); assert.equal(racer(s, 1).tripped, true);
  racer(s, 1).tripped = false; move(s, 1, -4);
  assert.equal(racer(s, 1).position, 3); assert.equal(racer(s, 1).tripped, true);
});
test('CHAR-04 Blimp gets +3 before the second corner and -1 on it', () => {
  const corner = TRACKS.mild.secondCorner;
  const early = fixture(['blimp', 'alchemist'], [corner - 1, 3]); dice(early, 3); begin(early); act(early, { type: 'roll' });
  assert.equal(racer(early).position, corner + 5);
  const late = fixture(['blimp', 'alchemist'], [corner, 3]); dice(late, 3); begin(late); act(late, { type: 'roll' });
  assert.equal(racer(late).position, corner + 2);
});
test('CHAR-05 Centaur pushes passed racers back two', () => {
  const s = fixture(['centaur', 'alchemist', 'alchemist'], [2, 4, 6]); move(s, 0, 6);
  assert.deepEqual(s.racers.map(r => r.position), [8, 2, 4]);
});
test('CHAR-06 Cheerleader moves every tied last racer then itself', () => {
  const s = fixture(['cheerleader', 'alchemist', 'alchemist'], [5, 1, 1]); begin(s); choose(s, 'use');
  assert.deepEqual(s.racers.map(r => r.position), [6, 3, 3]);
});
test('CHAR-07 Coach always includes itself in its modifier', () => {
  const s = fixture(['coach', 'alchemist'], [3, 15]); dice(s, 3); begin(s); act(s, { type: 'roll' });
  assert.equal(racer(s).position, 7);
});
test('CHAR-08 Copycat continuously copies the current leader', () => {
  const s = fixture(['copycat', 'coach', 'alchemist'], [2, 8, 4]);
  assert.equal(effectivePower(s, racer(s)), 'coach'); dice(s, 3); begin(s); act(s, { type: 'roll' }); assert.equal(racer(s).position, 6);
});
test('CHAR-09 Dicemonger moves before the new die is generated', () => {
  const s = fixture(['alchemist', 'dicemonger'], [6, 3]); dice(s, 1, 4); begin(s); act(s, { type: 'roll' }); choose(s, 'reroll');
  assert.equal(racer(s, 1).position, 4); assert.equal(s.lastRoll?.face, 4);
});
test('CHAR-10 Duelist wins tied dice and moves two', () => {
  const s = fixture(['duelist', 'alchemist'], [5, 5]); dice(s, 3, 3); begin(s); choose(s, 'r1');
  assert.equal(racer(s).position, 7); assert.equal(racer(s, 1).position, 5);
});
test('CHAR-11 Egg retains its identity and obtains copied before-race powers', () => {
  const s = fixture(['egg', 'alchemist']); beforeRace(s); choose(s, 'sisyphus');
  assert.equal(racer(s).characterId, 'egg'); assert.equal(effectivePower(s, racer(s)), 'sisyphus'); assert.equal(s.players[0]!.score, 4);
});
test('CHAR-12 Flip Flop swaps by warp without rolling', () => {
  const s = fixture(['flip-flop', 'alchemist'], [2, 9]); begin(s); choose(s, 'r1');
  assert.deepEqual(s.racers.map(r => r.position), [9, 2]); assert.equal(s.randomLog.length, 0);
});
test('CHAR-13 Genius gets the next turn after a correct prediction', () => {
  const s = fixture(['genius', 'alchemist'], [2, 15]); dice(s, 4); begin(s); choose(s, '4'); act(s, { type: 'roll' });
  assert.equal(racer(s).position, 6); assert.equal(s.currentRacerId, 'r0');
});
test('CHAR-14 Gunk changes the distance but not the die', () => {
  const s = fixture(['alchemist', 'gunk'], [3, 15]); dice(s, 6); begin(s); act(s, { type: 'roll' });
  assert.equal(racer(s).position, 8); assert.equal(s.lastRoll?.face, 6);
});
test('CHAR-15 Hare cannot recover while skipping its main move alone in lead', () => {
  const s = fixture(['hare', 'alchemist'], [8, 5]); racer(s).tripped = true; begin(s);
  assert.equal(racer(s).position, 8); assert.equal(racer(s).tripped, true); assert.equal(s.randomLog.length, 0);
});
test('CHAR-16 Heckler reacts to a recovery-only turn', () => {
  const s = fixture(['alchemist', 'heckler'], [5, 3]); racer(s).tripped = true; begin(s);
  assert.equal(racer(s).tripped, false); assert.equal(racer(s, 1).position, 5);
});
test('CHAR-16 Heckler does not react to a net backward distance of two', () => {
  const s = fixture(['coach', 'heckler', 'gunk', 'gunk', 'gunk', 'gunk'], [10, 3, 15, 18, 20, 22]); dice(s, 1); begin(s); act(s, { type: 'roll' });
  assert.equal(racer(s).position, 8); assert.equal(racer(s, 1).position, 3);
});
test('CHAR-17 Huge Baby forces another racer to the space behind it', () => {
  const s = fixture(['huge-baby', 'alchemist'], [8, 6]); move(s, 1, 2); assert.equal(racer(s, 1).position, 7);
  const start = fixture(['huge-baby', 'alchemist'], [0, 0]); enqueueWarp(start, 'r1', 0, 'test'); resolveTasks(start); assert.equal(racer(start, 1).position, 0);
});
test('CHAR-18 Hypnotist warps Baba Yaga and is tripped', () => {
  const s = fixture(['hypnotist', 'baba-yaga'], [5, 9]); begin(s); choose(s, 'r1');
  assert.equal(racer(s, 1).position, 5);
  assert.ok(s.logs.some(event => event.type === 'trip' && event.targets?.includes('r0')));
  assert.ok(s.logs.some(event => event.type === 'recover' && event.source === 'r0'));
  assert.equal(racer(s).tripped, false); // Its main move stands up during this same turn.
});
test('CHAR-19 Inchworm cancels the entire main move including bonuses', () => {
  const s = fixture(['coach', 'inchworm'], [5, 2]); dice(s, 1); begin(s); act(s, { type: 'roll' });
  assert.deepEqual(s.racers.map(r => r.position), [5, 3]);
});
test('CHAR-20 Lackey moves two before the other racer moves on six', () => {
  const s = fixture(['alchemist', 'lackey'], [5, 3]); dice(s, 6); begin(s); act(s, { type: 'roll' });
  assert.deepEqual(s.racers.map(r => r.position), [11, 5]);
});
test('CHAR-21 Leaptoad counts only empty spaces', () => {
  const s = fixture(['leaptoad', 'alchemist', 'alchemist'], [2, 3, 4]); move(s, 0, 2); assert.equal(racer(s).position, 6);
});
test('CHAR-22 Legs fixed main distance still takes Gunk modifier', () => {
  const s = fixture(['legs', 'gunk'], [2, 15]); begin(s); choose(s, 'use'); assert.equal(racer(s).position, 6); assert.equal(s.randomLog.length, 0);
});
test('CHAR-23 Lovable Loser scores before standing up', () => {
  const s = fixture(['lovable-loser', 'alchemist'], [1, 5]); racer(s).tripped = true; begin(s);
  assert.equal(s.players[0]!.score, 1); assert.equal(racer(s).position, 1); assert.equal(racer(s).tripped, false);
});
test('CHAR-24 Magician must retain the last of two rerolls', () => {
  const s = fixture(['magician', 'alchemist'], [2, 15]); dice(s, 1, 6, 3); begin(s); act(s, { type: 'roll' }); choose(s, 'reroll'); choose(s, 'reroll');
  if (s.pending) choose(s, 'keep'); assert.equal(racer(s).position, 5); assert.equal(s.lastRoll?.face, 3);
});
test('CHAR-25 Mastermind predicting itself wins both first and second', () => {
  const s = fixture(['mastermind', 'alchemist'], [TRACKS.mild.finish - 1, 3]); begin(s); choose(s, 'r0'); move(s, 0, 2);
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => [p.racerId, p.rank]), [['r0', 1], ['r0', 2]]);
});
test('CHAR-26 M.O.U.T.H. eliminates a single racer when it arrives', () => {
  const s = fixture(['mouth', 'alchemist', 'alchemist'], [2, 5, 9]); move(s, 0, 3); assert.equal(racer(s, 1).eliminated, true); assert.equal(racer(s).position, 5);
  const other = fixture(['mouth', 'alchemist', 'alchemist'], [5, 2, 9]); move(other, 1, 3); assert.equal(racer(other, 1).eliminated, false);
});
test('CHAR-26 The sole remaining racer receives the next available place', () => {
  const s = fixture(['mouth', 'alchemist', 'alchemist'], [2, 5, 9]); move(s, 0, 3); move(s, 0, 4);
  assert.equal(racer(s, 1).eliminated, true); assert.equal(racer(s, 2).eliminated, true); assert.equal(s.phase, 'results');
  assert.deepEqual(s.results.at(-1)?.placements.map(p => [p.racerId, p.rank]), [['r0', 1]]);
});
test('CHAR-27 Party Animal attracts simultaneously and gets all bonuses', () => {
  const s = fixture(['party-animal', 'alchemist', 'alchemist'], [5, 4, 6]); dice(s, 3); begin(s); act(s, { type: 'roll' }); assert.deepEqual(s.racers.map(r => r.position), [10, 5, 5]);
});
test('CHAR-28 Rocket Scientist doubles before additive modifiers then trips', () => {
  const s = fixture(['rocket-scientist', 'coach'], [2, 2]); dice(s, 5); begin(s); act(s, { type: 'roll' }); choose(s, 'use'); assert.equal(racer(s).position, 13); assert.equal(racer(s).tripped, true);
});
test('CHAR-29 Romantic can activate from its own single arrival', () => {
  const s = fixture(['romantic', 'alchemist'], [2, 5]); move(s, 0, 3); assert.equal(racer(s).position, 7);
});
test('CHAR-30 Scoocher gets one move for each occupied space skipped', () => {
  const s = fixture(['scoocher', 'leaptoad', 'alchemist', 'alchemist'], [1, 2, 3, 4]); move(s, 1, 2); assert.equal(racer(s, 1).position, 6); assert.equal(racer(s).position, 3);
});
test('CHAR-31 Sisyphus six replaces rather than precedes the main move', () => {
  const s = fixture(['sisyphus', 'alchemist'], [12, 3]); beforeRace(s); assert.equal(s.players[0]!.score, 4); dice(s, 6); begin(s); act(s, { type: 'roll' }); assert.equal(racer(s).position, 0); assert.equal(s.players[0]!.score, 3);
});
test('CHAR-32 Skipper changes the next turn and then order continues to its left', () => {
  const s = fixture(['alchemist', 'alchemist', 'skipper', 'alchemist'], [2, 8, 12, 16]); dice(s, 1); begin(s); act(s, { type: 'roll' }); if (s.pending) choose(s, 'skip'); assert.equal(s.currentRacerId, 'r2');
});
test('CHAR-33 Stickler cancels an entire overshooting skill move', () => {
  const before = TRACKS.mild.finish - 1; const s = fixture(['stickler', 'alchemist'], [4, before]); move(s, 1, 2); assert.equal(racer(s, 1).position, before); assert.equal(racer(s, 1).finished, false);
});
test('CHAR-34 Suckerfish follows together and the source finishes first', () => {
  const before = TRACKS.mild.finish - 1; const s = fixture(['alchemist', 'suckerfish'], [before, before]); move(s, 0, 2); choose(s, 'use');
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => p.racerId), ['r0', 'r1']);
});
test('CHAR-35 Third Wheel warps then still takes a main move', () => {
  const s = fixture(['third-wheel', 'alchemist', 'alchemist'], [2, 8, 8]); dice(s, 3); begin(s); choose(s, '8'); act(s, { type: 'roll' }); assert.equal(racer(s).position, 11);
});
test('CHAR-36 Twin can copy a previous winner including before-race power', () => {
  const s = fixture(['twin', 'alchemist']); s.round = 2; s.results = [{ round: 1, placements: [{ racerId: 'old', playerId: 'p1', characterId: 'sisyphus', rank: 1, points: 2 }] }]; beforeRace(s); choose(s, 'sisyphus');
  assert.equal(racer(s).characterId, 'twin'); assert.equal(effectivePower(s, racer(s)), 'sisyphus'); assert.equal(s.players[0]!.score, 4);
});

test('COMBO-01 Romantic and Suckerfish simultaneous arrivals do not trigger Romantic', () => {
  const s = fixture(['romantic', 'suckerfish'], [2, 2]); move(s, 0, 3); choose(s, 'use'); assert.deepEqual(s.racers.map(r => r.position), [5, 5]);
});
test('COMBO-02 Scoocher and Suckerfish can keep making progress through the finish', () => {
  const s = fixture(['alchemist', 'gunk', 'scoocher', 'suckerfish'], [17, 23, 0, 0]); dice(s, 3); begin(s); act(s, { type: 'roll' });
  // This bound protects a failing test, not gameplay. The verified mild track is
  // under 40 spaces, and every accepted follow advances the pair another space.
  let accepted = 0;
  while (s.pending && s.phase === 'race') { assert.ok(accepted++ < 40, 'progressing pair must finish rather than repeat its state'); choose(s, 'use'); }
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => p.racerId), ['r2', 'r3']);
});
test('COMBO-03 Skipper replaces a Genius extra turn from predicting one', () => {
  const s = fixture(['genius', 'alchemist', 'skipper'], [2, 8, 14]); dice(s, 1); begin(s); choose(s, '1'); act(s, { type: 'roll' }); assert.equal(s.currentRacerId, 'r2');
});
test('COMBO-04 Huge Baby pushing Banana counts as passing Banana', () => {
  const s = fixture(['huge-baby', 'banana'], [3, 5]); move(s, 0, 2); assert.equal(racer(s, 1).position, 4); assert.equal(racer(s).position, 5); assert.equal(racer(s).tripped, true);
});
test('COMBO-05 A discarded one triggers neither Inchworm nor Skipper', () => {
  const s = fixture(['alchemist', 'dicemonger', 'inchworm', 'skipper'], [15, 3, 6, 9]); dice(s, 1, 4); begin(s); act(s, { type: 'roll' }); choose(s, 'reroll');
  if (s.pending?.options.some(o => o.id === 'keep')) choose(s, 'keep');
  assert.equal(racer(s).position, 19); assert.equal(racer(s, 1).position, 4); assert.equal(racer(s, 2).position, 6); assert.equal(s.currentRacerId, 'r1');
});
test('COMBO-06 Party Animal arrivals do not let M.O.U.T.H. eat a co-arriving target', () => {
  const s = fixture(['party-animal', 'mouth', 'alchemist'], [5, 4, 6]); begin(s);
  assert.equal(racer(s, 2).eliminated, false); assert.deepEqual(s.racers.map(r => r.position), [5, 5, 5]);
});
test('COMBO-07 Copycat copies Twin printed power instead of Twin selected power', () => {
  const s = fixture(['copycat', 'twin', 'alchemist'], [2, 8, 4]); s.round = 2; s.results = [{ round: 1, placements: [{ racerId: 'old', playerId: 'p2', characterId: 'sisyphus', rank: 1, points: 2 }] }]; beforeRace(s, 1); choose(s, 'sisyphus');
  assert.equal(effectivePower(s, racer(s, 1)), 'sisyphus'); assert.equal(effectivePower(s, racer(s)), 'twin'); assert.equal(s.players[0]!.score, 0);
});
test('COMBO-08 A Duelist opportunity vanishes after active Romantic moves away', () => {
  const s = fixture(['romantic', 'duelist'], [2, 5]); move(s, 0, 3);
  assert.equal(racer(s).position, 7); assert.equal(racer(s, 1).position, 5); assert.equal(s.pending, undefined);
});
test('COMBO-09 Multiple Gunk penalties can produce a negative move without changing the die', () => {
  const s = fixture(['coach', 'gunk', 'gunk', 'gunk'], [5, 9, 12, 15]); dice(s, 1); begin(s); act(s, { type: 'roll' }); assert.equal(racer(s).position, 4); assert.equal(s.lastRoll?.face, 1);
});
test('COMBO-10 Original Mastermind resolves before a copy predicting the same winner', () => {
  const s = fixture(['mastermind', 'copycat', 'alchemist'], [8, 2, 5]); begin(s); choose(s, 'r2'); begin(s, 1); choose(s, 'r2'); move(s, 2, 40);
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => p.racerId), ['r2', 'r0']);
});
test('LOOP-01 Scoocher blocked by Huge Baby completes one true loop and then stops', () => {
  const s = fixture(['scoocher', 'huge-baby', 'alchemist'], [7, 8, 20]);
  s.queue.push({ kind: 'powerDone', racerId: 'r2', power: 'alchemist' }); resolveTasks(s);
  assert.equal(racer(s).position, 7); assert.equal(racer(s, 1).position, 8);
  assert.equal(s.flags.continuation, false, 'a true repeat must resolve, not perpetually exhaust each service budget');
  assert.equal(s.logs.filter(event => event.type === 'loop').length, 1);
});
test('COPY-01 Copycat cannot reopen an already passed first-turn prediction window', () => {
  const s = fixture(['copycat', 'coach', 'mastermind'], [0, 8, 6]); dice(s, 3); begin(s); act(s, { type: 'roll' });
  racer(s, 2).position = 10; begin(s);
  assert.notEqual(s.pending?.kind, 'mastermind'); assert.equal(racer(s).flags.prediction, undefined);
});
test('COPY-02 A copied Mastermind prediction disappears when that power is lost', () => {
  const s = fixture(['copycat', 'mastermind', 'coach'], [2, 8, 5]);
  s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s); begin(s); choose(s, 'r2'); assert.equal(racer(s).flags.prediction, 'r2');
  s.flags.awaitRoll = false; racer(s, 2).position = 10; s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s);
  assert.equal(racer(s).flags.prediction, undefined);
  racer(s, 2).position = 5; s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s); assert.equal(racer(s).flags.prediction, undefined);
});
test('SCOOCH-01 A successful Genius power triggers Scoocher once', () => {
  const s = fixture(['genius', 'scoocher', 'alchemist'], [2, 10, 15]); dice(s, 4); begin(s); choose(s, '4'); act(s, { type: 'roll' });
  assert.equal(s.currentRacerId, 'r0'); assert.equal(racer(s, 1).position, 11);
});
test('SCOOCH-02 A Hare skipping its main move still used its power', () => {
  const s = fixture(['hare', 'scoocher', 'alchemist'], [8, 3, 5]); begin(s);
  assert.equal(racer(s).position, 8); assert.equal(racer(s, 1).position, 4);
});
test('SCOOCH-03 A Stickler preventing an overshooting move triggers Scoocher', () => {
  const before = TRACKS.mild.finish - 1;
  const s = fixture(['stickler', 'scoocher', 'alchemist'], [4, 2, before]); move(s, 2, 2);
  assert.equal(racer(s, 2).position, before); assert.equal(racer(s, 1).position, 3);
});
test('CHAR-extra-01 Declining Legs keeps the same actor waiting for a normal die', () => {
  const s = fixture(['legs', 'alchemist'], [3, 15]); dice(s, 3); begin(s); choose(s, 'skip');
  assert.equal(s.currentRacerId, 'r0'); assert.equal(s.flags.awaitRoll, true); assert.equal(s.randomLog.length, 0);
  act(s, { type: 'roll' }, 'p0'); assert.equal(racer(s).position, 6); assert.equal(s.currentRacerId, 'r1');
});
test('CHAR-extra-02 Declining Flip Flop keeps the same actor waiting for a normal die', () => {
  const s = fixture(['flip-flop', 'alchemist'], [3, 15]); dice(s, 3); begin(s); choose(s, 'skip');
  assert.equal(s.currentRacerId, 'r0'); assert.equal(s.flags.awaitRoll, true); assert.equal(s.randomLog.length, 0);
  act(s, { type: 'roll' }, 'p0'); assert.equal(racer(s).position, 6); assert.equal(racer(s, 1).position, 15); assert.equal(s.currentRacerId, 'r1');
});
test('CHAR-extra-03 System turn setup recovers a tripped racer before the next legal roll', () => {
  const s = fixture(['alchemist', 'coach'], [8, 3]); racer(s).tripped = true; s.flags.needsBegin = true; dice(s, 3);
  assert.throws(() => act(s, { type: 'roll' }, 'p0'), /系统处理/);
  act(s, { type: 'next' }, 'p0');
  assert.equal(racer(s).tripped, false); assert.equal(racer(s).position, 8); assert.equal(s.randomLog.length, 0); assert.equal(s.currentRacerId, 'r1');
  act(s, { type: 'next' }, 'p0');
  act(s, { type: 'roll' }, 'p1'); assert.equal(racer(s, 1).position, 7); assert.equal(s.randomLog.length, 1); assert.equal(s.currentRacerId, 'r0');
});
test('CHAR-extra-04 System turn setup skips an alone-leading Hare without rolling the next racer', () => {
  const s = fixture(['hare', 'coach'], [8, 3]); s.flags.needsBegin = true; dice(s, 3);
  assert.throws(() => act(s, { type: 'roll' }, 'p0'), /系统处理/);
  act(s, { type: 'next' }, 'p0'); assert.equal(racer(s).position, 8); assert.equal(s.randomLog.length, 0); assert.equal(s.currentRacerId, 'r1');
  act(s, { type: 'next' }, 'p0');
  act(s, { type: 'roll' }, 'p1'); assert.equal(racer(s, 1).position, 7); assert.equal(s.randomLog.length, 1);
});
test('CHAR-extra-05 A queued Duelist opportunity rechecks current targets before asking', () => {
  const s = fixture(['romantic', 'duelist', 'alchemist'], [2, 5, 15]);
  move(s, 0, 3); assert.equal(racer(s).position, 7); assert.equal(s.pending, undefined);
  assert.ok(!s.logs.some(event => event.type === 'duel'));
});
test('COPY-extra-01 Copycat keeps Centaur for an entire move that changes the leader', () => {
  const s = fixture(['copycat', 'centaur', 'alchemist'], [2, 6, 4]);
  s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s); assert.equal(effectivePower(s, racer(s)), 'centaur');
  move(s, 0, 5); assert.deepEqual(s.racers.map(r => r.position), [7, 4, 2]);
  const hoofwhacks = s.logs.filter(event => event.type === 'power' && event.source === 'r0');
  assert.equal(hoofwhacks.length, 2); assert.ok(hoofwhacks.every(event => event.cause === 'centaur'), 'the event must retain the actual copied source ability after a leader change');
});
test('COPY-extra-02 Copycat keeps Leaptoad while moving past its previous leader', () => {
  const s = fixture(['copycat', 'leaptoad', 'alchemist'], [2, 4, 3]);
  s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s); assert.equal(effectivePower(s, racer(s)), 'leaptoad');
  move(s, 0, 2); assert.equal(racer(s).position, 6);
});
test('COPY-extra-03 Copycat Centaur effects coexist with being tripped by a real Banana', () => {
  const s = fixture(['copycat', 'centaur', 'banana', 'alchemist'], [2, 8, 6, 4]);
  s.queue.push({ kind: 'refreshCopies' }); resolveTasks(s); assert.equal(effectivePower(s, racer(s)), 'centaur');
  move(s, 0, 7); assert.equal(racer(s).position, 9); assert.equal(racer(s).tripped, true);
  // The real Banana is passed; it remains the source of tripping. The copied
  // Centaur's hoofwhacks still happen even after Copycat takes the lead.
  assert.deepEqual(s.racers.slice(1).map(r => r.position), [6, 4, 2]);
});
test('GROUP-extra-01 Cheerleader group finish follows current-player then clockwise priority', () => {
  // Publisher FAQ / Pompon: simultaneous destinations' consequences follow the
  // usual priority order. This is the project's explicit application to ranks;
  // it does not claim access to an additional current English ranking paragraph.
  const before = TRACKS.mild.finish - 2;
  const s = fixture(['alchemist', 'alchemist', 'cheerleader'], [before, before, before]); begin(s, 2); choose(s, 'use');
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => p.racerId), ['r2', 'r0']);
});
test('GROUP-extra-02 The followed racer finishes before Suckerfish even when Suckerfish owns the active turn', () => {
  const before = TRACKS.mild.finish - 1;
  const s = fixture(['suckerfish', 'alchemist'], [before, before]); move(s, 1, 2); choose(s, 'use');
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => p.racerId), ['r1', 'r0']);
});
test('CHAR-extra-06 After eliminations the sole remaining Hare receives second rather than skipping forever', () => {
  const s = fixture(['mouth', 'alchemist', 'hare'], [2, 5, 8]); move(s, 0, 3); assert.equal(racer(s, 1).eliminated, true);
  move(s, 0, TRACKS.mild.finish - racer(s).position);
  assert.equal(s.phase, 'results'); assert.deepEqual(s.results.at(-1)?.placements.map(p => [p.racerId, p.rank]), [['r0', 1], ['r2', 2]]);
});
test('CHAR-extra-07 Suckerfish is not offered a follow when Stickler cancels the entire move', () => {
  const before = TRACKS.mild.finish - 1;
  const s = fixture(['stickler', 'alchemist', 'suckerfish'], [5, before, before]); move(s, 1, 2);
  assert.equal(s.pending, undefined); assert.equal(racer(s, 1).position, before); assert.equal(racer(s, 2).position, before);
  assert.ok(!s.logs.some(event => event.type === 'power' && event.source === 'r2'));
});
test('CHAR-extra-08 Suckerfish is not offered a follow for a backward move clamped at Start', () => {
  const s = fixture(['alchemist', 'suckerfish'], [0, 0]); move(s, 0, -2);
  assert.equal(s.pending, undefined); assert.deepEqual(s.racers.map(r => r.position), [0, 0]);
  assert.ok(!s.logs.some(event => event.type === 'power' && event.source === 'r1'));
});
test('CHAR-extra-09 Two adjacent Huge Baby powers exclude an arrival successively', () => {
  const s = fixture(['huge-baby', 'egg', 'alchemist'], [8, 7, 6]); racer(s, 1).flags.power = 'huge-baby'; move(s, 2, 2);
  assert.deepEqual(s.racers.map(r => r.position), [8, 7, 6]);
  assert.deepEqual(s.logs.filter(event => event.type === 'place' && event.targets?.includes('r2')).map(event => event.after?.[0]), [7, 6]);
});
test('WILD-extra-01 Suckerfish can decline the leader arrow then resolve its own arrow', () => {
  const s = fixture(['alchemist', 'suckerfish'], [4, 4]); s.track = 'wild'; move(s, 0, 3); choose(s, 'use');
  assert.equal(s.pending?.kind, 'suckerfish'); choose(s, 'skip');
  assert.deepEqual(s.racers.map(r => r.position), [10, 10]);
  const arrows = s.logs.filter(event => event.type === 'move' && event.cause === 'track-arrow');
  assert.equal(arrows.length, 2); assert.ok(arrows.every(event => event.targets?.length === 1));
});
test('WILD-extra-02 Suckerfish can follow the leader arrow as one simultaneous group', () => {
  const s = fixture(['alchemist', 'suckerfish'], [4, 4]); s.track = 'wild'; move(s, 0, 3); choose(s, 'use'); choose(s, 'use');
  assert.deepEqual(s.racers.map(r => r.position), [10, 10]);
  const arrows = s.logs.filter(event => event.type === 'move' && event.cause === 'track-arrow');
  assert.equal(arrows.length, 1); assert.deepEqual(arrows[0]?.targets, ['r0', 'r1']);
});
test('WILD-extra-03 Huge Baby placement counts as a stop on the destination star', () => {
  const s = fixture(['huge-baby', 'alchemist'], [14, 12]); s.track = 'wild'; move(s, 1, 2);
  assert.equal(racer(s, 1).position, 13); assert.equal(s.players[1]!.score, 1);
});
test('WILD-extra-04 Leaptoad does not collect a star on an occupied space it skips', () => {
  const s = fixture(['leaptoad', 'alchemist'], [0, 1]); s.track = 'wild'; move(s, 0, 1);
  assert.equal(racer(s).position, 2); assert.equal(s.players[0]!.score, 0);
});
test('LOOP-extra-01 Huge Baby and an arrow repeat across a declined Suckerfish response only once', () => {
  // Minimized from the untouched full-game replay seed 82026, round 2.
  // Copycat still holds its pre-motion Suckerfish snapshot until the outer
  // movement's queued refreshCopies boundary, behind this track consequence.
  const s = fixture(['suckerfish', 'huge-baby', 'copycat'], [11, 12, 11]); s.track = 'wild';
  racer(s, 2).flags.copyPower = 'suckerfish'; racer(s, 2).flags.copyTarget = 'r0';
  enqueueMove(s, 'r0', 1, 'test'); s.queue.push({ kind: 'gain', racerId: 'r0', amount: 1 }); resolveTasks(s);
  let responses = 0;
  while (s.pending) {
    assert.ok(responses++ < 8, 'same board and effects across optional response boundaries must not grow forever');
    assert.equal(s.pending.kind, 'suckerfish'); choose(s, 'skip');
  }
  assert.deepEqual(s.racers.map(r => r.position), [11, 12, 11]);
  assert.equal(s.logs.filter(event => event.type === 'loop').length, 1); assert.equal(s.flags.continuation, false);
  assert.equal(s.players[0]!.score, 1, 'unrelated queued work after the looping branch must still resolve');
});
