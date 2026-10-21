import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CHARACTER_IDS } from '../src/shared/characters.js';

for (const variant of [
  { name: 'toy-racers', bytes: 2 * 1024 * 1024, triangles: 220_000, modelTriangles: 10_000 },
  { name: 'toy-racers-economy', bytes: 1024 * 1024, triangles: 80_000, modelTriangles: 4_000 },
]) test(`shipping ${variant.name} GLB decodes every racer within geometry and ground-pivot budgets`, async () => {
  const asset = new URL(`../public/models/${variant.name}.glb`, import.meta.url);
  const bytes = await readFile(asset);
  const manifest = JSON.parse(await readFile(new URL(`../public/models/${variant.name}.manifest.json`, import.meta.url), 'utf8'));
  assert.equal(manifest.models.length, CHARACTER_IDS.length);
  assert.deepEqual(manifest.models.map((model: { id: string }) => model.id).sort(), [...CHARACTER_IDS].sort());
  assert.equal(bytes.byteLength, manifest.optimizedBytes, 'manifest must describe the actual shipped compressed asset');
  assert.ok(bytes.byteLength < variant.bytes, 'all 36 refined models must fit the download budget for this quality');
  assert.match(manifest.generator, /^Blender 5\./, 'shipping models must come from the real Blender refinement pipeline');

  const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const header = new DataView(binary);
  assert.equal(header.getUint32(0, true), 0x46546c67, 'GLB signature');
  assert.equal(header.getUint32(4, true), 2, 'glTF 2.0');
  assert.equal(header.getUint32(16, true), 0x4e4f534a, 'first GLB chunk is JSON');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, header.getUint32(12, true))));
  assert.ok(json.buffers.every((buffer: { uri?: string }) => !buffer.uri), 'geometry must be embedded');
  assert.equal(json.images?.length ?? 0, 0, 'tokens must not download images or decoder-hosted textures');

  // Exercise the same Three.js decoder that useGLTF uses, including real quantized geometry.
  const manager = new LoadingManager();
  manager.setURLModifier(url => { throw new Error(`Unexpected external asset dependency: ${url}`); });
  const { scene } = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(binary, '');
  assert.equal(scene.children.length, CHARACTER_IDS.length);
  assert.deepEqual(scene.children.map(node => node.name).sort(), CHARACTER_IDS.map(id => `toy_${id}`).sort());

  const sharedMaterials = new Set();
  let allTriangles = 0;
  for (const id of CHARACTER_IDS) {
    const model = scene.getObjectByName(`toy_${id}`);
    assert.ok(model, `missing ${id}`);
    const bounds = new Box3().setFromObject(model, true);
    const size = bounds.getSize(new Vector3());
    assert.ok(Math.abs(bounds.min.y) < 0.001, `${id} must rest on the ownership base`);
    assert.ok(size.y > 0.5 && size.y < 1.016, `${id} must have readable toy scale`);
    assert.ok(size.x <= 0.601 && size.z <= 0.601, `${id} exceeds shared-square footprint`);
    let draws = 0;
    let triangles = 0;
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      draws++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      const material = object.material as MeshStandardMaterial;
      assert.ok(material.isMeshStandardMaterial, `${id} must respond to scene lighting`);
      assert.ok(material.roughness >= 0.3, `${id} should have matte toy plastic`);
      assert.equal(material.map, null, `${id} must share a texture-free palette`);
      sharedMaterials.add(material);
    });
    assert.ok(draws >= 2 && draws <= 8, `${id} has an excessive draw-call budget`);
    assert.ok(triangles < variant.modelTriangles, `${id} has an excessive triangle budget`);
    allTriangles += triangles;
  }
  assert.ok(sharedMaterials.size <= 10, 'all models must reuse the shared toy palette');
  assert.ok(allTriangles < variant.triangles, 'full 36-character catalog must stay within its quality budget');
  assert.equal(allTriangles, manifest.totalTriangles, 'manifest must describe the decoded shipping triangles');
});
