import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRelayConnection } from '../src/client/browser-connection.js';
import type { ActionEnvelope, ActionReply, RoomView } from '../src/shared/types.js';

const stale = (version: number): ActionReply => ({ ok: false, error: '画面已更新，请同步后重试。', version });
const lobby = (version: number, phase: RoomView['phase'] = 'lobby') => ({ version, phase }) as RoomView;
function transport(room: RoomView, request: (envelope: ActionEnvelope) => ActionReply): BrowserRelayConnection {
  return Object.assign(Object.create(BrowserRelayConnection.prototype), { latestRoom: room, requestOnce: async (envelope: ActionEnvelope) => request(envelope) });
}
const ready = (): ActionEnvelope => ({ actionId: crypto.randomUUID(), expectedVersion: 12, action: { type: 'ready', ready: true } });

test('ready rebases a definitively rejected lobby preference against its received private snapshot', async () => {
  const calls: ActionEnvelope[] = [];
  const connection = transport(lobby(13), envelope => { calls.push(envelope); return calls.length === 1 ? stale(13) : { ok: true, version: 14 }; });
  const initial = ready();
  assert.equal((await connection.request(initial)).ok, true);
  assert.deepEqual(calls.map(call => call.expectedVersion), [12, 13]);
  assert.notEqual(calls[0]!.actionId, calls[1]!.actionId);
  assert.deepEqual(calls[1]!.action, initial.action);
});

test('ready retries are bounded to three attempts', async () => {
  const calls: ActionEnvelope[] = [];
  const connection = transport(lobby(13), envelope => {
    calls.push(envelope);
    const version = envelope.expectedVersion + 1;
    Object.assign(connection, { latestRoom: lobby(version) });
    return stale(version);
  });
  assert.equal((await connection.request(ready())).ok, false);
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map(call => call.actionId)).size, 3);
});

test('ready is never replayed after the lobby or without the rejected version snapshot', async () => {
  for (const room of [lobby(13, 'draft'), lobby(12)]) {
    let calls = 0;
    const connection = transport(room, () => { calls++; return stale(13); });
    assert.equal((await connection.request(ready())).ok, false);
    assert.equal(calls, 1);
  }
});

test('a stale roll remains rejected and is never rebased', async () => {
  let calls = 0;
  const connection = transport(lobby(13, 'race'), () => { calls++; return stale(13); });
  const result = await connection.request({ ...ready(), action: { type: 'roll' } });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});
