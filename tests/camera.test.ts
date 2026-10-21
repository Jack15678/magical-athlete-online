import test from 'node:test';
import assert from 'node:assert/strict';
import type { Racer, RoomView } from '../src/shared/types.js';
import type { PresentationBeat } from '../src/client/presentation.js';
import { actionFocus, cameraFrame, choiceFocus, ownFocus, pawnOccupancy } from '../src/client/scene/camera.js';
import { boardPoint } from '../src/client/scene/math.js';

const racer = (id: string, playerId: string, position: number): Racer => ({ id, playerId, characterId: 'coach', position, tripped: false, finished: false, eliminated: false, flags: {} });
const racers = [racer('a', 'me', 2), racer('b', 'other', 14), racer('c', 'me', 7)];
const room: RoomView = { code: 'CAMERA', version: 1, hostId: 'me', selfId: 'me', maxPlayers: 8, timeoutSeconds: 0, deadline: null, phase: 'race', round: 1, track: 'wild', players: [], racers, currentRacerId: 'b', logs: [], results: [], rulesStatus: 'test' };
function beat(key: string, chainId: string, source: string, from: number, to: number): PresentationBeat {
  return { key, chainId, kind: 'move', source, targets: [source], motions: [{ racerId: source, from, to, path: Array.from({ length: to - from + 1 }, (_, index) => from + index) }], events: [], durationMs: 1000 };
}

test('the default camera follows my live racer and switches to my active racer', () => {
  assert.deepEqual(ownFocus(room, racers), { state: 'self', ids: ['a'], positions: [2] });
  assert.deepEqual(ownFocus({ ...room, currentRacerId: 'c' }, racers), { state: 'self', ids: ['c'], positions: [7] });
  assert.deepEqual(ownFocus(room, racers.map(value => ({ ...value, finished: value.id === 'a' }))).ids, ['c']);
});

test('one confirmed chain frames its actor, full movement path and reactions, excluding later turns', () => {
  const move = beat('move', 'turn1', 'b', 14, 20);
  const reaction = beat('reaction', 'turn1', 'a', 2, 4);
  const otherTurn = beat('later', 'turn2', 'c', 7, 30);
  const focus = actionFocus(move, racers, [move, reaction, otherTurn]);
  assert.equal(focus.chainId, 'turn1');
  assert.deepEqual(focus.ids, ['b', 'a']);
  assert.ok(focus.positions.includes(14) && focus.positions.includes(20) && focus.positions.includes(2) && focus.positions.includes(4));
  assert.ok(!focus.positions.includes(30));
});

test('a local pending choice shows all legal public targets and ignores another player choice', () => {
  const pending = { id: 'choice', playerId: 'me', racerId: 'a', title: '交换', kind: 'flip-flop', optional: true, options: [{ id: 'b', label: '对手' }, { id: 'c', label: '队友' }, { id: 'skip', label: '跳过' }] };
  assert.deepEqual(choiceFocus({ ...room, pending }, racers), { state: 'choice', ids: ['a', 'b', 'c'], positions: [2, 14, 7] });
  assert.equal(choiceFocus({ ...room, pending: { ...pending, playerId: 'other' } }, racers), undefined);
  assert.deepEqual(choiceFocus({ ...room, pending: { ...pending, kind: 'third-wheel', options: [{ id: '17', label: '17格' }, { id: '24', label: '24格' }] } }, racers)?.positions, [2, 17, 24]);
});

test('phone and desktop focus zoom in near me while panorama contains every track cell', () => {
  for (const [compact, width, height] of [[false, 1440, 900], [true, 390, 844]] as const) {
    const self = cameraFrame([2], compact, width, height);
    const overview = cameraFrame([], compact, width, height, true);
    assert.ok(self.zoom > overview.zoom, 'my nearby track must be larger than panorama');
    const actor = boardPoint(2, compact);
    assert.equal(self.x, actor[0]); assert.equal(self.z, actor[2]);
    for (let position = 0; position <= 30; position++) {
      const point = boardPoint(position, compact);
      assert.ok(Math.abs(point[0] - overview.x) * overview.zoom < width / 2 - 12);
      assert.ok(Math.abs(point[2] - overview.z) * .765 * overview.zoom < height / 2 - 80);
    }
    const action = cameraFrame([0, 12, 15, 30], compact, width, height);
    assert.ok(action.zoom < self.zoom, 'a distant chain should pull back to include its path');
    assert.ok(Number.isFinite(action.zoom) && action.zoom > 0);
  }
});

test('eight racers sharing one cell stay distinct at a readable pawn scale', () => {
  const crowd = Array.from({ length: 8 }, (_, index) => racer(String(index), String(index), 12));
  const placements = crowd.map(value => pawnOccupancy(value, crowd, 12));
  assert.equal(new Set(placements.map(value => `${value.x}:${value.z}`)).size, 8);
  for (const value of placements) { assert.ok(value.scale >= .8); assert.ok(Math.abs(value.x) <= .8 && Math.abs(value.z) <= .8); }
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    assert.ok(Math.hypot(placements[i]!.x - placements[j]!.x, placements[i]!.z - placements[j]!.z) >= .57);
  }
});
