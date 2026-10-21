import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh, type Group } from 'three';

export interface ToyCharacterProps {
  characterId: string;
  color: string;
  lowQuality?: boolean;
  castShadow?: boolean;
}

const MODEL_URL = '/models/toy-racers.glb';

function CharacterModel({ characterId, castShadow = true }: Pick<ToyCharacterProps, 'characterId' | 'castShadow'>) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const source = scene.getObjectByName(`toy_${characterId}`) ?? scene.getObjectByName('toy_hare');
    const instance = source!.clone(true) as Group;
    instance.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = castShadow;
        object.receiveShadow = false;
        object.frustumCulled = true;
      }
    });
    return instance;
  }, [scene, characterId, castShadow]);
  // Geometry and palette materials belong to the loader cache, shared by every racer.
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
  return <group name={`racer-model-${characterId}`}>
    <mesh position={[0, 0.035, 0]} receiveShadow castShadow={castShadow}>
      <cylinderGeometry args={[0.29, 0.3, 0.07, lowQuality ? 12 : 24]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.04} />
    </mesh>
    <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.25, 0.017, 5, lowQuality ? 12 : 24]} />
      <meshStandardMaterial color="#fffaf0" roughness={0.5} />
    </mesh>
    <group position={[0, 0.085, 0]}>
      <Suspense fallback={<LoadingToy color={color} />}>
        <CharacterModel characterId={characterId} castShadow={castShadow && !lowQuality} />
      </Suspense>
    </group>
  </group>;
}
