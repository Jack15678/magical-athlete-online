import { Component, Suspense, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial, type Group } from 'three';
import { toyResources } from './pawn-materials.js';
import { AssetRecovery } from './asset-recovery.js';

export interface ToyCharacterProps {
  characterId: string;
  color: string;
  lowQuality?: boolean;
  castShadow?: boolean;
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

function CharacterAsset({ revision, recovery, color, ...props }: ToyCharacterProps & { revision: number; recovery: AssetRecovery }) {
  let scene: Group;
  try {
    // In this pinned drei/fiber version useGLTF is a synchronous suspense-cache
    // accessor. Keep pending promises in Suspense, but handle rejected network
    // reads before fiber's onCaughtError reports them as window errors.
    scene = useGLTF(props.lowQuality ? ECONOMY_URL : MODEL_URL).scene;
  } catch (error) {
    if (error && typeof (error as { then?: unknown }).then === 'function') throw error;
    return <FailedToy color={color} castShadow={!!props.castShadow && !props.lowQuality} revision={revision} recovery={recovery} />;
  }
  return <CharacterModel scene={scene} recovery={recovery} {...props} />;
}

function CharacterModel({ scene, recovery, characterId, lowQuality = false, castShadow = true }: Pick<ToyCharacterProps, 'characterId' | 'lowQuality' | 'castShadow'> & { scene: Group; recovery: AssetRecovery }) {
  useEffect(() => { recovery.success(); }, [scene, recovery]);
  const model = useMemo(() => {
    const source = scene.getObjectByName(`toy_${characterId}`) ?? scene.getObjectByName('toy_hare');
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
  }, [scene, characterId, castShadow, lowQuality]);
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
export function ToyCharacter({ characterId, color, lowQuality = false, castShadow = true }: ToyCharacterProps) {
  const recovery = lowQuality ? economyRecovery : modelRecovery;
  const revision = useSyncExternalStore(recovery.subscribe, recovery.snapshot, recovery.snapshot);
  const geometry = toyResources.baseGeometry(lowQuality);
  const fallback = <LoadingToy color={color} castShadow={castShadow && !lowQuality} />;
  return <group name={`racer-model-${characterId}`}>
    <mesh geometry={geometry.body} material={toyResources.baseMaterial(color, lowQuality)} receiveShadow={!lowQuality} castShadow={castShadow && !lowQuality} dispose={null} />
    <mesh geometry={geometry.cap} material={toyResources.baseMaterial(color, lowQuality, true)} receiveShadow={!lowQuality} dispose={null} />
    <group position={[0, .164, 0]}>
      <ModelBoundary key={lowQuality ? ECONOMY_URL : MODEL_URL} recovery={recovery} revision={revision} fallback={fallback}>
        <Suspense fallback={fallback}>
          <CharacterAsset revision={revision} recovery={recovery} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow && !lowQuality} />
        </Suspense>
      </ModelBoundary>
    </group>
  </group>;
}
