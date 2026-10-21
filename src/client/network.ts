import { PresentationEventClient } from './presentation-events.js';
import { io, type Socket } from 'socket.io-client';
import type { ActionEnvelope, ActionReply, GameAction, GameMode, Identity, PublicEventReply, RoomRole, RoomSummary, RoomView } from '../shared/types.js';
import type { RelayJoinReply } from '../shared/relay.js';
import { BrowserRelayConnection, prepareBrowserRoom } from './browser-connection.js';

export const BROWSER_HOST_MODE = import.meta.env?.VITE_HOST_MODE === 'browser';
export interface RoomConnection {
  readonly connected: boolean;
  /** Authenticated personal-room owners may close through the relay even
   * while the browser responsible for computing gameplay is unavailable. */
  readonly canClose?: boolean;
  connect(): void;
  disconnect(): void;
  emit(event: 'sync'): unknown;
  request(envelope: ActionEnvelope): Promise<ActionReply>;
  acknowledgeEvents?(cursor:number):void;
}

const identityKey = (code: string) => `magical-athlete:identity:${code.toUpperCase()}`;
export function readIdentity(code: string, role?: RoomRole): Identity | null {
  try {
    const saved = localStorage.getItem(identityKey(code));
    const current = saved ? JSON.parse(saved) : null;
    const value = role ? JSON.parse(localStorage.getItem(`${identityKey(code)}:${role}`) ?? 'null') ?? ((current?.role ?? 'player') === role ? current : null) : current;
    return value && value.roomCode === code.toUpperCase() && typeof value.playerId === 'string' && typeof value.token === 'string' ? value : null;
  } catch { return null; }
}
export function saveIdentity(identity: Identity) {
  const previous = readIdentity(identity.roomCode);
  if (previous) localStorage.setItem(`${identityKey(previous.roomCode)}:${previous.role ?? 'player'}`, JSON.stringify(previous));
  localStorage.setItem(`${identityKey(identity.roomCode)}:${identity.role ?? 'player'}`, JSON.stringify(identity));
  localStorage.setItem(identityKey(identity.roomCode), JSON.stringify(identity));
}
export function forgetIdentity(code: string, identity = readIdentity(code)) {
  if (identity) localStorage.removeItem(`${identityKey(code)}:${identity.role ?? 'player'}`);
  const current = readIdentity(code);
  if (!identity || current?.playerId === identity.playerId) localStorage.removeItem(identityKey(code));
}
export interface JoinReply { identity: Identity; room: RoomView }
export async function listRooms(): Promise<RoomSummary[]> {
  const response = await fetch(BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms', { cache: 'no-store' });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(reply.error || '暂时无法获取房间列表。');
  return reply.rooms;
}
export async function leaveRoom(identity: Identity): Promise<void> {
  const prefix = BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms';
  let response: Response;
  try { response = await fetch(`${prefix}/${encodeURIComponent(identity.roomCode)}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity), signal: AbortSignal.timeout(4000) }); }
  catch { return; } // Local exit remains available offline; retain credentials for a later return.
  const reply = await response.json().catch(() => ({}));
  if ([401, 404, 410].includes(response.status)) { forgetIdentity(identity.roomCode, identity); return; }
  if (!response.ok) throw Error(reply.error || '退出房间未确认，请重试。');
  if (!reply.retainIdentity) forgetIdentity(identity.roomCode, identity);
}
export async function enterRoom(code: string | null, data: { name: string; maxPlayers?: number; timeoutSeconds?: number; mode?: GameMode; aiCount?: number; role?: RoomRole }): Promise<JoinReply> {
  const prefix = BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms';
  const { role, ...creation } = data;
  const response = await fetch(code ? `${prefix}/${encodeURIComponent(code)}/join` : prefix, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(code ? { name: data.name, ...(role ? { role } : {}) } : creation),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error || '暂时无法进入房间，请稍后重试。');
  saveIdentity(reply.identity);
  if (BROWSER_HOST_MODE && !code) await prepareBrowserRoom((reply as RelayJoinReply).meta);
  return reply;
}
export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error' | 'closed' | 'expired';
export function connectRoom(identity: Identity, onSnapshot: (room: RoomView) => void, onStatus: (state: ConnectionState, message?: string) => void): RoomConnection {
  if (BROWSER_HOST_MODE) return new BrowserRelayConnection(identity, onSnapshot, onStatus);
  const socket = io({ auth: identity, reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 10000 });
  let closed = false;
  let expired = false;
  let closedMessage='房间已解散，请创建或加入其他房间。';
  const eventClient=new PresentationEventClient(async afterId=>{
    const reply=await new Promise<PublicEventReply>((resolve,reject)=>socket.timeout(6500).emit('events',{afterId},(error:Error|null,value:PublicEventReply)=>error?reject(error):resolve(value)));
    if(!reply.ok||!reply.batch)throw Error(reply.error??'尚未取得完整动画记录。');return reply.batch;
  },onSnapshot,error=>onStatus('error',error instanceof Error?error.message:'动画记录同步失败，请重新连接。'));
  const finishClosed = () => { closed = true; eventClient.reset(); socket.io.reconnection(false); socket.disconnect(); onStatus(expired ? 'expired' : 'closed', expired ? '房间已达到3小时上限，请重新创建。' : closedMessage); };
  socket.on('connect', () => { eventClient.reset(); if (closed) { finishClosed(); return; } onStatus('online'); socket.emit('sync'); });
  socket.on('snapshot', (room: RoomView) => { if(room.closedAt)onSnapshot(room);else eventClient.receive(room); if (room.closedAt) { closed = true; socket.io.reconnection(false); onStatus('closed', '房间已解散，请创建或加入其他房间。'); } });
  socket.on('room-closed', (event: { code: string; reason?: 'expired'|'host-away'|'dismissed' }) => { if (event.code === identity.roomCode) { expired = event.reason === 'expired'; if(event.reason==='host-away')closedMessage='房主连续离开超过30分钟，房间已关闭。'; finishClosed(); } });
  socket.on('disconnect', () => { if (closed) finishClosed(); else onStatus('offline'); });
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => { if (error.data?.code === 'ROOM_EXPIRED' || /3小时|已过期/.test(error.message)) { expired = true; finishClosed(); } else if (error.data?.code === 'ROOM_CLOSED' || /房间已解散|房间已关闭/.test(error.message)) {if(error.message.includes('30分钟'))closedMessage=error.message;finishClosed();} else onStatus('error', error.message); });
  return { get connected() { return !closed && socket.connected; }, connect() { if (!closed) { if(socket.connected){eventClient.reset();onStatus('online');socket.emit('sync');}else socket.connect(); } }, disconnect() { eventClient.reset(); socket.disconnect(); }, acknowledgeEvents(cursor){eventClient.acknowledge(cursor);}, emit(event) { if (!closed) socket.emit(event); }, async request(envelope) { try { return await socketRequest(socket, envelope); } catch (error) { if (closed && envelope.action.type === 'close') return { ok: true }; throw error; } } };
}
function socketRequest(socket: Socket, envelope: ActionEnvelope): Promise<ActionReply> {
  return new Promise((resolve, reject) => socket.timeout(6500).emit('action', envelope, (error: Error | null, reply: ActionReply) => error ? reject(error) : resolve(reply)));
}
export async function sendAction(socket: RoomConnection, room: RoomView, action: GameAction): Promise<ActionReply> {
  const envelope: ActionEnvelope = { actionId: crypto.randomUUID(), expectedVersion: room.version, action };
  // Retrying uses the same id so a lost acknowledgement cannot apply an action twice.
  const attempt = () => socket.request(envelope);
  try { return await attempt(); }
  catch {
    if (!socket.connected && !(action.type === 'close' && socket.canClose)) throw new Error('连接已中断。恢复连接后会同步对局。');
    try { return await attempt(); }
    catch { socket.emit('sync'); throw new Error('尚未收到操作确认，正在重新同步。请先查看最新局面。'); }
  }
}
