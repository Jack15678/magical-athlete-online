import test from 'node:test';
import assert from 'node:assert/strict';
import { pawnRoute, strideLift, strideProgress } from '../src/client/scene/pawn-motion.js';
import { boardPoint, TILE } from '../src/client/scene/math.js';

test('forward and backward routes keep exact endpoints and rounded corners inside the track', () => {
  for (const compact of [false, true]) for (const reverse of [false, true]) {
    const positions = [10, 11, 12, 13, 14, 15, 16, 17]; if (reverse) positions.reverse();
    const points = positions.map(position => boardPoint(position, compact)), route = pawnRoute(points);
    const start = route.getPointAt(0), end = route.getPointAt(1);
    assert.equal(start.x, points[0]![0]); assert.equal(start.z, points[0]![2]);
    assert.ok(end.distanceTo(pawnRoute([points.at(-1)!]).getPointAt(0)) < 1e-10);
    for (let step = 0; step <= 200; step++) {
      const point = route.getPointAt(step / 200);
      assert.ok(points.some(centre => Math.hypot(point.x - centre[0], point.z - centre[2]) <= TILE * .6), 'curved motion stays on its numbered route');
    }
  }
});
test('small strides land softly and acceleration eases into and out of the route', () => {
  assert.equal(strideProgress(0), 0); assert.equal(strideProgress(1), 1);
  assert.ok(strideProgress(.001) < .00001); assert.ok(1 - strideProgress(.999) < .00001);
  for (let step = 0; step <= 6; step++) {
    assert.ok(strideLift(step / 6, 6) < 1e-10);
    assert.ok(strideLift((step + .001) / 6, 6) < .000001);
  }
  for (let step = 0; step <= 100; step++) assert.ok(strideLift(step / 100, 6) <= .075);
});
