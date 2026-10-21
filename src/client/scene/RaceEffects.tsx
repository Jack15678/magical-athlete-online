import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, InstancedMesh, MathUtils, MeshBasicMaterial, Object3D, Path, Shape, Vector2 } from 'three';
import type { Racer } from '../../shared/types.js';
import type { PresentationBeat } from '../presentation.js';
import { pawnOccupancy } from './camera.js';
import { boardPoint } from './math.js';
import { raceEffectDescriptors, type MarkerKind, type RaceEffectMarker, type RacePathMark } from './race-effects.js';

const colors: Record<MarkerKind, string> = { trip: '#f56650', recover: '#218f79', score: '#e7a92c', finish: '#e7a92c', warp: '#9471ca', swap: '#cf6ba8', skill: '#369fbb', eliminate: '#75697f' };
const polygon = (points: [number, number][]) => new Shape(points.map(([x, y]) => new Vector2(x, y)));

function glyph(kind: MarkerKind): Shape[] {
  if (kind === 'trip') return [polygon([[-.045, -.055], [.045, -.055], [.065, .23], [-.065, .23]]), polygon([[-.045, -.19], [.045, -.19], [.045, -.1], [-.045, -.1]])];
  if (kind === 'recover') return [polygon([[-.055, -.21], [.055, -.21], [.055, .05], [.19, .05], [0, .25], [-.19, .05], [-.055, .05]])];
  if (kind === 'warp') {
    const diamond = polygon([[0, .25], [.22, 0], [0, -.25], [-.22, 0]]);
    const hole = new Path(); hole.moveTo(0, .12); hole.lineTo(-.105, 0); hole.lineTo(0, -.12); hole.lineTo(.105, 0); hole.closePath(); diamond.holes.push(hole);
    return [diamond];
  }
  if (kind === 'swap') return [polygon([[-.24, .07], [.08, .07], [.08, -.01], [.25, .13], [.08, .27], [.08, .19], [-.24, .19]]), polygon([[.24, -.07], [-.08, -.07], [-.08, .01], [-.25, -.13], [-.08, -.27], [-.08, -.19], [.24, -.19]])];
  if (kind === 'eliminate') return [polygon([[-.21, .14], [-.14, .21], [.21, -.14], [.14, -.21]]), polygon([[-.21, -.14], [-.14, -.21], [.21, .14], [.14, .21]])];
  const points: [number, number][] = [];
  const rays = kind === 'skill' ? 4 : 5;
  for (let index = 0; index < rays * 2; index++) {
    const angle = Math.PI / 2 + index * Math.PI / rays, radius = index % 2 ? .105 : .25;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return [polygon(points)];
}

function Marker({ marker, racers, compact, startedAt, durationMs, reducedMotion, lowQuality }: { marker: RaceEffectMarker; racers: Racer[]; compact: boolean; startedAt: number; durationMs: number; reducedMotion: boolean; lowQuality: boolean }) {
  const root = useRef<Group>(null), pulse = useRef<Group>(null), badge = useRef<Group>(null), particles = useRef<InstancedMesh>(null);
  const materials = useRef<(MeshBasicMaterial | null)[]>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const shapes = useMemo(() => glyph(marker.kind), [marker.kind]);
  const racer = racers.find(value => value.id === marker.racerId)!;
  const offset = pawnOccupancy(racer, racers, marker.position, compact);
  const point = boardPoint(marker.position, compact);
  const color = colors[marker.kind];
  const celebrate = !lowQuality && !reducedMotion && ['score', 'finish', 'trip'].includes(marker.kind);
  useFrame(() => {
    if (!root.current) return;
    const t = MathUtils.clamp((performance.now() - startedAt) / Math.max(1, durationMs), 0, 1);
    let alpha = reducedMotion ? .92 : Math.min(1, t * 8) * Math.min(1, (1 - t) * 5);
    if (!reducedMotion && marker.endpoint) alpha *= marker.endpoint === 'departure' ? 1 - MathUtils.smoothstep(t, .25, .7) : MathUtils.smoothstep(t, .25, .6);
    root.current.visible = reducedMotion || alpha > .005;
    if (pulse.current) pulse.current.scale.setScalar(reducedMotion ? 1 : .8 + t * .65);
    if (badge.current) badge.current.position.y = reducedMotion ? 0 : Math.sin(t * Math.PI) * .25;
    materials.current.forEach((material, index) => { if (material) material.opacity = alpha * (index === 0 ? .68 : 1); });
    if (particles.current) {
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI * .5 + .4, radius = .3 + t * .6;
        dummy.position.set(Math.cos(angle) * radius, .45 + Math.sin(t * Math.PI) * .75 + index * .09, Math.sin(angle) * radius);
        dummy.scale.setScalar(.045 * (1 - t * .5)); dummy.updateMatrix(); particles.current.setMatrixAt(index, dummy.matrix);
      }
      particles.current.instanceMatrix.needsUpdate = true;
    }
  });
  return <group ref={root} position={[point[0] + offset.x, .235, point[2] + offset.z]}>
    <group ref={pulse}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.33 * offset.scale + .07, .33 * offset.scale + .13, lowQuality ? 16 : 32]} /><meshBasicMaterial ref={material => { materials.current[0] = material; }} color={color} transparent depthWrite={false} side={DoubleSide} toneMapped={false} /></mesh></group>
    <Billboard position={[0, .4 + 1.2 * offset.scale, 0]}><group ref={badge}>
      <mesh><circleGeometry args={[.34, lowQuality ? 16 : 24]} /><meshBasicMaterial ref={material => { materials.current[1] = material; }} color="#fff9e7" transparent depthWrite={false} toneMapped={false} /></mesh>
      <mesh position={[0, 0, .008]}><shapeGeometry args={[shapes]} /><meshBasicMaterial ref={material => { materials.current[2] = material; }} color={color} transparent depthWrite={false} toneMapped={false} /></mesh>
    </group></Billboard>
    {celebrate && <instancedMesh ref={particles} args={[undefined, undefined, 4]} frustumCulled={false}><sphereGeometry args={[1, 6, 4]} /><meshBasicMaterial ref={material => { materials.current[3] = material; }} color={color} transparent depthWrite={false} toneMapped={false} /></instancedMesh>}
  </group>;
}

function PathArrow({ mark, compact, startedAt, durationMs, reducedMotion }: { mark: RacePathMark; compact: boolean; startedAt: number; durationMs: number; reducedMotion: boolean }) {
  const root = useRef<Group>(null), material = useRef<MeshBasicMaterial>(null);
  const shape = useMemo(() => polygon([[-.14, -.11], [0, .06], [.14, -.11], [.14, .04], [0, .22], [-.14, .04]]), []);
  const point = boardPoint(mark.position, compact), previous = boardPoint(mark.previous, compact);
  useFrame(() => {
    if (!root.current || !material.current) return;
    const t = MathUtils.clamp((performance.now() - startedAt) / Math.max(1, durationMs), 0, 1);
    material.current.opacity = reducedMotion ? .8 : .75 * Math.min(1, (1 - t) * 5);
    root.current.visible = reducedMotion || t < 1;
  });
  return <group ref={root} position={[point[0], .236, point[2]]} rotation={[0, Math.atan2(point[0] - previous[0], point[2] - previous[2]), 0]}><mesh rotation={[Math.PI / 2, 0, 0]}><shapeGeometry args={[shape]} /><meshBasicMaterial ref={material} color={mark.backwards ? '#f56650' : '#43bca0'} transparent depthWrite={false} side={DoubleSide} toneMapped={false} /></mesh></group>;
}

export interface RaceEffectsProps { beat?: PresentationBeat; racers: Racer[]; compact: boolean; startedAt: number; durationMs: number; reducedMotion: boolean; lowQuality?: boolean }

/** Transient scene accents never alter confirmed playback or game timing. */
export function RaceEffects({ beat, racers, compact, startedAt, durationMs, reducedMotion, lowQuality = false }: RaceEffectsProps) {
  const descriptors = useMemo(() => raceEffectDescriptors(beat, racers), [beat, racers]);
  const destinations = useMemo(() => racers.map(racer => ({ ...racer, position: beat?.motions.find(motion => motion.racerId === racer.id)?.to ?? racer.position })), [beat, racers]);
  return <group name="confirmed-race-effects">
    {descriptors.markers.map(marker => <Marker key={`${beat?.key}:${marker.racerId}:${marker.endpoint ?? 'status'}`} marker={marker} racers={marker.endpoint === 'arrival' ? destinations : racers} {...{ compact, startedAt, durationMs, reducedMotion, lowQuality }} />)}
    {descriptors.path.map((mark, index) => <PathArrow key={`${beat?.key}:${index}`} mark={mark} {...{ compact, startedAt, durationMs, reducedMotion }} />)}
  </group>;
}
