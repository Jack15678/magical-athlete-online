import { io, type Socket } from 'socket.io-client';
import type { ActionEnvelope, ActionReply, GameAction, GameMode, Identity, RoomView } from '../shared/types.js';
import type { RelayJoinReply } from '../shared/relay.js';
import { BrowserRelayConnection, prepareBrowserRoom } from './browser-connection.js';

export const BROWSER_HOST_MODE = import.meta.env?.VITE_HOST_MODE === 'browser';
export interface RoomConnection {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  emit(event: 'sync'): unknown;
  request(envelope: ActionEnvelope): Promise<ActionReply>;
}

const identityKey = (code: string) => `magical-athlete:identity:${code.toUpperCase()}`;
export function readIdentity(code: string): Identity | null {
  try {
    const value = JSON.parse(localStorage.getItem(identityKey(code)) ?? 'null');
    return value && value.roomCode === code.toUpperCase() && typeof value.playerId === 'string' && typeof value.token === 'string' ? value : null;
  } catch { return null; }
}
export function saveIdentity(identity: Identity) { localStorage.setItem(identityKey(identity.roomCode), JSON.stringify(identity)); }
export function forgetIdentity(code: string) { localStorage.removeItem(identityKey(code)); }
export interface JoinReply { identity: Identity; room: RoomView }
export async function enterRoom(code: string | null, data: { name: string; maxPlayers?: number; timeoutSeconds?: number; mode?: GameMode; aiCount?: number }): Promise<JoinReply> {
  const prefix = BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms';
  const response = await fetch(code ? `${prefix}/${encodeURIComponent(code)}/join` : prefix, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(code ? { name: data.name } : data),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error || '暂时无法进入房间，请稍后重试。');
  saveIdentity(reply.identity);
  if (BROWSER_HOST_MODE && !code) await prepareBrowserRoom((reply as RelayJoinReply).meta);
  return reply;
}
export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error' | 'closed';
export function connectRoom(identity: Identity, onSnapshot: (room: RoomView) => void, onStatus: (state: ConnectionState, message?: string) => void): RoomConnection {
  if (BROWSER_HOST_MODE) return new BrowserRelayConnection(identity, onSnapshot, onStatus);
  const socket = io({ auth: identity, reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 10000 });
  let closed = false;
  const finishClosed = () => { closed = true; socket.io.reconnection(false); socket.disconnect(); onStatus('closed', '房间已解散，请创建或加入其他房间。'); };
  socket.on('connect', () => { if (closed) { finishClosed(); return; } onStatus('online'); socket.emit('sync'); });
  socket.on('snapshot', (room: RoomView) => { onSnapshot(room); if (room.closedAt) { closed = true; socket.io.reconnection(false); onStatus('closed', '房间已解散，请创建或加入其他房间。'); } });
  socket.on('room-closed', (event: { code: string }) => { if (event.code === identity.roomCode) finishClosed(); });
  socket.on('disconnect', () => { if (closed) finishClosed(); else onStatus('offline'); });
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => { if (error.data?.code === 'ROOM_CLOSED' || error.message.includes('房间已解散')) finishClosed(); else onStatus('error', error.message); });
  return { get connected() { return !closed && socket.connected; }, connect() { if (!closed) socket.connect(); }, disconnect() { socket.disconnect(); }, emit(event) { if (!closed) socket.emit(event); }, async request(envelope) { try { return await socketRequest(socket, envelope); } catch (error) { if (closed && envelope.action.type === 'close') return { ok: true }; throw error; } } };
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
    if (!socket.connected) throw new Error('连接已中断。恢复连接后会同步对局。');
    try { return await attempt(); }
    catch { socket.emit('sync'); throw new Error('尚未收到操作确认，正在重新同步。请先查看最新局面。'); }
  }
}
