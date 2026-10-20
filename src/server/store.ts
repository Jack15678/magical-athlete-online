import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Room, ActionReply } from '../shared/types.js';

/** Acknowledgement is sent only after this synchronous FULL transaction commits. */
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identities(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, token_hash TEXT NOT NULL, PRIMARY KEY(room_code,player_id));
      CREATE TABLE IF NOT EXISTS receipts(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, action_id TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_code,player_id,action_id));`);
  }
  load(): Room[] { return (this.db.prepare('SELECT state FROM rooms').all() as {state:string}[]).map(x => JSON.parse(x.state) as Room); }
  save(room: Room): void { this.db.prepare('INSERT INTO rooms VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(room.code, JSON.stringify(room), room.updatedAt); }
  identity(code: string, playerId: string): string | undefined { return (this.db.prepare('SELECT token_hash FROM identities WHERE room_code=? AND player_id=?').get(code, playerId) as {token_hash:string}|undefined)?.token_hash; }
  addIdentity(room: Room, id: string, tokenHash: string): void {
    this.transaction(() => { this.save(room); this.db.prepare('INSERT INTO identities VALUES(?,?,?)').run(room.code, id, tokenHash); });
  }
  receipt(code: string, playerId: string, actionId: string): {request:string;result:ActionReply}|undefined {
    const row = this.db.prepare('SELECT request,result FROM receipts WHERE room_code=? AND player_id=? AND action_id=?').get(code, playerId, actionId) as {request:string;result:string}|undefined;
    return row && {request:row.request,result:JSON.parse(row.result) as ActionReply};
  }
  commitAction(room: Room, id: string, actionId: string, request: string, result: ActionReply): void {
    this.transaction(() => { this.save(room); this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(room.code,id,actionId,request,JSON.stringify(result)); });
  }
  transaction(fn: () => void): void { this.db.exec('BEGIN IMMEDIATE'); try { fn(); this.db.exec('COMMIT'); } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  expire(before: number): void { this.db.prepare('DELETE FROM rooms WHERE updated_at < ?').run(before); }
  close(): void { this.db.close(); }
}
