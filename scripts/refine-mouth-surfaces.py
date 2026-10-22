"""Seat audited mouths on their sculpted face, preserving existing rigs/clips.

blender --background --threads 1 --python scripts/refine-mouth-surfaces.py -- --only=leaf-philanthropist
blender --background --threads 1 --python scripts/refine-mouth-surfaces.py

Meshes keep their topology, weights, materials and local motion. The correction
maps source and merged-mouth vertices by geometric identity, then preserves the
tube's signed thickness while following the actual face/snout surface.
"""
import bpy, json, math, sys, os
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SPEC=json.loads((ROOT/'scripts/mouth-repair-targets.json').read_text(encoding='utf8'))
ONLY=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')),None)
VERSION=SPEC['version'];GAP=SPEC['gap'];REPORT=[];TRANSFORMS={}
QA=ROOT/'docs/evidence/refinement-20261022';QA.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0

def meshes(game):return [obj for obj in game.children if obj.type=='MESH']
def centre(obj):
    pts=[obj.matrix_world@v.co for v in obj.data.vertices]
    return Vector(tuple((min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)))
def bvh(points,faces):return BVHTree.FromPolygons([Vector(p) for p in points],faces,all_triangles=False)
def surface(hosts,x,z):
    origin=Vector((x,-3,z));direction=Vector((0,1,0));hits=[]
    for obj in hosts:
        inv=obj.matrix_world.inverted();hit,location,normal,index=obj.ray_cast(inv@origin,inv.to_3x3()@direction)
        if hit:hits.append(obj.matrix_world@location)
    return min(hits,key=lambda p:p.y) if hits else None
def export(path,roots):
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        for obj in [root,*root.children]:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
    temporary=ROOT/'tmp'/('surface-'+path.stem+'.glb');temporary.parent.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=False,export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=False,export_optimize_animation_keep_anim_object=False,export_extras=True,export_texcoords=False,export_tangents=False,export_skins=True,export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    temporary.replace(path)
def save(path):
    temporary=path.with_name(path.stem+'.surface-tmp.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(temporary),compress=True);temporary.replace(path)
def metadata(game,path,row):
    row['bytes']=path.stat().st_size;row['triangles']=sum(len(p.vertices)-2 for obj in meshes(game) for p in obj.data.polygons)
    row['draws']=len(meshes(game));row['mouthSurfaceVersion']=VERSION
    pts=[obj.matrix_world@v.co for obj in meshes(game) for v in obj.data.vertices]
    dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
    row['bounds']=[round(dims[0],5),round(dims[2],5),round(dims[1],5)]
    return row

def repair(edit,game,spec):
    id=spec['id'];mouth=bpy.data.objects.get(spec['mouth']);assert mouth is not None,spec
    restored=mouth.get('surfaceRepairOriginal')
    if restored:
        original=json.loads(restored);points=original['points'];faces=original['faces'];dx=original['dx']
    else:
        points=[list(mouth.matrix_world@v.co) for v in mouth.data.vertices];faces=[list(p.vertices) for p in mouth.data.polygons];dx=0
        if id=='lackey':
            eyes=[obj for obj in edit.children if obj.name in ('GEO-lackey-08','GEO-lackey-10')]
            assert len(eyes)==2;dx=sum(centre(obj).x for obj in eyes)/2-centre(mouth).x
        mouth['surfaceRepairOriginal']=json.dumps({'points':points,'faces':faces,'dx':dx},separators=(',',':'))
    present=[list(mouth.matrix_world@v.co) for v in mouth.data.vertices]
    old=bvh(present,faces);nearest_vertex=KDTree(len(present))
    for i,p in enumerate(present):nearest_vertex.insert(Vector(p),i)
    nearest_vertex.balance();xs=[p[0] for p in points];depths=[-p[1] for p in points]
    coeff=np.polyfit(xs,depths,2).tolist()
    hosts=[bpy.data.objects[name] for name in spec['hosts'] if name in bpy.data.objects]
    # Snouts and beards are actual facial hosts, unlike hats/cameras/eyes.
    addons=[obj for obj in edit.children if any(tag in obj.name for tag in ('-snout-','-muzzle-','-long-grin-'))]
    if id=='leaf-thespian':addons.extend(obj for obj in edit.children if '-stage-beard-' in obj.name)
    if id=='blunderdog':addons.extend(obj for obj in edit.children if '-nose-' in obj.name)
    if id=='extra-mile-saint-nick':addons.extend(obj for obj in edit.children if '-long-beard-' in obj.name)
    hosts=list({obj.name:obj for obj in [*hosts,*addons]}.values());assert hosts,id
    missing=0
    def transform(point):
        nonlocal missing
        x,y,z=point;x+=dx;z+=spec.get('heightShift',0);hit=surface(hosts,x,z)
        if hit is None:missing+=1;return Vector((x,y,z))
        thickness=-y-float(np.polyval(coeff,point[0]))
        return Vector((x,hit.y-GAP-thickness,z))
    applied=mouth.get('surfaceRepairVersion')==VERSION
    changes=[]
    if not applied:
        for obj in meshes(game):
            if not obj.data.materials or obj.data.materials[0]!=mouth.data.materials[0]:continue
            inv=obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                point=obj.matrix_world@vertex.co;nearest=old.find_nearest(point)
                if nearest[0] is not None and nearest[3]<.0025:
                    _,index,_=nearest_vertex.find(point);changes.append((obj,vertex,inv@transform(Vector(points[index]))))
        assert len(changes)>=8,(id,'No reliable shipping-mouth matches',len(changes))
        for obj,vertex,point in changes:vertex.co=point
        inverse=mouth.matrix_world.inverted()
        for vertex,point in zip(mouth.data.vertices,points):vertex.co=inverse@transform(Vector(point))
        mouth.data.update();mouth['surfaceRepairVersion']=VERSION
    # Persist a reproducible deformation field for the separate economy asset.
    record={'id':id,'points':points,'faces':faces,'dx':dx,'coeff':coeff,'hosts':[obj.name for obj in hosts]}
    TRANSFORMS[id]=(record,hosts)
    REPORT.append({'id':id,'mouth':mouth.name,'hosts':[obj.name for obj in hosts],'centreShiftX':dx,'matchedShippingVertices':len(changes),'missingProjectionSamples':missing,'skippedAlreadyApplied':bool(applied),'gap':GAP})
    print('SURFACE_REPAIR',id,len(changes),'miss',missing,flush=True)

def remove_thief_duplicate_eyes(edit,game):
    if edit.get('duplicateEyesRemoved'):return
    whites=[obj for obj in edit.children if '-eye-white-' in obj.name]
    if len(whites)!=4:return
    # Each authored eye is a consecutive white/pupil/glint triple. Spatial
    # proximity is ambiguous here because the two original pairs overlap.
    old=sorted([obj for obj in edit.children if any('-'+tag+'-' in obj.name for tag in ('eye-white','eye-pupil','eye-glint'))],key=lambda obj:int(obj.name.rsplit('-',1)[1]))[:6]
    fields=[bvh([list(obj.matrix_world@v.co) for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons]) for obj in old]
    import bmesh
    removed=0
    for obj in meshes(game):
        bm=bmesh.new();bm.from_mesh(obj.data);pending=set()
        for vertex in bm.verts:
            point=obj.matrix_world@vertex.co
            if any((hit:=tree.find_nearest(point))[0] is not None and hit[3]<.00001 for tree in fields):pending.add(vertex)
        # Delete complete closed islands, preserving every other vertex/group.
        queue=list(pending)
        while queue:
            vertex=queue.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other not in pending:pending.add(other);queue.append(other)
        removed+=len(pending)
        if pending:bmesh.ops.delete(bm,geom=list(pending),context='VERTS');bm.to_mesh(obj.data)
        bm.free()
    for obj in old:bpy.data.objects.remove(obj,do_unlink=True)
    edit['duplicateEyesRemoved']=VERSION;print('THIEF_EYES_REMOVED',len(old),removed,flush=True)

specs=[row for row in SPEC['targets'] if ONLY is None or row['id']==ONLY]
base=[];independent=[]
for spec in specs:
    id=spec['id'];pack='extra-mile' if id.startswith('extra-mile-') else 'leaf' if id.startswith('leaf-') else 'second-wind' if (ROOT/'assets/blender/second-wind'/f'{id}.blend').exists() else 'base'
    (base if pack=='base' else independent).append((spec,pack))
for spec,pack in independent:
    id=spec['id'];path=ROOT/'assets/blender'/pack/f'{id}.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.preferences.filepaths.save_version=0
    edit=bpy.data.objects['EDIT-'+id];game=bpy.data.objects['toy_'+id]
    repair(edit,game,spec)
    if id=='extra-mile-thief':remove_thief_duplicate_eyes(edit,game)
    target=ROOT/'public/models'/pack/f'{id}.glb';export(target,[game]);save(path)
    manifest_path=ROOT/'public/models'/pack/'manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf8'));row=next(row for row in manifest['models'] if row['id']==id);metadata(game,target,row);manifest['bytes']=manifest['totalBytes']=sum(row.get('bytes',0) for row in manifest['models']);manifest['totalTriangles']=sum(row['triangles'] for row in manifest['models']);manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    single=path.with_suffix('.json')
    if single.exists():single.write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if base:
    path=ROOT/'assets/blender/toy-racers.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.preferences.filepaths.save_version=0
    for spec,pack in base:repair(bpy.data.objects['EDIT-'+spec['id']],bpy.data.objects['toy_'+spec['id']],spec)
    roots=[obj for obj in bpy.context.scene.objects if obj.name.startswith('toy_') and obj.type=='EMPTY'];target=ROOT/'public/models/toy-racers.glb';export(target,roots);save(path)
    manifest_path=ROOT/'public/models/toy-racers.manifest.json';manifest=json.loads(manifest_path.read_text());manifest['bytes']=manifest['optimizedBytes']=target.stat().st_size
    for spec,pack in base:
        row=next(row for row in manifest['models'] if row['id']==spec['id']);metadata(bpy.data.objects['toy_'+spec['id']],target,row);row.pop('bytes',None)
    manifest['totalTriangles']=sum(row['triangles'] for row in manifest['models']);manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    # Derive the reduced tier from the corrected source, then author its own
    # five-joint clips. Re-import/re-export of a rigged GLB loses Blender NLA
    # track ownership, so the canonical low-tier builder remains authoritative.
    import subprocess
    for script,args in [('export-blender-economy.py',[]),('refine-racer-motion.py',['--','--rig-economy'])]:
        subprocess.run([bpy.app.binary_path,'--background','--threads','1','--python-exit-code','1','--python',str(ROOT/'scripts'/script),*args],check=True)
(QA/'mouth-surface-repair.json').write_text(json.dumps({'version':VERSION,'mouths':REPORT},indent=2)+'\n',encoding='utf8')
print('MOUTH_SURFACES_COMPLETE',len(specs),flush=True)
