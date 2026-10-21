import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Subtle grounding survives the economy tier without another render pass. */
export function PawnContact() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 12, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(26,65,52,.26)'); gradient.addColorStop(1, 'rgba(26,65,52,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace; return value;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[.035, .009, -.025]}>
    <planeGeometry args={[.9, .9]} /><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </mesh>;
}

/** Small locally generated studio environment: no HDR download or post-processing passes. */
export function StudioLighting({ compact, lowQuality }: { compact: boolean; lowQuality: boolean }) {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl), studio = new RoomEnvironment();
    const environment = generator.fromScene(studio, .06);
    const previous = scene.environment, previousIntensity = scene.environmentIntensity;
    scene.environment = environment.texture; scene.environmentIntensity = .32;
    studio.dispose(); generator.dispose(); invalidate();
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; environment.dispose(); };
  }, [gl, scene, invalidate]);
  return <>
    <ambientLight intensity={.35} />
    <hemisphereLight args={['#fff7e7', '#80a89a', .8]} />
    <directionalLight color="#fff3de" position={[-9, 18, 10]} intensity={3.15} castShadow={!lowQuality}
      shadow-mapSize={compact ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-21} shadow-camera-right={21}
      shadow-camera-top={21} shadow-camera-bottom={-21} shadow-camera-near={.5} shadow-camera-far={65}
      shadow-normalBias={.018} shadow-bias={-.00012} shadow-radius={2.5} shadow-intensity={.72} />
    <directionalLight color="#d8f1ed" position={[8, 8, -7]} intensity={.55} />
  </>;
}

/** Only sustained animation load can downgrade; idle demand frames are not a frame-rate measurement. */
export function AdaptiveQuality({ lowQuality, onSlow, root }: { lowQuality: boolean; onSlow: () => void; root: React.RefObject<HTMLElement | null> }) {
  const sample = useRef({ frames: 0, slow: 0, elapsed: 0 });
  const { gl } = useThree();
  useFrame((_, delta) => {
    if (root.current) root.current.dataset.quality = lowQuality ? 'economy' : 'studio';
    if (lowQuality) return;
    const s = sample.current;
    if (delta > .2) { s.frames = 0; s.slow = 0; s.elapsed = 0; return; }
    s.frames++; s.elapsed += delta; if (delta > .038) s.slow++;
    if (s.frames >= 90) {
      if (s.slow > 60) {
        if (root.current) { root.current.dataset.adaptiveReason = 'sustained-frame-cost'; root.current.dataset.sampleFrameMs = (s.elapsed * 1000 / s.frames).toFixed(1); }
        onSlow();
      }
      s.frames = 0; s.slow = 0; s.elapsed = 0;
    }
    if (root.current) root.current.dataset.pixelRatio = gl.getPixelRatio().toFixed(2);
  });
  return null;
}
