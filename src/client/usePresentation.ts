import { useCallback, useEffect, useRef, useState } from 'react';
import type { Racer, RoomView } from '../shared/types.js';
import { beatDuration, completeBeat, createPlayback, receiveRoom, skipPlayback, type PlaybackState, type PresentationBeat, type PresentationOptions } from './presentation.js';

export interface UsePresentationResult {
  state: PlaybackState | null;
  beat: PresentationBeat | undefined;
  racers: Racer[];
  playing: boolean;
  skip: () => void;
  startedAt: number;
  durationMs: number;
  displayRoom: RoomView | null;
}

/** A visual clock only. Its timers never advance the rule engine or room service. */
export function usePresentation(room: RoomView | null, options: PresentationOptions & { reconnect?: boolean } = {}): UsePresentationResult {
  const [state, setState] = useState<PlaybackState | null>(() => room ? createPlayback(room) : null);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const latestRoom = useRef(room);
  latestRoom.current = room;
  const previousRoom = useRef(room);
  const recovering = useRef(false);
  useEffect(() => {
    const changed = previousRoom.current !== room;
    previousRoom.current = room;
    if (options.reconnect) recovering.current = true;
    const reconnect = !!options.reconnect || (recovering.current && changed);
    if (!options.reconnect && changed) recovering.current = false;
    setState(previous => !room ? null : !previous ? createPlayback(room) : receiveRoom(previous, room, { reconnect }));
  }, [room, options.reconnect]);
  const beat = state?.queue[0];
  const durationMs = beat ? beatDuration(beat, options) : 0;
  useEffect(() => {
    if (!beat) return;
    setStartedAt(performance.now());
    const timer = setTimeout(() => setState(previous => previous?.queue[0]?.key === beat.key ? completeBeat(previous) : previous), durationMs);
    return () => clearTimeout(timer);
  }, [beat?.key, durationMs]);
  const skip = useCallback(() => setState(previous => previous && latestRoom.current ? skipPlayback(previous, latestRoom.current) : previous), []);
  // While a completed action is still being shown, the action prompt must wait.
  const displayRoom: RoomView | null = state ? { ...state.confirmed, racers: state.racers, ...(state.queue.length && ['results', 'finished'].includes(state.confirmed.phase) ? { phase: 'race' as const } : {}) } : room;
  return { state, beat, racers: state?.racers ?? room?.racers ?? [], playing: (state?.queue.length ?? 0) > 0, skip, startedAt, durationMs, displayRoom };
}
