import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Racer, RoomView } from '../../shared/types.js';
import { TRACKS } from '../../shared/tracks.js';
import type { PresentationBeat } from '../presentation.js';
import { BOARD_CENTER_SPAN, boardPoint, TILE } from './math.js';
import { specialTileTexture } from './tile-art.js';

const C = { mint: '#84c6b1', darkMint: '#438674', cream: '#fff5df', coral: '#ee785e', ink: '#285e55', wood: '#cda77b', gold: '#edbc55' };
const WIDTH = BOARD_CENTER_SPAN.width + TILE * 1.95;
const DEPTH = BOARD_CENTER_SPAN.depth + TILE * 2.05;
const START_EXTENSION = TILE * 3;

function useKit() {
  const kit = useMemo(() => ({
    tile: new RoundedBoxGeometry(1.91, .38, 1.91, 2, .105),
    top: new RoundedBoxGeometry(1.85, .055, 1.85, 2, .08),
    start: new RoundedBoxGeometry(1.91 + START_EXTENSION, .38, 2.65, 2, .105),
    startTop: new RoundedBoxGeometry(1.85 + START_EXTENSION, .055, 2.59, 2, .08),
    box: new RoundedBoxGeometry(1, 1, 1, 2, .1),
    plinth: new RoundedBoxGeometry(WIDTH, .5, DEPTH, 3, .24),
    band: new RoundedBoxGeometry(WIDTH + .05, .15, DEPTH + .05, 2, .07),
    deck: new RoundedBoxGeometry(WIDTH, .28, DEPTH, 3, .13),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    plastic: new THREE.MeshStandardMaterial({ color: C.cream, roughness: .58, metalness: 0 }),
    mint: new THREE.MeshStandardMaterial({ color: C.mint, roughness: .72 }),
    dark: new THREE.MeshStandardMaterial({ color: C.darkMint, roughness: .66 }),
    coral: new THREE.MeshStandardMaterial({ color: C.coral, roughness: .48 }),
    wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: .88 }),
    gold: new THREE.MeshStandardMaterial({ color: C.gold, roughness: .36, metalness: .35 }),
    ink: new THREE.MeshStandardMaterial({ color: C.ink, roughness: .65 }),
  }), []);
  useEffect(() => () => Object.values(kit).forEach(resource => resource.dispose()), [kit]);
  return kit;
}
type Kit = ReturnType<typeof useKit>;
type BoxProps = { kit: Kit; position: [number, number, number]; scale: [number, number, number]; material?: THREE.Material; shadow?: boolean };
function Box({ kit, position, scale, material = kit.plastic, shadow = true }: BoxProps) {
  return <mesh geometry={kit.box} material={material} position={position} scale={scale} castShadow={shadow} receiveShadow dispose={null} />;
}
function Cylinder({ kit, position, scale, material = kit.plastic }: Omit<BoxProps, 'shadow'>) {
  return <mesh geometry={kit.cylinder} material={material} position={position} scale={scale} castShadow receiveShadow dispose={null} />;
}

function printTexture(index: number) {
  const canvas = document.createElement('canvas'); canvas.width = index === 0 ? 1024 : 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const endpoint = index === 0 || index === 30;
  ctx.fillStyle = endpoint ? C.cream : C.ink;
  ctx.font = '900 42px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(String(index).padStart(2, '0'), index === 0 ? 950 : 20, 35);
  ctx.save(); ctx.translate(index === 0 ? 1002 : 236, 221); ctx.rotate(Math.PI); ctx.fillText(String(index).padStart(2, '0'), 0, 0); ctx.restore();
  if (endpoint) {
    ctx.textAlign = 'center'; ctx.font = '900 37px sans-serif'; ctx.fillText(index === 0 ? 'START · 集结区' : 'FINISH', index === 0 ? 512 : 128, 39);
    for (let i = 0; i < (index === 0 ? 48 : 12); i++) { ctx.fillStyle = i % 2 ? C.cream : C.ink; ctx.fillRect(22 + i * 20, 224, 20, 12); }
    if (index === 0) {
      ctx.strokeStyle = C.cream; ctx.lineWidth = 3; ctx.globalAlpha = .25; ctx.setLineDash([18, 13]);
      ctx.beginPath(); ctx.moveTo(60, 132); ctx.lineTo(930, 132); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  } else {
    ctx.globalAlpha = .22; ctx.lineWidth = 3; ctx.strokeStyle = C.darkMint;
    ctx.beginPath(); ctx.roundRect(12, 12, 232, 232, 15); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** Reused geometry, shallow moulded caps and printed ink; the route remains the engine's route. */
export function DioramaTile({ index, track, triggered, kit }: { index: number; track: RoomView['track']; triggered: boolean; kit: Kit }) {
  const special = TRACKS[track].specials[index];
  const point = boardPoint(index, false);
  const next = boardPoint(index + Math.sign(special?.move ?? 1), false);
  const angle = Math.atan2(-(next[0] - point[0]), -(next[2] - point[2]));
  const texture = useMemo(() => special ? specialTileTexture(special.kind, special.move, index, angle) : printTexture(index), [index, special?.kind, special?.move, angle]);
  useEffect(() => () => texture.dispose(), [texture]);
  const color = index === 0 ? C.darkMint : index === 30 ? C.coral : special?.kind === 'star' ? '#f1c552' : special?.kind === 'trip' ? C.coral : special?.kind === 'arrow' ? (special.move ?? 0) < 0 ? '#b69bd1' : '#74c7af' : C.cream;
  const top = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: .57, emissive: color }), [color]);
  useEffect(() => () => top.dispose(), [top]);
  useFrame(({ clock }) => { top.emissiveIntensity = triggered ? .16 + Math.sin(clock.elapsedTime * 8) * .09 : 0; });
  const extended = index === 0, center = extended ? -START_EXTENSION / 2 : 0;
  return <group position={point}>
    <mesh geometry={extended ? kit.start : kit.tile} material={kit.dark} position={[center, -.225, 0]} receiveShadow castShadow dispose={null} />
    <mesh geometry={extended ? kit.startTop : kit.top} material={top} position={[center, -.028, 0]} receiveShadow dispose={null} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, .004, 0]} receiveShadow>
      <planeGeometry args={[extended ? 1.79 + START_EXTENSION : 1.79, extended ? 2.53 : 1.79]} />
      <meshStandardMaterial map={texture} transparent roughness={.7} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
    {special && <mesh geometry={kit.box} material={special.kind === 'trip' ? kit.coral : special.kind === 'star' ? kit.gold : (special.move ?? 0) < 0 ? kit.ink : kit.mint} position={[.79, .025, 0]} scale={[.065, .045, .7]} dispose={null} />}
  </group>;
}

function Sign({ text, position, width, kit, coral = false }: { text: string; position: [number, number, number]; width: number; kit: Kit; coral?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width / .4 * 128); canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = C.cream; ctx.font = '900 66px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 66);
    const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace; return value;
  }, [text, width]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position}>
    <Box kit={kit} position={[0, 0, 0]} scale={[width, .48, .18]} material={coral ? kit.coral : kit.ink} />
    <mesh position={[0, 0, .096]}><planeGeometry args={[width * .9, .4]} /><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

/** Gates sit outside the numbered square; the opening clears the maximum crowd. */
function Gate({ finish, kit }: { finish?: boolean; kit: Kit }) {
  const point = boardPoint(finish ? 30 : 0, false);
  const halfSpan = finish ? 1.14 : 3.55;
  return <group position={[point[0] - (finish ? 0 : START_EXTENSION / 2), -.12, point[2] - 1.52]}>
    {[-halfSpan, halfSpan].map(side => <group key={side}>
      <Box kit={kit} position={[side, .14, 0]} scale={[.51, .24, .64]} material={kit.plastic} />
      <Box kit={kit} position={[side, 1.2, 0]} scale={[.22, 2.25, .24]} material={finish ? kit.coral : kit.mint} />
      <Cylinder kit={kit} position={[side, 2.39, 0]} scale={[.17, .14, .17]} material={kit.gold} />
    </group>)}
    <Sign text={finish ? 'FINISH' : '胡闹运动会 · START'} position={[0, 2.18, 0]} width={finish ? 2.55 : 7.35} kit={kit} coral={finish} />
    {finish && Array.from({ length: 10 }, (_, index) => <Box key={index} kit={kit} position={[(index - 4.5) * .225, 1.86, 0]} scale={[.22, .13, .13]} material={index % 2 ? kit.plastic : kit.ink} shadow={false} />)}
  </group>;
}

function Podium({ kit }: { kit: Kit }) {
  return <group position={[-7.7, -.08, 0]}>
    {[{ x: -.77, h: .42, n: '2' }, { x: 0, h: .7, n: '1' }, { x: .77, h: .3, n: '3' }].map(({ x, h, n }) => <group key={n}>
      <Box kit={kit} position={[x, h / 2, 0]} scale={[.72, h, 1.12]} material={n === '1' ? kit.coral : kit.plastic} />
      <Sign text={n} position={[x, h / 2, .49]} width={.37} kit={kit} />
    </group>)}
    <group position={[0, .73, 0]}>
      <Cylinder kit={kit} position={[0, .06, 0]} scale={[.29, .12, .25]} material={kit.ink} />
      <Cylinder kit={kit} position={[0, .28, 0]} scale={[.07, .4, .07]} material={kit.gold} />
      <mesh position={[0, .54, 0]} castShadow><cylinderGeometry args={[.29, .12, .39, 16]} /><meshStandardMaterial color={C.gold} roughness={.3} metalness={.45} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .28, .57, 0]}><torusGeometry args={[.14, .035, 5, 12]} /><meshStandardMaterial color={C.gold} roughness={.3} metalness={.45} /></mesh>)}
    </group>
  </group>;
}

function Bleachers({ kit, lowQuality }: { kit: Kit; lowQuality: boolean }) {
  return <group position={[2.4, -.1, -.05]}>
    <Box kit={kit} position={[0, .12, 0]} scale={[5.5, .24, 1.5]} material={kit.dark} />
    <Box kit={kit} position={[0, .33, -.3]} scale={[5.1, .24, .86]} material={kit.plastic} />
    <Box kit={kit} position={[0, .55, -.59]} scale={[5.1, .24, .3]} material={kit.mint} />
    {Array.from({ length: lowQuality ? 5 : 9 }, (_, i) => <group key={i} position={[(i - (lowQuality ? 2 : 4)) * (lowQuality ? .94 : .52), .49, i % 2 ? -.48 : .28]}>
      <mesh geometry={kit.sphere} material={i % 3 === 0 ? kit.coral : i % 3 === 1 ? kit.gold : kit.mint} scale={[.15, .22, .15]} position={[0, .13, 0]} dispose={null} />
      <mesh geometry={kit.sphere} material={kit.plastic} scale={.13} position={[0, .43, 0]} dispose={null} />
    </group>)}
    <Sign text="胡闹运动会" position={[0, 1.27, -.62]} width={3.1} kit={kit} />
    {[-2, 2].map(x => <Cylinder key={x} kit={kit} position={[x, .77, -.62]} scale={[.035, 1.5, .035]} />)}
  </group>;
}

function CourseDetails({ kit, lowQuality }: { kit: Kit; lowQuality: boolean }) {
  return <group>
    <Podium kit={kit} /><Bleachers kit={kit} lowQuality={lowQuality} />
    {/* Discrete verge markings guide the two bends without occupying cells. */}
    {[12, 15].map(index => { const p = boardPoint(index, false); return <group key={index} position={[p[0] + 1.39, -.1, p[2]]}>
      <Box kit={kit} position={[0, .18, 0]} scale={[.35, .36, 1.85]} material={kit.plastic} />
      {[-.55, 0, .55].map(z => <Box key={z} kit={kit} position={[0, .38, z]} scale={[.36, .07, .24]} material={kit.coral} shadow={false} />)}
    </group>; })}
    {[-1, 1].flatMap(side => [-12.2, -3.2, 6.3, 12.2].map((x, index) => <group key={`${side}-${index}`} position={[x, -.13, side * (DEPTH / 2 - .38)]}>
      <Cylinder kit={kit} position={[0, .24, 0]} scale={[.055, .74, .055]} />
      <Box kit={kit} position={[.22, .54, 0]} scale={[.45, .27, .055]} material={index % 2 ? kit.coral : kit.mint} shadow={false} />
    </group>))}
    {[-1, 1].map(side => <Box key={side} kit={kit} position={[0, -.055, side * (DEPTH / 2 - .17)]} scale={[WIDTH - 1, .1, .1]} material={kit.plastic} shadow={false} />)}
    {!lowQuality && [-12.8, 10.5].flatMap(x => [-.4, .4].map(z => <group key={`${x}-${z}`} position={[x, -.1, z]}>
      <Cylinder kit={kit} position={[0, .06, 0]} scale={[.25, .12, .25]} material={kit.plastic} />
      <mesh position={[0, .3, 0]} castShadow><coneGeometry args={[.17, .48, 12]} /><meshStandardMaterial color={C.coral} roughness={.6} /></mesh>
    </group>))}
  </group>;
}

export function DioramaStadium({ compact, track, lowQuality, beat, racers }: { compact: boolean; track: RoomView['track']; lowQuality: boolean; beat?: PresentationBeat; racers: Racer[] }) {
  const kit = useKit();
  const triggered = new Set(beat?.motions.map(motion => motion.to) ?? []);
  if (beat && ['score', 'trip'].includes(beat.kind)) for (const racer of racers) if (beat.targets.includes(racer.id) || beat.source === racer.id) triggered.add(racer.position);
  return <group rotation={[0, compact ? -Math.PI / 2 : 0, 0]}>
    <mesh geometry={kit.plinth} position={[0, -.78, 0]} material={kit.wood} castShadow receiveShadow dispose={null} />
    <mesh geometry={kit.band} position={[0, -.49, 0]} material={kit.plastic} castShadow receiveShadow dispose={null} />
    <mesh geometry={kit.deck} position={[0, -.285, 0]} material={kit.mint} receiveShadow dispose={null} />
    {[-1, 1].map(side => <Box key={side} kit={kit} position={[0, -.77, side * (DEPTH / 2 + .005)]} scale={[WIDTH - .65, .035, .018]} material={kit.plastic} shadow={false} />)}
    {Array.from({ length: 31 }, (_, index) => <DioramaTile key={index} {...{ index, track, kit }} triggered={triggered.has(index)} />)}
    <Gate kit={kit} /><Gate finish kit={kit} /><CourseDetails kit={kit} lowQuality={lowQuality} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.055, 0]} receiveShadow><planeGeometry args={[240, 240]} /><meshStandardMaterial color="#c7dfd3" roughness={1} /></mesh>
  </group>;
}
