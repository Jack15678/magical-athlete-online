import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { ToyResourceCache } from '../src/client/scene/pawn-materials.js';

test('toy palette keeps character colours and uses shared, opaque material variants per quality tier', () => {
  const cache = new ToyResourceCache();
  const original = new MeshStandardMaterial({ color: '#f45b4c', name: 'toy-red', roughness: .4 });
  const satin = cache.characterMaterial(original, false);
  const matte = cache.characterMaterial(original, true);
  assert.ok(satin instanceof MeshPhysicalMaterial);
  assert.ok(!(matte instanceof MeshPhysicalMaterial), 'mobile tier must skip the clearcoat shader');
  assert.equal(cache.characterMaterial(original, false), satin);
  assert.equal(cache.characterMaterial(original, true), matte);
  assert.ok(satin.color.equals(original.color));
  assert.ok(matte.color.equals(original.color));
  assert.equal(original.roughness, .4, 'cached GLB sources may not be mutated');
  assert.ok(satin.clearcoat > 0 && satin.clearcoat <= .2);
  assert.ok(satin.clearcoatRoughness >= .5);
  for (const material of [satin, matte]) {
    assert.equal(material.transparent, false);
    assert.equal(material.metalness, 0);
    assert.equal(material.map, null);
    assert.ok(material.roughness >= .45);
  }
  const paper = cache.characterMaterial(new MeshStandardMaterial({ name: 'toy-paper', color: '#fff6dc' }), false);
  assert.ok(paper.roughness > satin.roughness, 'cream insets must read as a different, softer plastic');
  cache.dispose(); original.dispose();
});

test('rounded ownership base stays inside the shared-square footprint and mobile triangle budget', () => {
  const cache = new ToyResourceCache();
  for (const lowQuality of [false, true]) {
    const geometry = cache.baseGeometry(lowQuality);
    assert.equal(cache.baseGeometry(lowQuality), geometry);
    let triangles = 0;
    for (const part of [geometry.body, geometry.cap]) {
      part.computeBoundingBox();
      const bounds = part.boundingBox!;
      assert.ok(bounds.min.y >= 0 && bounds.max.y <= .163);
      assert.ok(bounds.min.x >= -.331 && bounds.max.x <= .331);
      assert.ok(bounds.min.z >= -.331 && bounds.max.z <= .331);
      triangles += part.index!.count / 3;
      const normals = part.attributes.normal;
      assert.ok(Array.from(normals.array).every(Number.isFinite));
    }
    assert.ok(triangles <= (lowQuality ? 360 : 720), 'rounding must not add expensive geometry');
  }
  assert.equal(cache.baseMaterial('#f45b4c', false), cache.baseMaterial('#f45b4c', false));
  assert.equal(cache.baseMaterial('#f45b4c', false, true), cache.baseMaterial('#5369dc', false, true), 'cream caps share one material across owners');
  cache.dispose();
});

test('cache disposal releases only owned GPU resources and can rebuild cleanly', () => {
  const cache = new ToyResourceCache();
  const original = new MeshStandardMaterial({ color: '#a7c967', name: 'toy-green' });
  const generated = cache.characterMaterial(original, false);
  const base = cache.baseGeometry(false);
  const ownership = cache.baseMaterial('#ffcf38', false);
  let sourcesDisposed = 0, generatedDisposed = 0, geometryDisposed = 0;
  original.addEventListener('dispose', () => sourcesDisposed++);
  generated.addEventListener('dispose', () => generatedDisposed++);
  ownership.addEventListener('dispose', () => generatedDisposed++);
  base.body.addEventListener('dispose', () => geometryDisposed++);
  base.cap.addEventListener('dispose', () => geometryDisposed++);
  cache.dispose(); cache.dispose();
  assert.equal(sourcesDisposed, 0);
  assert.equal(generatedDisposed, 2);
  assert.equal(geometryDisposed, 2);
  assert.notEqual(cache.characterMaterial(original, false), generated);
  assert.notEqual(cache.baseGeometry(false), base);
  cache.dispose(); original.dispose();
});
