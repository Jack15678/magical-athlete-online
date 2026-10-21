import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Racer } from '../../shared/types.js';
import { cameraFocusPoints, cameraFrame, cameraView, MAX_CAMERA_ZOOM, type CameraFocus } from './camera.js';

interface Props {
  compact: boolean;
  reset: number;
  focus: CameraFocus;
  racers: Racer[];
  reducedMotion: boolean;
  onManual: () => void;
  root: RefObject<HTMLElement | null>;
}

/** Demand-rendered follow camera. Manual pan/zoom remains untouched until reset. */
export function CameraRig({ compact, reset, focus, racers, reducedMotion, onManual, root }: Props) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const userDrag = useRef(false);
  const target = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const desiredOffset = useMemo(() => new THREE.Vector3(), []);
  const points = cameraFocusPoints(focus, racers, compact);
  const closeUp = focus.state === 'intro' && focus.ids.length === 1;
  const view = useMemo(() => cameraView(compact, closeUp), [compact, closeUp]);
  const frame = cameraFrame(focus.positions, compact, size.width, size.height, focus.state === 'overview', points, closeUp);
  useEffect(() => {
    const first = cameraFrame(focus.positions, compact, size.width, size.height, focus.state === 'overview', points, closeUp);
    camera.position.set(first.x + view.offset[0], view.offset[1], first.z + view.offset[2]);
    camera.up.set(0, 1, 0); camera.lookAt(first.x, 0, first.z);
    if (camera instanceof THREE.OrthographicCamera) { camera.zoom = first.zoom; camera.updateProjectionMatrix(); }
    controls.current?.target.set(first.x, 0, first.z); controls.current?.update();
    userDrag.current = false; invalidate();
  }, [camera, compact]);
  useEffect(() => { userDrag.current = false; invalidate(); }, [reset]);
  useEffect(() => { if (focus.state === 'choice') userDrag.current = false; invalidate(); }, [focus.state, focus.ids.join(','), frame.x, frame.z, frame.zoom]);
  useFrame((_, delta) => {
    if (!controls.current || !(camera instanceof THREE.OrthographicCamera)) return;
    if (!userDrag.current && focus.state !== 'manual') {
      target.set(frame.x, 0, frame.z);
      desiredOffset.set(...view.offset); offset.subVectors(camera.position, controls.current.target);
      const amount = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, .05) * 4.8);
      const moving = controls.current.target.distanceTo(target) > .003 || Math.abs(camera.zoom - frame.zoom) > .003 || offset.distanceTo(desiredOffset) > .003;
      if (moving) {
        controls.current.target.lerp(target, amount); offset.lerp(desiredOffset, amount);
        camera.position.copy(controls.current.target).add(offset);
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, frame.zoom, amount);
        camera.updateProjectionMatrix(); controls.current.update(); invalidate();
      }
    }
    if (root.current) {
      root.current.dataset.cameraX = controls.current.target.x.toFixed(2);
      root.current.dataset.cameraZ = controls.current.target.z.toFixed(2);
      root.current.dataset.cameraTarget = `${controls.current.target.x.toFixed(2)},${controls.current.target.z.toFixed(2)}`;
      root.current.dataset.cameraZoom = camera.zoom.toFixed(2);
      root.current.dataset.cameraPolar = controls.current.getPolarAngle().toFixed(4);
      root.current.dataset.cameraAzimuth = controls.current.getAzimuthalAngle().toFixed(4);
    }
  });
  return <OrbitControls ref={controls} makeDefault enablePan enableRotate={false} screenSpacePanning={false} enableDamping dampingFactor={.12} minZoom={3} maxZoom={MAX_CAMERA_ZOOM} mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }} onStart={() => { userDrag.current = true; onManual(); }} onChange={() => invalidate()} />;
}
