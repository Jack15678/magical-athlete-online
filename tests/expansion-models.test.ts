import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer, Box3, LoadingManager, Mesh, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { expansionModels } from '../src/client/scene/expansion-models.js';

for(const variant of ['toy-racers','toy-racers-economy']) test(`${variant}: all 36 established racers use independent local skeletons`,async()=>{
  const bytes=await readFile(new URL(`../public/models/${variant}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assert.equal(gltf.scene.children.length,36);
  for(const root of gltf.scene.children){
    const id=root.name.slice(4);let skins=0;
    root.traverse(o=>{if(o instanceof SkinnedMesh){skins++;assert.equal(o.skeleton.bones.length,5);}});assert.ok(skins>0);
    for(const action of ['idle','move','skill','fall','recover']) assert.ok(gltf.animations.find(c=>c.name===`${id}-${action}`),`${id} missing ${action}`);
    const mixer=new AnimationMixer(root);mixer.clipAction(gltf.animations.find(c=>c.name===`${id}-move`)!).play();mixer.setTime(.2);
    assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);
  }
});

for (const [pack, count] of [['extra-mile',31],['leaf',18]] as const) {
  const folder=new URL(`../public/models/${pack}/`,import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
  test(`${pack} has ${count} unique authored model sources`,()=>{
    assert.equal(manifest.models.length,count); assert.equal(new Set(manifest.models.map((m:{id:string})=>m.id)).size,count);
    assert.equal(manifest.skeletalAnimation,true);
    assert.equal(manifest.totalBytes,manifest.models.reduce((sum:number,m:{bytes:number})=>sum+m.bytes,0));
  });
  for (const model of manifest.models) test(`${model.id}: complete 3D volume, independent joints, local animation and bounded demand loading`,async()=>{
    const bytes=await readFile(new URL(`${model.id}.glb`,folder)); assert.equal(bytes.byteLength,model.bytes); assert.ok(bytes.byteLength<100_000);
    assert.match(expansionModels[model.id]!,new RegExp(`/models/${pack}/`));
    assert.ok((await stat(new URL(`../${model.editableSource}`,import.meta.url))).size>50_000);
    const loader=new GLTFLoader(new LoadingManager().setURLModifier(url=>{throw Error(`External dependency ${url}`);})).setMeshoptDecoder(MeshoptDecoder);
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const root=gltf.scene.getObjectByName(model.node)!; assert.ok(root);
    const bounds=new Box3().setFromObject(root,true),size=bounds.getSize(new Vector3());
    assert.ok(Math.abs(bounds.min.y)<.001); assert.ok(size.x<=.601&&size.z<=.601); assert.ok(size.y>.15&&size.y<.981); assert.ok(size.z>.1);
    if(model.id==='leaf-triangle-man') {
      assert.ok(size.y>.6&&size.z<.3,'the triangle must stand vertically, with complete side depth');
      root.updateWorldMatrix(true,true);root.traverse(o=>{if(o instanceof SkinnedMesh)o.skeleton.update();});
      const body:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh&&o.name.includes('yellow'))body.push(o);});
      assert.ok(new Raycaster(new Vector3(0,size.y*.6,2),new Vector3(0,0,-1)).intersectObjects(body).length>0,'front face must be visible rather than culled by inward normals');
    }
    let triangles=0,draws=0,skins=0;
    root.traverse(object=>{if(object instanceof Mesh){draws++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;} if(object instanceof SkinnedMesh){skins++;assert.equal(object.skeleton.bones.length,5);}});
    assert.equal(triangles,model.triangles); assert.ok(triangles<8_000); assert.equal(draws,model.draws); assert.ok(draws<=9); assert.equal(skins,draws);
    assert.deepEqual(gltf.animations.map(clip=>clip.name).sort(),['fall','idle','move','recover','skill']);
    const instance=clone(root), second=clone(root); let firstSkin:SkinnedMesh|undefined,secondSkin:SkinnedMesh|undefined;
    instance.traverse(o=>{if(o instanceof SkinnedMesh)firstSkin??=o;}); second.traverse(o=>{if(o instanceof SkinnedMesh)secondSkin??=o;});
    assert.notEqual(firstSkin!.skeleton.bones[0],secondSkin!.skeleton.bones[0],'different racers must not share pose state');
    const mixer=new AnimationMixer(instance); const clip=gltf.animations.find(c=>c.name==='move')!; mixer.clipAction(clip).play();
    const before=firstSkin!.skeleton.bones.map(b=>b.quaternion.toArray()); mixer.setTime(clip.duration*.25); instance.updateWorldMatrix(true,true);
    assert.notDeepEqual(firstSkin!.skeleton.bones.map(b=>b.quaternion.toArray()),before,'movement must animate joints, not just whole-root scale');
    assert.deepEqual(instance.position.toArray(),[0,0,0],'world position stays under gameplay authority');
    assert.deepEqual(instance.scale.toArray(),[1,1,1]); assert.deepEqual(secondSkin!.skeleton.bones.map(b=>b.quaternion.toArray()),before);
    assert.ok(model.referenceChecked&&model.recognition.length>30&&model.inferred.length>30);
  });
}
