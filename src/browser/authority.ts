import { publicEventBatch } from '../shared/public-events.js';
import { immediateRoomAction } from '../shared/automation.js';
import { personalRoom, roomExpiry } from '../shared/room-lifecycle.js';
import { automaticAction } from '../engine/index.js';
import { createBrowserRoom, projectRoom, reconcileRoster, reduceRoomAction, setRoomDeadline, validateActionEnvelope, validateMetadata } from '../shared/room-core.js';
import type { ActionEnvelope, ActionReply, Room, RoomView } from '../shared/types.js';
import type { RelayMetadata } from '../shared/relay.js';

export const AUTHORITY_DATABASE = 'magical-athlete-browser-authority-v1';
const DATABASE_VERSION = 1;
interface StoredRoom { code: string; authorityId: string; room: Room }
interface Receipt { code: string; playerId: string; actionId: string; request: string; result: ActionReply }
export interface AuthorityOptions {
  /** Test-only substitution; production uses the current origin's IndexedDB. */
  indexedDB?: IDBFactory; databaseName?: string; now?: () => number; randomSeed?: () => number;
}
function entropy(): number { return crypto.getRandomValues(new Uint32Array(1))[0]!; }
function storageError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return Error(`主持设备未能保存本次操作，尚未确认成功。请检查浏览器存储后重试。${detail ? `（${detail}）` : ''}`);
}
function open(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request=factory.open(name,DATABASE_VERSION);
    request.onupgradeneeded=() => {
      const db=request.result;
      if (!db.objectStoreNames.contains('rooms')) db.createObjectStore('rooms',{keyPath:'code'});
      if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts',{keyPath:['code','playerId','actionId']});
    };
    request.onerror=() => reject(storageError(request.error));
    request.onblocked=() => reject(Error('主持设备的旧页面占用了本地存档，请关闭旧页面后重试。'));
    request.onsuccess=() => resolve(request.result);
  });
}
function writeTransaction(db: IDBDatabase, stores: string[]): IDBTransaction {
  // Request the strongest standardized durability mode. Older implementations
  // may not accept its optional third argument, but still support oncomplete.
  try { return db.transaction(stores,'readwrite',{durability:'strict'}); }
  catch (error) { if (error instanceof TypeError) return db.transaction(stores,'readwrite'); throw error; }
}
/** Browser-authoritative session. Callers hold navigator.locks for this room
 * before opening it. The internal queue additionally serializes local intents.
 * No success result or new projection becomes visible before tx.oncomplete. */
export class BrowserAuthority {
  private chain: Promise<unknown> = Promise.resolve();
  private disposed=false;
  private constructor(private readonly db: IDBDatabase, private record: StoredRoom, private meta: RelayMetadata, private readonly options: AuthorityOptions) {
    this.db.onversionchange=() => this.dispose();
  }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private seed(): number { return (this.options.randomSeed ?? entropy)(); }
  static create(meta: RelayMetadata, options: AuthorityOptions = {}): Promise<BrowserAuthority> { return this.initialize(meta,true,options); }
  static load(meta: RelayMetadata, options: AuthorityOptions = {}): Promise<BrowserAuthority> { return this.initialize(meta,false,options); }
  private static async initialize(meta: RelayMetadata, allowCreate: boolean, options: AuthorityOptions): Promise<BrowserAuthority> {
    validateMetadata(meta); const factory=options.indexedDB ?? globalThis.indexedDB;
    if ((options.now ?? Date.now)() >= roomExpiry(meta)) throw Error('房主离开超过30分钟，房间已关闭。');
    if (!factory) throw Error('这个浏览器无法使用本地存档，不能主持比赛。请使用允许 IndexedDB 的正常浏览窗口。');
    const db=await open(factory,options.databaseName ?? AUTHORITY_DATABASE);
    try {
      const record=await new Promise<StoredRoom>((resolve,reject) => {
        const tx=writeTransaction(db,['rooms']);let committed:StoredRoom|undefined;let failure:unknown;
        tx.oncomplete=() => committed ? resolve(committed) : reject(storageError(failure));
        tx.onabort=() => reject(failure instanceof Error ? failure : storageError(tx.error));
        tx.onerror=() => { failure ??= tx.error; };
        const store=tx.objectStore('rooms');const request=store.get(meta.code);
        request.onsuccess=() => { try {
          const existing=request.result as StoredRoom|undefined;const now=(options.now ?? Date.now)();
          if (existing) {
            if (existing.authorityId!==meta.authorityId) throw Error('这个房间的主持身份与本地存档不一致，无法覆盖。');
            const resumed=reconcileRoster(existing.room,meta,now).room;
            // Closing a host page pauses its game. On return, grant a fresh
            // timeout window instead of instantly replaying elapsed deadlines.
            setRoomDeadline(resumed,now);
            committed={code:meta.code,authorityId:meta.authorityId,room:resumed};
          } else {
            if (!allowCreate || meta.phase!=='lobby') throw Error('主持设备没有这局的本地存档，无法恢复。请用创建房间的原浏览器，或创建新房间。');
            committed={code:meta.code,authorityId:meta.authorityId,room:createBrowserRoom(meta,(options.randomSeed ?? entropy)(),now)};
          }
          store.put(committed);
        } catch(error) { failure=error; tx.abort(); } };
      });
      return new BrowserAuthority(db,record,structuredClone(meta),options);
    } catch(error) { db.close(); throw error; }
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next=this.chain.then(() => { if(this.disposed) throw Error('主持页面已经关闭。请在原浏览器重新进入。'); return work(); });
    this.chain=next.catch(() => undefined);return next;
  }
  /** All mutations read the latest record inside their own IDB transaction;
   * this also prevents a stale second instance from overwriting an accepted act. */
  private commit<T>(work: (record: StoredRoom, receipts: IDBObjectStore, save: (record: StoredRoom, value: T) => void) => void): Promise<T> {
    return new Promise((resolve,reject) => {
      let result:T;let committed:StoredRoom|undefined;let failure:unknown;
      let tx:IDBTransaction;
      try { tx=writeTransaction(this.db,['rooms','receipts']); } catch(error) { reject(storageError(error)); return; }
      tx.oncomplete=() => { if(!committed){reject(storageError(failure));return;}this.record=committed;resolve(result); };
      tx.onabort=() => reject(storageError(failure ?? tx.error));
      tx.onerror=() => { failure ??= tx.error; };
      const rooms=tx.objectStore('rooms'),receipts=tx.objectStore('receipts');const get=rooms.get(this.meta.code);
      const save=(record:StoredRoom,value:T) => { try { rooms.put(record);committed=record;result=value; } catch(error){failure=error;tx.abort();} };
      get.onsuccess=() => { try {
        const record=get.result as StoredRoom|undefined;
        if(!record||record.authorityId!==this.meta.authorityId)throw Error('主持存档缺失或身份不匹配。');
        work(record,receipts,save);
      } catch(error){failure=error;tx.abort();} };
    });
  }
  roster(meta: RelayMetadata): Promise<void> {
    return this.updateRoster(meta,false);
  }
  /** Call once after the authority socket authenticates, including reconnects
   * that retain this instance. Disconnected host time never consumes a turn. */
  resume(meta: RelayMetadata): Promise<void> {
    return this.updateRoster(meta,true);
  }
  private updateRoster(meta: RelayMetadata, resume: boolean): Promise<void> {
    return this.serial(async() => {
      validateMetadata(meta);
      if(meta.code!==this.meta.code||meta.authorityId!==this.meta.authorityId)throw Error('不能将另一房间的成员写入本局。');
      await this.commit<void>((record,_receipts,save) => {
        const now=this.now();
        const next=reconcileRoster(record.room,meta,now).room;
        if(resume)setRoomDeadline(next,now);
        save({...record,room:next},undefined);
      });
      this.meta=structuredClone(meta);
    });
  }
  action(playerId: string, envelope: ActionEnvelope): Promise<ActionReply> {
    return this.serial(async() => {
      let canonical:ActionEnvelope;
      try { canonical=validateActionEnvelope(envelope); }
      catch(error){return{ok:false,error:error instanceof Error?error.message:'操作格式不正确。',version:this.record.room.version};}
      return this.commit<ActionReply>((record,receipts,save) => {
        this.perform(record,receipts,playerId,canonical,false,save);
      });
    });
  }
  private perform(record:StoredRoom,receipts:IDBObjectStore,playerId:string,envelope:ActionEnvelope,automatic:boolean,save:(record:StoredRoom,value:ActionReply)=>void):void {
    const request=JSON.stringify(envelope.action);const lookup=receipts.get([record.code,playerId,envelope.actionId]);
    lookup.onsuccess=() => {
      try {
        const prior=lookup.result as Receipt|undefined;
        if(prior){save(record,prior.request===request?{...prior.result,duplicate:true}:{ok:false,error:'同一操作编号不能用于不同操作。',version:record.room.version});return;}
        let result:ActionReply;let next=record;
        if(!record.room.game.players.some(p=>p.id===playerId))result={ok:false,error:'你不在这个房间的参赛席位中。',version:record.room.version};
        else if(record.room.closedAt!==undefined)result={ok:false,error:'房间已解散，请创建或加入其他房间。',version:record.room.version};
        else if(record.room.version!==envelope.expectedVersion)result={ok:false,error:'画面已更新，请同步后重试。',version:record.room.version};
        else { try {
          const room=reduceRoomAction(record.room,playerId,envelope.action,{now:this.now(),rematchSeed:envelope.action.type==='rematch'?this.seed():0,automatic});
          next={...record,room};result={ok:true,version:room.version};
        } catch(error){result={ok:false,error:error instanceof Error?error.message:'操作失败，请重试。',version:record.room.version};} }
        receipts.put({code:record.code,playerId,actionId:envelope.actionId,request,result} satisfies Receipt);
        save(next,result);
      } catch(error) {
        // This callback runs synchronously while the same transaction is active.
        // A receipt failure must abort its earlier room write as one atomic unit.
        try { lookup.transaction?.abort(); } catch { /* request has no transaction on some browsers */ }
        try { receipts.transaction.abort(); } catch { /* already aborted */ }
      }
    };
  }
  view(playerId: string): RoomView {
    return projectRoom(this.record.room,playerId,{authorityId:this.meta.authorityId,authorityOnline:!this.disposed&&this.meta.members.some(m=>m.id===this.meta.authorityId&&m.connected)});
  }
  events(playerId:string,afterId:number){return publicEventBatch(this.record.room,playerId,afterId);}
  tick(now = this.now()): Promise<boolean> {
    return this.serial(async() => {
      if(!this.meta.members.some(m=>m.id===this.meta.authorityId&&m.connected))return false;
      const cached=this.record.room;
      if(now>=roomExpiry({...cached,hostLeftAt:this.meta.hostLeftAt}))return false;
      if(cached.closedAt!==undefined)return false;
      if(!immediateRoomAction(cached,now)&&(cached.deadline===null||cached.deadline>now))return false;
      return this.commit<boolean>((record,receipts,save) => {
        if(record.room.closedAt!==undefined){save(record,false);return;}
        const immediate=immediateRoomAction(record.room,now);
        if(!immediate && (record.room.deadline===null||record.room.deadline>now)){save(record,false);return;}
        const next=immediate??automaticAction(record.room.game);
        if(!next){save(record,false);return;}
        this.perform(record,receipts,next.playerId,{actionId:crypto.randomUUID(),expectedVersion:record.room.version,action:next.action},!immediate,(updated,result)=>save(updated,result.ok));
      });
    });
  }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;
    void this.chain.finally(()=>this.db.close());
  }
}
