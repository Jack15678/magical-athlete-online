import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Room, ActionReply } from '../shared/types.js';
import type { RoomClosure } from '../shared/room-lifecycle.js';
import { roomExpiry } from '../shared/room-lifecycle.js';
import { MULTIPLAYER_ROOM_LIMIT, ROOM_CAPACITY_MESSAGE } from '../shared/room-config.js';
export interface CreationReceipt<T=unknown> { request:string; result:T }

/** Acknowledgement is sent only after this synchronous FULL transaction commits. */
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS closed_rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS create_receipts(request_id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS member_receipts(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_code,player_id,kind,request_id));
      CREATE TABLE IF NOT EXISTS identities(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, token_hash TEXT NOT NULL, PRIMARY KEY(room_code,player_id));
      CREATE TABLE IF NOT EXISTS receipts(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, action_id TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_code,player_id,action_id));`);
  }
  load(): Room[] { return (this.db.prepare('SELECT state FROM rooms').all() as {state:string}[]).map(x => JSON.parse(x.state) as Room); }
  capacity(now=Date.now()):{used:number;limit:number} { return {used:this.load().filter(room=>(room.mode??'multiplayer')==='multiplayer'&&room.closedAt===undefined&&roomExpiry(room)>now).length,limit:MULTIPLAYER_ROOM_LIMIT}; }
  creationReceipt<T>(requestId:string):CreationReceipt<T>|undefined { const row=this.db.prepare('SELECT request,result FROM create_receipts WHERE request_id=?').get(requestId) as {request:string;result:string}|undefined;return row&&{request:row.request,result:JSON.parse(row.result) as T}; }
  /** Every process uses the same SQLite transaction for admission and creation. */
  createRoom<T>(room:Room,id:string,tokenHash:string,result:T,now:number,requestId?:string,request=''):T {
    let committed=result;
    this.transaction(()=>{
      const prior=requestId?this.creationReceipt<T>(requestId):undefined;
      if(prior){if(prior.request!==request)throw Error('同一建房请求编号不能用于不同设置。');committed=prior.result;return;}
      if((room.mode??'multiplayer')==='multiplayer'&&this.capacity(now).used>=MULTIPLAYER_ROOM_LIMIT)throw Error(ROOM_CAPACITY_MESSAGE);
      this.save(room);this.db.prepare('INSERT INTO identities VALUES(?,?,?)').run(room.code,id,tokenHash);
      if(requestId)this.db.prepare('INSERT INTO create_receipts VALUES(?,?,?)').run(requestId,request,JSON.stringify(result));
    });
    return committed;
  }
  save(room: Room): void { this.db.prepare('INSERT INTO rooms VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(room.code, JSON.stringify(room), room.updatedAt); }
  identity(code: string, playerId: string): string | undefined { return (this.db.prepare('SELECT token_hash FROM identities WHERE room_code=? AND player_id=?').get(code, playerId) as {token_hash:string}|undefined)?.token_hash; }
  addIdentity(room: Room, id: string, tokenHash: string): void {
    this.transaction(() => { this.save(room); this.db.prepare('INSERT INTO identities VALUES(?,?,?)').run(room.code, id, tokenHash); });
  }
  removeIdentity(room: Room, id: string): void {
    this.transaction(() => {
      this.save(room);
      this.db.prepare('DELETE FROM identities WHERE room_code=? AND player_id=?').run(room.code,id);
      this.db.prepare('DELETE FROM receipts WHERE room_code=? AND player_id=?').run(room.code,id);
      this.db.prepare('DELETE FROM member_receipts WHERE room_code=? AND player_id=?').run(room.code,id);
    });
  }
  delete(code: string): void { this.db.prepare('DELETE FROM rooms WHERE code=?').run(code); }
  closed(code:string):RoomClosure|undefined {const row=this.db.prepare('SELECT state FROM closed_rooms WHERE code=?').get(code) as {state:string}|undefined;return row?JSON.parse(row.state) as RoomClosure:undefined;}
  closeRoom(closure:RoomClosure):void {
    this.transaction(()=>{this.db.prepare('INSERT INTO closed_rooms VALUES(?,?) ON CONFLICT(code) DO NOTHING').run(closure.code,JSON.stringify(closure));this.delete(closure.code);});
  }
  receipt(code: string, playerId: string, actionId: string): {request:string;result:ActionReply}|undefined {
    const row = this.db.prepare('SELECT request,result FROM receipts WHERE room_code=? AND player_id=? AND action_id=?').get(code, playerId, actionId) as {request:string;result:string}|undefined;
    return row && {request:row.request,result:JSON.parse(row.result) as ActionReply};
  }
  commitAction(room: Room, id: string, actionId: string, request: string, result: ActionReply): void {
    this.transaction(() => { this.save(room); this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(room.code,id,actionId,request,JSON.stringify(result)); });
  }
  memberReceipt<T>(code:string,id:string,kind:string,requestId:string):{request:string;result:T}|undefined {
    const row=this.db.prepare('SELECT request,result FROM member_receipts WHERE room_code=? AND player_id=? AND kind=? AND request_id=?').get(code,id,kind,requestId) as {request:string;result:string}|undefined;
    return row&&{request:row.request,result:JSON.parse(row.result) as T};
  }
  commitMember(room:Room,id:string,kind:string,requestId:string,request:string,result:unknown):void {
    this.transaction(()=>{this.save(room);this.db.prepare('INSERT INTO member_receipts VALUES(?,?,?,?,?,?)').run(room.code,id,kind,requestId,request,JSON.stringify(result));});
  }
  transaction(fn: () => void): void { this.db.exec('BEGIN IMMEDIATE'); try { fn(); this.db.exec('COMMIT'); } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  close(): void { this.db.close(); }
}
