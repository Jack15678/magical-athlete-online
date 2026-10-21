import type { Racer, RoomView } from '../../shared/types.js';
import type { PresentationBeat } from '../presentation.js';
import { boardPoint, TILE } from './math.js';

export type CameraMode = 'self' | 'overview';
export type CameraState = 'self' | 'action' | 'choice' | 'manual' | 'overview';
export interface CameraFocus { state: CameraState; ids: string[]; positions: number[]; chainId?: string }
export const ACTION_HOLD_MS = 700;

/** Only public, already-confirmed presentation data enters the camera. */
export function actionFocus(beat: PresentationBeat, racers: Racer[], queue: PresentationBeat[] = []): CameraFocus {
  const chain = queue.filter(value => value.chainId && value.chainId === beat.chainId);
  const beats = chain.length ? chain : [beat];
  const ids = [...new Set(beats.flatMap(value => [value.source, ...value.targets]).filter((id): id is string => !!id))];
  const positions = ids.flatMap(id => {
    const motions = beats.flatMap(value => value.motions).filter(value => value.racerId === id);
    if (motions.length) return motions.flatMap(motion => motion.path);
    const racer = racers.find(value => value.id === id);
    return racer ? [racer.position] : [];
  });
  return { state: 'action', ids, positions, chainId: beat.chainId ?? beat.key };
}

export function ownFocus(room: RoomView, racers: Racer[]): CameraFocus {
  const mine = racers.filter(racer => racer.playerId === room.selfId);
  const racer = mine.find(value => value.id === room.currentRacerId) ?? mine.find(value => !value.finished && !value.eliminated) ?? mine[0];
  return { state: 'self', ids: racer ? [racer.id] : [], positions: racer ? [racer.position] : [0] };
}

export function choiceFocus(room: RoomView, racers: Racer[]): CameraFocus | undefined {
  const pending = room.pending;
  if (!pending || pending.playerId !== room.selfId) return;
  const ids = [...new Set([pending.racerId, ...pending.options.map(option => option.id)].filter((id): id is string => !!id && racers.some(racer => racer.id === id)))];
  const positions = ids.flatMap(id => racers.filter(racer => racer.id === id).map(racer => racer.position));
  // Some abilities select a numbered cell rather than a racer.
  if (pending.kind === 'third-wheel') positions.push(...pending.options.map(option => Number(option.id)).filter(value => Number.isInteger(value) && value >= 0 && value <= 30));
  return { state: 'choice', ids, positions: positions.length ? positions : ownFocus(room, racers).positions };
}

/** Fit the visible points while leaving breathing room for floating controls. */
export function cameraFrame(positions: number[], compact: boolean, width: number, height: number, overview = false) {
  const points = (overview ? Array.from({ length: 31 }, (_, index) => index) : positions.length ? positions : [0]).map(position => boardPoint(position, compact));
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
  const minZ = Math.min(...points.map(point => point[2])), maxZ = Math.max(...points.map(point => point[2]));
  const spanX = overview ? maxX - minX + TILE * 2.5 : Math.max(TILE * (compact ? 3.1 : 6.8), maxX - minX + TILE * (compact ? 2.8 : 3.5));
  const spanY = overview ? (maxZ - minZ) * .765 + TILE * 4 : Math.max(TILE * (compact ? 4.5 : 4.2), (maxZ - minZ) * .765 + TILE * 3.8);
  const usableWidth = Math.max(160, width - (compact ? 24 : 80));
  const usableHeight = Math.max(180, height - (compact ? 235 : 180));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, zoom: Math.min(usableWidth / spanX, usableHeight / spanY) };
}

/** A stable grid spreads crowds without reducing every pawn to a tiny dot. */
export function pawnOccupancy(racer: Racer, racers: Racer[], position: number) {
  const clampPosition = (value: number) => Math.max(0, Math.min(30, value));
  const group = racers.filter(value => clampPosition(value.position) === clampPosition(position) && !value.eliminated);
  const index = Math.max(0, group.findIndex(value => value.id === racer.id));
  const cols = group.length > 4 ? 3 : group.length > 1 ? 2 : 1;
  const rows = Math.ceil(group.length / cols);
  const spacing = group.length > 4 ? .58 : .86;
  return { x: ((index % cols) - (Math.min(group.length, cols) - 1) / 2) * spacing, z: (Math.floor(index / cols) - (rows - 1) / 2) * spacing, scale: group.length > 4 ? .82 : group.length > 1 ? 1.05 : 1.45 };
}
