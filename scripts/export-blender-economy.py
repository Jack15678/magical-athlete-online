"""Generate mobile/economy game meshes from the editable Blender master; optional --render comparison."""
import bpy, json, math, sys, shutil
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'models'
OUTPUT.mkdir(parents=True, exist_ok=True)
QA = ROOT / 'docs' / 'evidence' / 'blender'
QA.mkdir(parents=True, exist_ok=True)
# Keep costly mesh editing in independent Blender processes. The candidate
# build leaks a dependency-graph pointer after several loose-island operations.
only=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--only=')),None)
if only is None:
    import subprocess
    source_manifest=json.loads((OUTPUT/'toy-racers.manifest.json').read_text())
    for model in source_manifest['models']:
        part=ROOT/'tmp/economy-mouth-parts'/(model['id']+'.glb')
        if part.exists() and part.with_suffix('.json').exists() and part.stat().st_mtime>(ROOT/'assets/blender/toy-racers.blend').stat().st_mtime:continue
        for attempt in range(3):
            result=subprocess.run([bpy.app.binary_path,'--background','--threads','1','--python-exit-code','1','--python',__file__,'--','--only='+model['id']])
            if result.returncode==0:break
            if 0<result.returncode<0x80000000:result.check_returncode()
            print('LOD_NATIVE_RETRY',model['id'],'attempt',attempt+1,'exit',result.returncode,flush=True)
        result.check_returncode()
    bpy.ops.wm.read_factory_settings(use_empty=True);statistics=[]
    for model in source_manifest['models']:
        part=ROOT/'tmp/economy-mouth-parts'/(model['id']+'.glb')
        bpy.ops.import_scene.gltf(filepath=str(part));statistics.extend(json.loads(part.with_suffix('.json').read_text())['models'])
    import re
    palette={}
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        for slot in obj.material_slots:
            key=re.sub(r'\.\d+$','',slot.material.name)
            if key not in palette:palette[key]=slot.material
            slot.material=palette[key]
    bpy.context.view_layer.update();bpy.ops.object.select_all(action='SELECT')
    path=OUTPUT/'toy-racers-economy.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_texcoords=False,export_tangents=False,export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    shutil.copyfile(path,ROOT/'tmp/toy-racers-economy-base.glb')
    manifest=dict(version=1,units='metres',up='+Y',forward='+Z',pivot='ground-centre',generator='Blender '+bpy.app.version_string,source='assets/blender/toy-racers.blend',collapseRatio=.36,models=statistics,totalTriangles=sum(row['triangles'] for row in statistics),bytes=path.stat().st_size,optimizedBytes=path.stat().st_size,compression='EXT_meshopt_compression',materialCount=10,textureCount=0)
    (OUTPUT/'toy-racers-economy.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('LOD_ISOLATED_COMPLETE',len(statistics),flush=True)
    raise SystemExit(0)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/blender/toy-racers.blend'))
scene = bpy.context.scene

# Decimation must operate on plain geometry. Carrying the high-tier armature
# dependency graph through hundreds of separate/join operations crashes this
# Blender candidate, even though the copied objects have no modifiers. A mesh
# library preserves materials and topology without retaining any rig links.
library=ROOT/'tmp/economy-clean-meshes.blend';library.parent.mkdir(exist_ok=True)
inventory=[];library_meshes=set()
for root in sorted([o for o in scene.objects if o.name.startswith('toy_') and o.type=='EMPTY'],key=lambda o:o.name):
    parts=[]
    for i,obj in enumerate(o for o in root.children if o.type=='MESH'):
        mesh=obj.data.copy();mesh.name='ECONOMY-'+root.name+'-'+str(i);library_meshes.add(mesh);parts.append((obj.name,mesh.name))
    inventory.append((root.name,parts))
bpy.data.libraries.write(str(library),library_meshes)
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
with bpy.data.libraries.load(str(library),link=False) as (source,target):target.meshes=source.meshes
for name,parts in inventory:
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
    for object_name,mesh_name in parts:
        obj=bpy.data.objects.new(object_name,bpy.data.meshes[mesh_name]);scene.collection.objects.link(obj);obj.parent=root

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.hide_set(False); obj.select_set(True)
    if objects: bpy.context.view_layer.objects.active = objects[0]

def triangles(obj): return sum(len(p.vertices) - 2 for p in obj.data.polygons)
def bounds(objects):
    points = [Vector(v.co) for o in objects for v in o.data.vertices]
    lo = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    return lo, hi

high_roots = sorted([o for o in scene.objects if o.name.startswith('toy_') and o.type == 'EMPTY'], key=lambda o:o.name)
only=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--only=')),None)
if only:high_roots=[o for o in high_roots if o.name=='toy_'+only]
low_roots = []
statistics = []
for high in high_roots:
    name = high.name; id = name.removeprefix('toy_'); high.name = 'HIGH-' + name
    low = bpy.data.objects.new(name, None); scene.collection.objects.link(low)
    before_triangles = 0
    small_parts = 0
    high_meshes = [o for o in high.children if o.type == 'MESH']
    for original in high_meshes:
        before_triangles += triangles(original)
        obj = bpy.data.objects.new('LOD-' + original.name, original.data.copy()); scene.collection.objects.link(obj)
        select([obj]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
        islands = list(bpy.context.selected_objects)
        for part in islands:
            count = triangles(part)
            lo, hi = bounds([part]); maximum = max(hi - lo)
            minimum = 24 if maximum < .026 else 64 if maximum < .1 else 48
            ratio = max(.36, min(1, minimum / max(1, count)))
            if ratio > .36: small_parts += 1
            if ratio < .999:
                select([part]); mod = part.modifiers.new('Economy silhouette-preserving collapse', 'DECIMATE')
                mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = True
                bpy.ops.object.modifier_apply(modifier=mod.name)
        select(islands)
        if len(islands) > 1: bpy.ops.object.join()
        obj = bpy.context.object; obj.parent = low; obj.name = original.name
    high_lo, high_hi = bounds(high_meshes); low_lo, low_hi = bounds(list(low.children))
    ratio = Vector(tuple((high_hi[i] - high_lo[i]) / (low_hi[i] - low_lo[i]) for i in range(3)))
    normalize = Matrix.Translation(high_lo) @ Matrix.Diagonal((*ratio,1)) @ Matrix.Translation(-low_lo)
    for child in low.children: child.data.transform(normalize)
    low_lo, low_hi = bounds(list(low.children))
    after = sum(triangles(o) for o in low.children)
    extent = high_hi - high_lo
    statistics.append(dict(id=id, node=low.name, triangles=after, sourceTriangles=before_triangles, draws=len(low.children),
                           bounds=[round(extent.x,5),round(extent.z,5),round(extent.y,5)], pivotY=0,
                           protectedSmallComponents=small_parts, canonicalBoundsScale=list(ratio)))
    low_roots.append(low)
    print('LOD', id, before_triangles, '->', after, 'protected', small_parts, flush=True)

select([o for root in low_roots for o in [root,*root.children]])
path = OUTPUT / 'toy-racers-economy.glb'
if only:
    path=ROOT/'tmp/economy-mouth-parts'/(only+'.glb');path.parent.mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_animations=False, export_extras=True, export_texcoords=False,
                          export_tangents=False, export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
(ROOT / 'tmp').mkdir(exist_ok=True)
if not only:shutil.copyfile(path, ROOT / 'tmp/toy-racers-economy-base.glb')
manifest = dict(version=1, units='metres', up='+Y', forward='+Z', pivot='ground-centre', generator='Blender ' + bpy.app.version_string,
                source='assets/blender/toy-racers.blend', collapseRatio=.36, models=statistics,
                totalTriangles=sum(s['triangles'] for s in statistics), bytes=path.stat().st_size, optimizedBytes=path.stat().st_size,
                compression='EXT_meshopt_compression', materialCount=10, textureCount=0)
(path.with_suffix('.json') if only else OUTPUT/'toy-racers-economy.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')

if '--render' in sys.argv:
    for obj in scene.objects:
        obj.hide_render = True
    for row, (id, quality) in enumerate([('hare','high'),('hare','low'),('gunk','high'),('gunk','low')]):
        source = next(o for o in (high_roots if quality == 'high' else low_roots) if o.name == ('HIGH-toy_' if quality == 'high' else 'toy_') + id)
        for view in range(3):
            x,z = (view-1)*1.4, (3-row)*1.3
            rotation = Matrix.Rotation(view * -math.pi/2,4,'Z')
            for child in [o for o in source.children if o.type == 'MESH']:
                obj = bpy.data.objects.new('QA-' + id + '-' + quality, child.data); scene.collection.objects.link(obj)
                obj.matrix_world = Matrix.Translation((x,0,z)) @ rotation
            font = bpy.data.curves.new('QA-label','FONT'); font.body = id + ' / ' + quality + ' / ' + ('front','side','back')[view]
            font.size = .105; font.align_x = 'CENTER'; font.materials.append(bpy.data.materials['toy-paper'])
            obj = bpy.data.objects.new('QA-label',font); scene.collection.objects.link(obj); obj.location=(x,-.05,z-.16); obj.rotation_euler=(math.pi/2,0,0)
    camera_data = bpy.data.cameras.new('LOD-review-camera'); camera = bpy.data.objects.new('LOD-review-camera',camera_data); scene.collection.objects.link(camera)
    target=Vector((0,0,2.45)); camera.location=(0,-12,3.05); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type='ORTHO'; camera_data.ortho_scale=5.9; scene.camera=camera
    for name,loc,energy,size in [('Key',(-3,-4,7),500,5),('Fill',(4,-1,3),250,4),('Rim',(1,3,5),400,3)]:
        light=bpy.data.lights.new(name,'AREA'); light.energy=energy; light.shape='DISK'; light.size=size
        obj=bpy.data.objects.new(name,light); scene.collection.objects.link(obj); obj.location=loc; obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=True
    scene.render.resolution_x=1400; scene.render.resolution_y=1600; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
    scene.render.filepath=str(QA / 'economy-front-side-back.png')
    bpy.ops.render.render(write_still=True)

print('LOD_COMPLETE', json.dumps({k:v for k,v in manifest.items() if k!='models'}), flush=True)

