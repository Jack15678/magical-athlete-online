import type { GameMode } from './types.js';
import { ROOM_TTL_MS } from './constants.js';

/** Only the owner's absence closes a personal room; game activity is irrelevant. */
export const PERSONAL_ROOM_AWAY_MS = 30 * 60 * 1000;
export type RoomCloseReason = 'expired' | 'host-away' | 'dismissed';
export interface RoomClosure { code:string; closedAt:number; reason:RoomCloseReason; hostId?:string; version?:number; actionId?:string }
export const personalRoom = (room:{mode?:GameMode}):boolean => room.mode==='ai'||room.mode==='practice';
export function roomExpiry(room:{mode?:GameMode;createdAt:number;hostLeftAt?:number;expiresAt?:number}):number {
  return personalRoom(room)
    ? room.hostLeftAt===undefined?Number.MAX_SAFE_INTEGER:room.hostLeftAt+PERSONAL_ROOM_AWAY_MS
    : Math.min(room.expiresAt??Number.MAX_SAFE_INTEGER,room.createdAt+ROOM_TTL_MS);
}
