import { useCallback, useEffect, useRef, useState } from 'react';
import type { Racer, RoomView } from '../../shared/types.js';
import { advanceIntroStep, claimRaceIntro, introFocus, INTRO_REDUCED_MS, INTRO_STEP_MS, raceIntroEligible, raceIntroKey, resetRaceIntroForSetup } from './camera.js';

const seenInDocument = new Set<string>();
interface IntroRun { key: string; ids: string[]; startedAt: number | null; index: number }

/** Mount in App, where setup phases remain observable while Board3D is unmounted. */
export function useRaceIntroReset(room: RoomView | null | undefined) {
  useEffect(() => {
    if (!room) return;
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Storage is optional. */ }
    resetRaceIntroForSetup(room, storage, seenInDocument);
  }, [room?.code, room?.createdAt, room?.selfId, room?.phase, room?.round]);
}

/** Optional local presentation. It never delays authority, choices or confirmed play. */
export function useRaceIntro(room: RoomView, racers: Racer[], reducedMotion: boolean, blocked = false) {
  const key = raceIntroKey(room);
  const decided = useRef<string | null>(null);
  const [run, setRun] = useState<IntroRun | null>(null);
  const skip = useCallback(() => setRun(null), []);
  useEffect(() => {
    if (room.phase !== 'race') { setRun(null); return; }
    if (!racers.length || decided.current === key) return;
    decided.current = key;
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Embedded/private contexts may forbid storage. */ }
    const fresh = claimRaceIntro(key, storage, seenInDocument);
    setRun(fresh && raceIntroEligible(room, racers) ? { key, ids: racers.map(racer => racer.id), startedAt: null, index: 0 } : null);
  }, [key, room.phase, racers.length]);
  useEffect(() => {
    if (!run || run.key !== key) return;
    if (run.startedAt === null && !blocked) {
      if (!raceIntroEligible(room, racers)) { skip(); return; }
      setRun(value => value?.key === key ? { ...value, startedAt: performance.now() } : value);
    }
    else if (run.startedAt !== null && blocked) skip();
  }, [key, run?.startedAt, run?.key, blocked, skip]);
  useEffect(() => {
    if (run && run.startedAt !== null && !raceIntroEligible(room, racers)) skip();
  }, [room.version, skip]);
  useEffect(() => {
    if (!run || run.startedAt === null || run.key !== key) return;
    const next = reducedMotion ? INTRO_REDUCED_MS : (run.index + 1) * INTRO_STEP_MS;
    const timer = setTimeout(() => {
      const index = advanceIntroStep(run.index, performance.now() - run.startedAt!, run.ids.length, reducedMotion);
      setRun(value => value?.key !== run.key ? value : index === undefined ? null : { ...value!, index });
    }, Math.max(0, next - (performance.now() - run.startedAt)));
    return () => clearTimeout(timer);
  }, [key, run?.key, run?.startedAt, run?.index, reducedMotion]);
  const ordered = run?.ids.flatMap(id => { const racer = racers.find(value => value.id === id); return racer ? [racer] : []; }) ?? [];
  const active = run?.key === key && run.startedAt !== null && !blocked;
  return {
    focus: active ? introFocus(ordered, run.index, reducedMotion) : undefined,
    racer: active && !reducedMotion ? ordered[run.index] : undefined,
    index: run?.index ?? 0,
    total: run?.ids.length ?? 0,
    reducedMotion,
    skip,
  };
}
