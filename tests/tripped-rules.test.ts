import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, enqueueMove, resolveTasks } from '../src/engine/index.js';
import type { GameState } from '../src/shared/types.js';

// Independent rule oracles: publisher rulebook p14/p21 (Trébucher,
// Déplacement principal) and IELLO FAQ v2.0 (2026-08-28), Trébuchement,
// Endormimie, Lièvrapide, Duelliste, Hypnotiseur, Hyénarquoise.
// https://iello.fr/wp-content/uploads/2026/02/Magical-Athlete_Rulebook_FR_Light.pdf
// https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/
// The final test explicitly records the web ruling for an ambiguous post-roll
// timing window; it is not promoted to a publisher-confirmed example.
function fixture(characters: string[], positions: number[]): GameState {
  return {
    phase: 'race', round: 1, track: 'mild', currentRacerId: 'r0', turn: 0, turnCount: 0,
    players: characters.map((_, index) => ({ id: `p${index}`, name: `Player ${index}`, seat: index, color: '#000', ready: true, connected: true, score: 0, hand: [], used: [], selection: [] })),
    racers: characters.map((characterId, index) => ({ id: `r${index}`, playerId: `p${index}`, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })),
    queue: [], logs: [], results: [], deck: [], discard: [], flags: {}, randomLog: [], rngState: 1234,
  };
}
function begin(game: GameState) { game.queue.push({ kind: 'beginTurn', racerId: 'r0' }); resolveTasks(game); }
function choose(game: GameState, optionId: string) {
  assert.ok(game.pending, 'Expected a legal skill choice.');
  applyGameAction(game, game.pending.playerId, { type: 'choose', choiceId: game.pending.id, optionId });
}
function noMainDie(game: GameState) { assert.equal(game.logs.some(event => event.type === 'die' || event.type === 'roll'), false); }

test('a tripped racer stands instead of rolling; main-roll predictions and replacements cannot bypass recovery', () => {
  for (const character of ['alchemist', 'legs', 'flip-flop', 'genius', 'rocket-scientist', 'magician', 'sisyphus']) {
    const game = fixture([character, 'coach'], [8, 20]); game.racers[0]!.tripped = true; begin(game);
    assert.equal(game.racers[0]!.position, 8, character); assert.equal(game.racers[0]!.tripped, false, character);
    assert.equal(game.pending, undefined, character); assert.equal(game.flags.awaitRoll, false, character);
    assert.ok(game.logs.some(event => event.type === 'recover' && event.source === 'r0'), character); noMainDie(game);
  }
});

test('a tripped Lovable Loser scores at turn start before standing up', () => {
  const game = fixture(['lovable-loser', 'coach', 'banana'], [2, 10, 20]); game.racers[0]!.tripped = true; begin(game);
  assert.equal(game.players[0]!.score, 1); assert.equal(game.racers[0]!.position, 2); assert.equal(game.racers[0]!.tripped, false);
  assert.ok(game.logs.findIndex(event => event.type === 'score') < game.logs.findIndex(event => event.type === 'recover')); noMainDie(game);
});

test('a tripped Cheerleader can use its turn-start movements before standing', () => {
  const game = fixture(['cheerleader', 'coach', 'banana'], [2, 10, 20]); game.racers[0]!.tripped = true; begin(game);
  assert.equal(game.pending?.kind, 'cheerleader'); choose(game, 'use');
  assert.equal(game.racers[0]!.position, 5); assert.equal(game.racers[0]!.tripped, false);
  const movements = game.logs.filter(event => event.type === 'move' && event.targets?.includes('r0'));
  assert.deepEqual(movements.map(event => [event.before?.[0], event.after?.[0]]), [[2, 4], [4, 5]]); noMainDie(game);
});

test('Hypnotist tripping itself during its turn-start power stands during this same turn', () => {
  const game = fixture(['hypnotist', 'baba-yaga', 'coach'], [5, 12, 20]); begin(game); choose(game, 'r1');
  assert.equal(game.racers[0]!.position, 5); assert.equal(game.racers[1]!.position, 5); assert.equal(game.racers[0]!.tripped, false);
  const trip = game.logs.findIndex(event => event.type === 'trip' && event.targets?.includes('r0'));
  const recovery = game.logs.findIndex(event => event.type === 'recover' && event.source === 'r0');
  assert.ok(trip >= 0 && recovery > trip); noMainDie(game);
});

test('a tripped Mastermind still makes its mandatory first-turn prediction', () => {
  const game = fixture(['mastermind', 'coach', 'banana'], [2, 10, 20]); game.racers[0]!.tripped = true; begin(game);
  assert.equal(game.pending?.kind, 'mastermind'); choose(game, 'r0');
  assert.equal(game.racers[0]!.flags.prediction, 'r0'); assert.equal(game.racers[0]!.tripped, false); noMainDie(game);
});

test('a tripped Third Wheel can teleport at turn start and then stand without a main die', () => {
  const game = fixture(['third-wheel', 'coach', 'banana'], [2, 10, 10]); game.racers[0]!.tripped = true; begin(game);
  assert.equal(game.pending?.kind, 'third-wheel'); choose(game, '10');
  assert.equal(game.racers[0]!.position, 10); assert.equal(game.racers[0]!.tripped, false);
  assert.ok(game.logs.some(event => event.type === 'warp' && event.targets?.includes('r0'))); noMainDie(game);
});

test('a tripped Banana retains its passive power and trips a racer only after that full movement', () => {
  const game = fixture(['alchemist', 'banana', 'coach'], [2, 4, 20]); game.racers[1]!.tripped = true;
  enqueueMove(game, 'r0', 4); resolveTasks(game);
  assert.equal(game.racers[0]!.position, 6); assert.equal(game.racers[0]!.tripped, true); assert.equal(game.racers[1]!.tripped, true);
  assert.ok(game.logs.findIndex(event => event.type === 'move') < game.logs.findIndex(event => event.type === 'trip'));
});

test('a tripped Gunk still applies its continuous modifier to another main move', () => {
  const game = fixture(['alchemist', 'gunk', 'banana'], [8, 15, 20]); game.racers[1]!.tripped = true; game.flags.testDice = [3]; begin(game);
  applyGameAction(game, 'p0', { type: 'roll' });
  assert.equal(game.racers[0]!.position, 10); assert.equal(game.lastRoll?.face, 3); assert.equal(game.lastRoll?.distance, 2);
  assert.equal(game.racers[1]!.tripped, true);
});

test('a tripped Scoocher moves in response to another power and remains tripped', () => {
  const game = fixture(['lovable-loser', 'scoocher', 'coach'], [0, 4, 20]); game.racers[1]!.tripped = true; begin(game);
  assert.equal(game.racers[1]!.position, 5); assert.equal(game.racers[1]!.tripped, true);
  assert.equal(game.logs.some(event => event.type === 'recover' && event.source === 'r1'), false);
});

test('an externally moved tripped racer follows a wild arrow without recovering', () => {
  const game = fixture(['coach', 'alchemist', 'banana'], [20, 6, 25]); game.track = 'wild'; game.racers[1]!.tripped = true;
  enqueueMove(game, 'r1', 1); resolveTasks(game);
  assert.equal(game.racers[1]!.position, 10); assert.equal(game.racers[1]!.tripped, true);
  assert.ok(game.logs.some(event => event.type === 'move' && event.cause === 'track-arrow')); noMainDie(game);
});

test('a tripped Duelist can roll and win a duel before using its main action to stand', () => {
  const game = fixture(['duelist', 'lackey', 'inchworm', 'skipper'], [5, 5, 12, 18]); game.racers[0]!.tripped = true; game.flags.testDice = [6, 1]; begin(game);
  assert.equal(game.pending?.kind, 'duelist'); choose(game, 'r1'); choose(game, 'roll'); choose(game, 'roll');
  assert.equal(game.racers[0]!.position, 7); assert.equal(game.racers[0]!.tripped, false);
  assert.deepEqual(game.racers.slice(1).map(racer => racer.position), [5, 12, 18]);
  assert.ok(game.logs.some(event => event.type === 'duel')); noMainDie(game);
  assert.equal(game.logs.some(event => event.type === 'power' && ['lackey', 'inchworm', 'skipper'].includes(event.cause ?? '')), false);
});

test('a tripped duel opponent can roll a winning six, move two, and remain tripped outside its own turn', () => {
  const game = fixture(['duelist', 'lackey', 'inchworm', 'skipper'], [5, 5, 12, 18]); game.racers[1]!.tripped = true; game.flags.testDice = [1, 6]; begin(game); choose(game, 'r1'); choose(game, 'roll'); choose(game, 'roll');
  assert.equal(game.racers[1]!.position, 7); assert.equal(game.racers[1]!.tripped, true);
  assert.deepEqual(game.racers.slice(2).map(racer => racer.position), [12, 18]); noMainDie(game);
  assert.equal(game.flags.awaitRoll, true); // Duelist still has its ordinary main action.
});

test('Hare that starts alone in the lead skips its main action and stays tripped', () => {
  const game = fixture(['hare', 'alchemist', 'coach'], [10, 8, 2]); game.racers[0]!.tripped = true; begin(game);
  assert.equal(game.racers[0]!.position, 10); assert.equal(game.racers[0]!.tripped, true);
  assert.ok(game.logs.some(event => event.type === 'skip')); assert.equal(game.logs.some(event => event.type === 'recover'), false); noMainDie(game);
});

test('standing still to recover can trigger a tripped Heckler which moves but remains down', () => {
  const game = fixture(['alchemist', 'heckler', 'coach'], [5, 12, 20]); game.racers[0]!.tripped = true; game.racers[1]!.tripped = true; begin(game);
  assert.equal(game.racers[0]!.position, 5); assert.equal(game.racers[0]!.tripped, false);
  assert.equal(game.racers[1]!.position, 14); assert.equal(game.racers[1]!.tripped, true); noMainDie(game);
});

test('WEB RULING, not official example: a post-roll Lackey chain can trip Scoocher while the already-started main action still completes', () => {
  const game = fixture(['scoocher', 'lackey', 'baba-yaga', 'alchemist'], [4, 0, 5, 20]); game.flags.testDice = [6]; begin(game);
  applyGameAction(game, 'p0', { type: 'roll' });
  assert.equal(game.racers[0]!.position, 12); assert.equal(game.racers[0]!.tripped, true);
  assert.equal(game.lastRoll?.face, 6); assert.equal(game.lastRoll?.distance, 6);
  const moves = game.logs.filter(event => event.type === 'move').map(event => ({ cause: event.cause, before: event.before, after: event.after }));
  assert.deepEqual(moves, [
    { cause: 'lackey', before: [0], after: [2] },
    { cause: 'scoocher', before: [4], after: [5] },
    { cause: 'scoocher', before: [5], after: [6] },
    { cause: 'main', before: [6], after: [12] },
  ]);
  assert.ok(game.logs.findIndex(event => event.type === 'trip') < game.logs.findIndex(event => event.type === 'move' && event.cause === 'main'));
  assert.equal(game.logs.some(event => event.type === 'recover' && event.source === 'r0'), false);
});
