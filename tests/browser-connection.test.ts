import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRelayConnection } from '../src/client/browser-connection.js';
import type { ActionEnvelope, ActionReply, RoomView } from '../src/shared/types.js';
import type { RelayServerMessage } from '../src/shared/relay.js';

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

test('a stale close is never rebased after the user confirms it', async () => {
  let calls = 0;
  const connection = transport(lobby(13), () => { calls++; return stale(13); });
  assert.equal((await connection.request({ ...ready(), action: { type: 'close' } })).ok, false);
  assert.equal(calls, 1);
});

function closingTransport() {
  const events: string[] = [];
  const replies = new Map();
  const connection = Object.assign(Object.create(BrowserRelayConnection.prototype), {
    identity: { roomCode: 'ABC234', playerId: 'self' }, latestRoom: null, roomClosed: false, disposed: false,
    replies, metadata: null, authorityOnline: true, synchronized: true, syncRequestId: null,
    onSnapshot: () => events.push('snapshot'), onStatus: (state: string) => events.push(state),
    disconnect() { events.push('disconnect'); this.disposed = true; },
  }) as BrowserRelayConnection;
  const receive = (message: RelayServerMessage) => Reflect.get(connection, 'receive').call(connection, message);
  const addClose = () => new Promise<ActionReply>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('test pending reply was not settled')), 1000);
    replies.set('close-request', { timer, closing: true, resolve: (reply: ActionReply) => { events.push('ack'); resolve(reply); }, reject });
  });
  return { connection, events, receive, addClose };
}

test('a closed snapshot renders the terminal state without disconnecting before its acknowledgement', async () => {
  const client = closingTransport(); const reply = client.addClose();
  client.receive({ type: 'snapshot', room: { ...lobby(14), code: 'ABC234', selfId: 'self', closedAt: 123 } });
  assert.deepEqual(client.events, ['snapshot', 'closed']);
  assert.equal(client.connection.connected, false);
  client.receive({ type: 'ack', requestId: 'close-request', result: { ok: true, version: 14 } });
  assert.equal((await reply).ok, true);
  assert.ok(!client.events.includes('disconnect'));
  client.receive({ type: 'room-closed', code: 'ABC234', closedAt: 123 });
  assert.ok(client.events.indexOf('ack') < client.events.indexOf('disconnect'));
});

test('a terminal notification settles a pending close successfully and prevents reconnect', async () => {
  const client = closingTransport(); const reply = client.addClose();
  client.receive({ type: 'room-closed', code: 'ABC234', closedAt: 123 });
  assert.equal((await reply).ok, true);
  const events = [...client.events]; client.connection.connect();
  assert.deepEqual(client.events, events);
  assert.equal(client.connection.connected, false);
  assert.equal(client.events.at(-1), 'closed');
});

test('another room closure does not terminate this room', () => {
  const client = closingTransport();
  client.receive({ type: 'room-closed', code: 'DEF567', closedAt: 123 });
  assert.deepEqual(client.events, []);
});
