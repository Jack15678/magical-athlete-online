import { Component, Suspense, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, type AnimationClip, type Group } from 'three';
import { SECOND_WIND_CHARACTERS } from '../../shared/second-wind.js';
import { WURSTII_CHARACTERS } from '../../shared/wurstii.js';
import { toyResources } from './pawn-materials.js';
import { AssetRecovery } from './asset-recovery.js';

export interface ToyCharacterProps {
  characterId: string;
  color: string;
  lowQuality?: boolean;
  castShadow?: boolean;
  form?: string;
  mount?: boolean;
  animation?: 'idle' | 'move' | 'skill';
}

const MODEL_URL = '/models/toy-racers.glb?v=blender-refined-20261021';
const ECONOMY_URL = '/models/toy-racers-economy.glb?v=blender-refined-20261021';
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
  return <LoadingToy color={color} castShadow={castShadow} />;
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

function CharacterModel({ scene, recovery, characterId, lowQuality = false, castShadow = true, rootName, animations, animation = 'idle' }: Pick<ToyCharacterProps, 'characterId' | 'lowQuality' | 'castShadow' | 'animation'> & { scene: Group; recovery: AssetRecovery; rootName?: string; animations: AnimationClip[] }) {
  useEffect(() => { recovery.success(); }, [scene, recovery]);
  const model = useMemo(() => {
    const source = scene.getObjectByName(rootName ?? `toy_${characterId}`) ?? scene.children[0];
    const instance = source!.clone(true) as Group;
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
  }, [scene, characterId, rootName, castShadow, lowQuality]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  useEffect(() => {
    const clip = animations.find(clip => clip.name === animation);
    if (!clip) return;
    const action = mixer.clipAction(clip); action.reset(); action.setLoop(animation === 'skill' ? LoopOnce : LoopRepeat, animation === 'skill' ? 1 : Infinity); action.clampWhenFinished = true; action.play(); mixer.update(0);
    return () => { action.stop(); };
  }, [mixer, animations, animation]);
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); }, [mixer, model]);
  useFrame((_, delta) => { if (animations.length) mixer.update(Math.min(delta, .1)); });
  // Source geometry belongs to useGLTF; satin palette variants to toyResources.
  return <primitive object={model} dispose={null} />;
}

function LoadingToy({ color, castShadow }: { color: string; castShadow: boolean }) {
  return <group name="procedural-racer-fallback">
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
function Sculpture({ characterId, color, lowQuality = false, castShadow = true, url, rootName, animation }: ToyCharacterProps & {url: string; rootName?: string}) {
  const recovery = recoveryFor(url);
  const revision = useSyncExternalStore(recovery.subscribe, recovery.snapshot, recovery.snapshot);
  const fallback = <LoadingToy color={color} castShadow={castShadow && !lowQuality} />;
  return <ModelBoundary key={url} recovery={recovery} revision={revision} fallback={fallback}><Suspense fallback={fallback}><CharacterAsset url={url} rootName={rootName} revision={revision} recovery={recovery} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow && !lowQuality} animation={animation} /></Suspense></ModelBoundary>;
}

export function ToyCharacter({ characterId, color, lowQuality = false, castShadow = true, form, mount, animation }: ToyCharacterProps) {
  const geometry = toyResources.baseGeometry(lowQuality);
  const modelId = characterId === 'bite-mark' && form === 'were-mouth' ? 'bite-mark-were' : characterId;
  const url = secondWind.has(characterId) ? `/models/second-wind/${modelId}.glb?v=second-wind-20261021` : lowQuality ? ECONOMY_URL : MODEL_URL;
  return <group name={`racer-model-${characterId}`}>
    <mesh geometry={geometry.body} material={toyResources.baseMaterial(color, lowQuality)} receiveShadow={!lowQuality} castShadow={castShadow && !lowQuality} dispose={null} />
    <mesh geometry={geometry.cap} material={toyResources.baseMaterial(color, lowQuality, true)} receiveShadow={!lowQuality} dispose={null} />
    {mount && <group position={[0, .164, 0]}><Sculpture characterId="hog-knight-hog" rootName="toy_hog-knight-hog" url="/models/second-wind/hog-knight-hog.glb?v=second-wind-20261021" color={color} lowQuality={lowQuality} castShadow={castShadow} animation={animation} /></group>}
    <group position={[0, .164 + (mount ? .34 : 0), mount ? -.07 : 0]} scale={mount ? .7 : 1}>
      {/* shortcut: Wurstii uses the named procedural pawn until dedicated models are available; never show another card's sculpture. */}
      {wurstii.has(characterId) ? <LoadingToy color={color} castShadow={castShadow && !lowQuality} /> : <Sculpture url={url} rootName={`toy_${modelId}`} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow} animation={animation} />}
    </group>
  </group>;
}
