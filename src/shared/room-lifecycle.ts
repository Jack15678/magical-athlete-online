import type { GameMode } from './types.js';

/** All room modes follow the owner's presence, independently of gameplay. */
export const ROOM_OWNER_AWAY_MS = 30 * 60 * 1000;
/** Compatibility name retained for existing clients and saved diagnostics. */
export const PERSONAL_ROOM_AWAY_MS = ROOM_OWNER_AWAY_MS;
export type RoomCloseReason = 'expired' | 'host-away' | 'dismissed';
export interface RoomClosure { code:string; closedAt:number; reason:RoomCloseReason; hostId?:string; version?:number; actionId?:string }
export const personalRoom = (room:{mode?:GameMode}):boolean => room.mode==='ai'||room.mode==='practice';
export function roomExpiry(room:{mode?:GameMode;createdAt:number;hostLeftAt?:number;expiresAt?:number;closedAt?:number}):number {
  if(room.closedAt!==undefined)return room.closedAt+ROOM_OWNER_AWAY_MS;
  return room.hostLeftAt===undefined?Number.MAX_SAFE_INTEGER:room.hostLeftAt+ROOM_OWNER_AWAY_MS;
}
