import { io, type Socket } from 'socket.io-client';
import type { ActionEnvelope, ActionReply, GameAction, Identity, RoomView } from '../shared/types.js';

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
export async function enterRoom(code: string | null, data: { name: string; maxPlayers?: number; timeoutSeconds?: number }): Promise<JoinReply> {
  const response = await fetch(code ? `/api/rooms/${encodeURIComponent(code)}/join` : '/api/rooms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(code ? { name: data.name } : data),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error || '暂时无法进入房间，请稍后重试。');
  saveIdentity(reply.identity);
  return reply;
}
export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error';
export function connectRoom(identity: Identity, onSnapshot: (room: RoomView) => void, onStatus: (state: ConnectionState, message?: string) => void) {
  const socket = io({ auth: identity, reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 10000 });
  socket.on('connect', () => { onStatus('online'); socket.emit('sync'); });
  socket.on('snapshot', onSnapshot);
  socket.on('disconnect', () => onStatus('offline'));
  socket.on('connect_error', (error: Error) => onStatus('error', error.message));
  return socket;
}
export async function sendAction(socket: Socket, room: RoomView, action: GameAction): Promise<ActionReply> {
  const envelope: ActionEnvelope = { actionId: crypto.randomUUID(), expectedVersion: room.version, action };
  // Retrying uses the same id so a lost acknowledgement cannot apply an action twice.
  const attempt = () => new Promise<ActionReply>((resolve, reject) => {
    socket.timeout(6500).emit('action', envelope, (error: Error | null, reply: ActionReply) => error ? reject(error) : resolve(reply));
  });
  try { return await attempt(); }
  catch {
    if (!socket.connected) throw new Error('连接已中断。恢复连接后会同步对局。');
    try { return await attempt(); }
    catch { socket.emit('sync'); throw new Error('尚未收到操作确认，正在重新同步。请先查看最新局面。'); }
  }
}
