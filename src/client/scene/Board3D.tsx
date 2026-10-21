import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Racer, RoomView } from '../../shared/types.js';
import { TRACKS } from '../../shared/tracks.js';
import { CHARACTERS } from '../../shared/characters.js';
import type { PresentationBeat } from '../presentation.js';
import { Avatar } from '../avatars.js';
import { ToyCharacter } from './ToyCharacter.js';
import { DioramaStadium } from './DioramaStadium.js';
import { CameraRig } from './CameraRig.js';
import { StudioLighting, AdaptiveQuality, PawnContact } from './StudioLighting.js';
import { RaceEffects } from './RaceEffects.js';
import { useRaceIntro } from './useRaceIntro.js';
import { boardPoint, diceTopRotation, TILE } from './math.js';
import { pawnRoute, strideLift, strideProgress } from './pawn-motion.js';
import { pawnFallPose } from './pawn-fall.js';

import { ACTION_HOLD_MS, actionFocus, choiceFocus, ownFocus, pawnOccupancy, pawnWorldPoint, type CameraFocus, type CameraMode } from './camera.js';
import './scene.css';

export interface ScenePlayback {
  beat?: PresentationBeat;
  queue?: PresentationBeat[];
  racers: Racer[];
  startedAt: number;
  durationMs: number;
}
interface Props extends ScenePlayback {
  room: RoomView;
  lowQuality: boolean;
  reducedMotion: boolean;
  muted: boolean;
  onDetail: (id: string, racerId?: string) => void;
}
const characterName = (id: string) => CHARACTERS.find(c => c.id === id)?.nameZh ?? id;
/** Presentation captions describe the existing effect; they are not new rule names. */
const abilityCaptions: Record<string, string> = {
  alchemist: '炼金加速', 'baba-yaga': '同格绊倒', banana: '香蕉绊倒', blimp: '弯道变速', centaur: '后蹄踢击', cheerleader: '全场助威', coach: '同格鼓劲', copycat: '复制领跑能力', dicemonger: '骰子交易', duelist: '同格决斗', egg: '破壳模仿', 'flip-flop': '位置互换', genius: '骰面预测', gunk: '黏液减速', hare: '野兔冲刺', heckler: '起哄追赶', 'huge-baby': '挤到身后', hypnotist: '催眠召唤', inchworm: '代替前进', lackey: '六点抢跑', leaptoad: '跳过占格', legs: '大步前进', 'lovable-loser': '末位得分', magician: '骰子重掷', mastermind: '冠军预言', mouth: '大嘴吞噬', 'party-animal': '派对聚拢', 'rocket-scientist': '火箭加速', romantic: '相遇心动', scoocher: '跟着蹭蹭', sisyphus: '起点轮回', skipper: '抢先行动', stickler: '精确冲线', suckerfish: '贴身随行', 'third-wheel': '双人插队', twin: '冠军传承',
};
const clamp = THREE.MathUtils.clamp;
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const progress = (start: number, duration: number) => clamp((performance.now() - start) / Math.max(1, duration), 0, 1);
const occupancy = pawnOccupancy;

class SceneBoundary extends Component<{ children: ReactNode; resetKey: number; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { resetKey: number }) { if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="scene-fallback" role="status"><strong>3D 场景暂时无法显示</strong><p>选手位置与操作仍可在下方查看。</p><button onClick={this.props.retry}>重新载入 3D</button></div> : this.props.children; }
}

export function Board3D({ room, racers, beat, queue, startedAt, durationMs, lowQuality, reducedMotion, muted, onDetail }: Props) {
  const [automaticLow, setAutomaticLow] = useState(false);
  lowQuality = lowQuality || automaticLow;
  const spectator = room.role === 'spectator';
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 650px)').matches);
  const [resetKey, setResetKey] = useState(0);
  const [cameraReset, setCameraReset] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('self');
  const [manualCamera, setManualCamera] = useState(false);
  const [autoWatch, setAutoWatch] = useState(() => { try { return localStorage.getItem('magical-athlete:auto-watch') !== 'false'; } catch { return true; } });
  const [heldFocus, setHeldFocus] = useState<CameraFocus | null>(null);
  const [dismissedChain, setDismissedChain] = useState<string>();
  const [lost, setLost] = useState(false);
  const root = useRef<HTMLElement>(null);
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const scoreLabel = useRef<HTMLSpanElement>(null);
  useEffect(() => { const m = matchMedia('(max-width: 650px)'); const update = () => setCompact(m.matches); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useDiceSound(beat, durationMs, muted);
  const active = beat?.source ?? room.currentRacerId;
  const selected = racers.find(r => r.id === active);
  const dice = beat?.kind === 'dice' || beat?.kind === 'duel-dice';
  const duelContenders = beat?.kind === 'duel-dice' && beat.faces?.length === 2 ? beat.targets.slice(0, 2).flatMap((id, index) => { const racer = racers.find(value => value.id === id); return racer ? [{ racerId: id, characterId: racer.characterId, name: characterName(racer.characterId), face: beat.faces![index]! }] : []; }) : undefined;
  useEffect(() => {
    if (beat) { setHeldFocus(previous => { const next = actionFocus(beat, racers, queue); return previous && previous.chainId === next.chainId ? { ...next, ids: [...new Set([...previous.ids, ...next.ids])], positions: [...new Set([...previous.positions, ...next.positions])] } : next; }); return; }
    const timer = setTimeout(() => setHeldFocus(null), ACTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [beat?.key]);
  const beatFocus = beat ? actionFocus(beat, racers, queue) : null;
  const action = beatFocus && heldFocus && heldFocus.chainId === beatFocus.chainId ? { ...beatFocus, ids: [...new Set([...heldFocus.ids, ...beatFocus.ids])], positions: [...new Set([...heldFocus.positions, ...beatFocus.positions])] } : beatFocus ?? heldFocus;
  const myAction = action?.ids.some(id => racers.some(racer => racer.id === id && racer.playerId === room.selfId));
  const choosing = !beat && !(queue?.length) ? choiceFocus(room, racers) : undefined;
  const intro = useRaceIntro(room, racers, reducedMotion, !!beat || !!queue?.length || !!choosing);
  const idleFocus = ownFocus(room, racers);
  const focus: CameraFocus = cameraMode === 'overview' ? { state: 'overview', ids: active ? [active] : [], positions: [] } : choosing ?? (manualCamera ? { state: 'manual', ids: [], positions: [] } : intro.focus ?? (action && action.chainId !== dismissedChain && (autoWatch || myAction) ? action : idleFocus));
  const returnSelf = () => { intro.skip(); setCameraMode('self'); setManualCamera(false); setDismissedChain(action?.chainId); setCameraReset(value => value + 1); };
  return <section ref={root} className={`board-scene ${compact ? 'compact-scene' : ''}`} data-testid="board-3d" data-phase={beat?.kind ?? 'idle'} data-event-ids={beat?.events.map(e => e.id).join(',') ?? ''} data-motion-count={beat?.motions.length ?? 0} data-renderer="react-three-fiber" data-frameloop={beat && !dice && !reducedMotion ? 'always' : 'demand'} data-camera-mode={cameraMode} data-camera-state={focus.state} data-camera-target-ids={focus.ids.join(',')} data-camera-chain-id={focus.chainId ?? ''} aria-label={`${TRACKS[room.track].name}立体棋盘`}>
    <div className="scene-camera-toolbar">
      <div className="scene-camera-modes" role="group" aria-label="棋盘视角"><button aria-pressed={cameraMode === 'self'} aria-label={spectator ? '跟随当前选手' : undefined} onClick={returnSelf}>{spectator ? '跟随' : '自己'}</button><button aria-pressed={cameraMode === 'overview'} onClick={() => { intro.skip(); setCameraMode('overview'); setManualCamera(false); setCameraReset(value => value + 1); }}>总览</button></div>
      <button className="camera-home" onClick={returnSelf} aria-label="恢复默认视角" title={spectator ? '跟随当前选手' : '回到自己的棋子'}>⌖ <span>{spectator ? '跟随选手' : '回到自己'}</span></button>
      <details className="camera-options"><summary aria-label="镜头设置">镜头</summary><label><input type="checkbox" aria-label={spectator ? '自动跟随赛场行动' : '自动观看他人行动'} checked={autoWatch} onChange={event => { setAutoWatch(event.target.checked); try { localStorage.setItem('magical-athlete:auto-watch', String(event.target.checked)); } catch { /* Preferences are optional. */ } }} />{spectator ? '自动跟随赛场行动' : '自动观看他人行动'}</label><small>拖动平移 · 双指或滚轮缩放</small></details>
      {manualCamera && cameraMode === 'self' && !choosing && <span className="camera-paused" role="status">跟拍已暂停</span>}
    </div>
    {intro.focus && <div className="race-intro" data-testid="race-intro" data-intro-index={intro.index} role="status">
      {intro.racer && <span className="race-intro-avatar"><Avatar id={intro.racer.characterId} /></span>}
      <div><small>{intro.reducedMotion ? '全体选手就位' : `选手亮相 · ${intro.index + 1} / ${intro.total}`}</small><strong>{intro.racer ? characterName(intro.racer.characterId) : '准备开赛！'}</strong></div>
      <button onClick={returnSelf} aria-label="跳过选手介绍">跳过 ›</button>
    </div>}
    <Minimap room={room} racers={racers} active={active} beat={beat} startedAt={startedAt} durationMs={durationMs} reducedMotion={reducedMotion} />
    <PredictionHud room={room} racers={racers} choosing={!!choosing} />
    <SceneBoundary resetKey={resetKey} retry={() => setResetKey(n => n + 1)}>
      <Canvas className="board-webgl" key={resetKey} frameloop={beat && !dice && !reducedMotion ? 'always' : 'demand'} orthographic shadows={!lowQuality} dpr={lowQuality ? 1 : [1, compact ? 1.25 : 1.5]} camera={{ position: [3, 16, 16], near: .1, far: 100, zoom: 35 }} gl={{ antialias: !lowQuality, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.setClearColor('#c7dfd3'); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; gl.shadowMap.type = THREE.PCFShadowMap; gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setLost(true); }); gl.domElement.addEventListener('webglcontextrestored', () => setLost(false)); }}>
        <StudioLighting compact={compact} lowQuality={lowQuality} />
        <AdaptiveQuality lowQuality={lowQuality} onSlow={() => setAutomaticLow(true)} root={root} />
        <CameraRig racers={racers} compact={compact} reset={cameraReset} focus={focus} reducedMotion={reducedMotion} onManual={() => { intro.skip(); setManualCamera(true); }} root={root} />
        <DioramaStadium compact={compact} track={room.track} lowQuality={lowQuality} beat={beat} racers={racers} />
        <Suspense fallback={null}>{racers.filter(r => !r.eliminated || beat?.kind === 'eliminate' && beat.targets.includes(r.id)).map(racer => <Pawn key={racer.id} racer={racer} racers={racers} room={room} compact={compact} beat={beat} startedAt={startedAt} durationMs={durationMs} lowQuality={lowQuality} reducedMotion={reducedMotion} active={active === racer.id} onDetail={onDetail} labels={labels} />)}</Suspense>
        <RaceEffects {...{ beat, racers, compact, startedAt, durationMs, reducedMotion, lowQuality }} />
        <ScoreProjector beat={beat} racers={racers} compact={compact} label={scoreLabel} />
        <PerformanceProbe root={root} />
      </Canvas>
    </SceneBoundary>
    <div className="scene-labels" aria-hidden="true">{racers.filter(r => !r.eliminated).map(racer => { const owner = room.players.find(p => p.id === racer.playerId), scale = occupancy(racer, racers, racer.position).scale; return <span key={racer.id} data-racer-id={racer.id} ref={element => { if (element) labels.current.set(racer.id, element); else labels.current.delete(racer.id); }} className={`pawn-seat ${active === racer.id ? 'is-active' : ''} ${scale < .5 ? 'is-crowded' : scale < .9 ? 'is-shared' : ''}`} style={{ borderColor: owner?.color }}>{(owner?.seat ?? 0) + 1}</span>; })}<span ref={scoreLabel} className="score-float" style={{ display: beat?.kind === 'score' || beat?.kind === 'finish' ? undefined : 'none' }}>{beat?.events[0]?.text.match(/[+＋-]\d+分/)?.[0] ?? (beat?.kind === 'finish' ? '冲线！' : '得分！')}</span></div>
    {lost && <div className="scene-fallback"><strong>正在恢复图形画面…</strong><button onClick={() => { setLost(false); setResetKey(n => n + 1); }}>重新载入 3D</button></div>}
    <SceneBoundary resetKey={resetKey} retry={() => setResetKey(n => n + 1)}><DiceSpotlight active={dice} beatKey={dice ? beat?.key : undefined} contenders={duelContenders} face={beat?.face ?? room.lastRoll?.face ?? 1} startedAt={startedAt} durationMs={durationMs} reducedMotion={reducedMotion} lowQuality={lowQuality} source={selected ? characterName(selected.characterId) : '运动员'} /></SceneBoundary>
    <ActionBanner beat={beat} racers={racers} />
    <ul className="sr-only" aria-label="立体棋盘选手位置">{racers.map(r => <li key={r.id} data-testid="scene-racer" data-racer-id={r.id} data-position={r.position} data-target-position={beat?.motions.find(m => m.racerId === r.id)?.to ?? r.position}>{characterName(r.characterId)} · {r.position} 格{r.tripped ? ' · 绊倒' : ''}</li>)}</ul>
  </section>;
}

function PerformanceProbe({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const { gl, scene } = useThree();
  const frameCount = useRef(0);
  useEffect(() => {
    const previous = scene.onAfterRender;
    // Model readiness is diagnostic metadata, not a per-frame rendering task.
    // In an eight-client room, keep graph walks off the animation hot path.
    const reportModels = () => {
      if (!root.current) return;
      let loaded = 0, fallbacks = 0;
      scene.traverse(object => { if (object.name.startsWith('toy_')) loaded++; if (object.name === 'procedural-racer-fallback') fallbacks++; });
      root.current.dataset.loadedModels = String(loaded); root.current.dataset.modelFallbacks = String(fallbacks);
    };
    reportModels();
    const modelReport = setInterval(reportModels, 500);
    scene.onAfterRender = function (...args) {
      previous.apply(this, args);
      if (root.current) {
        root.current.dataset.drawCalls = String(gl.info.render.calls); root.current.dataset.triangles = String(gl.info.render.triangles);
        root.current.dataset.renderFrameCount = String(++frameCount.current);
      }
    };
    return () => { clearInterval(modelReport); scene.onAfterRender = previous; };
  }, [gl, scene, root]);
  return null;
}
function Minimap({ room, racers, active, beat, startedAt, durationMs, reducedMotion }: { room: RoomView; racers: Racer[]; active?: string; beat?: PresentationBeat; startedAt: number; durationMs: number; reducedMotion: boolean }) {
  const [tick, setTick] = useState(1);
  useEffect(() => {
    if (reducedMotion || !beat?.motions.length) { setTick(1); return; }
    let animation: number;
    const update = () => { const value = progress(startedAt, durationMs); setTick(value); if (value < 1) animation = requestAnimationFrame(update); };
    update(); return () => cancelAnimationFrame(animation);
  }, [beat?.key, startedAt, durationMs, reducedMotion]);
  const mapPoint = (position: number) => { const point = boardPoint(position, false); return { x: 32 + (point[0] / TILE + 7.5) * 10.3, y: 28 + (point[2] / TILE + 1.5) * 15 }; };
  const currentPosition = (racer: Racer) => {
    const motion = beat?.motions.find(value => value.racerId === racer.id);
    if (!motion) return racer.position;
    if (beat?.kind !== 'move') return tick < .5 ? motion.from : motion.to;
    const step = ease(clamp((tick - .06) / .88, 0, 1)) * Math.max(0, motion.path.length - 1);
    const at = Math.min(motion.path.length - 1, Math.floor(step));
    return THREE.MathUtils.lerp(motion.path[at] ?? motion.from, motion.path[Math.min(at + 1, motion.path.length - 1)] ?? motion.to, step - at);
  };
  const ownRacers = racers.filter(racer => racer.playerId === room.selfId);
  const others = racers.filter(racer => racer.playerId !== room.selfId);
  const visibleRacers = racers.filter(racer => !racer.eliminated);
  const ownMarker = (racer: Racer) => ownRacers.length > 1 ? String.fromCharCode(65 + ownRacers.findIndex(value => value.id === racer.id)) : '你';
  const positionText = (racer: Racer) => racer.eliminated ? '已出局' : `第${Math.round(currentPosition(racer))}格`;
  return <aside className="board-minimap" data-testid="board-minimap" aria-label="赛道小地图">
    <div className="minimap-heading"><span>赛道小地图</span><span><i />{room.role === 'spectator' ? '选手位置' : '你的位置'}</span></div>
    <svg className="minimap-track" viewBox="0 0 220 104" aria-hidden="true">
      <polyline points={Array.from({ length: 31 }, (_, index) => { const point = mapPoint(index); return `${point.x},${point.y}`; }).join(' ')} fill="none" stroke="#d9e5da" strokeWidth="15" strokeLinejoin="round" />
      <polyline points={Array.from({ length: 31 }, (_, index) => { const point = mapPoint(index); return `${point.x},${point.y}`; }).join(' ')} fill="none" stroke="#62877b" strokeWidth="8" strokeLinejoin="round" />
      {[0, 5, 10, 12, 15, 20, 25, 30].map(index => { const point = mapPoint(index), upper = index <= 12; return <g key={index}><circle cx={point.x} cy={point.y} r="1.8" fill="#ecf5e8" /><text x={point.x} y={point.y + (upper ? -14 : 18)} textAnchor="middle">{index === 0 ? '起点' : index === 30 ? '终点' : index}</text></g>; })}
      {[...visibleRacers].sort((first, second) => Number(first.playerId === room.selfId) - Number(second.playerId === room.selfId)).map(racer => {
        const point = mapPoint(currentPosition(racer)), owner = room.players.find(player => player.id === racer.playerId), own = racer.playerId === room.selfId;
        const peers = visibleRacers.filter(value => Math.round(currentPosition(value)) === Math.round(currentPosition(racer))), index = peers.findIndex(value => value.id === racer.id);
        const cols = Math.min(3, peers.length), rows = Math.ceil(peers.length / cols);
        const x = point.x + (index % cols - (cols - 1) / 2) * 14, y = point.y + (Math.floor(index / cols) - (rows - 1) / 2) * 14;
        return <g key={racer.id} data-map-racer-id={racer.id} className={`${own ? 'minimap-self' : ''} ${active === racer.id ? 'minimap-active' : ''}`}>
          {peers.length > 1 && <line x1={point.x} y1={point.y} x2={x} y2={y} stroke={own ? '#b68b23' : '#668675'} strokeWidth="1" opacity=".65" />}
          <g transform={`translate(${x},${y})`}>
            {own && <circle r="11" fill="#ffd967" fillOpacity=".4" stroke="#c79a2b" strokeWidth="1.2" />}
            {active === racer.id && <circle r={own ? 13 : 9} fill="none" stroke="#216858" strokeWidth="1.8" strokeDasharray="3 2" />}
            <circle r={own ? 8 : 5.7} fill={own ? '#285e54' : owner?.color ?? '#fff'} stroke={own ? '#fff8d8' : '#fff9e6'} strokeWidth={own ? 2 : 1.5} />
            <text className={own ? 'minimap-own-marker' : 'minimap-seat-marker'} textAnchor="middle" dominantBaseline="central">{own ? ownMarker(racer) : (owner?.seat ?? 0) + 1}</text>
          </g>
        </g>;
      })}
    </svg>
    <div className="minimap-own-positions">{ownRacers.map(racer => <div key={racer.id} data-testid="minimap-own-position" data-racer-id={racer.id} data-position={Math.round(currentPosition(racer))} className={`minimap-own-position ${active === racer.id ? 'is-active' : ''}`} aria-label={`你，${characterName(racer.characterId)}，${positionText(racer)}`}>
      <span className="minimap-own-avatar"><Avatar id={racer.characterId} />{ownRacers.length > 1 && <b>{ownMarker(racer)}</b>}</span>
      <span><strong>你 · {positionText(racer)}</strong><small>{characterName(racer.characterId)}{racer.finished ? ' · 已冲线' : racer.tripped ? ' · 绊倒' : ''}</small></span>
      {active === racer.id && <i title="正在行动" />}
    </div>)}</div>
    {others.length > 0 && <div className="minimap-positions" aria-label="其他选手位置">{others.map(racer => { const owner = room.players.find(player => player.id === racer.playerId); return <span key={racer.id} data-racer-id={racer.id} data-position={Math.round(currentPosition(racer))} className={active === racer.id ? 'is-active' : ''} style={{ borderColor: owner?.color }} aria-label={`${(owner?.seat ?? 0) + 1}号选手，${characterName(racer.characterId)}，${positionText(racer)}`}><i style={{ background: owner?.color }} /><small>{(owner?.seat ?? 0) + 1}号</small><b>{racer.eliminated ? '出局' : <>{Math.round(currentPosition(racer))}<em>格</em></>}</b></span>; })}</div>}
  </aside>;
}

function PredictionHud({ room, racers, choosing }: { room: RoomView; racers: Racer[]; choosing: boolean }) {
  if (room.phase !== 'race') return null;
  // These are displayed racers, never the newer confirmed room's future flags.
  const predictions = racers.flatMap(source => { const target = racers.find(racer => racer.id === source.flags.prediction); return target ? [{ source, target }] : []; });
  if (!predictions.length) return null;
  const ownerText = (racer: Racer) => { const owner = room.players.find(player => player.id === racer.playerId); return `${(owner?.seat ?? 0) + 1}号 · ${owner?.id === room.selfId ? '你' : owner?.name ?? '选手'}`; };
  return <aside className={`prediction-hud ${choosing ? 'is-choosing' : ''}`} data-testid="prediction-hud" aria-label="本场冠军预测" aria-live="polite"><span className="prediction-hud-title">✦ 冠军预测</span><div className="prediction-hud-list">{predictions.map(({ source, target }) => <div key={source.id} className={`prediction-chip ${source.eliminated ? 'is-inactive' : ''}`} data-prediction-source={source.id} data-prediction-target={target.id} aria-label={`${ownerText(source)}的${characterName(source.characterId)}预测${ownerText(target)}的${characterName(target.characterId)}夺冠${source.eliminated ? '，预测已失效' : ''}`}>
    <span className="prediction-avatar"><Avatar id={source.characterId} /></span><span className="prediction-racer"><strong>{characterName(source.characterId)}</strong><small>{ownerText(source)}</small></span><b aria-hidden="true">→</b><span className="prediction-racer"><strong>{characterName(target.characterId)}</strong><small>{ownerText(target)}</small></span>{source.eliminated && <em>已失效</em>}
  </div>)}</div></aside>;
}

function ActionBanner({ beat, racers }: { beat?: PresentationBeat; racers: Racer[] }) {
  const skillMove = beat?.kind === 'move' && !!beat.cause && beat.cause !== 'main';
  if (!beat || !skillMove && !['skill', 'trip', 'recover', 'score', 'finish', 'warp', 'swap'].includes(beat.kind)) return null;
  const affected = racers.filter(racer => beat.targets.includes(racer.id));
  const actor = skillMove ? affected[0] : racers.find(racer => racer.id === beat.source) ?? affected[0];
  const distances = [...new Set(beat.motions.map(motion => motion.to - motion.from))];
  const distance = distances[0] ?? 0;
  const motionText = distances.length > 1 ? '同时移动' : `${beat.motions.length > 1 ? '同时' : ''}${distance < 0 ? '后退' : '前进'}${Math.abs(distance)}格`;
  const effectName = beat.cause === 'track-arrow' ? '箭头格' : abilityCaptions[beat.cause ?? ''] ?? '技能效果';
  const title = skillMove ? `${effectName} → ${motionText}` : beat.kind === 'skill' ? beat.events[0]?.type === 'skip' ? '领先休息' : abilityCaptions[beat.cause ?? actor?.characterId ?? ''] ?? '能力发动' : beat.kind === 'trip' ? '绊倒！' : beat.kind === 'recover' ? '起身 · 本次不掷骰' : beat.kind === 'swap' ? '交换位置' : beat.kind === 'warp' ? '瞬间移动' : beat.kind === 'finish' ? '冲过终点！' : beat.events[0]?.text.match(/[+＋-]\d+分/)?.[0] ?? '获得分数';
  const caption = skillMove ? `技能效果 · ${affected.map(racer => characterName(racer.characterId)).join('、') || '受影响角色'}` : `${actor ? characterName(actor.characterId) : '魔法赛道'} · ${beat.kind === 'skill' ? '技能发动' : '赛场瞬间'}`;
  const detail = `${beat.kind === 'recover' ? '起身替代主移动，本次不掷骰。' : ''}${beat.events.map(event => event.text).join(' · ')}`;
  return <div key={beat.key} className={`scene-action-banner banner-${beat.kind}`} data-testid="skill-banner" role="status">{actor && <span className="skill-banner-avatar"><Avatar id={actor.characterId} /></span>}<div><small>{caption}</small><strong>{title}</strong><span>{detail}</span></div><b aria-hidden="true">✦</b></div>;
}

function Pawn({ racer, racers, room, compact, beat, startedAt, durationMs, lowQuality, reducedMotion, active, onDetail, labels }: { racer: Racer; racers: Racer[]; room: RoomView; compact: boolean; beat?: PresentationBeat; startedAt: number; durationMs: number; lowQuality: boolean; reducedMotion: boolean; active: boolean; onDetail: (id: string, racerId?: string) => void; labels: React.RefObject<Map<string, HTMLSpanElement>> }) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const { camera, size } = useThree(); const projection = useMemo(() => new THREE.Vector3(), []);
  const owner = room.players.find(p => p.id === racer.playerId);
  const color = owner?.color ?? '#ffcf50';
  const motion = beat?.motions.find(m => m.racerId === racer.id);
  const from = boardPoint(motion?.from ?? racer.position, compact);
  const offset = occupancy(racer, racers, motion?.from ?? racer.position, compact);
  const destinations = motion ? racers.map(r => ({ ...r, position: beat?.motions.find(m => m.racerId === r.id)?.to ?? r.position })) : racers;
  const endOffset = occupancy(racer, destinations, motion?.to ?? racer.position, compact);
  const route = useMemo(() => motion ? pawnRoute(motion.path.map((position, index) => {
    const point = boardPoint(position, compact);
    return [point[0] + (index === 0 ? offset.x : index === motion.path.length - 1 ? endOffset.x : 0), 0, point[2] + (index === 0 ? offset.z : index === motion.path.length - 1 ? endOffset.z : 0)];
  })) : undefined, [motion, compact, offset.x, offset.z, endOffset.x, endOffset.z]);
  const walkPoint = useMemo(() => new THREE.Vector3(), []);
  const affected = beat?.targets.includes(racer.id) || beat?.source === racer.id;
  useFrame(() => {
    if (!root.current || !body.current) return;
    // Demand rendering in reduced-motion mode must show the confirmed endpoint
    // immediately; it cannot rely on another animation frame to reach it.
    const t = beat && !reducedMotion ? progress(startedAt, durationMs) : 1;
    let x = from[0] + offset.x, z = from[2] + offset.z, y = .225, scale = offset.scale, tilt = racer.tripped ? -Math.PI / 2 : 0, swing = 0;
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
        const count = Math.max(1, motion.path.length - 1), fraction = strideProgress(t), walk = fraction * count;
        route!.getPointAt(fraction, walkPoint); x = walkPoint.x; z = walkPoint.z;
        const backwards = motion.to < motion.from;
        y += reducedMotion ? 0 : strideLift(fraction, count); swing = reducedMotion ? 0 : Math.sin(walk * Math.PI * 2) * (backwards ? -.055 : .045); scale = THREE.MathUtils.lerp(offset.scale, endOffset.scale, fraction);
      }
    }
    const fallPhase = beat?.targets.includes(racer.id) && beat.kind === 'trip' ? 'trip' : affected && beat?.kind === 'recover' ? 'recover' : racer.tripped ? 'down' : undefined;
    const fall = fallPhase ? pawnFallPose(t, fallPhase, reducedMotion) : undefined;
    if (fall) { tilt = fall.tilt; swing = 0; }
    if (affected && beat?.kind === 'skill' && !reducedMotion) { y += Math.sin(t * Math.PI) * .3; swing += Math.sin(t * Math.PI * 2) * .18; }
    if (beat?.targets.includes(racer.id) && beat.kind === 'eliminate') scale *= 1 - ease(t);
    root.current.position.set(x, y, z); root.current.scale.setScalar(Math.max(.01, scale)); body.current.rotation.set(tilt, swing, 0); body.current.position.y = fall?.lift ?? 0;
    const label = labels.current.get(racer.id);
    if (label) { label.dataset.worldX = x.toFixed(4); label.dataset.worldZ = z.toFixed(4); }
    if (label) { root.current.updateWorldMatrix(true, false); projection.set(0, .19, .34).applyMatrix4(root.current.matrixWorld).project(camera); label.style.transform = `translate(${(projection.x + 1) * size.width / 2}px,${(1 - projection.y) * size.height / 2}px) translate(-50%,-50%)`; label.style.visibility = projection.z < -1 || projection.z > 1 ? 'hidden' : 'visible'; }
  });
  return <group ref={root} position={[from[0] + offset.x, .225, from[2] + offset.z]} scale={offset.scale} onClick={e => { e.stopPropagation(); if (e.delta <= 5) onDetail(racer.characterId, racer.id); }}>
    <PawnContact />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .018, 0]}><ringGeometry args={[.31, active ? .43 : .38, 24]} /><meshBasicMaterial color={active ? '#ffda27' : color} side={THREE.DoubleSide} /></mesh>
    <group ref={body} position={[0, 0, 0]}><ToyCharacter characterId={racer.characterId} color={color} lowQuality={lowQuality} /></group>
    {active && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .023, 0]}><ringGeometry args={[.46, .49, 32]} /><meshBasicMaterial color="#fff8da" side={THREE.DoubleSide} /></mesh>}
  </group>;
}

function ScoreProjector({ beat, racers, compact, label }: { beat?: PresentationBeat; racers: Racer[]; compact: boolean; label: React.RefObject<HTMLSpanElement | null> }) {
  const { camera, size } = useThree(); const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => { const racer = racers.find(r => r.id === beat?.source); if (!label.current || !racer || !beat || !['score', 'finish'].includes(beat.kind)) return; const point = pawnWorldPoint(racer, racers, racer.position, compact); projected.set(point[0], 2.5, point[2]).project(camera); label.current.style.transform = `translate(${(projected.x + 1) * size.width / 2}px,${(1 - projected.y) * size.height / 2}px) translate(-50%,-50%)`; });
  return null;
}

const pipPatterns: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-.24, .24], [.24, -.24]], 3: [[-.24, .24], [0, 0], [.24, -.24]], 4: [[-.24, .24], [.24, .24], [-.24, -.24], [.24, -.24]], 5: [[-.24, .24], [.24, .24], [0, 0], [-.24, -.24], [.24, -.24]], 6: [[-.24, .26], [.24, .26], [-.24, 0], [.24, 0], [-.24, -.26], [.24, -.26]] };
function Die({ face, startedAt, durationMs, reducedMotion, side = 0 }: { face: number; startedAt: number; durationMs: number; reducedMotion: boolean; side?: number }) {
  const die = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!die.current) return;
    const p = progress(startedAt, durationMs), final = diceTopRotation(face);
    const throwTime = clamp(p / .82, 0, 1), remaining = 1 - ease(clamp((p - .15) / .68, 0, 1));
    // Kinematic presentation: fixed result orientation, ballistic throw and damped rebounds.
    const flight = p < .34 ? Math.sin(p / .34 * Math.PI) * 2.1 : p < .59 ? Math.sin((p - .34) / .25 * Math.PI) * .78 : p < .75 ? Math.sin((p - .59) / .16 * Math.PI) * .26 : p < .83 ? Math.sin((p - .75) / .08 * Math.PI) * .07 : 0;
    die.current.position.set(reducedMotion ? 0 : (side || -1.4) * (1 - ease(throwTime)), .44 + (reducedMotion ? 0 : flight), reducedMotion ? 0 : Math.sin(p * Math.PI * 2) * .28 * (1 - throwTime));
    const spin = side > 0 ? -1 : 1;
    die.current.rotation.set(final[0] + (reducedMotion ? 0 : spin * remaining * Math.PI * 8), final[1] + (reducedMotion ? 0 : spin * remaining * Math.PI * 5), final[2] + (reducedMotion ? 0 : spin * remaining * Math.PI * 6));
  });
  const faces: { value: number; position: [number, number, number]; rotation: [number, number, number] }[] = [{ value: 1, position: [0, .501, 0], rotation: [-Math.PI / 2, 0, 0] }, { value: 6, position: [0, -.501, 0], rotation: [Math.PI / 2, 0, 0] }, { value: 2, position: [0, 0, .501], rotation: [0, 0, 0] }, { value: 5, position: [0, 0, -.501], rotation: [0, Math.PI, 0] }, { value: 3, position: [.501, 0, 0], rotation: [0, Math.PI / 2, 0] }, { value: 4, position: [-.501, 0, 0], rotation: [0, -Math.PI / 2, 0] }];
  return <group ref={die}><RoundedBox args={[1, 1, 1]} radius={.095} smoothness={3} castShadow receiveShadow><meshStandardMaterial color="#fff9e9" roughness={.3} metalness={.05} /></RoundedBox>{faces.map(side => <group key={side.value} position={side.position} rotation={side.rotation}>{pipPatterns[side.value].map(([x, y], i) => <mesh key={i} position={[x, y, .005]} scale={[1, 1, .28]}><sphereGeometry args={[.065, 12, 8]} /><meshStandardMaterial color={side.value === 1 ? '#ed6149' : '#253e50'} roughness={.5} /></mesh>)}</group>)}</group>;
}
interface DuelContender { racerId: string; characterId: string; name: string; face: number }
function DiceSpotlight({ active, beatKey, contenders, face, startedAt, durationMs, reducedMotion, lowQuality, source }: { active: boolean; beatKey?: string; contenders?: DuelContender[]; face: number; startedAt: number; durationMs: number; reducedMotion: boolean; lowQuality: boolean; source: string }) {
  const [settledKey, setSettledKey] = useState<string>();
  const paired = contenders?.length === 2;
  const revealAfterMs = paired ? reducedMotion ? 0 : Math.max(0, Math.min(1800, durationMs - 1500)) : durationMs * .84;
  const settled = active && !!beatKey && (revealAfterMs === 0 || settledKey === beatKey);
  // Consecutive throws can keep `active` true. Tie their revealed face to the
  // confirmed event, so a new throw never inherits the previous settled frame.
  useEffect(() => { if (!active || !beatKey) return; const timer = setTimeout(() => setSettledKey(beatKey), Math.max(0, startedAt + revealAfterMs - performance.now())); return () => clearTimeout(timer); }, [active, beatKey, startedAt, revealAfterMs]);
  return <div hidden={!active} className={`dice-spotlight ${settled ? 'is-settled' : ''} ${paired ? 'is-duel' : ''}`} role="status" aria-label={paired ? `${contenders[0]!.name}与${contenders[1]!.name}的决斗骰` : `${source}正在掷骰`} data-dice-event-key={active ? beatKey : ''} data-frameloop={active ? reducedMotion ? 'demand' : 'always' : 'never'} data-dice-mode={paired ? 'duel' : 'single'} data-up-face={!paired && settled ? face : ''} data-up-faces={paired && settled ? contenders.map(contender => contender.face).join(',') : ''} data-result-read-ms={paired ? durationMs - revealAfterMs : undefined}>
    {paired ? <div className="duel-contenders">{contenders.map((contender, index) => <div key={contender.racerId} data-duel-racer-id={contender.racerId}><span><Avatar id={contender.characterId} /></span><strong>{contender.name}</strong><small>{index ? '应战方' : '挑战方'}</small></div>)}<b>VS</b></div> : <div className="dice-caption">{source}<strong>{settled ? '点数确认' : '好戏，掷出来！'}</strong></div>}
    <Canvas frameloop={active ? reducedMotion ? 'demand' : 'always' : 'never'} shadows={!lowQuality} dpr={lowQuality ? 1 : [1, 1.5]} camera={{ position: [3.7, 6.5, 5], fov: 38 }} gl={{ alpha: true, antialias: !lowQuality }}><ambientLight intensity={1.5} /><directionalLight position={[-3, 8, 4]} intensity={3} castShadow shadow-mapSize={[512, 512]} shadow-normalBias={.02} /><RoundedBox args={[4.2, .18, 3.6]} position={[0, -.15, 0]} radius={.2} smoothness={3} receiveShadow><meshStandardMaterial color="#315c62" roughness={.9} /></RoundedBox>{[-1, 1].map(side => <group key={side}><mesh position={[side * 2.04, .03, 0]}><boxGeometry args={[.1, .3, 3.7]} /><meshStandardMaterial color="#e4b569" /></mesh><mesh position={[0, .03, side * 1.78]}><boxGeometry args={[4.1, .3, .1]} /><meshStandardMaterial color="#e4b569" /></mesh></group>)}{paired ? contenders.map((contender, index) => <group key={contender.racerId} position={[(index ? 1 : -1) * .95, 0, 0]} scale={.82}><Die face={contender.face} startedAt={startedAt} durationMs={Math.max(1, revealAfterMs)} reducedMotion={reducedMotion || revealAfterMs === 0} side={index ? 1 : -1} /></group>) : <Die {...{ face, startedAt, durationMs, reducedMotion }} />}</Canvas>
    <div className={`dice-result ${paired ? 'duel-result' : ''}`} data-testid={active ? paired ? 'duel-dice-value' : 'dice-value' : undefined}>{paired ? <><span className="duel-values"><b>{settled ? contenders[0]!.face : '·'}</b><i>:</i><b>{settled ? contenders[1]!.face : '·'}</b></span><span>{settled ? '双方点数确认 · 即将结算' : '两人已投骰 · 同时揭晓'}</span></> : settled ? <><b>{face}</b><span>点 · 即将出发</span></> : <span>抛出 · 弹跳 · 停稳</span>}</div>
  </div>;
}

function useDiceSound(beat: PresentationBeat | undefined, durationMs: number, muted: boolean) {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => { const unlock = () => { if (muted) return; try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Audio is optional. */ } }; document.addEventListener('pointerdown', unlock); return () => document.removeEventListener('pointerdown', unlock); }, [muted]);
  useEffect(() => {
    if (muted || !beat || beat.kind !== 'dice' && beat.kind !== 'duel-dice') return;
    const timers = [.34, .59, .75, .83].map((at, index) => setTimeout(() => {
      try { const ctx = audio.current; if (!ctx || ctx.state !== 'running') return; const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(170 + index * 35, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + .065); gain.gain.setValueAtTime(.13 / (index + 1), ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .09); oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .1); } catch { /* Gameplay never depends on audio availability. */ }
    }, durationMs * at));
    return () => timers.forEach(clearTimeout);
  }, [beat?.key, durationMs, muted]);
  useEffect(() => () => { void audio.current?.close(); }, []);
}
