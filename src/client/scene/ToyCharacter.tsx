import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial, type Group } from 'three';
import { toyResources } from './pawn-materials.js';

export interface ToyCharacterProps {
  characterId: string;
  color: string;
  lowQuality?: boolean;
  castShadow?: boolean;
}

const MODEL_URL = '/models/toy-racers.glb';

function CharacterModel({ characterId, lowQuality = false, castShadow = true }: Pick<ToyCharacterProps, 'characterId' | 'lowQuality' | 'castShadow'>) {
  const { scene } = useGLTF(MODEL_URL);
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

function LoadingToy({ color }: { color: string }) {
  return <group>
    <mesh position={[0, 0.38, 0]} castShadow>
      <capsuleGeometry args={[0.18, 0.3, 3, 8]} />
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
    <mesh position={[0, 0.7, 0]} castShadow>
      <sphereGeometry args={[0.2, 12, 8]} />
      <meshStandardMaterial color="#fff6d6" roughness={0.45} />
    </mesh>
  </group>;
}

/** Original toy sculptures: +Y up, +Z face, ground pivot at zero. */
export function ToyCharacter({ characterId, color, lowQuality = false, castShadow = true }: ToyCharacterProps) {
  const geometry = toyResources.baseGeometry(lowQuality);
  return <group name={`racer-model-${characterId}`}>
    <mesh geometry={geometry.body} material={toyResources.baseMaterial(color, lowQuality)} receiveShadow={!lowQuality} castShadow={castShadow && !lowQuality} dispose={null} />
    <mesh geometry={geometry.cap} material={toyResources.baseMaterial(color, lowQuality, true)} receiveShadow={!lowQuality} dispose={null} />
    <group position={[0, .164, 0]}>
      <Suspense fallback={<LoadingToy color={color} />}>
        <CharacterModel characterId={characterId} lowQuality={lowQuality} castShadow={castShadow && !lowQuality} />
      </Suspense>
    </group>
  </group>;
}
