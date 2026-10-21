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

const MODEL_URL = '/models/toy-racers.glb';
const modelRecovery = new AssetRecovery({
  clearCache: () => useGLTF.clear(MODEL_URL),
  isOnline: () => navigator.onLine,
  watchOnline: listener => {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
});

/** Network failures affect only the sculpture, never the board or its controls. */
class ModelBoundary extends Component<{ revision: number; fallback: ReactNode; children: ReactNode }, { revision: number; failed: boolean }> {
  state = { revision: this.props.revision, failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { revision: number }, state: { revision: number }) {
    return props.revision === state.revision ? null : { revision: props.revision, failed: false };
  }
  componentDidCatch() { modelRecovery.failure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FailedToy({ color, castShadow, revision }: { color: string; castShadow: boolean; revision: number }) {
  useEffect(() => { modelRecovery.failure(); }, [revision]);
  return <LoadingToy color={color} castShadow={castShadow} />;
}

function CharacterAsset({ revision, color, ...props }: ToyCharacterProps & { revision: number }) {
  let scene: Group;
  try {
    // In this pinned drei/fiber version useGLTF is a synchronous suspense-cache
    // accessor. Keep pending promises in Suspense, but handle rejected network
    // reads before fiber's onCaughtError reports them as window errors.
    scene = useGLTF(MODEL_URL).scene;
  } catch (error) {
    if (error && typeof (error as { then?: unknown }).then === 'function') throw error;
    return <FailedToy color={color} castShadow={!!props.castShadow && !props.lowQuality} revision={revision} />;
  }
  return <CharacterModel scene={scene} {...props} />;
}

function CharacterModel({ scene, characterId, lowQuality = false, castShadow = true }: Pick<ToyCharacterProps, 'characterId' | 'lowQuality' | 'castShadow'> & { scene: Group }) {
  useEffect(() => { modelRecovery.success(); }, [scene]);
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
  const revision = useSyncExternalStore(modelRecovery.subscribe, modelRecovery.snapshot, modelRecovery.snapshot);
  const geometry = toyResources.baseGeometry(lowQuality);
  const fallback = <LoadingToy color={color} castShadow={castShadow && !lowQuality} />;
  return <group name={`racer-model-${characterId}`}>
    <mesh geometry={geometry.body} material={toyResources.baseMaterial(color, lowQuality)} receiveShadow={!lowQuality} castShadow={castShadow && !lowQuality} dispose={null} />
    <mesh geometry={geometry.cap} material={toyResources.baseMaterial(color, lowQuality, true)} receiveShadow={!lowQuality} dispose={null} />
    <group position={[0, .164, 0]}>
      <ModelBoundary revision={revision} fallback={fallback}>
        <Suspense fallback={fallback}>
          <CharacterAsset revision={revision} characterId={characterId} color={color} lowQuality={lowQuality} castShadow={castShadow && !lowQuality} />
        </Suspense>
      </ModelBoundary>
    </group>
  </group>;
}
