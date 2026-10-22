import { Component, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, type AnimationClip, type Group } from 'three';
import { SECOND_WIND_CHARACTERS } from '../../shared/second-wind.js';
import { WURSTII_CHARACTERS } from '../../shared/wurstii.js';
import { toyResources } from './pawn-materials.js';
import { AssetRecovery } from './asset-recovery.js';
import { expansionModels } from './expansion-models.js';
import { cloneToyModel } from './toy-model-instance.js';

export interface ToyCharacterProps {
  characterId: string;
  color: string;
  lowQuality?: boolean;
  castShadow?: boolean;
  form?: string;
  mount?: boolean;
  animation?: 'idle' | 'move' | 'skill' | 'fall' | 'recover';
  motionEnabled?: boolean;
}

const MODEL_URL = '/models/toy-racers.glb?v=mouth-surface-v2-20261022';
const ECONOMY_URL = '/models/toy-racers-economy.glb?v=mouth-surface-v2-20261022';
const createRecovery = (url: string) => new AssetRecovery({
  clearCache: () => useGLTF.clear(url),
  isOnline: () => navigator.onLine,
  watchOnline: listener => {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
});
// Each asset has its own failed promise and retry budget. Switching quality
// must not leave the other asset's boundary or successful load in charge.
const modelRecovery = createRecovery(MODEL_URL);
const economyRecovery = createRecovery(ECONOMY_URL);
const secondWind = new Set(SECOND_WIND_CHARACTERS.map(character => character.id));
const wurstii = new Set(WURSTII_CHARACTERS.map(character => character.id));
const additionalRecovery = new Map<string, AssetRecovery>();
function recoveryFor(url: string) {
  if (url === MODEL_URL) return modelRecovery;
  if (url === ECONOMY_URL) return economyRecovery;
  let recovery = additionalRecovery.get(url);
  if (!recovery) { recovery = createRecovery(url); additionalRecovery.set(url, recovery); }
  return recovery;
}

/** Network failures affect only the sculpture, never the board or its controls. */
class ModelBoundary extends Component<{ recovery: AssetRecovery; revision: number; fallback: ReactNode; children: ReactNode }, { revision: number; failed: boolean }> {
  state = { revision: this.props.revision, failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { revision: number }, state: { revision: number }) {
    return props.revision === state.revision ? null : { revision: props.revision, failed: false };
  }
  componentDidCatch() { this.props.recovery.failure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FailedToy({ color, castShadow, revision, recovery }: { color: string; castShadow: boolean; revision: number; recovery: AssetRecovery }) {
  useEffect(() => { recovery.failure(); }, [revision, recovery]);
  return <LoadingToy color={color} castShadow={castShadow} failed />;
}

function CharacterAsset({ revision, recovery, color, url, rootName, ...props }: ToyCharacterProps & { revision: number; recovery: AssetRecovery; url: string; rootName?: string }) {
  let scene: Group;
  let animations: AnimationClip[];
  try {
    // In this pinned drei/fiber version useGLTF is a synchronous suspense-cache
    // accessor. Keep pending promises in Suspense, but handle rejected network
    // reads before fiber's onCaughtError reports them as window errors.
    const asset = useGLTF(url); scene = asset.scene; animations = asset.animations;
  } catch (error) {
    if (error && typeof (error as { then?: unknown }).then === 'function') throw error;
    return <FailedToy color={color} castShadow={!!props.castShadow && !props.lowQuality} revision={revision} recovery={recovery} />;
  }
  return <CharacterModel scene={scene} animations={animations} recovery={recovery} rootName={rootName} {...props} />;
}

function CharacterModel({ scene, recovery, characterId, lowQuality = false, castShadow = true, rootName, animations, animation = 'idle', motionEnabled = true }: Pick<ToyCharacterProps, 'characterId' | 'lowQuality' | 'castShadow' | 'animation' | 'motionEnabled'> & { scene: Group; recovery: AssetRecovery; rootName?: string; animations: AnimationClip[] }) {
  useEffect(() => { recovery.success(); }, [scene, recovery]);
  const model = useMemo(() => {
    const source = scene.getObjectByName(rootName ?? `toy_${characterId}`) ?? scene.children[0];
    const instance = cloneToyModel(source!, motionEnabled);
    instance.userData.sculptureState = 'ready';
    instance.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = castShadow;
        object.receiveShadow = !lowQuality;
        object.frustumCulled = true;
        object.material = Array.isArray(object.material)
          ? object.material.map(material => material instanceof MeshStandardMaterial ? toyResources.characterMaterial(material, lowQuality) : material)
          : object.material instanceof MeshStandardMaterial ? toyResources.characterMaterial(object.material, lowQuality) : object.material;
      }
    });
    return instance;
  }, [scene, characterId, rootName, castShadow, lowQuality, motionEnabled]);
  const mixer = useMemo(() => motionEnabled ? new AnimationMixer(model) : null, [model, motionEnabled]);
  useEffect(() => {
    if (!mixer) return;
    const clip = animations.find(clip => clip.name === `${characterId}-${animation}`) ?? animations.find(clip => clip.name === animation);
    if (!clip) return;
    const once = !['idle','move'].includes(animation);
    const action = mixer.clipAction(clip); action.reset(); action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity); action.clampWhenFinished = true; action.fadeIn(.12); action.play(); mixer.update(0);
    return () => { action.fadeOut(.1); };
  }, [mixer, animations, animation, characterId]);
  useEffect(() => () => { mixer?.stopAllAction(); mixer?.uncacheRoot(model); }, [mixer, model]);
  useFrame((_, delta) => { if (mixer && animations.length) mixer.update(Math.min(delta, .1)); });
  // Source geometry belongs to useGLTF; satin palette variants to toyResources.
  return <primitive object={model} dispose={null} />;
}

function LoadingToy({ color, castShadow, failed = false }: { color: string; castShadow: boolean; failed?: boolean }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(()=>{
    if(failed)return;
    // A never-settling loader can use the visible fallback after a bounded
    // wait. A successful late request still replaces it through Suspense.
    const timer=setTimeout(()=>setTimedOut(true),12_000);
    return()=>clearTimeout(timer);
  },[failed]);
  return <group name="procedural-racer-fallback" userData={{sculptureState:failed||timedOut?'failed':'pending',...(failed||timedOut?{fallbackReason:failed?'load-error':'load-timeout'}:{})}}>
    <mesh position={[0, 0.38, 0]} castShadow={castShadow}>
      <capsuleGeometry args={[0.18, 0.3, 3, 8]} />
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
    <mesh position={[0, 0.7, 0]} castShadow={castShadow}>
      <sphereGeometry args={[0.2, 12, 8]} />
      <meshStandardMaterial color="#fff6d6" roughness={0.45} />
    </mesh>
  </group>;
}

/** Original toy sculptures: +Y up, +Z face, ground pivot at zero. */
function Sculpture({ characterId, color, lowQuality = false, castShadow = true, url, rootName, animation, motionEnabled }: ToyCharacterProps & {url: string; rootName?: string}) {
  const recovery = recoveryFor(url);
  const revision = useSyncExternalStore(recovery.subscribe, recovery.snapshot, recovery.snapshot);
  const fallback = <LoadingToy color={color} castShadow={castShadow && !lowQuality} />;
  return <ModelBoundary key={url} recovery={recovery} revision={revision} fallback={<LoadingToy color={color} castShadow={castShadow && !lowQuality} failed />}><Suspense fallback={fallback}><CharacterAsset url={url} rootName={rootName} revision={revision} recovery={recovery} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow && !lowQuality} animation={animation} motionEnabled={motionEnabled} /></Suspense></ModelBoundary>;
}

export function ToyCharacter({ characterId, color, lowQuality = false, castShadow = true, form, mount, animation, motionEnabled }: ToyCharacterProps) {
  const geometry = toyResources.baseGeometry(lowQuality);
  const modelId = characterId === 'bite-mark' && form === 'were-mouth' ? 'bite-mark-were' : characterId;
  const url = wurstii.has(characterId) ? `/models/wurstii/${characterId}.glb` : characterId==='banana' ? `/models/banana/${lowQuality?'banana-economy':'banana'}.glb?v=reference-mouth-v2-20261022` : expansionModels[characterId] ?? (secondWind.has(characterId) ? `/models/second-wind/${modelId}.glb?v=mouth-surface-v2-20261022` : lowQuality ? ECONOMY_URL : MODEL_URL);
  return <group name={`racer-model-${characterId}`} userData={{racerModel:true}}>
    <mesh geometry={geometry.body} material={toyResources.baseMaterial(color, lowQuality)} receiveShadow={!lowQuality} castShadow={castShadow && !lowQuality} dispose={null} />
    <mesh geometry={geometry.cap} material={toyResources.baseMaterial(color, lowQuality, true)} receiveShadow={!lowQuality} dispose={null} />
    {mount && <group position={[0, .164, 0]}><Sculpture characterId="hog-knight-hog" rootName="toy_hog-knight-hog" url="/models/second-wind/hog-knight-hog.glb?v=mouth-surface-v2-20261022" color={color} lowQuality={lowQuality} castShadow={castShadow} animation={animation} motionEnabled={motionEnabled} /></group>}
    <group position={[0, .164 + (mount ? .34 : 0), mount ? -.07 : 0]} scale={mount ? .7 : 1} userData={{racerMainSculpture:true}}>
      <Sculpture url={url} rootName={`toy_${modelId}`} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow} animation={animation} motionEnabled={motionEnabled} />
    </group>
  </group>;
}
