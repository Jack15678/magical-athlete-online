import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameAction, resolveTasks } from '../src/engine/index.js';
import { decideAI } from '../src/engine/ai.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameState, Room } from '../src/shared/types.js';

function fixture(faces = [6, 2]): GameState {
  return {
    phase: 'race', round: 1, track: 'mild', currentRacerId: 'r0', turn: 0, turnCount: 0,
    players: ['p0', 'p1', 'p2'].map((id, seat) => ({ id, name: id, seat, color: '#000', ready: true, connected: true, score: 0, hand: [], used: [], selection: [] })),
    racers: ['duelist', 'alchemist', 'coach'].map((characterId, index) => ({ id: `r${index}`, playerId: `p${index}`, characterId, position: index < 2 ? 5 : 20, tripped: false, finished: false, eliminated: false, flags: {} })),
    queue: [], logs: [], results: [], deck: [], discard: [], flags: { testDice: [...faces] }, randomLog: [], rngState: 1234,
  };
}
function begin(game: GameState) { game.queue.push({ kind: 'beginTurn', racerId: 'r0' }); resolveTasks(game); }
function choose(game: GameState, optionId: string, playerId = game.pending!.playerId) {
  assert.ok(game.pending); applyGameAction(game, playerId, { type: 'choose', choiceId: game.pending.id, optionId });
}
function duel(game: GameState) { begin(game); choose(game, 'r1'); }
function room(game: GameState): Room { return { code: 'ABC234', hostId: 'p0', createdAt: 0, updatedAt: 0, version: 1, maxPlayers: 3, timeoutSeconds: 0, deadline: null, game }; }
const options = { authorityId: 'p0', authorityOnline: true };

test('accepting a duel asks the initiator to roll without generating either die or moving', () => {
  const game = fixture(); duel(game);
  assert.equal(game.pending?.kind, 'duel-roll'); assert.equal(game.pending?.playerId, 'p0'); assert.equal(game.pending?.racerId, 'r0');
  assert.deepEqual(game.pending?.options, [{ id: 'roll', label: '掷决斗骰' }]); assert.equal(game.pending?.optional, false);
  assert.equal(game.randomLog.length, 0); assert.deepEqual(game.racers.map(racer => racer.position), [5, 5, 20]);
  assert.equal(game.logs.some(event => ['duel', 'duel-dice', 'move'].includes(event.type)), false);
});

test('each participant must submit its own click; the first face stays private until the opponent rolls', () => {
  const game = fixture(); duel(game); const initialChoice = game.pending!.id;
  assert.throws(() => choose(game, 'roll', 'p1'), /对应玩家/); assert.equal(game.randomLog.length, 0);
  choose(game, 'roll', 'p0');
  assert.equal(game.randomLog.length, 1); assert.equal(game.pending?.kind, 'duel-roll'); assert.equal(game.pending?.playerId, 'p1');
  assert.equal(game.pending?.racerId, 'r1'); assert.notEqual(game.pending?.id, initialChoice);
  assert.equal(game.pending?.context.firstFace, 6); assert.deepEqual(game.racers.map(racer => racer.position), [5, 5, 20]);
  assert.equal(game.logs.some(event => event.type === 'duel-dice' || event.type === 'duel'), false);
  for (const id of ['p0', 'p1', 'p2']) {
    const view = projectRoom(room(game), id, options);
    assert.equal(JSON.stringify(view).includes('firstFace'), false);
    assert.equal(view.logs.some(event => event.faces?.length), false);
    assert.equal('context' in (view.pending ?? {}), false);
  }
  assert.equal(projectRoom(room(game), 'p0', options).pending, undefined);
  assert.equal(projectRoom(room(game), 'p1', options).pending?.kind, 'duel-roll');
  assert.throws(() => choose(game, 'roll', 'p0'), /对应玩家/); assert.equal(game.randomLog.length, 1);
});

test('the second click publishes both faces together, then the existing duel result and winner move', () => {
  const game = fixture(); duel(game); choose(game, 'roll'); choose(game, 'roll');
  const paired = game.logs.find(event => event.type === 'duel-dice')!;
  assert.deepEqual(paired.targets, ['r0', 'r1']); assert.deepEqual(paired.faces, [6, 2]); assert.equal(paired.source, 'r0');
  const pairIndex = game.logs.indexOf(paired), resultIndex = game.logs.findIndex(event => event.type === 'duel');
  const powerIndex = game.logs.findIndex(event => event.type === 'power' && event.cause === 'duelist');
  const moveIndex = game.logs.findIndex(event => event.type === 'move' && event.cause === 'duelist');
  assert.ok(pairIndex < resultIndex && resultIndex < powerIndex && powerIndex < moveIndex);
  assert.equal(game.randomLog.length, 2); assert.deepEqual(game.racers.map(racer => racer.position), [7, 5, 20]);
  assert.equal(game.logs.some(event => event.type === 'die' || event.type === 'roll'), false);
  assert.equal(game.lastRoll, undefined);
});

test('a tied pair still awards the Duelist two spaces', () => {
  const game = fixture([3, 3]); duel(game); choose(game, 'roll'); choose(game, 'roll');
  assert.deepEqual(game.logs.find(event => event.type === 'duel-dice')?.faces, [3, 3]);
  assert.deepEqual(game.racers.map(racer => racer.position), [7, 5, 20]);
});

test('a tripped opponent can click and win its duel without recovering outside its own turn', () => {
  const game = fixture([1, 6]); game.racers[1]!.tripped = true; duel(game); choose(game, 'roll'); choose(game, 'roll');
  assert.equal(game.racers[1]!.position, 7); assert.equal(game.racers[1]!.tripped, true);
  assert.equal(game.logs.some(event => event.type === 'recover' && event.source === 'r1'), false);
});

test('saving after the first click preserves its hidden face and resumes only the second participant', () => {
  let game = fixture([4, 2]); duel(game); choose(game, 'roll'); const oldChoice = game.pending!.id;
  game = JSON.parse(JSON.stringify(game)) as GameState;
  assert.equal(game.pending?.playerId, 'p1'); assert.equal(game.pending?.context.firstFace, 4); assert.equal(game.randomLog.length, 1);
  choose(game, 'roll'); assert.equal(game.randomLog.length, 2);
  assert.deepEqual(game.logs.find(event => event.type === 'duel-dice')?.faces, [4, 2]);
  assert.throws(() => applyGameAction(game, 'p1', { type: 'choose', choiceId: oldChoice, optionId: 'roll' }), /过期/);
  assert.equal(game.randomLog.length, 2);
});

test('AI automatically chooses its own required duel roll without seeing the other hidden face', () => {
  const game = fixture(); game.players[0]!.isAI = true; game.players[1]!.isAI = true; duel(game);
  const firstView = projectRoom(room(game), 'p0', options); const first = decideAI(firstView)!;
  assert.deepEqual(first, { type: 'choose', choiceId: game.pending!.id, optionId: 'roll' });
  applyGameAction(game, 'p0', first);
  assert.equal(decideAI(projectRoom(room(game), 'p0', options)), undefined);
  const secondView = projectRoom(room(game), 'p1', options); const second = decideAI(secondView)!;
  assert.equal(JSON.stringify(secondView).includes('firstFace'), false);
  assert.deepEqual(second, { type: 'choose', choiceId: game.pending!.id, optionId: 'roll' });
  applyGameAction(game, 'p1', second); assert.deepEqual(game.logs.find(event => event.type === 'duel-dice')?.faces, [6, 2]);
});

test('two racers controlled by the same player still require two distinct roll choices', () => {
  const game = fixture(); game.racers[1]!.playerId = 'p0'; duel(game); const first = game.pending!.id;
  choose(game, 'roll'); assert.equal(game.pending?.playerId, 'p0'); assert.equal(game.pending?.racerId, 'r1');
  assert.notEqual(game.pending?.id, first); assert.equal(game.randomLog.length, 1);
  choose(game, 'roll'); assert.equal(game.randomLog.length, 2); assert.deepEqual(game.logs.find(event => event.type === 'duel-dice')?.faces, [6, 2]);
});

test('declining the initial optional duel consumes neither die', () => {
  const game = fixture(); begin(game); choose(game, 'skip');
  assert.equal(game.pending, undefined); assert.equal(game.randomLog.length, 0); assert.equal(game.flags.awaitRoll, true);
});
