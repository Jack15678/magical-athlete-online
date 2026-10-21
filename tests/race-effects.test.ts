import assert from 'node:assert/strict';
import test from 'node:test';
import type { Racer } from '../src/shared/types.js';
import type { PresentationBeat } from '../src/client/presentation.js';
import { raceEffectDescriptors } from '../src/client/scene/race-effects.js';
import { trackPath } from '../src/client/presentation.js';

const racer = (id: string, position: number): Racer => ({ id, position, playerId: `p-${id}`, characterId: 'hare', tripped: false, finished: false, eliminated: false, flags: {} });
const beat = (kind: PresentationBeat['kind'], props: Partial<PresentationBeat> = {}): PresentationBeat => ({ key: 'confirmed:42', kind, source: 'a', targets: [], motions: [], events: [], durationMs: 850, ...props });

test('trip accents identify victims rather than the character who caused the trip', () => {
  const racers = [racer('banana', 2), racer('victim', 4), racer('spectator', 6)];
  const visual = raceEffectDescriptors(beat('trip', { source: 'banana', targets: ['victim', 'victim', 'unknown'] }), racers);
  assert.deepEqual(visual.markers.map(marker => marker.racerId), ['victim']);
  assert.equal(visual.markers[0]!.position, 4);
  assert.equal(visual.path.length, 0);
  assert.deepEqual(raceEffectDescriptors(beat('trip', { source: 'track', targets: ['victim'] }), racers).markers.map(marker => marker.racerId), ['victim']);
});

test('mixed simultaneous movement keeps each real direction and turn under the transient draw budget', () => {
  const racers = Array.from({ length: 8 }, (_, index) => racer(`r${index}`, index % 2 ? 28 : 0));
  const motions = racers.map((value, index) => ({ racerId: value.id, from: value.position, to: index % 2 ? 0 : 28, path: trackPath(value.position, index % 2 ? 0 : 28) }));
  const visual = raceEffectDescriptors(beat('move', { motions }), racers);
  assert.equal(visual.markers.length, 0);
  assert.ok(visual.path.length <= 12);
  assert.deepEqual([...new Set(visual.path.map(mark => mark.racerId))].sort(), racers.map(value => value.id).sort());
  for (const mark of visual.path) {
    const motion = motions.find(value => value.racerId === mark.racerId)!;
    assert.equal(mark.backwards, motion.to < motion.from);
    assert.equal(Math.abs(mark.position - mark.previous), 1, 'arrow must follow a real adjacent step, including corners');
    assert.ok(motion.path.includes(mark.position));
  }
});

test('warp shows public endpoints without inventing an intermediate route or changing racers', () => {
  const racers = [racer('a', 3), racer('b', 23)];
  const initial = structuredClone(racers);
  const visual = raceEffectDescriptors(beat('swap', { targets: ['a', 'b'], motions: [{ racerId: 'a', from: 3, to: 23, path: [3, 23] }, { racerId: 'b', from: 23, to: 3, path: [23, 3] }] }), racers);
  assert.equal(visual.path.length, 0);
  assert.deepEqual(visual.markers.map(({ racerId, position, endpoint }) => [racerId, position, endpoint]), [['a', 3, 'departure'], ['a', 23, 'arrival'], ['b', 23, 'departure'], ['b', 3, 'arrival']]);
  assert.deepEqual(racers, initial);
});

test('idle and dice remain clear; confirmed score/recovery fall back to their source', () => {
  const racers = [racer('a', 5)];
  for (const value of [undefined, beat('dice'), beat('duel-dice')]) assert.deepEqual(raceEffectDescriptors(value, racers), { markers: [], path: [] });
  for (const kind of ['score', 'recover', 'finish'] as const) {
    const visual = raceEffectDescriptors(beat(kind), racers);
    assert.equal(visual.markers.length, 1);
    assert.equal(visual.markers[0]!.racerId, 'a');
  }
});
