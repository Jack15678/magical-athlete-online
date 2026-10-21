import type { GameEvent, Racer, RoomView } from '../shared/types.js';

/** Presentation consumes confirmed event IDs. It never sends a rule action. */
export type PresentationKind = 'dice' | 'move' | 'warp' | 'swap' | 'skill' | 'trip' | 'recover' | 'score' | 'finish' | 'eliminate';
export interface PresentationMotion {
  racerId: string;
  from: number;
  to: number;
  /** Ordinary motion visits every actual track index, including backward steps. */
  path: number[];
}
export interface PresentationBeat {
  key: string;
  kind: PresentationKind;
  events: GameEvent[];
  source?: string;
  targets: string[];
  motions: PresentationMotion[];
  face?: number;
  cause?: string;
  durationMs: number;
}
interface ConfirmedDie { source?: string; face: number; eventId: number }
export interface PlaybackState {
  roomCode: string;
  version: number;
  round: number;
  /** Highest accepted ID, including queued events, so repeated snapshots are safe. */
  eventCursor: number;
  racers: Racer[];
  queue: PresentationBeat[];
  confirmed: RoomView;
  lastDie?: ConfirmedDie;
}
export interface PresentationOptions { speed?: number; reducedMotion?: boolean }

const cloneRacers = (racers: Racer[]) => racers.map(racer => ({ ...racer, flags: { ...racer.flags } }));
const highestEvent = (events: GameEvent[]) => events.reduce((id, event) => Math.max(id, event.id), 0);
const roster = (racers: Racer[]) => racers.map(racer => `${racer.id}:${racer.characterId}`).sort().join('|');

/** Joining or restoring a room establishes a baseline; old rolls are not replayed. */
export function createPlayback(room: RoomView): PlaybackState {
  let lastDie: ConfirmedDie | undefined;
  for (const event of room.logs) {
    if (event.type === 'die') {
      const face = confirmedFace(event, room);
      if (face !== undefined) lastDie = { source: event.source, face, eventId: event.id };
    }
    if (['roll', 'turn', 'reveal', 'phase', 'move', 'warp', 'place'].includes(event.type)) lastDie = undefined;
  }
  return { roomCode: room.code, version: room.version, round: room.round, eventCursor: highestEvent(room.logs), racers: cloneRacers(room.racers), queue: [], confirmed: room, lastDie };
}

export function trackPath(from: number, to: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  const start = Math.max(0, Math.trunc(from));
  const end = Math.max(0, Math.trunc(to));
  if (start === end) return [start];
  const direction = Math.sign(end - start);
  return Array.from({ length: Math.abs(end - start) + 1 }, (_, index) => start + index * direction);
}

/** Older persisted rooms have no structured face field; their log suffix is exact. */
export function confirmedFace(event: GameEvent, room?: RoomView): number | undefined {
  const structured = (event as GameEvent & { face?: number }).face;
  if (structured !== undefined && Number.isInteger(structured) && structured >= 1 && structured <= 6) return structured;
  const value = /(?:最终骰面为|掷出)\s*([1-6])\s*[。！!]?\s*$/.exec(event.text)?.[1];
  if (value) return Number(value);
  // Use lastRoll only for the newest confirmed die, never for an older reroll.
  const newest = room?.logs.filter(log => log.type === 'die' || log.type === 'roll').at(-1);
  const lastRoll = room?.lastRoll;
  if (lastRoll && newest?.id === event.id && lastRoll.racerId === event.source) return lastRoll.face;
  return undefined;
}

function eventMotion(event: GameEvent, kind: PresentationKind): PresentationMotion[] {
  return (event.targets ?? []).flatMap((racerId, index) => {
    const from = event.before?.[index]; const to = event.after?.[index];
    if (from === undefined || to === undefined || !Number.isFinite(from) || !Number.isFinite(to)) return [];
    return [{ racerId, from, to, path: kind === 'move' ? trackPath(from, to) : [from, to] }];
  });
}

function beatForEvent(event: GameEvent, room: RoomView): PresentationBeat | undefined {
  let kind: PresentationKind;
  if (event.type === 'die' || event.type === 'roll') kind = 'dice';
  else if (event.type === 'move') kind = 'move';
  else if (event.type === 'warp') kind = event.cause === 'flip-flop' ? 'swap' : 'warp';
  else if (event.type === 'place') kind = 'warp';
  else if (['trip', 'recover', 'score', 'finish', 'eliminate'].includes(event.type)) kind = event.type as PresentationKind;
  else if (['power', 'copy', 'prediction', 'duel', 'cancel', 'reroll', 'skip'].includes(event.type)) kind = 'skill';
  else return undefined;
  const face = kind === 'dice' ? confirmedFace(event, room) : undefined;
  if (kind === 'dice' && face === undefined) return undefined;
  const motions = eventMotion(event, kind);
  const longest = motions.reduce((steps, motion) => Math.max(steps, Math.abs(motion.to - motion.from)), 0);
  const durationMs = kind === 'dice' ? 2500 : kind === 'move' ? 200 + Math.max(1, longest) * 220 : kind === 'swap' || kind === 'warp' ? 950 : kind === 'trip' ? 850 : kind === 'finish' ? 850 : kind === 'score' ? 650 : 600;
  return { key: `${room.code}:${room.round}:${event.id}`, kind, events: [event], source: event.source, targets: event.targets ?? (event.source ? [event.source] : []), motions, face, cause: event.cause, durationMs };
}

function mergeSimultaneous(previous: PresentationBeat | undefined, next: PresentationBeat): PresentationBeat | undefined {
  const group = next.events[0]?.group;
  if (!previous || !group || previous.events.at(-1)?.group !== group || previous.kind !== next.kind || !['move', 'warp', 'swap'].includes(next.kind)) return undefined;
  return { ...previous, events: [...previous.events, ...next.events], targets: [...new Set([...previous.targets, ...next.targets])], motions: [...previous.motions, ...next.motions], durationMs: Math.max(previous.durationMs, next.durationMs) };
}

/**
 * Enqueue only new, ordered, server-confirmed events. A reconnect, new roster,
 * rematch/reset, or missing event window restores the authoritative board.
 */
export function receiveRoom(state: PlaybackState, room: RoomView, options: { reconnect?: boolean } = {}): PlaybackState {
  if (room.code !== state.roomCode || options.reconnect) return createPlayback(room);
  if (room.version < state.version) return state;
  const latestId = highestEvent(room.logs);
  if (latestId < state.eventCursor) return createPlayback(room);
  if (room.version === state.version && latestId <= state.eventCursor) return state;
  const fresh = [...new Map(room.logs.filter(event => event.id > state.eventCursor).map(event => [event.id, event])).values()].sort((a, b) => a.id - b.id);
  if (fresh.some((event, index) => event.id !== state.eventCursor + index + 1)) return createPlayback(room);
  const changedRoster = room.round !== state.round || roster(room.racers) !== roster(state.confirmed.racers);
  const revealingRace = changedRoster && room.phase === 'race' && fresh.some(event => event.type === 'reveal');
  if (changedRoster && !revealingRace) return createPlayback(room);
  // A race starts from the published start cell before any pre-race abilities.
  // Reconstruct that baseline only when the fresh server reveal proves it.
  const baseRacers = revealingRace ? cloneRacers(room.racers).map(racer => ({ ...racer, position: 0, tripped: false, finished: false, eliminated: false, rank: undefined })) : state.racers;
  const queue = revealingRace ? [] : [...state.queue];
  let lastDie = revealingRace ? undefined : state.lastDie;
  for (const event of fresh) {
    if (['turn', 'reveal', 'phase', 'move', 'warp', 'place'].includes(event.type)) lastDie = undefined;
    const beat = beatForEvent(event, room);
    if (!beat) continue;
    // `die` is the throw; `roll` confirms it after the optional reroll window.
    // They may arrive in different snapshots. A reroll emits a new `die` ID.
    if (event.type === 'roll' && lastDie && lastDie.source === event.source && lastDie.face === beat.face) { lastDie = undefined; continue; }
    if (event.type === 'die') lastDie = { source: event.source, face: beat.face!, eventId: event.id };
    if (event.type === 'roll') lastDie = undefined;
    const merged = mergeSimultaneous(queue.at(-1), beat);
    if (merged) queue[queue.length - 1] = merged;
    else queue.push(beat);
  }
  return { ...state, round: room.round, version: room.version, eventCursor: latestId, confirmed: room, queue, lastDie, racers: queue.length ? baseRacers : cloneRacers(room.racers) };
}

/** Apply all targets together after their visual beat; later skills cannot jump ahead. */
export function completeBeat(state: PlaybackState): PlaybackState {
  const beat = state.queue[0];
  if (!beat) return state;
  const positions = new Map(beat.motions.map(motion => [motion.racerId, motion.to]));
  const targets = new Set(beat.targets);
  const racers = state.racers.map(racer => {
    const next = { ...racer, flags: { ...racer.flags } };
    if (positions.has(racer.id)) next.position = positions.get(racer.id)!;
    if (beat.kind === 'trip' && targets.has(racer.id)) next.tripped = true;
    if (beat.kind === 'recover' && targets.has(racer.id)) next.tripped = false;
    if (beat.kind === 'eliminate' && targets.has(racer.id)) next.eliminated = true;
    if (beat.kind === 'finish' && racer.id === beat.source) {
      const confirmed = state.confirmed.racers.find(value => value.id === racer.id);
      next.finished = true;
      next.rank = confirmed?.rank;
      next.position = confirmed?.position ?? next.position;
    }
    return next;
  });
  const queue = state.queue.slice(1);
  return { ...state, racers: queue.length ? racers : cloneRacers(state.confirmed.racers), queue };
}

/** Skipping is strictly local: the already-confirmed rule result remains identical. */
export function skipPlayback(state: PlaybackState, room: RoomView = state.confirmed): PlaybackState {
  return createPlayback(room);
}

export function beatDuration(beat: PresentationBeat, options: PresentationOptions = {}): number {
  const speed = Math.max(0.5, Math.min(8, Number.isFinite(options.speed) ? options.speed! : 1));
  if (options.reducedMotion) return Math.round((beat.kind === 'dice' ? 400 : 100) / speed);
  return Math.round(beat.durationMs / speed);
}
