import assert from 'node:assert/strict';
import test from 'node:test';
import { pawnFallPose } from '../src/client/scene/pawn-fall.js';

test('a trip makes one bounded tilt and holds the same supported down pose until recovery', () => {
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100, pose = pawnFallPose(t, 'trip');
    assert.ok(pose.tilt >= -Math.PI / 2 && pose.tilt <= .101);
    assert.ok(pose.lift >= Math.sin(Math.abs(pose.tilt)) * .33, 'base rim stays above the tile');
    if (t >= .16) assert.ok(pose.tilt <= previous + 1e-8, 'fall never adds another revolution');
    previous = pose.tilt;
  }
  assert.deepEqual(pawnFallPose(1, 'trip'), pawnFallPose(0, 'down'));
  assert.deepEqual(pawnFallPose(0, 'recover'), pawnFallPose(0, 'down'));
  assert.deepEqual(pawnFallPose(1, 'recover'), { tilt: -0, lift: 0 });
  assert.deepEqual(pawnFallPose(.2, 'trip', true), pawnFallPose(0, 'down'));
});
