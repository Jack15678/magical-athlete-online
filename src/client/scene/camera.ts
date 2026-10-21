import type { Racer, RoomView } from '../../shared/types.js';
import type { PresentationBeat } from '../presentation.js';
import { BOARD_CENTER_SPAN, boardPoint, TILE } from './math.js';

export type CameraMode = 'self' | 'overview';
export type CameraState = 'self' | 'action' | 'choice' | 'manual' | 'overview' | 'intro';
export interface CameraFocus { state: CameraState; ids: string[]; positions: number[]; chainId?: string }
export type WorldPoint = [number, number, number];
export const ACTION_HOLD_MS = 700;
export const INTRO_STEP_MS = 1350;
export const INTRO_REDUCED_MS = 1000;
export const MAX_CAMERA_ZOOM = 160;
export const START_EXTENSION = TILE * 3;
export const START_CENTER_OFFSET = -START_EXTENSION / 2;
export const START_GRID_SPACING = 1.3;

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
  const mine = room.role === 'spectator' ? racers : racers.filter(racer => racer.playerId === room.selfId);
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

/**
 * A lower toy-table viewing angle exposes the tile bevels and the pawn faces.
 * Desktop gets a gentle diagonal composition; phones keep the long track upright.
 * Keep these vectors shared by framing and the rig so fits use the actual view.
 */
export function cameraView(compact: boolean, portrait = false) {
  const offset: [number, number, number] = compact ? portrait ? [-14, 18, 14] : [0, 16, 20] : [6, 16, 20];
  const horizontal = Math.hypot(offset[0], offset[2]);
  const distance = Math.hypot(horizontal, offset[1]);
  const right: [number, number, number] = [offset[2] / horizontal, 0, -offset[0] / horizontal];
  const up: [number, number, number] = [-offset[0] * offset[1] / (horizontal * distance), horizontal / distance, -offset[2] * offset[1] / (horizontal * distance)];
  return { offset, right, up };
}

/** Orthographic screen coordinates in world units, before zoom. */
export function cameraProject(point: readonly number[], compact: boolean, portrait = false) {
  const { right, up } = cameraView(compact, portrait);
  return { x: point[0]! * right[0] + point[2]! * right[2], y: point[0]! * up[0] + point[1]! * up[1] + point[2]! * up[2] };
}

/** Fit real projected model bounds, including the plinth and the finish arch. */
export function cameraFrame(positions: number[], compact: boolean, width: number, height: number, overview = false, anchors?: readonly WorldPoint[], closeUp = false) {
  const points = anchors?.length ? anchors : (positions.length ? positions : [0]).map(position => {
    const point = boardPoint(position, compact);
    if (position <= 0) { if (compact) point[2] += START_CENTER_OFFSET; else point[0] += START_CENTER_OFFSET; }
    return point;
  });
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
  const minZ = Math.min(...points.map(point => point[2])), maxZ = Math.max(...points.map(point => point[2]));
  const x = overview ? 0 : (minX + maxX) / 2, z = overview ? 0 : (minZ + maxZ) / 2;
  const bounds: { x: number; y: number }[] = [];
  if (overview) {
    // The stadium rotates with the compact track; do not fold or shorten its route.
    const halfWidth = BOARD_CENTER_SPAN.width / 2 + TILE;
    const halfDepth = BOARD_CENTER_SPAN.depth / 2 + TILE * 1.1;
    for (const bx of [-halfWidth, halfWidth]) for (const bz of [-halfDepth, halfDepth]) for (const by of [-1.1, 2.8]) {
      bounds.push(cameraProject(compact ? [-bz, by, bx] : [bx, by, bz], compact, closeUp));
    }
  } else {
    // Include enlarged pawns, all occupied offsets and both ends of a confirmed move.
    const padding = closeUp ? .9 : TILE * .67;
    for (const point of points) for (const dx of [-padding, padding]) for (const dz of [-padding, padding]) for (const by of closeUp ? [-.3, 2.65] : [-.9, 2.9]) {
      bounds.push(cameraProject([point[0] - x + dx, by, point[2] - z + dz], compact, closeUp));
    }
  }
  // The target remains on the racer/tile, so an asymmetric arch or pawn must fit
  // on either side of it rather than silently shifting the follow destination.
  const fittedWidth = Math.max(...bounds.map(point => Math.abs(point.x))) * 2;
  const fittedHeight = Math.max(...bounds.map(point => Math.abs(point.y))) * 2;
  const spanX = overview ? fittedWidth : Math.max(TILE * (compact ? closeUp ? 2.35 : 2.85 : closeUp ? 3.6 : 5.3), fittedWidth);
  const spanY = overview ? fittedHeight : Math.max(TILE * (compact ? closeUp ? 3.1 : 3.7 : closeUp ? 2.55 : 3.15), fittedHeight);
  const usableWidth = Math.max(160, width - (compact ? 24 : 80));
  const usableHeight = Math.max(180, height - (compact ? 235 : 190));
  return { x, z, zoom: Math.max(3, Math.min(MAX_CAMERA_ZOOM, usableWidth / spanX, usableHeight / spanY)) };
}

/** A full-size two-by-four lineup on the extended start platform. */
export function startPlacement(racer: Racer, racers: Racer[], compact = false) {
  const group = racers.filter(value => !value.eliminated && (value.id === racer.id || value.position <= 0));
  const index = Math.max(0, group.findIndex(value => value.id === racer.id));
  const cols = Math.min(4, Math.max(1, group.length)), rows = Math.ceil(group.length / cols);
  const row = Math.floor(index / cols), rowSize = Math.min(cols, group.length - row * cols);
  const stagger = rows > 1 ? row === 0 ? .35 : -.35 : 0;
  const x = START_CENTER_OFFSET + ((index % cols) - (rowSize - 1) / 2) * START_GRID_SPACING + stagger;
  const z = (row - (rows - 1) / 2) * START_GRID_SPACING;
  return compact ? { x: -z, z: x, scale: 1.65 } : { x, z, scale: 1.65 };
}

/** A stable grid spreads crowds; the spacious start keeps every pawn full size. */
export function pawnOccupancy(racer: Racer, racers: Racer[], position: number, compact = false) {
  if (position <= 0) return startPlacement(racer, racers, compact);
  const clampPosition = (value: number) => Math.max(0, Math.min(30, value));
  const group = racers.filter(value => (value.id === racer.id || clampPosition(value.position) === clampPosition(position)) && !value.eliminated);
  const index = Math.max(0, group.findIndex(value => value.id === racer.id));
  const cols = group.length > 4 ? 3 : group.length > 1 ? 2 : 1;
  const rows = Math.ceil(group.length / cols);
  const spacing = group.length > 4 ? .68 : .9;
  const row = Math.floor(index / cols), rowSize = Math.min(cols, group.length - row * cols);
  return { x: ((index % cols) - (rowSize - 1) / 2) * spacing, z: (row - (rows - 1) / 2) * spacing, scale: group.length > 4 ? .95 : group.length > 1 ? 1.14 : 1.65 };
}

/** Visual location without changing the numbered route used by the rules. */
export function pawnWorldPoint(racer: Racer, racers: Racer[], position: number, compact: boolean): WorldPoint {
  const point = boardPoint(position, compact), offset = pawnOccupancy(racer, racers, position, compact);
  return [point[0] + offset.x, point[1], point[2] + offset.z];
}

/** Frame the displayed pawns, including their expanded starting lineup. */
export function cameraFocusPoints(focus: CameraFocus, racers: Racer[], compact: boolean): WorldPoint[] {
  const selected = focus.ids.flatMap(id => { const racer = racers.find(value => value.id === id); return racer ? [racer] : []; });
  if ((focus.state === 'self' || focus.state === 'intro') && selected.length) {
    return selected.map(racer => pawnWorldPoint(racer, racers, racer.position, compact));
  }
  return focus.positions.flatMap(position => {
    if (position <= 0) {
      const starting = selected.filter(racer => racer.position <= 0);
      if (starting.length) return starting.map(racer => pawnWorldPoint(racer, racers, 0, compact));
      const point = boardPoint(0, compact);
      if (compact) point[2] += START_CENTER_OFFSET; else point[0] += START_CENTER_OFFSET;
      return [point];
    }
    return [boardPoint(position, compact)];
  });
}

export function raceIntroKey(room: Pick<RoomView, 'code' | 'createdAt' | 'round' | 'selfId'>) {
  return `magical-athlete:intro:${room.code}:${room.createdAt ?? ''}:${room.round}:${room.selfId}`;
}

/** Rejoining an underway race must never replay its opening tour. */
export function raceIntroEligible(room: RoomView, racers: Racer[]) {
  if (room.phase !== 'race' || !racers.length || racers.some(racer => racer.position !== 0 || racer.finished || racer.eliminated)) return false;
  const reveal = room.logs.findLastIndex(event => event.type === 'reveal');
  return !room.logs.slice(reveal + 1).some(event => ['die', 'roll', 'move', 'swap', 'warp', 'finish', 'eliminate'].includes(event.type));
}

/** Mark at the start, so refreshes and disconnects do not restart the tour. */
export function claimRaceIntro(key: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, seen: Set<string>) {
  if (seen.has(key)) return false;
  seen.add(key);
  try {
    if (storage?.getItem(key) === 'seen') return false;
    storage?.setItem(key, 'seen');
  } catch { /* A memory marker still protects remounts when browser storage is unavailable. */ }
  return true;
}

/** Setup is a new chance to introduce entrants, including same-room rematches. */
export function resetRaceIntroForSetup(room: RoomView, storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined, seen: Set<string>) {
  if (!['lobby', 'draft', 'selection'].includes(room.phase)) return false;
  const prefix = `magical-athlete:intro:${room.code}:${room.createdAt ?? ''}:`;
  const suffix = `:${room.selfId}`;
  const belongs = (key: string) => key.startsWith(prefix) && key.endsWith(suffix);
  for (const key of seen) if (belongs(key)) seen.delete(key);
  try {
    for (let index = (storage?.length ?? 0) - 1; index >= 0; index--) {
      const key = storage?.key(index);
      if (key && belongs(key)) storage?.removeItem(key);
    }
  } catch { /* The in-memory markers still reset if browser storage is unavailable. */ }
  return true;
}

export function introStepAt(elapsed: number, count: number, reducedMotion = false): number | undefined {
  const duration = reducedMotion ? INTRO_REDUCED_MS : Math.max(0, count) * INTRO_STEP_MS;
  if (!count || elapsed >= duration) return;
  return reducedMotion ? 0 : Math.floor(Math.max(0, elapsed) / INTRO_STEP_MS);
}

/** Browser timers may fire just before a step boundary; always finish that step. */
export function advanceIntroStep(current: number, elapsed: number, count: number, reducedMotion = false): number | undefined {
  if (reducedMotion) return;
  const measured = introStepAt(elapsed, count);
  const next = Math.max(current + 1, measured ?? count);
  return next < count ? next : undefined;
}

export function introFocus(racers: Racer[], index: number, reducedMotion = false): CameraFocus | undefined {
  const live = racers.filter(racer => !racer.eliminated);
  const selected = reducedMotion ? live : live.slice(index, index + 1);
  if (!selected.length) return;
  return { state: 'intro', ids: selected.map(racer => racer.id), positions: selected.map(racer => racer.position) };
}
