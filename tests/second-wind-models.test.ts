import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AnimationMixer, Box3, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SECOND_WIND_CHARACTERS } from '../src/shared/second-wind.js';

const folder = new URL('../public/models/second-wind/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder), 'utf8'));
test('Second Wind has exactly 36 individually shipped Blender sculptures and two modular states', async () => {
  assert.equal(manifest.models.length, 36);
  assert.deepEqual(manifest.models.map((m: { id: string }) => m.id).sort(), SECOND_WIND_CHARACTERS.map(c => c.id).sort());
  assert.deepEqual(manifest.variants.map((m: { id: string }) => m.id).sort(), ['bite-mark-were', 'hog-knight-hog']);
  assert.equal(manifest.up, '+Y'); assert.equal(manifest.forward, '+Z');
  assert.match(manifest.generator, /^Blender 5\./);
  assert.ok((await stat(new URL('../assets/blender/second-wind.blend', import.meta.url))).size > 100_000);
  for (const model of [...manifest.models, ...manifest.variants]) {
    assert.ok((await stat(new URL(`../${model.editableSource}`, import.meta.url))).size > 50_000);
  }
});

for (const model of [...manifest.models, ...manifest.variants]) test(`Second Wind ${model.id} decodes with five usable clips and a 3D footprint`, async () => {
  const bytes = await readFile(new URL(`${model.id}.glb`, folder));
  assert.equal(bytes.byteLength, model.bytes);
  assert.ok(bytes.byteLength < 100_000, 'per-racer demand loading budget');
  const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const header = new DataView(binary);
  assert.equal(header.getUint32(0, true), 0x46546c67);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, header.getUint32(12, true))));
  assert.ok(json.buffers.every((b: { uri?: string }) => !b.uri));
  assert.equal(json.images?.length ?? 0, 0, 'all sculpture surfaces are full 3D PBR material');
  const manager = new LoadingManager(); manager.setURLModifier(url => { throw new Error(`Unexpected external dependency ${url}`); });
  const gltf = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(binary, '');
  const root = gltf.scene.getObjectByName(model.node); assert.ok(root);
  const bounds = new Box3().setFromObject(root, true); const size = bounds.getSize(new Vector3());
  assert.ok(Math.abs(bounds.min.y) < .001, 'canonical ground pivot');
  assert.ok(size.y >= .35 && size.y <= .981, 'readable game scale including squat mount');
  assert.ok(size.x <= .601 && size.z <= .601, 'same-space mobile footprint');
  assert.ok(size.z > .11, 'side/back must have complete volume');
  assert.ok(Math.abs(size.x - model.bounds[0]) < .001);
  assert.ok(Math.abs(size.y - model.bounds[1]) < .001);
  assert.ok(Math.abs(size.z - model.bounds[2]) < .001);
  let tris = 0; let draws = 0;
  root.traverse(obj => { if (obj instanceof Mesh) {
    draws++; tris += (obj.geometry.index?.count ?? obj.geometry.attributes.position.count) / 3;
    const mat = obj.material as MeshStandardMaterial;
    assert.ok(mat.isMeshStandardMaterial); assert.equal(mat.map, null); assert.ok(mat.roughness >= .4);
  } });
  assert.equal(tris, model.triangles); assert.ok(tris <= 8_000); assert.equal(draws, model.draws); assert.ok(draws <= 9);
  assert.deepEqual(gltf.animations.map(c => c.name).sort(), ['fall','idle','move','recover','skill']);
  for (const clip of gltf.animations) {
    assert.ok(clip.duration > 0); const mixer = new AnimationMixer(gltf.scene); const action = mixer.clipAction(clip); action.play();
    for (let i = 0; i <= 8; i++) {
      mixer.setTime(clip.duration * i / 8); root.updateWorldMatrix(true, true);
      assert.ok(root.position.toArray().every(Number.isFinite));
      assert.ok(root.scale.toArray().every(n => n > 0 && Number.isFinite(n)));
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  }
  assert.ok(model.referenceChecked); assert.ok(model.recognition.length > 30); assert.ok(model.inferred.length > 30);
});

test('all 36 lobby previews are compact local PNGs without source-card redistribution', async () => {
  for (const model of manifest.models) {
    const png = await readFile(new URL(`avatars/${model.id}.png`, folder));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 192); assert.equal(png.readUInt32BE(20), 192);
    assert.ok(png.length < 75_000);
  }
});

test('Blender closed-volume audit describes the exact 38 editable sources and shipping GLBs', async () => {
  const audit = JSON.parse(await readFile(new URL('../docs/evidence/second-wind/source-audit.json', import.meta.url), 'utf8'));
  assert.equal(audit.passed, true); assert.equal(audit.sources.length, 38);
  for (const source of audit.sources) {
    assert.equal(source.boundaryEdges, 0); assert.equal(source.looseEdges, 0); assert.ok(source.editableParts >= 5);
    assert.equal(createHash('sha256').update(await readFile(new URL(`../${source.source}`, import.meta.url))).digest('hex'), source.sourceSha256);
    assert.equal(createHash('sha256').update(await readFile(new URL(`${source.id}.glb`, folder))).digest('hex'), source.glbSha256);
  }
});
