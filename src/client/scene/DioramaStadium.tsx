import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Racer, RoomView } from '../../shared/types.js';
import { TRACKS } from '../../shared/tracks.js';
import type { PresentationBeat } from '../presentation.js';
import { BOARD_CENTER_SPAN, boardPoint, TILE } from './math.js';
import { specialTileTexture } from './tile-art.js';

const C = { mint: '#84c6b1', darkMint: '#438674', cream: '#f3e3c4', coral: '#ee785e', ink: '#285e55', wood: '#cda77b', gold: '#edbc55' };
const WIDTH = BOARD_CENTER_SPAN.width + TILE * 1.95;
const DEPTH = BOARD_CENTER_SPAN.depth + TILE * 2.05;
const START_EXTENSION = TILE * 3;

/** A shared, tiny roughness stamp gives the toy surfaces a soft handmade finish
 * without geometry, external images, extra materials or post-processing. */
function mouldGrain() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!, pixels = context.createImageData(64, 64);
  let seed = 73;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const value = 190 + ((seed >>> 24) % 35);
    pixels.data.set([value, value, value, 255], index);
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 4);
  return texture;
}

function lawnTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d')!,pixels=context.createImageData(256,256);let seed=419;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    seed=(Math.imul(seed,1664525)+1013904223)|0;
    const variation=((seed>>>24)%9)-4, stripe=Math.floor(x/32)%2?6:-4;
    pixels.data.set([124+variation+stripe,165+variation+stripe,76+variation,255],(y*256+x)*4);
  }
  context.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,1);texture.anisotropy=4;return texture;
}

function baseContactTexture() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const context=canvas.getContext('2d')!;
  context.filter='blur(9px)';context.fillStyle='rgba(62,52,32,.28)';context.beginPath();context.roundRect(12,12,232,104,16);context.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** One continuous U-shaped mint curb under the 31 unchanged logical segments. */
function courseGeometry() {
  const shape=new THREE.Shape();
  shape.moveTo(-16.55,-4.56);shape.lineTo(-8.08,-4.56);shape.lineTo(-8.08,-4.4);shape.lineTo(15.75,-4.4);shape.quadraticCurveTo(16.65,-4.4,16.65,-3.5);
  shape.lineTo(16.65,3.5);shape.quadraticCurveTo(16.65,4.4,15.75,4.4);shape.lineTo(-16.55,4.4);
  shape.quadraticCurveTo(-16.7,4.4,-16.7,4.25);shape.lineTo(-16.7,1.91);shape.lineTo(13.94,1.91);
  shape.quadraticCurveTo(14.15,1.91,14.15,1.7);shape.lineTo(14.15,-1.7);shape.quadraticCurveTo(14.15,-1.91,13.94,-1.91);
  shape.lineTo(-8.08,-1.91);shape.lineTo(-8.08,-1.6);shape.lineTo(-16.7,-1.6);shape.lineTo(-16.7,-4.41);shape.quadraticCurveTo(-16.7,-4.56,-16.55,-4.56);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,steps:1,curveSegments:6});
  geometry.rotateX(Math.PI/2);geometry.computeVertexNormals();return geometry;
}

function useKit() {
  const kit = useMemo(() => {
    const grain=mouldGrain(),lawn=lawnTexture();
    return {
    grain,lawn,baseContact:baseContactTexture(),course:courseGeometry(),
    tile: new RoundedBoxGeometry(1.99, .115, 1.99, 2, .035),
    top: new RoundedBoxGeometry(2.025, .045, 2.025, 3, .02),
    start: new RoundedBoxGeometry(1.99 + START_EXTENSION, .115, 2.65, 2, .035),
    startTop: new RoundedBoxGeometry(2.025 + START_EXTENSION, .045, 2.63, 3, .02),
    box: new RoundedBoxGeometry(1, 1, 1, 2, .1),
    plinth: new RoundedBoxGeometry(WIDTH+.2, .6, DEPTH+.2, 5, .29),
    band: new RoundedBoxGeometry(WIDTH + .23, .11, DEPTH + .23, 4, .05),
    deck: new RoundedBoxGeometry(WIDTH, .3, DEPTH, 5, .145),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 24),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    plastic: new THREE.MeshStandardMaterial({ color: C.cream, roughness: .65, bumpMap:grain,bumpScale:.009, metalness: 0 }),
    mint: new THREE.MeshStandardMaterial({ color: C.mint, roughness: .72 }),
    dark: new THREE.MeshStandardMaterial({ color: C.darkMint, roughness: .66 }),
    coral: new THREE.MeshStandardMaterial({ color: C.coral, roughness: .48 }),
    wood: new THREE.MeshStandardMaterial({ color: '#f7e7c9', roughness: .56, bumpMap:grain,bumpScale:.007 }),
    turf: new THREE.MeshStandardMaterial({ color: '#fffdf0',map:lawn,roughness: .96,bumpMap:grain,bumpScale:.02 }),
    turfShade: new THREE.MeshStandardMaterial({ color: '#e3eabf',map:lawn,roughness:.98,bumpMap:grain,bumpScale:.026 }),
    gold: new THREE.MeshPhysicalMaterial({ color: '#f6be43', roughness: .22, metalness: .72,clearcoat:.22 }),
    ink: new THREE.MeshStandardMaterial({ color: C.ink, roughness: .65 }),
  };}, []);
  useEffect(() => () => Object.values(kit).forEach(resource => resource.dispose()), [kit]);
  return kit;
}
type Kit = ReturnType<typeof useKit>;
type BoxProps = { kit: Kit; position: [number, number, number]; scale: [number, number, number]; material?: THREE.Material; shadow?: boolean; receiveShadow?:boolean };
function Box({ kit, position, scale, material = kit.plastic, shadow = true, receiveShadow = true }: BoxProps) {
  return <mesh geometry={kit.box} material={material} position={position} scale={scale} castShadow={shadow} receiveShadow={receiveShadow} dispose={null} />;
}
function Cylinder({ kit, position, scale, material = kit.plastic }: Omit<BoxProps, 'shadow'>) {
  return <mesh geometry={kit.cylinder} material={material} position={position} scale={scale} castShadow receiveShadow dispose={null} />;
}

function printTexture(index: number) {
  const canvas = document.createElement('canvas'); canvas.width = index === 0 ? 1024 : 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const endpoint = index === 0 || index === 30;
  ctx.fillStyle = endpoint ? C.cream : C.ink;
  ctx.font = '900 40px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  // One number per segment, always in the same corner. Gate lettering carries
  // START/FINISH, leaving the small finish segment clear for its number.
  ctx.fillText(String(index).padStart(2, '0'), index === 0 ? 954 : 19, 34);
  if (endpoint) {
    if (index === 0) { ctx.textAlign = 'center'; ctx.font = '900 30px sans-serif'; ctx.fillText('集结区', 470, 39); }
    for (let i = 0; i < (index === 0 ? 48 : 10); i++) { ctx.fillStyle = i % 2 ? C.cream : C.ink; ctx.fillRect(22 + i * 20, 222, 20, 12); }
    if (index === 0) {
      ctx.strokeStyle = C.cream; ctx.lineWidth = 3; ctx.globalAlpha = .25; ctx.setLineDash([18, 13]);
      ctx.beginPath(); ctx.moveTo(60, 132); ctx.lineTo(930, 132); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** Reused geometry, shallow moulded caps and printed ink; the route remains the engine's route. */
export function DioramaTile({ index, track, triggered, kit }: { index: number; track: RoomView['track']; triggered: boolean; kit: Kit }) {
  const special = TRACKS[track].specials[index];
  const point = boardPoint(index, false);
  const next = boardPoint(index + Math.sign(special?.move ?? 1), false);
  const angle = Math.atan2(-(next[0] - point[0]), -(next[2] - point[2]));
  const texture = useMemo(() => special ? specialTileTexture(special.kind, special.move, index, angle) : printTexture(index), [index, special?.kind, special?.move, angle]);
  useEffect(() => () => texture.dispose(), [texture]);
  const color = index === 0 ? C.darkMint : index === 30 ? C.coral : special?.kind === 'star' ? '#f1c552' : special?.kind === 'trip' ? C.coral : special?.kind === 'arrow' ? (special.move ?? 0) < 0 ? '#b69bd1' : '#74c7af' : '#efd29c';
  const top = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: .76, roughnessMap: kit.grain,bumpMap:kit.grain,bumpScale:.012, emissive: color }), [color, kit.grain]);
  useEffect(() => () => top.dispose(), [top]);
  useFrame(({ clock }) => { top.emissiveIntensity = triggered ? .16 + Math.sin(clock.elapsedTime * 8) * .09 : 0; });
  const extended = index === 0, center = extended ? -START_EXTENSION / 2 : 0;
  return <group position={point}>
    <mesh geometry={extended ? kit.startTop : kit.top} material={top} position={[center, -.0225, 0]} receiveShadow dispose={null} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, .012, 0]}>
      <planeGeometry args={[extended ? 1.91 + START_EXTENSION : 1.91, extended ? 2.57 : 1.91]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
    </mesh>
    {special && <mesh geometry={kit.box} material={special.kind === 'trip' ? kit.coral : special.kind === 'star' ? kit.gold : (special.move ?? 0) < 0 ? kit.ink : kit.mint} position={[.79, .025, 0]} scale={[.065, .045, .7]} dispose={null} />}
  </group>;
}

function Sign({ text, position, width, kit, coral = false }: { text: string; position: [number, number, number]; width: number; kit: Kit; coral?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width / .4 * 128); canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = C.cream; ctx.font = '900 66px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 66);
    const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace; return value;
  }, [text, width]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position}>
    <Box kit={kit} position={[0, 0, 0]} scale={[width, .48, .18]} material={coral ? kit.coral : kit.ink} />
    <mesh position={[0, 0, .096]}><planeGeometry args={[width * .9, .4]} /><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

/** Gates sit outside the numbered square; the opening clears the maximum crowd. */
function Gate({ finish, kit }: { finish?: boolean; kit: Kit }) {
  const point = boardPoint(finish ? 30 : 0, false);
  const halfSpan = finish ? 1.14 : 3.55;
  const width=finish?2.55:7.35;
  const checker=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const context=canvas.getContext('2d')!;
    const columns=finish?12:32;
    for(let row=0;row<2;row++)for(let column=0;column<columns;column++){
      context.fillStyle=(row+column)%2?C.cream:C.ink;context.fillRect(column*512/columns,row*32,512/columns+1,32);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[finish]);
  useEffect(()=>()=>checker.dispose(),[checker]);
  return <group position={[point[0] - (finish ? 0 : START_EXTENSION / 2), -.12, point[2] - 1.52]}>
    {[-halfSpan, halfSpan].map(side => <group key={side}>
      <Box kit={kit} position={[side, .17, 0]} scale={[.62, .24, .68]} material={kit.plastic} />
      <Box kit={kit} position={[side, .32, 0]} scale={[.46, .09, .51]} material={kit.plastic} />
      <Cylinder kit={kit} position={[side, 1.25, 0]} scale={[.12, 1.93, .12]} material={finish ? kit.coral : kit.mint} />
      <Cylinder kit={kit} position={[side, 2.18, 0]} scale={[.135, .31, .135]} material={finish?kit.coral:kit.dark} />
      <mesh geometry={kit.sphere} position={[side,2.43,0]} scale={.19} material={kit.gold} castShadow dispose={null}/>
    </group>)}
    <Sign text={finish ? 'FINISH' : '胡闹运动会 · START'} position={[0, 2.17, 0]} width={width} kit={kit} coral={finish} />
    <Box kit={kit} position={[0,1.91,0]} scale={[width,.25,.18]} material={finish?kit.coral:kit.dark}/>
    <mesh position={[0,1.91,.098]}><planeGeometry args={[width*.91,.22]}/><meshStandardMaterial map={checker} roughness={.68}/></mesh>
  </group>;
}

function Podium({ kit }: { kit: Kit }) {
  return <group position={[-7.7, .15, 0]}>
    {[{ x: -.77, h: .42, n: '2' }, { x: 0, h: .7, n: '1' }, { x: .77, h: .3, n: '3' }].map(({ x, h, n }) => <group key={n}>
      <Box kit={kit} position={[x, h / 2, 0]} scale={[.72, h, 1.12]} material={n === '1' ? kit.coral : kit.plastic} />
      <Sign text={n} position={[x, h / 2, .49]} width={.37} kit={kit} />
    </group>)}
    <group position={[0, .73, 0]}>
      <Cylinder kit={kit} position={[0, .06, 0]} scale={[.29, .12, .25]} material={kit.ink} />
      <Cylinder kit={kit} position={[0, .28, 0]} scale={[.07, .4, .07]} material={kit.gold} />
      <mesh position={[0, .54, 0]} castShadow><cylinderGeometry args={[.29, .12, .39, 16]} /><meshStandardMaterial color={C.gold} roughness={.3} metalness={.45} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .28, .57, 0]}><torusGeometry args={[.14, .035, 5, 12]} /><meshStandardMaterial color={C.gold} roughness={.3} metalness={.45} /></mesh>)}
    </group>
  </group>;
}

function Bleachers({ kit, lowQuality }: { kit: Kit; lowQuality: boolean }) {
  return <group position={[2.4, .15, -.05]}>
    <Box kit={kit} position={[0, .12, 0]} scale={[5.5, .24, 1.5]} material={kit.dark} />
    <Box kit={kit} position={[0, .33, -.3]} scale={[5.1, .24, .86]} material={kit.plastic} />
    <Box kit={kit} position={[0, .55, -.59]} scale={[5.1, .24, .3]} material={kit.mint} />
    {Array.from({ length: lowQuality ? 5 : 9 }, (_, i) => <group key={i} position={[(i - (lowQuality ? 2 : 4)) * (lowQuality ? .94 : .52), .49, i % 2 ? -.48 : .28]}>
      <mesh geometry={kit.sphere} material={i % 3 === 0 ? kit.coral : i % 3 === 1 ? kit.gold : kit.mint} scale={[.15, .22, .15]} position={[0, .13, 0]} dispose={null} />
      <mesh geometry={kit.sphere} material={kit.plastic} scale={.13} position={[0, .43, 0]} dispose={null} />
    </group>)}
    <Sign text="胡闹运动会" position={[0, 1.27, -.62]} width={3.1} kit={kit} />
    {[-2, 2].map(x => <Cylinder key={x} kit={kit} position={[x, .77, -.62]} scale={[.035, 1.5, .035]} />)}
  </group>;
}

function CourseDetails({ kit, lowQuality }: { kit: Kit; lowQuality: boolean }) {
  return <group>
    <Podium kit={kit} /><Bleachers kit={kit} lowQuality={lowQuality} />
    {/* Discrete verge markings guide the two bends without occupying cells. */}
    {[12, 15].map(index => { const p = boardPoint(index, false); return <group key={index} position={[p[0] + 1.39, .15, p[2]]}>
      <Box kit={kit} position={[0, .09, 0]} scale={[.25, .18, 1.85]} material={kit.plastic} />
      {[-.55, 0, .55].map(z => <Box key={z} kit={kit} position={[0, .18, z]} scale={[.26, .04, .24]} material={kit.coral} shadow={false} />)}
    </group>; })}
    {[-1, 1].flatMap(side => [-12.2, -3.2, 6.3, 12.2].map((x, index) => <group key={`${side}-${index}`} position={[x, .15, side * (DEPTH / 2 - .38)]}>
      <Cylinder kit={kit} position={[0, .37, 0]} scale={[.055, .74, .055]} />
      <Box kit={kit} position={[.22, .6, 0]} scale={[.45, .27, .055]} material={index % 2 ? kit.coral : kit.mint} shadow={false} />
    </group>))}
    {[-1, 1].map(side => <Box key={side} kit={kit} position={[0, .2, side * (DEPTH / 2 - .17)]} scale={[WIDTH - 1, .1, .1]} material={kit.plastic} shadow={false} receiveShadow={false} />)}
    {!lowQuality && [-12.8, 10.5].flatMap(x => [-.4, .4].map(z => <group key={`${x}-${z}`} position={[x, .15, z]}>
      <Cylinder kit={kit} position={[0, .06, 0]} scale={[.25, .12, .25]} material={kit.plastic} />
      <mesh position={[0, .3, 0]} castShadow><coneGeometry args={[.17, .48, 12]} /><meshStandardMaterial color={C.coral} roughness={.6} /></mesh>
    </group>))}
  </group>;
}

/** Bounded instancing adds a few leafy masses and tufts, never a grass carpet. */
function LawnDetails({lowQuality,kit}:{lowQuality:boolean;kit:Kit}) {
  const bushes=useRef<THREE.InstancedMesh>(null),grass=useRef<THREE.InstancedMesh>(null);
  const points=useMemo(()=>{
    const result:[number,number,number][]=[];
    for(const z of [-1.35,1.35]) for(const x of [-13.3,-11.3,-8.9,-5.8,-3.2,.5,4.6,7.8,10.6,12.7]) result.push([x,.15,z]);
    for(const z of [-4.65,4.65]) for(const x of [-14.6,-10.7,-5.9,-1.9,3.7,8.8,13.7])result.push([x,.15,z]);
    return result;
  },[]);
  useEffect(()=>{
    if(lowQuality||!bushes.current||!grass.current)return;
    const object=new THREE.Object3D(),color=new THREE.Color();let n=0;
    for(let i=0;i<points.length;i++)for(let lobe=0;lobe<5;lobe++){
      const p=points[i]!,r=Math.abs(p[2])>4?.16:.17+(i%4)*.023,angle=lobe*Math.PI/2+i*.7,side=lobe===0?0:r*.55,scale=lobe===0?r:r*.7;
      object.position.set(p[0]+Math.cos(angle)*side,p[1]+scale*.78+(lobe===0?r*.25:0),p[2]+Math.sin(angle)*side);
      object.scale.set(scale*.93,scale*(.83+(i%3)*.08),scale*.9);object.rotation.set(i*.17,lobe*.8,0);object.updateMatrix();bushes.current.setMatrixAt(n,object.matrix);
      color.set(lobe===0?'#789b4c':lobe%2?'#567b38':'#88a64f');bushes.current.setColorAt(n++,color);
    }
    bushes.current.instanceMatrix.needsUpdate=true;if(bushes.current.instanceColor)bushes.current.instanceColor.needsUpdate=true;
    for(let i=0;i<points.length*3;i++){
      const p=points[Math.floor(i/3)]!,side=i%3-1;
      object.position.set(p[0]+.35+side*.045,p[1]+.055,p[2]+.16+Math.sin(i)*.08);object.scale.set(.025,.13+(i%3)*.025,.025);object.rotation.set(side*.23,0,side*.3);object.updateMatrix();grass.current.setMatrixAt(i,object.matrix);
    }
    grass.current.instanceMatrix.needsUpdate=true;
  },[points,lowQuality]);
  if(lowQuality)return null;
  return <group>
    <instancedMesh ref={bushes} args={[undefined,undefined,points.length*5]} castShadow receiveShadow frustumCulled={false}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial roughness={.97} color="#d2dea5" bumpMap={kit.grain} bumpScale={.018}/></instancedMesh>
    <instancedMesh ref={grass} args={[undefined,undefined,points.length*3]} receiveShadow frustumCulled={false}><coneGeometry args={[1,1,3,1]}/><meshStandardMaterial roughness={1} color="#819c47"/></instancedMesh>
  </group>;
}

export function DioramaStadium({ compact, track, lowQuality, beat, racers }: { compact: boolean; track: RoomView['track']; lowQuality: boolean; beat?: PresentationBeat; racers: Racer[] }) {
  const kit = useKit();
  const triggered = new Set(beat?.motions.map(motion => motion.to) ?? []);
  if (beat && ['score', 'trip'].includes(beat.kind)) for (const racer of racers) if (beat.targets.includes(racer.id) || beat.source === racer.id) triggered.add(racer.position);
  return <group rotation={[0, compact ? -Math.PI / 2 : 0, 0]}>
    <mesh rotation={[-Math.PI/2,0,0]} position={[.12,-.923,0]}><planeGeometry args={[WIDTH*1.07,DEPTH*1.21]}/><meshBasicMaterial map={kit.baseContact} transparent depthWrite={false} toneMapped={false}/></mesh>
    <mesh geometry={kit.plinth} position={[0, -.62, 0]} material={kit.wood} castShadow receiveShadow dispose={null} />
    <mesh geometry={kit.band} position={[0, -.265, 0]} material={kit.dark} castShadow receiveShadow dispose={null} />
    <mesh geometry={kit.deck} position={[0, -.07, 0]} material={kit.plastic} receiveShadow dispose={null} />
    <Box kit={kit} position={[0, .11, 0]} scale={[WIDTH - .55, .08, DEPTH-.55]} material={kit.turf} shadow={false} />
    <Box kit={kit} position={[-7.7,.154,0]} scale={[3.25,.022,1.87]} material={kit.turfShade} shadow={false}/>
    <Box kit={kit} position={[2.4,.154,-.05]} scale={[6.15,.022,2.08]} material={kit.turfShade} shadow={false}/>
    <mesh geometry={kit.course} material={kit.dark} position={[0,.19,0]} receiveShadow castShadow dispose={null}/>
    <LawnDetails lowQuality={lowQuality} kit={kit}/>
    {Array.from({ length: 31 }, (_, index) => <DioramaTile key={index} {...{ index, track, kit }} triggered={triggered.has(index)} />)}
    <Gate kit={kit} /><Gate finish kit={kit} /><CourseDetails kit={kit} lowQuality={lowQuality} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.925, 0]} receiveShadow><planeGeometry args={[240, 240]} /><meshStandardMaterial color="#e3dcca" roughness={1} /></mesh>
  </group>;
}
