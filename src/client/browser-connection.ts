import { PresentationEventClient } from './presentation-events.js';
import { BrowserAuthority } from '../browser/authority.js';
import type { RelayMetadata, RelayServerMessage, RelayClientMessage } from '../shared/relay.js';
import type { ActionEnvelope, ActionReply, Identity, PublicEventBatch, RoomView } from '../shared/types.js';
import type { ConnectionState, RoomConnection } from './network.js';

const lockName = (code: string) => `magical-athlete:authority:${code}`;
const HOST_OFFLINE = '计算房主网页离线，等待其返回。';
const ROOM_CLOSED = '房间已解散，请创建或加入其他房间。';
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 25_000;

export async function prepareBrowserRoom(meta: RelayMetadata): Promise<void> {
  if (!navigator.locks) throw Error('当前浏览器不支持安全的计算页面锁。请使用新版Chrome、Edge或Firefox，并通过HTTPS打开网站。');
  await navigator.locks.request(lockName(meta.code), { ifAvailable: true }, async lock => {
    if (!lock) throw Error('本房间已有计算页面，请回到原标签页。');
    const authority = await BrowserAuthority.create(meta);
    authority.dispose();
  });
}

interface AwaitingReply { resolve: (reply: ActionReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; closing: boolean }

/** Relay transport plus the creator's exclusively locked, durable browser authority. */
export class BrowserRelayConnection implements RoomConnection {
  private ws: WebSocket | null = null;
  private generation = 0;
  private disposed = false;
  private blocked = false;
  private roomClosed = false;
  private roomExpired = false;
  private roomClosedMessage = ROOM_CLOSED;
  private authenticated = false;
  private synchronized = false;
  private syncRequestId: string | null = null;
  private authorityOnline = false;
  private authorityRole = false;
  private requestedRole = false;
  private metadata: RelayMetadata | null = null;
  private authority: BrowserAuthority | null = null;
  private tryingLock = false;
  private unavailableAuthority = false;
  private releaseLock: (() => void) | null = null;
  private latestRoom: RoomView | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 700;
  private lastPingAt = 0;
  private lastPongAt = 0;
  private hostQueue: Promise<void> = Promise.resolve();
  private tickBusy = false;
  private replies = new Map<string, AwaitingReply>();
  private readonly eventReplies=new Map<string,{resolve:(batch:PublicEventBatch)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private readonly eventClient:PresentationEventClient;
  private upkeep: ReturnType<typeof setInterval>;
  private readonly offline = () => {
    if (this.disposed || this.blocked || this.roomClosed) return;
    this.generation++;
    this.authenticated = false; this.synchronized = false; this.authorityRole = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.eventClient.reset();
    this.ws?.close(1000, 'network offline'); this.ws = null;
    this.rejectReplies('网络已断开，恢复后将重新同步。');
    this.onStatus('offline', '网络已断开，恢复后将重新同步。');
  };
  private readonly online = () => { if (!this.disposed && !this.blocked && !this.roomClosed) this.open(!!this.authority); };

  constructor(private identity: Identity, private onSnapshot: (room: RoomView) => void, private onStatus: (status: ConnectionState, message?: string) => void) {
    this.eventClient=new PresentationEventClient(afterId=>this.readEvents(afterId),room=>this.onSnapshot(room),error=>this.fail(error instanceof Error?error.message:'未能补齐动画记录，请重新连接。'));
    window.addEventListener('offline', this.offline);
    window.addEventListener('online', this.online);
    this.upkeep = setInterval(() => {
      if (this.disposed || this.blocked || this.roomClosed) return;
      if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
        const now = Date.now();
        if (now - this.lastPongAt >= PONG_TIMEOUT_MS) {
          // A disconnected network can leave the browser's WebSocket OPEN indefinitely.
          // Replace its generation directly instead of waiting for a close handshake.
          this.rejectReplies('联机连接暂时中断，正在重新同步。');
          this.open(!!this.authority);
          return;
        }
        if (now - this.lastPingAt >= PING_INTERVAL_MS) this.ping(now);
      }
      if (!this.disposed && !this.blocked && this.authenticated && !this.authorityOnline) void this.tryAuthority();
      if (this.authorityRole && this.authenticated && this.ws?.readyState === WebSocket.OPEN && this.authority && !this.tickBusy) {
        this.tickBusy = true;
        this.enqueueHost(async () => { try { if (await this.authority!.tick()) this.broadcast(); } finally { this.tickBusy = false; } });
      }
    }, 250);
    this.open(false);
  }
  acknowledgeEvents(cursor:number){this.eventClient.acknowledge(cursor);}
  private readEvents(afterId:number):Promise<PublicEventBatch>{
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.eventReplies.delete(requestId);reject(Error('动画记录同步超时，请重新连接。'));},10_000);
      this.eventReplies.set(requestId,{resolve,reject,timer});
      if(!this.send({type:'events',requestId,afterId})){clearTimeout(timer);this.eventReplies.delete(requestId);reject(Error('连接已中断，正在等待动画记录。'));}
    });
  }
  get connected() { return !this.disposed && !this.blocked && !this.roomClosed && this.authenticated && this.synchronized && this.authorityOnline && this.ws?.readyState === WebSocket.OPEN; }
  get canClose() {
    return !this.disposed && !this.blocked && !this.roomClosed && this.authenticated && this.ws?.readyState === WebSocket.OPEN &&
      this.identity.role !== 'spectator' && this.metadata?.code === this.identity.roomCode && this.metadata.adminHostId === this.identity.playerId &&
      (this.metadata.mode === 'practice' || this.metadata.mode === 'ai');
  }
  connect() {
    if (this.disposed || this.roomClosed) return;
    this.blocked = false; this.unavailableAuthority = false;
    if (this.ws?.readyState === WebSocket.OPEN) { this.emit('sync'); void this.tryAuthority(); }
    else this.open(!!this.authority);
  }
  disconnect() {
    if (this.disposed) return;
    this.disposed = true; this.generation++;this.eventClient.reset();
    window.removeEventListener('offline', this.offline);
    window.removeEventListener('online', this.online);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    clearInterval(this.upkeep); this.ws?.close(1000, 'page closed'); this.ws = null;
    this.rejectReplies('页面已断开连接。'); this.releaseLock?.();
  }
  emit(event: 'sync') { if (event === 'sync' && this.authenticated && !this.roomClosed) { this.syncRequestId = crypto.randomUUID(); this.send({ type: 'sync', requestId: this.syncRequestId }); } }
  async request(envelope: ActionEnvelope): Promise<ActionReply> {
    let current = envelope;
    for (let attempt = 0; ; attempt++) {
      const reply = await this.requestOnce(current);
      // Ready is an explicit, idempotent lobby preference. A different player's
      // ready/roster update can overtake its snapshot on a higher-latency link.
      // Rebase only after a definitive rejection and its fresh private snapshot;
      // a new id is required because the rejected id already has a receipt.
      const room = this.latestRoom;
      if (current.action.type !== 'ready' || reply.ok || reply.error !== '画面已更新，请同步后重试。' || attempt >= 2 ||
          reply.version === undefined || reply.version <= current.expectedVersion || !room || room.closedAt || room.phase !== 'lobby' || room.version < reply.version) return reply;
      current = { actionId: crypto.randomUUID(), expectedVersion: room.version, action: current.action };
    }
  }
  private requestOnce(envelope: ActionEnvelope): Promise<ActionReply> {
    if (!this.connected && !(envelope.action.type === 'close' && this.canClose)) return Promise.reject(Error(this.authorityOnline ? '连接已中断，正在重新同步。' : HOST_OFFLINE));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.replies.delete(requestId); if (this.roomClosed && envelope.action.type === 'close') resolve({ ok: true }); else reject(Error('操作确认超时。')); }, 6500);
      this.replies.set(requestId, { resolve, reject, timer, closing: envelope.action.type === 'close' });
      if (!this.send({ type: 'action', requestId, envelope })) { clearTimeout(timer); this.replies.delete(requestId); reject(Error('连接已中断。')); }
    });
  }
  private send(message: RelayClientMessage) {
    if (this.disposed || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message)); return true;
  }
  private open(authority: boolean) {
    if (this.disposed || this.blocked || this.roomClosed) return;
    if (!navigator.onLine) { this.onStatus('offline', '网络已断开，恢复后将重新同步。'); return; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.eventClient.reset();
    const generation = ++this.generation;
    this.authenticated = false; this.synchronized = false; this.syncRequestId = null; this.authorityRole = false; this.requestedRole = authority;
    this.lastPingAt = 0; this.lastPongAt = 0;
    this.ws?.close(1000, 'reconnecting');
    const url = new URL(`/api/browser/ws/${encodeURIComponent(this.identity.roomCode)}`, location.origin); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(url);
    this.onStatus('connecting');
    ws.addEventListener('open', () => { if (generation === this.generation) this.send({ type: 'auth', identity: this.identity, authority }); });
    ws.addEventListener('message', event => {
      if (generation !== this.generation || this.disposed) return;
      if (event.data === 'pong') { this.lastPongAt = Date.now(); return; }
      try { this.receive(JSON.parse(String(event.data)) as RelayServerMessage); }
      catch { this.fail('收到无法读取的中继消息，请重新连接。'); }
    });
    ws.addEventListener('error', () => { if (generation === this.generation && !this.disposed) this.onStatus('offline', '与联机中继的连接暂时中断，正在重连。'); });
    ws.addEventListener('close', event => {
      if (generation !== this.generation || this.disposed) return;
      if (event.code === 4404 && /过期|3小时/.test(event.reason)) this.roomExpired = true;
      if (event.code === 4410 || this.roomClosed || this.roomExpired) { this.finishClosed(); return; }
      this.authenticated = false; this.synchronized = false; this.authorityRole = false; this.rejectReplies('连接已中断。');
      if ([4401, 4404, 4409, 4429].includes(event.code)) {
        this.blocked = true; this.releaseLock?.();
        this.onStatus('error', event.code === 4409 ? '另一标签页已接管计算。可关闭本页，或点击重连作为普通页面返回。' : event.reason || '房间或身份已失效，请检查邀请链接。');
        return;
      }
      this.onStatus('offline', '与联机中继的连接暂时中断，正在重连。');
      if (!this.blocked) {
        this.reconnectTimer = setTimeout(() => this.open(!!this.authority), this.reconnectDelay);
        this.reconnectDelay = Math.min(5000, this.reconnectDelay * 1.7);
      }
    });
  }
  private receive(message: RelayServerMessage) {
    if (message.type === 'room-closed') {
      if (message.code === this.identity.roomCode) { this.roomExpired = message.reason === 'expired'; this.roomClosedMessage=message.reason==='host-away'?'房主连续离开超过30分钟，房间已关闭。':ROOM_CLOSED; this.finishClosed(); }
    } else if (message.type === 'auth-ok') {
      this.authenticated = true; this.reconnectDelay = 700; this.metadata = message.meta;
      this.lastPongAt = Date.now(); this.ping(this.lastPongAt);
      this.authorityOnline = message.authorityOnline; this.authorityRole = message.authority;
      if (this.requestedRole && (!message.authority || !this.authority)) { this.fail('中继未确认本页的计算资格，已停止计算。'); return; }
      this.reportStatus();
      if (this.authorityRole) this.enqueueHost(async () => { await this.authority!.resume(message.meta); this.broadcast(); });
      else void this.tryAuthority();
      this.emit('sync');
    } else if (message.type === 'roster') {
      this.metadata = message.meta;
      if (this.authorityRole && this.authority) this.enqueueHost(async () => { await this.authority!.roster(message.meta); this.broadcast(); });
    } else if (message.type === 'host-status') {
      const wasOnline = this.authorityOnline;
      this.authorityOnline = message.online;
      if (!message.online) this.synchronized = false;
      this.reportStatus();
      if (message.online && (!wasOnline || !this.synchronized)) this.emit('sync');
      if (!message.online) void this.tryAuthority();
    } else if (message.type === 'snapshot') {
      if (message.room.selfId !== this.identity.playerId || message.room.code !== this.identity.roomCode) { this.fail('中继快照身份不匹配，已停止显示。'); return; }
      if (this.latestRoom && message.room.version < this.latestRoom.version) return;
      const snapshotRequestId = (message as typeof message & { requestId?: string }).requestId;
      if (snapshotRequestId && snapshotRequestId === this.syncRequestId) this.synchronized = true;
      this.latestRoom = { ...message.room, hosting: 'browser', authorityId: this.metadata?.authorityId, authorityOnline: this.authorityOnline };
      if(message.room.closedAt)this.onSnapshot(this.latestRoom);else this.eventClient.receive(this.latestRoom);
      if (message.room.closedAt) { this.roomClosed = true; this.onStatus('closed', ROOM_CLOSED); return; }
      this.reportStatus();
    } else if(message.type==='events'){
      const pending=this.eventReplies.get(message.requestId);if(!pending)return;clearTimeout(pending.timer);this.eventReplies.delete(message.requestId);pending.resolve(message.batch);
    } else if (message.type === 'ack') {
      const pending = this.replies.get(message.requestId); if (!pending) return;
      clearTimeout(pending.timer); this.replies.delete(message.requestId); pending.resolve(message.result);
    } else if (message.type === 'error') {
      const eventReply=message.requestId?this.eventReplies.get(message.requestId):undefined;
      if(eventReply&&message.requestId){clearTimeout(eventReply.timer);this.eventReplies.delete(message.requestId);eventReply.reject(Error(message.message));return;}
      if (!this.authorityOnline && message.requestId === this.syncRequestId) { this.reportStatus(); return; }
      const pending = message.requestId ? this.replies.get(message.requestId) : undefined;
      if (pending && message.requestId) { clearTimeout(pending.timer); this.replies.delete(message.requestId); pending.resolve({ ok: false, error: message.message }); }
      else this.onStatus('error', message.message);
    } else if (message.type === 'request' && this.authorityRole && this.authority) {
      this.enqueueHost(async () => {
        if(message.operation==='events'){
          try{this.send({type:'deliver-events',to:message.playerId,requestId:message.requestId,batch:this.authority!.events(message.playerId,message.afterId!)});}
          catch(error){this.send({type:'deliver-events',to:message.playerId,requestId:message.requestId,error:error instanceof Error?error.message:'无法读取动画记录。'});}return;
        }
        if (message.operation === 'sync') { this.deliver(message.playerId, message.requestId); return; }
        if (!message.envelope) return;
        let result: ActionReply;
        try { result = await this.authority!.action(message.playerId, message.envelope); }
        catch (error) { result = { ok: false, error: error instanceof Error ? error.message : '操作未提交，请稍后重试。' }; }
        this.deliver(message.playerId, message.requestId, result);
        if (result.ok) this.broadcast();
      });
    }
  }
  private ping(now: number) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // The relay answers these frames without waking its hibernating Durable Object.
    this.ws.send('ping'); this.lastPingAt = now;
  }
  private reportStatus() {
    if (this.roomClosed) { this.onStatus('closed', ROOM_CLOSED); return; }
    this.onStatus(!this.authorityOnline ? 'offline' : this.synchronized ? 'online' : 'connecting', !this.authorityOnline ? HOST_OFFLINE : this.synchronized ? undefined : '正在同步已保存的最新对局…');
    if (this.latestRoom && this.latestRoom.authorityOnline !== this.authorityOnline) { this.latestRoom = { ...this.latestRoom, authorityOnline: this.authorityOnline }; this.onSnapshot(this.latestRoom); }
  }
  private enqueueHost(operation: () => Promise<void>) {
    this.hostQueue = this.hostQueue.then(async () => { if (!this.disposed && !this.blocked && !this.roomClosed && this.authority) await operation(); }).catch(error => this.fail(error instanceof Error ? error.message : '计算存档失败，请回到原计算房主页面。'));
  }
  private deliver(playerId: string, requestId?: string, result?: ActionReply) {
    if (!this.authorityRole || !this.authority) return;
    const room = this.authority.view(playerId);
    this.send({ type: 'deliver', to: playerId, room, requestId, result, phase: room.phase, adminHostId: room.hostId });
  }
  private broadcast() {
    if (!this.metadata) return;
    for (const member of this.metadata.members) if (member.connected&&!member.isAI) this.deliver(member.id);
    for (const spectator of this.metadata.spectators ?? []) if (spectator.connected) this.deliver(spectator.id);
  }
  private async tryAuthority() {
    const meta = this.metadata;
    if (this.disposed || this.blocked || this.unavailableAuthority || this.authority || this.tryingLock || !this.authenticated || meta?.authorityId !== this.identity.playerId) return;
    if (!navigator.locks) { this.unavailableAuthority = true; this.onStatus('error', '当前浏览器不支持计算页面锁，请回到原计算房主浏览器。'); return; }
    this.tryingLock = true;
    try {
      await navigator.locks.request(lockName(meta.code), { ifAvailable: true }, async lock => {
        if (!lock || this.disposed || this.blocked) return;
        let authority: BrowserAuthority;
        try { authority = await BrowserAuthority.load(meta); }
        catch (error) {
          this.unavailableAuthority = true;
          if (!this.authorityOnline) this.onStatus('error', error instanceof Error ? error.message : '本浏览器没有房主存档，请回到原浏览器。');
          return;
        }
        if (this.disposed || this.blocked) { authority.dispose(); return; }
        this.authority = authority;
        try {
          await new Promise<void>(release => { this.releaseLock = release; this.open(true); });
          await this.hostQueue;
        } finally { authority.dispose(); if (this.authority === authority) this.authority = null; this.authorityRole = false; this.releaseLock = null; }
      });
    } catch (error) { if (!this.disposed) this.fail(error instanceof Error ? error.message : '无法取得计算页面锁。'); }
    finally { this.tryingLock = false; }
  }
  private rejectReplies(message: string) { for(const reply of this.eventReplies?.values()??[]){clearTimeout(reply.timer);reply.reject(Error(message));}this.eventReplies?.clear(); for (const pending of this.replies.values()) { clearTimeout(pending.timer); pending.reject(Error(message)); } this.replies.clear(); }
  private finishClosed() {
    this.roomClosed = true;
    for (const pending of this.replies.values()) { clearTimeout(pending.timer); if (pending.closing) pending.resolve({ ok: true, version: this.latestRoom?.version }); else pending.reject(Error(ROOM_CLOSED)); }
    this.replies.clear();
    this.disconnect();
    this.onStatus(this.roomExpired ? 'expired' : 'closed', this.roomExpired ? '房间已达到3小时上限，请重新创建。' : this.roomClosedMessage??ROOM_CLOSED);
  }
  private fail(message: string) { this.blocked = true; this.authenticated = false; this.authorityRole = false; this.onStatus('error', message); this.ws?.close(1011, 'authority unavailable'); this.releaseLock?.(); this.rejectReplies(message); }
}
