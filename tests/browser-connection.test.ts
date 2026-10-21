import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRelayConnection } from '../src/client/browser-connection.js';
import type { ActionEnvelope, ActionReply, RoomView } from '../src/shared/types.js';
import type { RelayServerMessage } from '../src/shared/relay.js';
import { sendAction, type RoomConnection } from '../src/client/network.js';

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

test('owner absence closure reports its own terminal reason and never reconnects',()=>{
  const client=closingTransport(),statuses:{state:string;message?:string}[]=[];
  Reflect.set(client.connection,'onStatus',(state:string,message?:string)=>statuses.push({state,message}));
  client.receive({type:'room-closed',code:'ABC234',closedAt:123,reason:'host-away'});
  assert.deepEqual(statuses,[{state:'closed',message:'房主连续离开超过30分钟，房间已关闭。'}]);
  const events=[...client.events];client.connection.connect();assert.deepEqual(client.events,events);
});

test('expiration is terminal and reports the lifetime limit without offering reconnection', () => {
  const client = closingTransport();
  client.receive({ type: 'room-closed', code: 'ABC234', closedAt: 123, reason: 'expired' });
  assert.equal(client.events.at(-1), 'expired');
  assert.equal(client.connection.connected, false);
  const events = [...client.events]; client.connection.connect(); assert.deepEqual(client.events, events);
});

function offlineOwnerTransport(mode:'ai'|'practice'='ai'){
  const sent:any[]=[];
  const connection=Object.assign(Object.create(BrowserRelayConnection.prototype),{
    identity:{roomCode:'ABC234',playerId:'owner',role:'player'},
    metadata:{code:'ABC234',mode,adminHostId:'owner'},
    disposed:false,blocked:false,roomClosed:false,authenticated:true,synchronized:false,authorityOnline:false,
    replies:new Map(),
    ws:{readyState:WebSocket.OPEN,send(value:string){
      const message=JSON.parse(value);sent.push(message);
      Reflect.get(connection,'receive').call(connection,{type:'ack',requestId:message.requestId,result:{ok:true,version:7}});
    }},
  }) as BrowserRelayConnection;
  return{connection,sent};
}
test('an authenticated personal-room owner can dismiss without a synchronized gameplay authority, while all gameplay stays paused',async()=>{
  for(const mode of ['ai','practice'] as const){
    const client=offlineOwnerTransport(mode);assert.equal(client.connection.connected,false);assert.equal(client.connection.canClose,true);
    const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:6,action:{type:'close'}};
    assert.deepEqual(await client.connection.request(envelope),{ok:true,version:7});assert.deepEqual(client.sent[0].envelope,envelope);
    await assert.rejects(client.connection.request({...envelope,action:{type:'roll'}}),/计算房主网页离线/);
    assert.equal(client.sent.length,1);
  }
});
test('personal close availability requires the authenticated owner and a usable relay socket',()=>{
  const restrictions=[
    {authenticated:false},{blocked:true},{disposed:true},{roomClosed:true},{ws:{readyState:WebSocket.CLOSED}},
    {metadata:{code:'ABC234',mode:'multiplayer',adminHostId:'owner'}},
    {metadata:{code:'ABC234',mode:'ai',adminHostId:'other'}},
    {metadata:{code:'DEF567',mode:'ai',adminHostId:'owner'}},
    {identity:{roomCode:'ABC234',playerId:'owner',role:'spectator'}},
  ];
  for(const restriction of restrictions){const client=offlineOwnerTransport();Object.assign(client.connection,restriction);assert.equal(client.connection.canClose,false);}
});
test('a lost personal-close acknowledgement retries the identical action through the relay even with gameplay offline',async()=>{
  const envelopes:ActionEnvelope[]=[];
  const connection:RoomConnection={connected:false,canClose:true,connect(){},disconnect(){},emit(){},async request(envelope){envelopes.push(envelope);if(envelopes.length===1)throw Error('ack lost');return{ok:true,version:8};}};
  assert.deepEqual(await sendAction(connection,lobby(7),{type:'close'}),{ok:true,version:8});
  assert.equal(envelopes.length,2);assert.strictEqual(envelopes[0],envelopes[1]);
  envelopes.length=0;await assert.rejects(sendAction(connection,lobby(7),{type:'roll'}),/连接已中断/);assert.equal(envelopes.length,1);
});
