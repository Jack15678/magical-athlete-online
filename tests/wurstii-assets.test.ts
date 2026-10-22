import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer, Box3, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WURSTII_CHARACTERS } from '../src/shared/wurstii.js';
import { ToyResourceCache } from '../src/client/scene/pawn-materials.js';

const folder = new URL('../public/models/wurstii/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder), 'utf8'));

test('Wurstii ships exactly the 30 implemented roles, with portraits and editable sources', async () => {
  const ids = WURSTII_CHARACTERS.map(c => c.id).sort();
  assert.deepEqual(manifest.models.map((m: { id: string }) => m.id).sort(), ids);
  assert.deepEqual((await readdir(folder)).filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4)).sort(), ids);
  assert.deepEqual((await readdir(new URL('../public/avatars/wurstii/', import.meta.url))).map(f => f.slice(0, -4)).sort(), ids);
  for (const model of manifest.models) {
    assert.equal(model.nameZh, WURSTII_CHARACTERS.find(c => c.id === model.id)?.nameZh);
    assert.equal(model.model, `/models/wurstii/${model.id}.glb`);
    assert.equal(model.portrait, `/avatars/wurstii/${model.id}.png`);
    assert.equal(model.node, `toy_${model.id}`);
    assert.ok((await stat(new URL(`../${model.editableSource}`, import.meta.url))).size > 50_000);
    const png = await readFile(new URL(`../public${model.portrait}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 6, 'RGBA, retaining transparent background');
  }
});

for (const model of manifest.models) test(`${model.id}: self-contained 3D asset, palette and independent animation`, async () => {
  const bytes = await readFile(new URL(`${model.id}.glb`, folder));
  assert.equal(bytes.byteLength, model.bytes);
  assert.ok(bytes.byteLength < 320_000, 'per-character model budget');
  const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const manager = new LoadingManager();
  manager.setURLModifier(url => { throw new Error(`Unexpected external dependency ${url}`); });
  const gltf = await new GLTFLoader(manager).parseAsync(binary, '');
  const source = gltf.scene.getObjectByName(model.node); assert.ok(source);
  // Match CharacterModel: animate the named clone, not the complete GLTF scene.
  const root = source.clone(true); const sibling = source.clone(true);
  const bounds = new Box3().setFromObject(root, true); const size = bounds.getSize(new Vector3());
  assert.ok(Math.abs(bounds.min.y) < .001, 'feet meet the existing player base');
  assert.ok(Math.abs(bounds.min.x + bounds.max.x) < .001);
  assert.ok(Math.abs(bounds.min.z + bounds.max.z) < .001);
  assert.ok(size.y > .2 && size.y <= .981);
  assert.ok(size.x <= .601 && size.z <= .601 && size.z > .1);
  size.toArray().forEach((value, i) => assert.ok(Math.abs(value - model.bounds[i]) < .001));
  let triangles = 0; let draws = 0;
  const cache = new ToyResourceCache();
  try {
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      assert.ok(object.material instanceof MeshStandardMaterial);
      draws++;
      const colors = object.geometry.attributes.color;
      assert.ok(colors && colors.count === object.geometry.attributes.position.count);
      assert.ok(object.material.vertexColors, 'Dots bakes outfit/face colors into vertices');
      assert.equal(object.material.map, null);
      for (const lowQuality of [false, true]) {
        const material = cache.characterMaterial(object.material, lowQuality);
        assert.ok(material.vertexColors, 'both game quality tiers preserve the palette');
        assert.ok(material.color.equals(object.material.color));
      }
    });
    assert.equal(triangles, model.triangles); assert.ok(triangles <= 8000);
    assert.equal(draws, model.draws); assert.equal(draws, 1);
    assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), ['idle', 'move', 'skill']);
    for (const clip of gltf.animations) {
      assert.ok(clip.duration > 0);
      const mixer = new AnimationMixer(root); mixer.clipAction(clip).play();
      let changed = false;
      for (let i = 0; i <= 16; i++) {
        mixer.setTime(clip.duration * i / 16);
        const animated = new Box3().setFromObject(root, true);
        const dimensions = animated.getSize(new Vector3());
        assert.ok(animated.min.y >= -.001 && animated.max.y <= .981, 'animation does not sink or exceed the height budget');
        assert.ok(dimensions.x <= .601 && dimensions.z <= .601);
        assert.ok(Math.abs(root.position.x) < .001 && Math.abs(root.position.z) < .001, 'the board owns horizontal movement');
        assert.deepEqual(sibling.position.toArray(), source.position.toArray(), 'another player stays independent');
        assert.deepEqual(sibling.scale.toArray(), source.scale.toArray());
        changed ||= root.position.y > .001 || Math.abs(root.scale.y - 1) > .001;
      }
      assert.ok(changed, `${clip.name} binds to the cloned model and visibly animates`);
      mixer.stopAllAction(); mixer.uncacheRoot(root);
    }
  } finally { cache.dispose(); }
});
