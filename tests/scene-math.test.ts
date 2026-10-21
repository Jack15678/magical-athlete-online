import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Vector3 } from 'three';
import { applyGameAction, createGame, resolveTasks } from '../src/engine/index.js';
import { TRACKS } from '../src/shared/tracks.js';
import { BOARD_CENTER_SPAN, TILE, TRACK_FIRST_CORNER, TRACK_SECOND_CORNER, boardPoint, diceTopRotation } from '../src/client/scene/math.js';

// Independent face layout oracle matching the numbered pip meshes in Die.
const faceNormals = [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)];

for (let face = 1; face <= 6; face++) {
  test(`confirmed die ${face} settles with only face ${face} upward`, () => {
    const [x, y, z] = diceTopRotation(face);
    const rotation = new Euler(x, y, z, 'XYZ');
    const worldNormals = faceNormals.map(normal => normal.clone().applyEuler(rotation));
    assert.ok(worldNormals[face - 1]!.distanceTo(new Vector3(0, 1, 0)) < 1e-10);
    for (let other = 1; other <= 6; other++) {
      if (other !== face) assert.ok(worldNormals[other - 1]!.y < 1e-10, `face ${other} must not be upward for result ${face}`);
    }
    const opposite = 7 - face;
    assert.ok(worldNormals[opposite - 1]!.distanceTo(new Vector3(0, -1, 0)) < 1e-10);
  });
}

test('the continuous 31-space track turns exactly twice, at rule corners 12 and 15', () => {
  for (const compact of [false, true]) {
    const steps = Array.from({ length: 30 }, (_, index) => new Vector3(...boardPoint(index + 1, compact)).sub(new Vector3(...boardPoint(index, compact))));
    const corners: number[] = [];
    for (let index = 0; index < steps.length; index++) {
      assert.ok(Math.abs(steps[index]!.length() - TILE) < 1e-10, `adjacent spaces ${index} and ${index + 1} must remain one tile apart`);
      if (index > 0 && steps[index]!.clone().normalize().dot(steps[index - 1]!.clone().normalize()) < 1 - 1e-10) {
        assert.ok(Math.abs(steps[index]!.dot(steps[index - 1]!)) < 1e-10, 'each bend must be a right angle');
        corners.push(index);
      }
    }
    assert.deepEqual(corners, [12, 15]);
    assert.equal(TRACK_FIRST_CORNER, 12);
    assert.equal(TRACK_SECOND_CORNER, 15);
  }
});

test('return straight mirrors the outgoing straight and the centered board has the published U bounds', () => {
  for (let index = 0; index <= 12; index++) {
    const outgoing = boardPoint(index, false), returning = boardPoint(27 - index, false);
    assert.equal(returning[0], outgoing[0]);
    assert.equal(returning[2], -outgoing[2]);
  }
  const points = Array.from({ length: 31 }, (_, index) => boardPoint(index, false));
  assert.equal(Math.min(...points.map(point => point[0])), -7.5 * TILE);
  assert.equal(Math.max(...points.map(point => point[0])), 7.5 * TILE);
  assert.equal(Math.min(...points.map(point => point[2])), -1.5 * TILE);
  assert.equal(Math.max(...points.map(point => point[2])), 1.5 * TILE);
  assert.equal(BOARD_CENTER_SPAN.width, 15 * TILE);
  assert.equal(BOARD_CENTER_SPAN.depth, 3 * TILE);
});

test('mobile is a rigid 90-degree board rotation and never changes cell ownership or corner locations', () => {
  for (let index = 0; index <= 30; index++) {
    const desktop = boardPoint(index, false), mobile = boardPoint(index, true);
    assert.deepEqual(mobile, [-desktop[2], desktop[1], desktop[0]]);
    for (let other = 0; other <= 30; other++) {
      const desktopDistance = new Vector3(...desktop).distanceTo(new Vector3(...boardPoint(other, false)));
      const mobileDistance = new Vector3(...mobile).distanceTo(new Vector3(...boardPoint(other, true)));
      assert.ok(Math.abs(desktopDistance - mobileDistance) < 1e-10);
    }
  }
});

test('Blimp engine modifier changes at the displayed second corner 15 on both tracks', () => {
  for (const track of ['mild', 'wild'] as const) {
    assert.equal(TRACKS[track].firstCorner, TRACK_FIRST_CORNER);
    assert.equal(TRACKS[track].secondCorner, TRACK_SECOND_CORNER);
    for (const start of [14, 15]) {
      const game = createGame([0, 1].map(seat => ({ id: `p${seat}`, name: `玩家${seat}`, seat, color: '#000', ready: true, connected: true, score: 0, hand: [], used: [], selection: [] })), 3);
      game.phase = 'race'; game.round = 1; game.track = track; game.currentRacerId = 'r0';
      game.racers = ['blimp', 'coach'].map((characterId, index) => ({ id: `r${index}`, playerId: `p${index}`, characterId, position: index ? 0 : start, tripped: false, finished: false, eliminated: false, flags: {} }));
      game.flags.testDice = [3]; game.queue.push({ kind: 'beginTurn', racerId: 'r0' }); resolveTasks(game);
      applyGameAction(game, 'p0', { type: 'roll' });
      assert.equal(game.racers[0]!.position, start === 14 ? 20 : 17);
      assert.equal(game.lastRoll?.distance, start === 14 ? 6 : 2);
    }
  }
});
