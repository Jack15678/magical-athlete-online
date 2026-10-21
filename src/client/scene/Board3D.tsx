import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Racer, RoomView } from '../../shared/types.js';
import { TRACKS } from '../../shared/tracks.js';
import { CHARACTERS } from '../../shared/characters.js';
import type { PresentationBeat } from '../presentation.js';
import { ToyCharacter } from './ToyCharacter.js';
import { boardPoint, diceTopRotation, TILE } from './math.js';
import './scene.css';

export interface ScenePlayback {
  beat?: PresentationBeat;
  racers: Racer[];
  startedAt: number;
  durationMs: number;
}
interface Props extends ScenePlayback {
  room: RoomView;
  lowQuality: boolean;
  reducedMotion: boolean;
  muted: boolean;
  onDetail: (id: string) => void;
}
const characterName = (id: string) => CHARACTERS.find(c => c.id === id)?.nameZh ?? id;
const clamp = THREE.MathUtils.clamp;
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const progress = (start: number, duration: number) => clamp((performance.now() - start) / Math.max(1, duration), 0, 1);
function occupancy(racer: Racer, racers: Racer[], position: number) {
  const group = racers.filter(r => clamp(r.position, 0, 30) === clamp(position, 0, 30) && !r.eliminated);
  const index = Math.max(0, group.findIndex(r => r.id === racer.id));
  const cols = group.length > 4 ? 3 : group.length > 1 ? 2 : 1;
  const rows = Math.ceil(group.length / cols);
  const spacing = group.length > 4 ? .44 : .60;
  return { x: ((index % cols) - (Math.min(group.length, cols) - 1) / 2) * spacing, z: (Math.floor(index / cols) - (rows - 1) / 2) * spacing, scale: group.length > 4 ? .42 : group.length > 1 ? .72 : 1.05 };
}

class SceneBoundary extends Component<{ children: ReactNode; resetKey: number; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { resetKey: number }) { if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="scene-fallback" role="status"><strong>3D 场景暂时无法显示</strong><p>选手位置与操作仍可在下方查看。</p><button onClick={this.props.retry}>重新载入 3D</button></div> : this.props.children; }
}

export function Board3D({ room, racers, beat, startedAt, durationMs, lowQuality, reducedMotion, muted, onDetail }: Props) {
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 650px)').matches);
  const [resetKey, setResetKey] = useState(0);
  const [cameraReset, setCameraReset] = useState(0);
  const [lost, setLost] = useState(false);
  const root = useRef<HTMLElement>(null);
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const scoreLabel = useRef<HTMLSpanElement>(null);
  useEffect(() => { const m = matchMedia('(max-width: 650px)'); const update = () => setCompact(m.matches); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useDiceSound(beat, durationMs, muted);
  const active = beat?.source ?? room.currentRacerId;
  const selected = racers.find(r => r.id === active);
  const dice = beat?.kind === 'dice';
  return <section ref={root} className={`board-scene ${compact ? 'compact-scene' : ''}`} data-testid="board-3d" data-phase={beat?.kind ?? 'idle'} data-event-ids={beat?.events.map(e => e.id).join(',') ?? ''} data-motion-count={beat?.motions.length ?? 0} data-renderer="react-three-fiber" aria-label={`${TRACKS[room.track].name}立体棋盘`}>
    <div className="scene-topline"><span><i />LIVE IN 3D <strong>{TRACKS[room.track].name}</strong></span><button onClick={() => setCameraReset(n => n + 1)} aria-label="恢复默认视角">↺ 恢复视角</button></div>
    <SceneBoundary resetKey={resetKey} retry={() => setResetKey(n => n + 1)}>
      <Canvas className="board-webgl" key={resetKey} frameloop={beat && beat.kind !== 'dice' ? 'always' : 'demand'} orthographic shadows={!lowQuality} dpr={lowQuality ? 1 : [1, 1.65]} camera={{ position: [3, 16, 16], near: .1, far: 100, zoom: 35 }} gl={{ antialias: !lowQuality, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.setClearColor('#c4e4d7'); gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setLost(true); }); gl.domElement.addEventListener('webglcontextrestored', () => setLost(false)); }}>
        <ambientLight intensity={1.2} />
        <hemisphereLight args={['#fff8e7', '#6a9e8f', 1.5]} />
        <directionalLight position={[-7, 16, 8]} intensity={3.1} castShadow={!lowQuality} shadow-mapSize={lowQuality ? [512, 512] : [1024, 1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-normalBias={.025} shadow-bias={-.0001} />
        <CameraRig compact={compact} reset={cameraReset} focus={selected?.position} playing={!!beat && !dice} reducedMotion={reducedMotion} />
        <Stadium compact={compact} track={room.track} lowQuality={lowQuality} />
        <Suspense fallback={null}>{racers.filter(r => !r.eliminated || beat?.kind === 'eliminate' && beat.targets.includes(r.id)).map(racer => <Pawn key={racer.id} racer={racer} racers={racers} room={room} compact={compact} beat={beat} startedAt={startedAt} durationMs={durationMs} lowQuality={lowQuality} reducedMotion={reducedMotion} active={active === racer.id} onDetail={onDetail} labels={labels} />)}</Suspense>
        <SkillEffect {...{ beat, racers, compact, startedAt, durationMs, reducedMotion }} />
        <ScoreProjector beat={beat} racers={racers} compact={compact} label={scoreLabel} />
        <PerformanceProbe root={root} />
      </Canvas>
    </SceneBoundary>
    <div className="scene-labels" aria-hidden="true">{racers.filter(r => !r.eliminated).map(racer => { const owner = room.players.find(p => p.id === racer.playerId), scale = occupancy(racer, racers, racer.position).scale; return <span key={racer.id} ref={element => { if (element) labels.current.set(racer.id, element); else labels.current.delete(racer.id); }} className={`pawn-seat ${active === racer.id ? 'is-active' : ''} ${scale < .5 ? 'is-crowded' : scale < .9 ? 'is-shared' : ''}`} style={{ borderColor: owner?.color }}>{(owner?.seat ?? 0) + 1}</span>; })}<span ref={scoreLabel} className="score-float" style={{ display: beat?.kind === 'score' || beat?.kind === 'finish' ? undefined : 'none' }}>{beat?.events[0]?.text.match(/[+＋-]\d+分/)?.[0] ?? (beat?.kind === 'finish' ? '冲线！' : '得分！')}</span></div>
    {lost && <div className="scene-fallback"><strong>正在恢复图形画面…</strong><button onClick={() => { setLost(false); setResetKey(n => n + 1); }}>重新载入 3D</button></div>}
    <SceneBoundary resetKey={resetKey} retry={() => setResetKey(n => n + 1)}><DiceSpotlight active={dice} face={beat?.face ?? room.lastRoll?.face ?? 1} startedAt={startedAt} durationMs={durationMs} reducedMotion={reducedMotion} lowQuality={lowQuality} source={selected ? characterName(selected.characterId) : '运动员'} /></SceneBoundary>
    <div className="scene-bottomline"><span>拖动旋转 · 双指 / 滚轮缩放</span><span>两次直角转弯 · 12 / 15 格</span></div>
    <ul className="sr-only" aria-label="立体棋盘选手位置">{racers.map(r => <li key={r.id} data-testid="scene-racer" data-racer-id={r.id} data-position={r.position} data-target-position={beat?.motions.find(m => m.racerId === r.id)?.to ?? r.position}>{characterName(r.characterId)} · {r.position} 格{r.tripped ? ' · 绊倒' : ''}</li>)}</ul>
  </section>;
}

function PerformanceProbe({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const gl = useThree(s => s.gl); const last = useRef(0);
  useFrame(({ clock }) => { if (root.current && gl.info.render.triangles > 0 && (!root.current.dataset.triangles || clock.elapsedTime - last.current > 1)) { last.current = clock.elapsedTime; root.current.dataset.drawCalls = String(gl.info.render.calls); root.current.dataset.triangles = String(gl.info.render.triangles); } }); return null;
}
function CameraRig({ compact, reset, focus, playing, reducedMotion }: { compact: boolean; reset: number; focus?: number; playing: boolean; reducedMotion: boolean }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const userDrag = useRef(false);
  useEffect(() => { camera.position.set(compact ? .5 : 2, 19, 16); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); if (camera instanceof THREE.OrthographicCamera) { camera.zoom = Math.min(size.width / (compact ? 10 : 32), size.height / (compact ? 25 : 11)); camera.updateProjectionMatrix(); } controls.current?.target.set(0, 0, 0); controls.current?.update(); userDrag.current = false; }, [camera, size.width, size.height, compact, reset]);
  useFrame((_, delta) => { if (!controls.current || userDrag.current || reducedMotion) return; const point = boardPoint(playing ? focus ?? 15 : 15, compact); const x = playing ? point[0] * .16 : 0, z = playing ? point[2] * .12 : 0; const target = new THREE.Vector3(x, 0, z); if (controls.current.target.distanceTo(target) > .005) { controls.current.target.lerp(target, Math.min(1, delta * 2)); invalidate(); } });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.12} minPolarAngle={.3} maxPolarAngle={1.06} minAzimuthAngle={compact ? -.24 : -.45} maxAzimuthAngle={compact ? .24 : .45} minZoom={Math.min(size.width / (compact ? 14 : 42), size.height / (compact ? 33 : 15))} maxZoom={Math.min(size.width / (compact ? 6 : 20), size.height / (compact ? 17 : 7))} onStart={() => { userDrag.current = true; }} />;
}

function labelTexture(text: string, color: string) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 58px "Microsoft YaHei", sans-serif'; ctx.fillText(text, 128, 66);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
function Tile({ index, compact, track }: { index: number; compact: boolean; track: RoomView['track'] }) {
  const position = boardPoint(index, compact); const special = TRACKS[track].specials[index];
  const next = boardPoint(Math.min(30, index + 1), compact);
  const arrowAngle = Math.atan2(-(next[0] - position[0]), -(next[2] - position[2]));
  const color = index === 0 ? '#365bea' : index === 30 ? '#f5c646' : special?.kind === 'trip' ? '#f29b8f' : special?.kind === 'arrow' ? '#a5ceec' : special?.kind === 'star' ? '#ffe28b' : index % 2 ? '#fff6e1' : '#f0e6cd';
  const caption = index === 0 ? 'START' : index === 30 ? 'FINISH' : `${index} ${index === TRACKS[track].firstCorner ? '↱' : index === TRACKS[track].secondCorner ? '↰' : special?.kind === 'star' ? '★' : special?.kind === 'trip' ? '!' : special?.kind === 'arrow' ? ((special.move ?? 0) > 0 ? '+' : '') + special.move : ''}`;
  const texture = useMemo(() => labelTexture(caption, index === 0 ? '#ffffff' : '#3a4e51'), [caption, index]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position}>
    <RoundedBox args={[1.61, .22, 1.61]} radius={.1} smoothness={2} position={[0, -.11, 0]} receiveShadow castShadow><meshStandardMaterial color={color} roughness={.7} /></RoundedBox>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .012, -.53]}><planeGeometry args={[1.18, .59]} /><meshBasicMaterial map={texture} transparent depthWrite={false} /></mesh>
    {index < 30 && <mesh position={[0, .018, .65]} rotation={[-Math.PI / 2, 0, arrowAngle]}><coneGeometry args={[.07, .16, 3]} /><meshBasicMaterial color={index === 0 ? '#ffffff' : '#a6aaa1'} /></mesh>}
  </group>;
}
function Stadium({ compact, track, lowQuality }: { compact: boolean; track: RoomView['track']; lowQuality: boolean }) {
  const width = (compact ? 4 : 16) * TILE + .65, depth = (compact ? 16 : 4) * TILE + .65;
  return <group>
    <RoundedBox args={[width + .45, .5, depth + .45]} radius={.32} smoothness={3} position={[0, -.38, 0]} castShadow receiveShadow><meshStandardMaterial color="#4a8c78" roughness={.6} /></RoundedBox>
    <RoundedBox args={[width, .28, depth]} radius={.2} smoothness={3} position={[0, -.1, 0]} receiveShadow><meshStandardMaterial color="#79bda0" roughness={.85} /></RoundedBox>
    {Array.from({ length: 31 }, (_, i) => <Tile key={i} index={i} compact={compact} track={track} />)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.67, 0]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#c4e4d7" roughness={1} /></mesh>
    {!lowQuality && [-1, 1].flatMap(side => Array.from({ length: compact ? 6 : 12 }, (_, i) => <group key={`${side}-${i}`} position={compact ? [side * (width / 2 + .65), -.12, (i / 5 - .5) * depth * .92] : [(i / 11 - .5) * width * .92, -.12, side * (depth / 2 + .65)]}><mesh castShadow position={[0, .4, 0]}><cylinderGeometry args={[.035, .05, .95, 6]} /><meshStandardMaterial color="#fff6e1" /></mesh><mesh position={[.17, .7, 0]}><boxGeometry args={[.35, .26, .045]} /><meshStandardMaterial color={i % 2 ? '#f16b51' : '#f5cd51'} /></mesh></group>))}
    <FinishGate compact={compact} />
  </group>;
}
function FinishGate({ compact }: { compact: boolean }) {
  const p = boardPoint(30, compact);
  return <group position={[p[0] + (compact ? 0 : .7), .22, p[2] + (compact ? .7 : 0)]} rotation={[0, compact ? 0 : Math.PI / 2, 0]}>{[-.76, .76].map(x => <mesh key={x} position={[x, .7, 0]} castShadow><cylinderGeometry args={[.035, .045, 1.4, 8]} /><meshStandardMaterial color="#3d6265" /></mesh>)}<mesh position={[0, 1.3, 0]}><boxGeometry args={[1.55, .18, .06]} /><meshStandardMaterial color="#fff8e8" /></mesh>{Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[(i % 6 - 2.5) * .24, 1.3 + (Math.floor(i / 6) ? .045 : -.045), .035]}><planeGeometry args={[.24, .09]} /><meshBasicMaterial color={(i + Math.floor(i / 6)) % 2 ? '#334b50' : '#fff8e8'} /></mesh>)}</group>;
}

function Pawn({ racer, racers, room, compact, beat, startedAt, durationMs, lowQuality, reducedMotion, active, onDetail, labels }: { racer: Racer; racers: Racer[]; room: RoomView; compact: boolean; beat?: PresentationBeat; startedAt: number; durationMs: number; lowQuality: boolean; reducedMotion: boolean; active: boolean; onDetail: (id: string) => void; labels: React.RefObject<Map<string, HTMLSpanElement>> }) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const { camera, size } = useThree(); const projection = useMemo(() => new THREE.Vector3(), []);
  const owner = room.players.find(p => p.id === racer.playerId);
  const color = owner?.color ?? '#ffcf50';
  const motion = beat?.motions.find(m => m.racerId === racer.id);
  const from = boardPoint(motion?.from ?? racer.position, compact);
  const offset = occupancy(racer, racers, motion?.from ?? racer.position);
  const destinations = motion ? racers.map(r => ({ ...r, position: beat?.motions.find(m => m.racerId === r.id)?.to ?? r.position })) : racers;
  const endOffset = occupancy(racer, destinations, motion?.to ?? racer.position);
  const affected = beat?.targets.includes(racer.id) || beat?.source === racer.id;
  useFrame(() => {
    if (!root.current || !body.current) return;
    const t = beat ? progress(startedAt, durationMs) : 1;
    let x = from[0] + offset.x, z = from[2] + offset.z, y = .24, scale = offset.scale, tilt = racer.tripped ? -Math.PI / 2 : 0, swing = 0;
    if (motion) {
      const target = boardPoint(motion.to, compact);
      if (beat?.kind === 'swap' && !reducedMotion) {
        const fraction = ease(t), dx = target[0] - from[0], dz = target[2] - from[2], length = Math.max(1, Math.hypot(dx, dz));
        x = THREE.MathUtils.lerp(from[0] + offset.x, target[0] + endOffset.x, fraction) - dz / length * Math.sin(t * Math.PI) * .55;
        z = THREE.MathUtils.lerp(from[2] + offset.z, target[2] + endOffset.z, fraction) + dx / length * Math.sin(t * Math.PI) * .55;
        y += Math.sin(t * Math.PI) * .6; scale = THREE.MathUtils.lerp(offset.scale, endOffset.scale, fraction); swing = Math.sin(t * Math.PI) * .25;
      } else if (beat?.kind === 'warp' || beat?.kind === 'swap') {
        const arrived = t > .5; x = (arrived ? target[0] + endOffset.x : x); z = (arrived ? target[2] + endOffset.z : z);
        scale = (arrived ? endOffset.scale : offset.scale) * Math.max(.04, Math.abs(2 * t - 1)); y += reducedMotion ? 0 : Math.sin(t * Math.PI) * .65; swing = reducedMotion ? 0 : t * Math.PI * 2;
      } else {
        const count = Math.max(1, motion.path.length - 1), walk = ease(clamp((t - .06) / .88, 0, 1)) * count, segment = Math.min(count - 1, Math.floor(walk)), local = walk - segment;
        const a = boardPoint(motion.path[segment] ?? motion.from, compact), b = boardPoint(motion.path[segment + 1] ?? motion.to, compact);
        x = THREE.MathUtils.lerp(a[0], b[0], local) + THREE.MathUtils.lerp(offset.x, endOffset.x, ease(t)); z = THREE.MathUtils.lerp(a[2], b[2], local) + THREE.MathUtils.lerp(offset.z, endOffset.z, ease(t));
        const backwards = motion.to < motion.from;
        y += reducedMotion ? 0 : Math.sin(local * Math.PI) * (backwards ? .17 : .28); swing = reducedMotion ? 0 : Math.sin(walk * Math.PI * 2) * (backwards ? -.18 : .12); scale = THREE.MathUtils.lerp(offset.scale, endOffset.scale, ease(t));
      }
    }
    if (beat?.targets.includes(racer.id) && beat.kind === 'trip') { tilt = reducedMotion ? -Math.PI / 2 : -ease(t) * Math.PI * 2.5; y += reducedMotion ? 0 : Math.sin(t * Math.PI) * .45; }
    if (affected && beat?.kind === 'recover') tilt = -Math.PI / 2 * (1 - ease(t));
    if (affected && beat?.kind === 'skill' && !reducedMotion) { y += Math.sin(t * Math.PI) * .3; swing += Math.sin(t * Math.PI * 2) * .18; }
    if (beat?.targets.includes(racer.id) && beat.kind === 'eliminate') scale *= 1 - ease(t);
    root.current.position.set(x, y, z); root.current.scale.setScalar(Math.max(.01, scale)); body.current.rotation.set(tilt, swing, 0);
    const label = labels.current.get(racer.id);
    if (label) { root.current.updateWorldMatrix(true, false); projection.set(0, .19, .34).applyMatrix4(root.current.matrixWorld).project(camera); label.style.transform = `translate(${(projection.x + 1) * size.width / 2}px,${(1 - projection.y) * size.height / 2}px) translate(-50%,-50%)`; label.style.visibility = projection.z < -1 || projection.z > 1 ? 'hidden' : 'visible'; }
  });
  return <group ref={root} position={[from[0] + offset.x, .24, from[2] + offset.z]} scale={offset.scale} onClick={e => { e.stopPropagation(); onDetail(racer.characterId); }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .018, 0]}><ringGeometry args={[.31, active ? .43 : .38, 24]} /><meshBasicMaterial color={active ? '#ffda27' : color} side={THREE.DoubleSide} /></mesh>
    <mesh castShadow={!lowQuality} receiveShadow position={[0, .06, 0]}><cylinderGeometry args={[.32, .36, .12, 20]} /><meshStandardMaterial color={color} roughness={.5} /></mesh>
    <group ref={body} position={[0, .12, 0]}><ToyCharacter characterId={racer.characterId} color={color} lowQuality={lowQuality} /></group>
    {active && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .023, 0]}><ringGeometry args={[.46, .49, 32]} /><meshBasicMaterial color="#fff8da" side={THREE.DoubleSide} /></mesh>}
  </group>;
}

function SkillEffect({ beat, racers, compact, startedAt, durationMs, reducedMotion }: { beat?: PresentationBeat; racers: Racer[]; compact: boolean; startedAt: number; durationMs: number; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => { if (!group.current) return; const t = progress(startedAt, durationMs); group.current.scale.setScalar(reducedMotion ? 1 : .6 + t * .8); group.current.rotation.y = reducedMotion ? 0 : t * Math.PI; });
  if (!beat || beat.kind === 'dice') return null;
  const affected = [...new Set([beat.source, ...beat.targets].filter((id): id is string => !!id))];
  const warp = beat.kind === 'warp' || beat.kind === 'swap';
  const impact = beat.kind === 'trip' || beat.cause === 'huge-baby' || beat.cause === 'centaur';
  const color = beat.kind === 'swap' ? '#f197c4' : warp ? '#af78ff' : impact ? '#ff7057' : beat.kind === 'score' || beat.kind === 'finish' ? '#ffd648' : beat.motions.some(m => m.to < m.from) ? '#eca44c' : '#6adae5';
  return <group>{affected.map(id => { const r = racers.find(x => x.id === id); if (!r) return null; const motion = beat.motions.find(m => m.racerId === id); const positions = warp && motion ? [motion.from, motion.to] : [r.position]; return positions.map((position, index) => {
    const point = boardPoint(position, compact);
    return <group key={`${id}-${index}`} position={[point[0], .25, point[2]]}>
      {['skill', 'warp', 'swap', 'trip', 'recover', 'finish', 'score'].includes(beat.kind) && <group ref={affected[0] === id && index === 0 ? group : undefined}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.48, .54, lowSegments(reducedMotion)]} /><meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={.75} /></mesh>{warp && <mesh position={[0, .4, 0]}><cylinderGeometry args={[.55, .55, .8, 20, 1, true]} /><meshBasicMaterial color={color} transparent opacity={.18} side={THREE.DoubleSide} depthWrite={false} /></mesh>}</group>}
      {motion && beat.kind === 'move' && !reducedMotion && <group>{motion.path.slice(1).map((step, i) => { const p = boardPoint(step, compact); return <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p[0] - point[0], .025, p[2] - point[2]]}><ringGeometry args={[.12, .18, 12]} /><meshBasicMaterial color={color} transparent opacity={.45} side={THREE.DoubleSide} /></mesh>; })}</group>}
    </group>;
  }); })}</group>;
}
const lowSegments = (reduced: boolean) => reduced ? 16 : 32;

function ScoreProjector({ beat, racers, compact, label }: { beat?: PresentationBeat; racers: Racer[]; compact: boolean; label: React.RefObject<HTMLSpanElement | null> }) {
  const { camera, size } = useThree(); const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => { const racer = racers.find(r => r.id === beat?.source); if (!label.current || !racer || !beat || !['score', 'finish'].includes(beat.kind)) return; const point = boardPoint(racer.position, compact); projected.set(point[0], 1.8, point[2]).project(camera); label.current.style.transform = `translate(${(projected.x + 1) * size.width / 2}px,${(1 - projected.y) * size.height / 2}px) translate(-50%,-50%)`; });
  return null;
}

const pipPatterns: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-.24, .24], [.24, -.24]], 3: [[-.24, .24], [0, 0], [.24, -.24]], 4: [[-.24, .24], [.24, .24], [-.24, -.24], [.24, -.24]], 5: [[-.24, .24], [.24, .24], [0, 0], [-.24, -.24], [.24, -.24]], 6: [[-.24, .26], [.24, .26], [-.24, 0], [.24, 0], [-.24, -.26], [.24, -.26]] };
function Die({ face, startedAt, durationMs, reducedMotion }: { face: number; startedAt: number; durationMs: number; reducedMotion: boolean }) {
  const die = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!die.current) return;
    const p = progress(startedAt, durationMs), final = diceTopRotation(face);
    const throwTime = clamp(p / .82, 0, 1), remaining = 1 - ease(clamp((p - .15) / .68, 0, 1));
    // Kinematic presentation: fixed result orientation, ballistic throw and damped rebounds.
    const flight = p < .34 ? Math.sin(p / .34 * Math.PI) * 2.1 : p < .59 ? Math.sin((p - .34) / .25 * Math.PI) * .78 : p < .75 ? Math.sin((p - .59) / .16 * Math.PI) * .26 : p < .83 ? Math.sin((p - .75) / .08 * Math.PI) * .07 : 0;
    die.current.position.set(reducedMotion ? 0 : -1.4 * (1 - ease(throwTime)), .44 + (reducedMotion ? 0 : flight), reducedMotion ? 0 : Math.sin(p * Math.PI * 2) * .28 * (1 - throwTime));
    die.current.rotation.set(final[0] + (reducedMotion ? 0 : remaining * Math.PI * 8), final[1] + (reducedMotion ? 0 : remaining * Math.PI * 5), final[2] + (reducedMotion ? 0 : remaining * Math.PI * 6));
  });
  const faces: { value: number; position: [number, number, number]; rotation: [number, number, number] }[] = [{ value: 1, position: [0, .501, 0], rotation: [-Math.PI / 2, 0, 0] }, { value: 6, position: [0, -.501, 0], rotation: [Math.PI / 2, 0, 0] }, { value: 2, position: [0, 0, .501], rotation: [0, 0, 0] }, { value: 5, position: [0, 0, -.501], rotation: [0, Math.PI, 0] }, { value: 3, position: [.501, 0, 0], rotation: [0, Math.PI / 2, 0] }, { value: 4, position: [-.501, 0, 0], rotation: [0, -Math.PI / 2, 0] }];
  return <group ref={die}><RoundedBox args={[1, 1, 1]} radius={.095} smoothness={3} castShadow receiveShadow><meshStandardMaterial color="#fff9e9" roughness={.3} metalness={.05} /></RoundedBox>{faces.map(side => <group key={side.value} position={side.position} rotation={side.rotation}>{pipPatterns[side.value].map(([x, y], i) => <mesh key={i} position={[x, y, .005]} scale={[1, 1, .28]}><sphereGeometry args={[.065, 12, 8]} /><meshStandardMaterial color={side.value === 1 ? '#ed6149' : '#253e50'} roughness={.5} /></mesh>)}</group>)}</group>;
}
function DiceSpotlight({ active, face, startedAt, durationMs, reducedMotion, lowQuality, source }: { active: boolean; face: number; startedAt: number; durationMs: number; reducedMotion: boolean; lowQuality: boolean; source: string }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => { setSettled(false); if (!active) return; const timer = setTimeout(() => setSettled(true), durationMs * .84); return () => clearTimeout(timer); }, [active, startedAt, durationMs]);
  return <div hidden={!active} className={`dice-spotlight ${settled ? 'is-settled' : ''}`} role="status" aria-label={`${source}正在掷骰`} data-up-face={active && settled ? face : ''}>
    <div className="dice-caption">{source}<strong>{settled ? '点数确认' : '好戏，掷出来！'}</strong></div>
    <Canvas frameloop={active ? 'always' : 'never'} shadows={!lowQuality} dpr={lowQuality ? 1 : [1, 1.5]} camera={{ position: [3.7, 6.5, 5], fov: 38 }} gl={{ alpha: true, antialias: !lowQuality }}><ambientLight intensity={1.5} /><directionalLight position={[-3, 8, 4]} intensity={3} castShadow shadow-mapSize={[512, 512]} shadow-normalBias={.02} /><RoundedBox args={[4.2, .18, 3.6]} position={[0, -.15, 0]} radius={.2} smoothness={3} receiveShadow><meshStandardMaterial color="#315c62" roughness={.9} /></RoundedBox>{[-1, 1].map(side => <group key={side}><mesh position={[side * 2.04, .03, 0]}><boxGeometry args={[.1, .3, 3.7]} /><meshStandardMaterial color="#e4b569" /></mesh><mesh position={[0, .03, side * 1.78]}><boxGeometry args={[4.1, .3, .1]} /><meshStandardMaterial color="#e4b569" /></mesh></group>)}<Die {...{ face, startedAt, durationMs, reducedMotion }} /></Canvas>
    <div className="dice-result" data-testid={active ? 'dice-value' : undefined}>{settled ? <><b>{face}</b><span>点 · 即将出发</span></> : <span>抛出 · 弹跳 · 停稳</span>}</div>
  </div>;
}

function useDiceSound(beat: PresentationBeat | undefined, durationMs: number, muted: boolean) {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => { const unlock = () => { if (muted) return; try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Audio is optional. */ } }; document.addEventListener('pointerdown', unlock); return () => document.removeEventListener('pointerdown', unlock); }, [muted]);
  useEffect(() => {
    if (muted || beat?.kind !== 'dice') return;
    const timers = [.34, .59, .75, .83].map((at, index) => setTimeout(() => {
      try { const ctx = audio.current; if (!ctx || ctx.state !== 'running') return; const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(170 + index * 35, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + .065); gain.gain.setValueAtTime(.13 / (index + 1), ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .09); oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .1); } catch { /* Gameplay never depends on audio availability. */ }
    }, durationMs * at));
    return () => timers.forEach(clearTimeout);
  }, [beat?.key, durationMs, muted]);
  useEffect(() => () => { void audio.current?.close(); }, []);
}
