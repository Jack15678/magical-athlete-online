import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, enqueueMove, resolveTasks } from '../src/engine/index.js';
import type { GameEvent, GameState, Racer, RoomView } from '../src/shared/types.js';
import { beatDuration, completeBeat, confirmedFace, createPlayback, receiveRoom, skipPlayback, trackPath } from '../src/client/presentation.js';

function racer(id: string, position = 0): Racer { return { id, playerId: `p${id}`, characterId: 'coach', position, tripped: false, finished: false, eliminated: false, flags: {} }; }
function view(version = 1, logs: GameEvent[] = [], racers = [racer('a'), racer('b')]): RoomView {
  return { code: 'TEST', version, hostId: 'pa', selfId: 'pa', maxPlayers: 8, timeoutSeconds: 0, deadline: null, phase: 'race', round: 1, track: 'mild', players: [], racers, currentRacerId: 'a', logs, results: [], rulesStatus: 'test' };
}
function motion(id: number, targets: string[], before: number[], after: number[], detail: Partial<GameEvent> = {}): GameEvent {
  return { id, type: 'move', text: '已确认移动', source: targets[0], targets, before, after, group: `g${id}`, ...detail };
}
const die = (id: number, face: number): GameEvent => ({ id, type: 'die', source: 'a', text: `教练掷出${face}` });
const roll = (id: number, face: number): GameEvent => ({ id, type: 'roll', source: 'a', text: `教练最终骰面为${face}` });

test('initial snapshots restore the confirmed board without replaying historical dice', () => {
  const room = view(9, [die(1, 6), roll(2, 6), motion(3, ['a'], [0], [6])], [racer('a', 6)]);
  const state = createPlayback(room);
  assert.equal(state.eventCursor, 3);
  assert.equal(state.queue.length, 0);
  assert.equal(state.racers[0]?.position, 6);
});

test('a throw settles once before every simultaneous target moves along the track', () => {
  const initial = view(1, [], [racer('a', 2), racer('b', 8)]);
  const events = [die(1, 6), roll(2, 6), motion(3, ['a', 'b'], [2, 8], [8, 2])];
  const confirmed = view(2, events, [racer('a', 8), racer('b', 2)]);
  let state = receiveRoom(createPlayback(initial), confirmed);
  assert.deepEqual(state.queue.map(beat => beat.kind), ['dice', 'move']);
  assert.equal(state.queue[0]?.face, 6);
  assert.equal(state.queue[0]?.durationMs, 2500);
  assert.deepEqual(state.racers.map(value => value.position), [2, 8]);
  state = completeBeat(state);
  assert.deepEqual(state.racers.map(value => value.position), [2, 8]);
  assert.deepEqual(state.queue[0]?.motions.map(value => value.path), [[2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2]]);
  state = completeBeat(state);
  assert.deepEqual(state.racers.map(value => value.position), [8, 2]);
  assert.equal(state.queue.length, 0);
});

test('duplicate/reordered snapshots cannot replay a queued or completed event', () => {
  const initial = view();
  const next = view(2, [die(1, 2), roll(2, 2), motion(3, ['a'], [0], [2])], [racer('a', 2), racer('b')]);
  let state = receiveRoom(createPlayback(initial), next);
  const same = receiveRoom(state, structuredClone(next));
  assert.equal(same, state);
  assert.equal(receiveRoom(state, initial), state);
  while (state.queue.length) state = completeBeat(state);
  state = receiveRoom(state, { ...next, version: 3 });
  assert.equal(state.queue.length, 0);
  assert.equal(state.eventCursor, 3);
});

test('new confirmed actions append behind the current presentation without losing either move', () => {
  let state = receiveRoom(createPlayback(view()), view(2, [motion(1, ['a'], [0], [2])], [racer('a', 2), racer('b')]));
  state = receiveRoom(state, view(3, [motion(1, ['a'], [0], [2]), motion(2, ['a'], [2], [5])], [racer('a', 5), racer('b')]));
  assert.equal(state.queue.length, 2);
  assert.equal(state.racers[0]?.position, 0);
  state = completeBeat(state);
  assert.equal(state.racers[0]?.position, 2);
  state = completeBeat(state);
  assert.equal(state.racers[0]?.position, 5);
});

test('reroll choices across snapshots preserve real throws and suppress only their confirmation', () => {
  let state = receiveRoom(createPlayback(view()), view(2, [die(1, 4)]));
  state = completeBeat(state);
  state = receiveRoom(state, view(3, [die(1, 4), { id: 2, type: 'reroll', source: 'a', text: '教练舍弃4，选择重掷' }, die(3, 4), roll(4, 4), motion(5, ['a'], [0], [4])], [racer('a', 4), racer('b')]));
  assert.deepEqual(state.queue.map(beat => beat.kind), ['skill', 'dice', 'move']);
  assert.equal(state.queue.filter(beat => beat.kind === 'dice').length, 1);
  assert.equal(state.queue.find(beat => beat.kind === 'dice')?.events[0]?.id, 3);
  const keep = receiveRoom(completeBeat(receiveRoom(createPlayback(view()), view(2, [die(1, 4)]))), view(3, [die(1, 4), roll(2, 4), motion(3, ['a'], [0], [4])], [racer('a', 4), racer('b')]));
  assert.deepEqual(keep.queue.map(beat => beat.kind), ['move']);
  const restoredAtChoice = createPlayback(view(2, [die(1, 4)]));
  const restoredKeep = receiveRoom(restoredAtChoice, view(3, [die(1, 4), roll(2, 4), motion(3, ['a'], [0], [4])], [racer('a', 4), racer('b')]));
  assert.deepEqual(restoredKeep.queue.map(beat => beat.kind), ['move']);
});

test('real engine skill chains retain rule order and only apply trip after the movement beat', () => {
  const players = Array.from({ length: 3 }, (_, seat) => ({ id: `p${seat}`, name: `玩家${seat}`, seat, color: '#000', ready: true, connected: true, score: 0, hand: [], used: [], selection: [] }));
  const game = createGame(players, 8);
  game.phase = 'race'; game.round = 1; game.currentRacerId = 'r0';
  game.racers = ['centaur', 'banana', 'coach'].map((characterId, index) => ({ ...racer(`r${index}`, [2, 4, 6][index]), playerId: `p${index}`, characterId }));
  const project = (state: GameState, version: number) => view(version, structuredClone(state.logs), structuredClone(state.racers));
  const initial = project(game, 1);
  enqueueMove(game, 'r0', 6); resolveTasks(game);
  const confirmed = project(game, 2);
  let state = receiveRoom(createPlayback(initial), confirmed);
  assert.equal(state.queue[0]?.kind, 'move');
  assert.deepEqual(state.queue.flatMap(beat => beat.events.map(event => event.id)), game.logs.filter(event => ['move', 'warp', 'place', 'power', 'trip', 'score', 'finish', 'eliminate'].includes(event.type)).map(event => event.id));
  assert.equal(state.racers[0]?.tripped, false);
  state = completeBeat(state);
  assert.equal(state.racers[0]?.position, 8);
  assert.equal(state.racers[0]?.tripped, false);
  const observed: string[] = [];
  while (state.queue.length) { observed.push(state.queue[0]!.kind); state = completeBeat(state); }
  assert.ok(observed.includes('trip'));
  assert.deepEqual(state.racers, confirmed.racers);
});

test('teleports and swaps retain simultaneous destinations without walking intervening cells', () => {
  let state = receiveRoom(createPlayback(view(1, [], [racer('a', 2), racer('b', 18)])), view(2, [motion(1, ['a', 'b'], [2, 18], [18, 2], { type: 'warp', cause: 'flip-flop' })], [racer('a', 18), racer('b', 2)]));
  assert.equal(state.queue[0]?.kind, 'swap');
  assert.deepEqual(state.queue[0]?.motions.map(value => value.path), [[2, 18], [18, 2]]);
  state = completeBeat(state);
  assert.deepEqual(state.racers.map(value => value.position), [18, 2]);
});

test('reconnect, skipped animation, and missing event windows restore identical confirmed state', () => {
  const confirmed = view(20, [die(1, 6), roll(2, 6), motion(3, ['a'], [0], [6])], [racer('a', 6), racer('b')]);
  const queued = receiveRoom(createPlayback(view()), confirmed);
  for (const restored of [receiveRoom(queued, confirmed, { reconnect: true }), skipPlayback(queued), receiveRoom(createPlayback(view()), { ...confirmed, logs: [motion(3, ['a'], [0], [6])] }), receiveRoom(createPlayback(view()), { ...confirmed, logs: [die(1, 6), motion(3, ['a'], [0], [6])] })]) {
    assert.equal(restored.queue.length, 0);
    assert.deepEqual(restored.racers, confirmed.racers);
    assert.equal(restored.eventCursor, 3);
  }
  assert.equal(confirmed.racers[0]?.position, 6);
});

test('race reveal reconstructs the start before fresh pre-race abilities and a new round resets old work', () => {
  const selection = { ...view(1), phase: 'selection' as const, racers: [] };
  const raced = view(2, [{ id: 1, type: 'reveal', text: '运动员揭示' }, { id: 2, type: 'power', text: '技能发动', source: 'a' }, motion(3, ['a'], [0], [3])], [racer('a', 3), racer('b')]);
  let state = receiveRoom(createPlayback(selection), raced);
  assert.equal(state.racers[0]?.position, 0);
  assert.deepEqual(state.queue.map(beat => beat.kind), ['skill', 'move']);
  state = receiveRoom(state, { ...raced, version: 3, round: 2, phase: 'selection' });
  assert.equal(state.queue.length, 0);
});

test('simultaneous groups remain one beat while later groups and abilities stay ordered', () => {
  const logs = [motion(1, ['a'], [0], [2], { group: 'g1' }), motion(2, ['b'], [0], [2], { group: 'g1' }), { id: 3, type: 'power', text: '连锁发动', source: 'a' }, motion(4, ['a'], [2], [4], { group: 'g2' })];
  const state = receiveRoom(createPlayback(view()), view(2, logs, [racer('a', 4), racer('b', 2)]));
  assert.deepEqual(state.queue.map(beat => beat.kind), ['move', 'skill', 'move']);
  assert.equal(state.queue[0]?.motions.length, 2);
  assert.deepEqual(state.queue[0]?.events.map(event => event.id), [1, 2]);
});

test('presentation speed and reduced motion only change durations, never final rule state', () => {
  const room = view(2, [die(1, 3), roll(2, 3), motion(3, ['a'], [0], [3])], [racer('a', 3), racer('b')]);
  const state = receiveRoom(createPlayback(view()), room);
  const diceBeat = state.queue[0]!;
  assert.equal(beatDuration(diceBeat), 2500);
  assert.equal(beatDuration(diceBeat, { speed: 2 }), 1250);
  assert.equal(beatDuration(diceBeat, { speed: 2, reducedMotion: true }), 200);
  assert.equal(confirmedFace({ id: 1, type: 'die', text: '第6号运动员掷出2', source: 'a' }), 2);
  assert.equal(confirmedFace({ id: 2, type: 'die', text: '运动员掷出9', source: 'a' }), undefined);
  assert.deepEqual(trackPath(4, 1), [4, 3, 2, 1]);
  assert.deepEqual(trackPath(2, 2), [2]);
  assert.deepEqual(skipPlayback(state).racers, room.racers);
});

test('server turn boundaries keep movement and reaction chains together across snapshots', () => {
  const events: GameEvent[] = [{ id: 1, type: 'turn', text: '轮到a', source: 'a' }, motion(2, ['a'], [0], [4]), { id: 3, type: 'power', text: 'b反应', source: 'b' }, motion(4, ['b'], [0], [2])];
  let state = receiveRoom(createPlayback(view()), view(2, events, [racer('a', 4), racer('b', 2)]));
  assert.equal(new Set(state.queue.map(beat => beat.chainId)).size, 1);
  const chainId = state.queue[0]!.chainId;
  state = completeBeat(state);
  const next: GameEvent[] = [...events, { id: 5, type: 'turn', text: '轮到b', source: 'b' }, motion(6, ['b'], [2], [5])];
  state = receiveRoom(state, view(3, next, [racer('a', 4), racer('b', 5)]));
  assert.equal(state.queue[0]!.chainId, chainId);
  assert.notEqual(state.queue.at(-1)!.chainId, chainId);
});

test('long chains and incoming AI turns have bounded playback without discarding confirmed events', () => {
  const events: GameEvent[] = Array.from({ length: 40 }, (_, index) => motion(index + 1, ['a'], [index % 2 ? 8 : 0], [index % 2 ? 0 : 8]));
  let state = receiveRoom(createPlayback(view()), view(2, events));
  assert.equal(state.queue.length, 40);
  assert.ok(state.queue.reduce((sum, beat) => sum + beat.durationMs, 0) <= 9000);
  const activeDuration = state.queue[0]!.durationMs;
  const allEvents: GameEvent[] = [...events, ...Array.from({ length: 60 }, (_, index) => index % 2 ? motion(index + 41, ['b'], [0], [6]) : { id: index + 41, type: 'turn', text: 'AI行动', source: 'b' })];
  state = receiveRoom(state, view(3, allEvents));
  assert.equal(state.queue[0]!.durationMs, activeDuration, 'arrival must never restart or retime a beat already playing');
  assert.ok(state.queue.reduce((sum, beat) => sum + beat.durationMs, 0) <= 11000);
  assert.deepEqual(state.queue.flatMap(beat => beat.events.map(event => event.id)), allEvents.filter(event => event.type === 'move').map(event => event.id));
  while (state.queue.length) state = completeBeat(state);
  assert.deepEqual(state.racers, state.confirmed.racers);
});

test('my turn-start choice skips unrelated backlog and restores the complete confirmed board immediately', () => {
  const initial = view();
  const pending = { id: 'my-start', playerId: initial.selfId, racerId: 'a', kind: 'hypnotist', title: '选择召唤对象', optional: true, options: [{ id: 'b', label: '对手' }] };
  const events: GameEvent[] = [{ id: 1, type: 'die', source: 'b', text: '对手掷出6' }, motion(2, ['b'], [0], [6]), { id: 3, type: 'turn', source: 'a', text: '轮到我' }];
  const confirmed = { ...view(2, events, [racer('a', 2), { ...racer('b', 6), tripped: true }]), pending };
  const state = receiveRoom(createPlayback(initial), confirmed);
  assert.equal(state.queue.length, 0);
  assert.deepEqual(state.racers, confirmed.racers);
  assert.equal(state.confirmed.pending?.id, pending.id);
  assert.deepEqual(confirmed.logs, events, 'prioritizing a prompt cannot change server events');
});

test('my own die settles before its resulting skill choice and later unrelated beats do not delay it', () => {
  const initial = view();
  const pending = { id: 'after-die', playerId: initial.selfId, racerId: 'a', kind: 'alchemist', title: '炼金加速？', optional: true, options: [{ id: 'use', label: '使用' }] };
  const confirmed = { ...view(2, [die(1, 2), { id: 2, type: 'power', source: 'b', text: '其他人的技能' }]), pending };
  let state = receiveRoom(createPlayback(initial), confirmed);
  assert.equal(state.queue[0]?.kind, 'dice');
  assert.equal(state.queue[0]?.durationMs, 2500);
  state = completeBeat(state);
  assert.equal(state.queue.length, 0);
  assert.deepEqual(state.racers, confirmed.racers);
  assert.equal(state.confirmed.pending?.id, pending.id);
  const otherChoice = receiveRoom(createPlayback(initial), { ...confirmed, pending: { ...pending, playerId: 'pb', racerId: 'b' } });
  assert.equal(otherChoice.queue[0]?.kind, 'dice', 'another player choice never steals my presentation camera');
});
