import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer, Bone, Box3, Mesh, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cloneToyModel } from '../src/client/scene/toy-model-instance.js';

async function load(path: string) {
  const bytes = await readFile(new URL(`../public/models/${path}.glb`, import.meta.url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

for (const path of ['toy-racers', 'toy-racers-economy', 'banana/banana', 'banana/banana-economy', 'second-wind/switcharoo', 'extra-mile/extra-mile-toll-troll', 'leaf/leaf-triangle-man']) {
  test(`${path}: reduced motion uses shared static bind-pose geometry and can restore independent animation`, async () => {
    const asset = await load(path), source = asset.scene;
    source.updateWorldMatrix(true, true);
    source.traverse(object => { if (object instanceof SkinnedMesh) object.skeleton.update(); });
    const instance = cloneToyModel(source, false), sourceMeshes: Mesh[] = [], staticMeshes: Mesh[] = [];
    source.traverse(object => { if (object instanceof Mesh) sourceMeshes.push(object); });
    instance.traverse(object => {
      assert.ok(!(object instanceof Bone));
      assert.ok(!(object instanceof SkinnedMesh), 'static path must not select a skinning shader');
      if (object instanceof Mesh) staticMeshes.push(object);
    });
    assert.ok(sourceMeshes.some(mesh => mesh instanceof SkinnedMesh));
    assert.equal(staticMeshes.length, sourceMeshes.length);
    instance.updateWorldMatrix(true, true);
    const expected = new Vector3(), actual = new Vector3();
    for (let index = 0; index < sourceMeshes.length; index++) {
      const original = sourceMeshes[index]!, rendered = staticMeshes[index]!;
      assert.equal(rendered.geometry, original.geometry, 'no per-racer geometry copies');
      assert.deepEqual(rendered.material, original.material, 'no per-racer material copies');
      assert.ok(rendered.matrixWorld.equals(original.matrixWorld));
      // Check every actual shipping vertex, including bind matrices and all
      // non-identity GLTF node transforms, rather than just nominal root bounds.
      for (let vertex = 0; vertex < original.geometry.attributes.position!.count; vertex++) {
        original.getVertexPosition(vertex, expected).applyMatrix4(original.matrixWorld);
        rendered.getVertexPosition(vertex, actual).applyMatrix4(rendered.matrixWorld);
        assert.ok(expected.distanceTo(actual) < .00001, `${original.name}: bind pose vertex moved`);
      }
    }
    const originalBounds = new Box3().setFromObject(source, true), staticBounds = new Box3().setFromObject(instance, true);
    assert.ok(originalBounds.min.distanceTo(staticBounds.min) < .00001);
    assert.ok(originalBounds.max.distanceTo(staticBounds.max) < .00001);

    const animated = cloneToyModel(source, true), other = cloneToyModel(source, true);
    const skins: SkinnedMesh[] = [], otherSkins: SkinnedMesh[] = [];
    animated.traverse(object => { if (object instanceof SkinnedMesh) skins.push(object); });
    other.traverse(object => { if (object instanceof SkinnedMesh) otherSkins.push(object); });
    assert.ok(skins.length > 0);
    assert.notEqual(skins[0]!.skeleton.bones[0], otherSkins[0]!.skeleton.bones[0]);
    const clip = asset.animations.find(clip => clip.name.endsWith('move'))!;
    assert.ok(clip);
    const before = skins.flatMap(mesh => mesh.skeleton.bones.map(bone => bone.quaternion.toArray()));
    const mixer = new AnimationMixer(animated); mixer.clipAction(clip).play(); mixer.update(clip.duration * .25);
    assert.notDeepEqual(skins.flatMap(mesh => mesh.skeleton.bones.map(bone => bone.quaternion.toArray())), before);
    // Neither a previous static instance nor the cache is mutated by reenabling.
    assert.ok(new Box3().setFromObject(instance, true).equals(staticBounds));
    assert.ok(new Box3().setFromObject(source, true).equals(originalBounds));
    mixer.stopAllAction(); mixer.uncacheRoot(animated);
  });
}
