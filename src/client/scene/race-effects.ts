import type { Racer } from '../../shared/types.js';
import type { PresentationBeat } from '../presentation.js';

export type MarkerKind = Exclude<PresentationBeat['kind'], 'intro' | 'dice' | 'duel-dice' | 'move'>;
export interface RaceEffectMarker { racerId: string; position: number; kind: MarkerKind; endpoint?: 'departure' | 'arrival' }
export interface RacePathMark { racerId: string; position: number; previous: number; backwards: boolean }

/** Public event semantics only: a trip's source caused it; its targets fell. */
export function raceEffectDescriptors(beat: PresentationBeat | undefined, racers: Racer[]) {
  const markers: RaceEffectMarker[] = [], path: RacePathMark[] = [];
  if (!beat || beat.kind === 'intro' || beat.kind === 'dice' || beat.kind === 'duel-dice') return { markers, path };
  const known = new Map(racers.map(racer => [racer.id, racer]));
  if (beat.kind === 'move') {
    const routes = beat.motions.filter(motion => known.has(motion.racerId) && motion.path.length > 1);
    for (const [routeIndex, motion] of routes.entries()) {
      const steps = motion.path.length - 1;
      // Every simultaneous racer keeps its direction cue. Longer paths sample
      // real route steps rather than drawing a shortcut across a board corner.
      const quota = Math.min(steps, Math.floor(12 / routes.length) + (routeIndex < 12 % routes.length ? 1 : 0));
      const indices = new Set(Array.from({ length: quota }, (_, index) => quota === 1 ? steps : 1 + Math.round(index * (steps - 1) / (quota - 1))));
      for (const index of indices) path.push({ racerId: motion.racerId, position: motion.path[index]!, previous: motion.path[index - 1]!, backwards: motion.to < motion.from });
    }
    return { markers, path };
  }
  if (beat.kind === 'warp' || beat.kind === 'swap') {
    for (const motion of beat.motions) if (known.has(motion.racerId)) {
      markers.push({ racerId: motion.racerId, position: motion.from, kind: beat.kind, endpoint: 'departure' });
      if (motion.to !== motion.from) markers.push({ racerId: motion.racerId, position: motion.to, kind: beat.kind, endpoint: 'arrival' });
    }
    return { markers, path };
  }
  const targets = beat.kind === 'trip' || beat.kind === 'eliminate'
    ? beat.targets.length ? beat.targets : [beat.source]
    : [beat.source, ...beat.targets];
  for (const id of new Set(targets)) {
    const racer = id ? known.get(id) : undefined;
    if (racer) markers.push({ racerId: racer.id, position: racer.position, kind: beat.kind });
  }
  return { markers, path };
}
