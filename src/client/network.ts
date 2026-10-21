import { PresentationEventClient } from './presentation-events.js';
import { io, type Socket } from 'socket.io-client';
import type { ActionEnvelope, ActionReply, CharacterPool, ChatReply, ChatSend, GameAction, GameMode, Identity, Phase, PublicEventReply, RenameReply, RoomRole, RoomSummary, RoomView } from '../shared/types.js';
import { CommunityFeed, type CommunityState } from './community.js';
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
  subscribeCommunity?(listener: (state: CommunityState) => void): () => void;
  sendChat?(message: ChatSend): Promise<ChatReply>;
  rename?(request: {requestId: string; name: string}): Promise<RenameReply>;
}

const identityKey = (code: string) => `magical-athlete:identity:${code.toUpperCase()}`;
const OWNED_ROOMS_KEY = 'magical-athlete:owned-rooms:v1';
const ROUTE_IDENTITY_KEY = 'magical-athlete:route-identity:v1';
const CLOSED_ROOMS_KEY = 'magical-athlete:closed-rooms:v1';
export const OWNED_ROOMS_CHANGED = 'magical-athlete:owned-rooms-changed';
/** No credential is duplicated here: returning always uses the saved player identity. */
export interface OwnedRoom { code: string; playerId: string; mode: GameMode; phase: Phase; createdAt: number; lastVisitedAt: number; hostLeftAt?: number; expiresAt?: number }
function ownedRecords(): OwnedRoom[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(OWNED_ROOMS_KEY) ?? '[]');
    return Array.isArray(records) ? records.filter((r): r is OwnedRoom => !!r && typeof r === 'object' && /^[A-Z2-9]{6}$/.test(r.code) && typeof r.playerId === 'string' && Number.isFinite(r.createdAt) && Number.isFinite(r.lastVisitedAt)) : [];
  } catch { return []; }
}
function writeOwnedRooms(records: OwnedRoom[]) {
  try {
    const value = JSON.stringify(records.toSorted((a,b) => b.lastVisitedAt-a.lastVisitedAt).slice(0,8));
    if (localStorage.getItem(OWNED_ROOMS_KEY) === value) return;
    localStorage.setItem(OWNED_ROOMS_KEY, value);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(OWNED_ROOMS_CHANGED));
  } catch { /* Optional recovery metadata must not prevent a committed game action. */ }
}
export function forgetOwnedRoom(code: string) { writeOwnedRooms(ownedRecords().filter(room => room.code !== code.toUpperCase())); }
function closedRecords(): { code:string; reason:'closed'|'expired' }[] {
  try { const records=JSON.parse(localStorage.getItem(CLOSED_ROOMS_KEY)??'[]');return Array.isArray(records)?records.filter(record=>record&&/^[A-Z2-9]{6}$/.test(record.code)&&(record.reason==='closed'||record.reason==='expired')):[]; }catch{return [];}
}
export function readClosedRoom(code:string):'closed'|'expired'|null{return closedRecords().find(record=>record.code===code.toUpperCase())?.reason??null;}
export function forgetClosedRoom(code: string, reason:'closed'|'expired'='closed') {
  forgetOwnedRoom(code);
  try { localStorage.setItem(CLOSED_ROOMS_KEY,JSON.stringify([{code:code.toUpperCase(),reason},...closedRecords().filter(record=>record.code!==code.toUpperCase())].slice(0,32)));for (const suffix of ['', ':player', ':spectator']) localStorage.removeItem(identityKey(code)+suffix); } catch { /* Storage may be unavailable. */ }
}
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
  try { sessionStorage.setItem(ROUTE_IDENTITY_KEY, JSON.stringify({ code: identity.roomCode, playerId: identity.playerId, role: identity.role ?? 'player' })); } catch { /* Per-tab preference is optional. */ }
}
/** A spectator opened in another tab must not replace this tab's player on refresh. */
export function readRouteIdentity(code: string): Identity | null {
  try {
    const route = JSON.parse(sessionStorage.getItem(ROUTE_IDENTITY_KEY) ?? 'null');
    const identity = route?.code === code.toUpperCase() ? readIdentity(code, route.role) : null;
    if (identity && identity.playerId === route?.playerId) return identity;
  } catch { /* Fall back to retained local credentials. */ }
  const owned = ownedRecords().find(room => room.code === code.toUpperCase()), player = readIdentity(code, 'player');
  return owned && player?.playerId === owned.playerId ? player : readIdentity(code);
}
export function forgetIdentity(code: string, identity = readIdentity(code)) {
  if (identity) localStorage.removeItem(`${identityKey(code)}:${identity.role ?? 'player'}`);
  const current = readIdentity(code);
  if (!identity || current?.playerId === identity.playerId) localStorage.removeItem(identityKey(code));
  if (!identity || ownedRecords().some(room => room.code === code.toUpperCase() && room.playerId === identity.playerId)) forgetOwnedRoom(code);
}
export function rememberOwnedRoom(room: Pick<RoomView,'code'|'hostId'|'ownerId'|'mode'|'phase'|'createdAt'|'hostLeftAt'|'expiresAt'|'closedAt'>, identity: Identity, touch = false): void {
  if (room.closedAt !== undefined) { forgetClosedRoom(room.code); return; }
  try { if(readClosedRoom(room.code))localStorage.setItem(CLOSED_ROOMS_KEY,JSON.stringify(closedRecords().filter(record=>record.code!==room.code))); }catch{/* The live server response remains authoritative. */}
  if (identity.role === 'spectator') return;
  const records = ownedRecords(), old = records.find(record => record.code === room.code);
  if ((room.ownerId ?? room.hostId) !== identity.playerId) { if (old?.playerId === identity.playerId) forgetOwnedRoom(room.code); return; }
  const now = Date.now();
  const record: OwnedRoom = { code: room.code, playerId: identity.playerId, mode: room.mode ?? 'multiplayer', phase: room.phase, createdAt: room.createdAt ?? old?.createdAt ?? now, lastVisitedAt: touch ? now : old?.lastVisitedAt ?? room.createdAt ?? now,
    ...(room.hostLeftAt === undefined ? {} : { hostLeftAt: room.hostLeftAt }), ...(room.expiresAt === undefined || room.expiresAt === Number.MAX_SAFE_INTEGER ? {} : { expiresAt: room.expiresAt }) };
  writeOwnedRooms([record,...records.filter(previous => previous.code !== room.code)]);
}
/** Include old player credentials so rooms created before this UI can be found.
 * The server must confirm ownership before any candidate gets a return button. */
export function ownedRoomCandidates(): Identity[] {
  const candidates = new Map<string, Identity>();
  const add = (code: string) => { const identity = readIdentity(code, 'player'); if (identity && identity.role !== 'spectator'&&!readClosedRoom(code)) candidates.set(code,identity); };
  for (const room of ownedRecords().toSorted((a,b) => b.lastVisitedAt-a.lastVisitedAt)) add(room.code);
  try { for (let index=localStorage.length-1; index>=0 && candidates.size<8; index--) { const match = /^magical-athlete:identity:([A-Z2-9]{6})(?::player)?$/.exec(localStorage.key(index) ?? ''); if (match) add(match[1]!); } } catch { /* Use known records if enumeration is restricted. */ }
  return [...candidates.values()].slice(0,8);
}
/** This read never opens a room connection or renews its absence timer. */
export async function checkOwnedRoom(identity: Identity): Promise<OwnedRoom | null> {
  const prefix = BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms';
  const response = await fetch(`${prefix}/${encodeURIComponent(identity.roomCode)}/resume-status`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(identity), signal: AbortSignal.timeout(4500), cache: 'no-store' });
  if ([404,410].includes(response.status)) { forgetClosedRoom(identity.roomCode); return null; }
  if (response.status === 401) { forgetIdentity(identity.roomCode,identity); return null; }
  const reply = await response.json().catch(() => ({}));
  if (!response.ok || !reply.ok || typeof reply.ownerId !== 'string' || !Number.isFinite(reply.createdAt)) throw Error(reply.error ?? '暂时无法确认原房间，请稍后重试。');
  if (reply.ownerId !== identity.playerId || identity.role === 'spectator') { forgetOwnedRoom(identity.roomCode); return null; }
  rememberOwnedRoom({ code:identity.roomCode,hostId:reply.ownerId,ownerId:reply.ownerId,mode:reply.mode,phase:reply.phase,createdAt:reply.createdAt,hostLeftAt:reply.hostLeftAt,expiresAt:reply.expiresAt },identity);
  return ownedRecords().find(room => room.code === identity.roomCode) ?? null;
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
export async function enterRoom(code: string | null, data: { name: string; maxPlayers?: number; timeoutSeconds?: number; mode?: GameMode; aiCount?: number; role?: RoomRole; characterPool?: CharacterPool }): Promise<JoinReply> {
  const prefix = BROWSER_HOST_MODE ? '/api/browser/rooms' : '/api/rooms';
  const { role, ...creation } = data;
  const response = await fetch(code ? `${prefix}/${encodeURIComponent(code)}/join` : prefix, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(code ? { name: data.name, ...(role ? { role } : {}) } : creation),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error || '暂时无法进入房间，请稍后重试。');
  saveIdentity(reply.identity);
  if (BROWSER_HOST_MODE && !code) await prepareBrowserRoom((reply as RelayJoinReply).meta);
  rememberOwnedRoom(reply.room,reply.identity,true);
  return reply;
}
export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error' | 'closed' | 'expired';
export function connectRoom(identity: Identity, onSnapshot: (room: RoomView) => void, onStatus: (state: ConnectionState, message?: string) => void): RoomConnection {
  if (BROWSER_HOST_MODE) return new BrowserRelayConnection(identity, onSnapshot, onStatus);
  const socket = io({ auth: identity, reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 10000 });
  const community = new CommunityFeed();
  const chatSync = () => { socket.timeout(6500).emit('chat-sync', {afterId: 0}, (error: Error | null, reply: {ok: boolean; messages?: RoomView['chat']; latestId?: number}) => { if (!error && reply.ok) community.update({messages: reply.messages, latestId: reply.latestId}); }); };
  socket.on('chat', (payload: {messages: NonNullable<RoomView['chat']>; latestId: number}) => community.update(payload));
  socket.on('connect', () => { community.update({connected: true}); chatSync(); });
  socket.on('disconnect', () => community.update({connected: false}));
  socket.on('snapshot', (room: RoomView) => community.update({messages: room.chat, latestId: room.chatLatestId, renameRemaining: room.renameRemaining, name: room.players.find(player => player.id === identity.playerId)?.name ?? room.spectators?.find(viewer => viewer.id === identity.playerId)?.name}));
  let closed = false;
  let expired = false;
  let closedMessage='房间已解散，请创建或加入其他房间。';
  const eventClient=new PresentationEventClient(async afterId=>{
    const reply=await new Promise<PublicEventReply>((resolve,reject)=>socket.timeout(6500).emit('events',{afterId},(error:Error|null,value:PublicEventReply)=>error?reject(error):resolve(value)));
    if(!reply.ok||!reply.batch)throw Error(reply.error??'尚未取得完整动画记录。');return reply.batch;
  },onSnapshot,error=>onStatus('error',error instanceof Error?error.message:'动画记录同步失败，请重新连接。'));
  const finishClosed = () => { closed = true; forgetClosedRoom(identity.roomCode); eventClient.reset(); socket.io.reconnection(false); socket.disconnect(); onStatus(expired ? 'expired' : 'closed', expired ? '房间已到期关闭，请重新创建。' : closedMessage); };
  socket.on('connect', () => { eventClient.reset(); if (closed) { finishClosed(); return; } onStatus('online'); socket.emit('sync'); });
  socket.on('snapshot', (room: RoomView) => { if(room.closedAt)onSnapshot(room);else eventClient.receive(room); if (room.closedAt) { closed = true; socket.io.reconnection(false); onStatus('closed', '房间已解散，请创建或加入其他房间。'); } });
  socket.on('room-closed', (event: { code: string; reason?: 'expired'|'host-away'|'dismissed' }) => { if (event.code === identity.roomCode) { expired = event.reason === 'expired'; if(event.reason==='host-away')closedMessage='房主连续离开超过30分钟，房间已关闭。'; finishClosed(); } });
  socket.on('disconnect', () => { if (closed) finishClosed(); else onStatus('offline'); });
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => { if (error.data?.code === 'ROOM_EXPIRED' || /3小时|已过期/.test(error.message)) { expired = true; finishClosed(); } else if (error.data?.code === 'ROOM_CLOSED' || /房间已解散|房间已关闭/.test(error.message)) {if(error.message.includes('30分钟'))closedMessage=error.message;finishClosed();} else onStatus('error', error.message); });
  return { get connected() { return !closed && socket.connected; }, subscribeCommunity: community.subscribe,
    sendChat(message) { return new Promise((resolve,reject) => socket.timeout(6500).emit('chat-send', message, (error: Error | null, reply: ChatReply) => { if (error) reject(error); else { if (reply.message) community.update({messages: [reply.message]}); resolve(reply); } })); },
    rename(request) { return new Promise((resolve,reject) => socket.timeout(6500).emit('rename', request, (error: Error | null, reply: RenameReply) => { if (error) reject(error); else { if (reply.ok) community.update({name: reply.name, renameRemaining: reply.remaining}); resolve(reply); } })); },
    connect() { if (!closed) { if(socket.connected){eventClient.reset();onStatus('online');socket.emit('sync');chatSync();}else socket.connect(); } }, disconnect() { eventClient.reset(); socket.disconnect(); }, acknowledgeEvents(cursor){eventClient.acknowledge(cursor);}, emit(event) { if (!closed) socket.emit(event); }, async request(envelope) { try { return await socketRequest(socket, envelope); } catch (error) { if (closed && envelope.action.type === 'close') return { ok: true }; throw error; } } };
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
