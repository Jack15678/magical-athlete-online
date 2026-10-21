import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetRecovery } from '../src/client/scene/asset-recovery.js';

function fixture() {
  let online = true, cleared = 0, next = 0, onlineListener: (() => void) | undefined;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const recovery = new AssetRecovery({
    clearCache: () => cleared++, isOnline: () => online,
    watchOnline: callback => { onlineListener = callback; return () => { onlineListener = undefined; }; },
    schedule: (callback, delay) => { timers.set(++next, { callback, delay }); return next; },
    cancel: timer => { timers.delete(timer as number); },
  });
  return {
    recovery, timers, cleared: () => cleared,
    offline: () => { online = false; },
    online: (emitEvent = true) => { online = true; if (emitEvent) onlineListener?.(); },
    tick: () => { const [id, timer] = timers.entries().next().value!; timers.delete(id); timer.callback(); return timer.delay; },
    watched: () => !!onlineListener,
  };
}

test('eight failed sculptures share three bounded retries and clear only on an actual retry', () => {
  const f = fixture(), updates = Array(8).fill(0);
  const unsubscribe = updates.map((_, index) => f.recovery.subscribe(() => updates[index]++));
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let racer = 0; racer < 8; racer++) f.recovery.failure();
    assert.equal(f.timers.size, 1);
    assert.equal(f.cleared(), attempt);
    assert.equal(f.tick(), [400, 1200, 3000][attempt]);
  }
  f.recovery.failure();
  assert.equal(f.timers.size, 0);
  assert.equal(f.cleared(), 3);
  assert.deepEqual(updates, Array(8).fill(3));
  unsubscribe.forEach(dispose => dispose());
  assert.equal(f.watched(), false);
});

test('offline failures wait for online, which can recover an exhausted request', () => {
  const f = fixture(); f.recovery.subscribe(() => {});
  f.offline(); f.recovery.failure();
  assert.equal(f.timers.size, 0); assert.equal(f.cleared(), 0);
  f.online(); assert.equal(f.cleared(), 1);
  for (let attempt = 0; attempt < 2; attempt++) { f.recovery.failure(); f.tick(); }
  f.recovery.failure(); assert.equal(f.timers.size, 0);
  f.offline(); f.online(); assert.equal(f.cleared(), 4);
  f.recovery.success(); f.offline(); f.online();
  assert.equal(f.cleared(), 4, 'healthy loaded geometry must not be evicted by later network changes');
});

test('successful loading and final unmount cancel pending retries without evicting cached geometry', () => {
  const f = fixture(), unsubscribe = f.recovery.subscribe(() => {});
  f.recovery.failure(); assert.equal(f.timers.size, 1);
  f.recovery.success(); assert.equal(f.timers.size, 0); assert.equal(f.cleared(), 0);
  f.recovery.failure(); assert.equal(f.timers.size, 1);
  unsubscribe(); assert.equal(f.timers.size, 0); assert.equal(f.cleared(), 0);
});

test('a first-render offline failure recovers when online changed before the first subscription', () => {
  const f = fixture();
  f.offline(); f.recovery.failure();
  assert.equal(f.timers.size, 0);
  f.online(false);
  const unsubscribe = f.recovery.subscribe(() => {});
  assert.equal(f.timers.size, 1, 'subscribe catches an online event missed before mounting');
  assert.equal(f.tick(), 400); assert.equal(f.cleared(), 1);
  for (let attempt = 0; attempt < 2; attempt++) { f.recovery.failure(); f.tick(); }
  f.recovery.failure();
  assert.equal(f.cleared(), 3); assert.equal(f.timers.size, 0);
  unsubscribe(); f.recovery.subscribe(() => {});
  assert.equal(f.timers.size, 0, 'remounting must not bypass the three-attempt budget');
});
