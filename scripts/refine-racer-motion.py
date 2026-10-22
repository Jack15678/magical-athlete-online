"""Refine the banana, then author local skeletal clips for every shipping toy.

Run with Blender 5.2 --background --threads 1 --python this.py -- --geometry
then export-blender-economy.py, then --rig-base / --rig-economy / --rig-second
in separate Blender processes. No world/root motion.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/blender'
OUT = ROOT / 'public/models'
FLOAT = {'blimp','genius','romantic','soulmate','null','nemesis','magical-athlete','icarus','kraken','mush'}
LONG = {'banana','inchworm','gunk','suckerfish','tail','the-hose','gloth'}
WHEEL = {'third-wheel','scoocher','mastermind','hotel','rocket-scientist'}
QUAD = {'centaur','hog-knight-hog','blunderdog','cheatah','leaptoad','hopfrog','penguin'}

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.hide_set(False); obj.hide_render=False; obj.select_set(True)
    if objects: bpy.context.view_layer.objects.active=objects[0]

def geometry():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tmp/toy-racers-master-base.blend' if '--fresh' in sys.argv else SOURCE/'toy-racers.blend'))
    edit=bpy.data.objects['EDIT-banana']; game=bpy.data.objects['toy_banana']
    if edit.get('refinement_20261022'): return
    # Use the actual sculpt bounds. Details intersect existing volumes rather
    # than leaving seam gaps; the original silhouette and palette are retained.
    added=[]
    def orb(tag, material, location, scale):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1)
        obj=bpy.context.object; obj.name='GEO-banana-'+tag
        obj.data.transform(Matrix.Translation(location) @ Matrix.Diagonal((*scale,1)))
        obj.parent=edit; obj.data.materials.append(bpy.data.materials['toy-'+material])
        for p in obj.data.polygons: p.use_smooth=True
        added.append(obj); return obj
    # Moulded soles/toe caps follow the canonical shoe positions from the source.
    feet=[o for o in edit.children if o.get('foot')]
    for i,foot in enumerate(feet):
        corners=[Vector(v) for v in foot.bound_box]; lo=Vector(tuple(min(v[k] for v in corners) for k in range(3))); hi=Vector(tuple(max(v[k] for v in corners) for k in range(3)))
        centre=(lo+hi)/2; extent=hi-lo
        orb('sole-'+str(i),'paper',(centre.x,centre.y,lo.z+.013),(extent.x*.48,extent.y*.47,.013))
        orb('toe-cap-'+str(i),'ink',(centre.x,lo.y+.025,centre.z+.009),(extent.x*.47,.038,extent.z*.39))
    # The old tube has a relatively coarse curved silhouette. Subdivision only
    # on its largest yellow component, leaving eyes and shoes untouched.
    yellow=bpy.data.objects.get('banana_toy-yellow')
    if yellow:
        import bmesh
        bm=bmesh.new(); bm.from_mesh(yellow.data)
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True,smooth=.18)
        bm.to_mesh(yellow.data); bm.free()
        for p in yellow.data.polygons: p.use_smooth=True
    for material in {o.data.materials[0] for o in added}:
        target=next(o for o in game.children if o.type=='MESH' and o.data.materials[0]==material)
        copies=[]
        for original in added:
            if original.data.materials[0]!=material: continue
            copy=bpy.data.objects.new('banana-added',original.data.copy()); bpy.context.scene.collection.objects.link(copy); copies.append(copy)
        select([target,*copies]); bpy.context.view_layer.objects.active=target; bpy.ops.object.join(); target.parent=game
    # Seat the refined shoe soles on the same origin used by all racers.
    low=min(v.co.z for obj in game.children if obj.type=='MESH' for v in obj.data.vertices)
    for obj in [*edit.children,*game.children]:
        if obj.type=='MESH': obj.data.transform(Matrix.Translation((0,0,-low)))
    edit['refinement_20261022']='smoother curved peel; moulded toe caps and cream soles; same silhouette and ground pivot'
    for obj in [edit,*edit.children]: obj.hide_set(True); obj.hide_render=True
    # Keep export metadata exact after topology changes.
    manifest=json.loads((OUT/'toy-racers.manifest.json').read_text())
    row=next(m for m in manifest['models'] if m['id']=='banana')
    row['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in game.children if o.type=='MESH')
    row['refinement']+='; '+edit['refinement_20261022']
    manifest['totalTriangles']=sum(m['triangles'] for m in manifest['models'])
    (OUT/'toy-racers.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'toy-racers.blend'),compress=True)
    print('BANANA_GEOMETRY_DONE',row['triangles'],flush=True)

def profile(id):
    id=id.removeprefix('extra-mile-').removeprefix('leaf-')
    if id in ('whisper','echo','spiteful-spirit'): return 'float'
    if id in ('snake-eyes','catfish'): return 'long'
    if id in ('race-car','lazy-bones'): return 'wheel'
    if id in ('dark-horse','lonely-wolf'): return 'quadruped'
    return 'float' if id in FLOAT else 'long' if id in LONG else 'wheel' if id in WHEEL else 'quadruped' if id in QUAD else 'biped'

def rig(game,id,prefix):
    scene=bpy.context.scene
    meshes=[o for o in game.children if o.type=='MESH']
    for previous in [o for o in game.children if o.type=='ARMATURE']:
        bpy.data.objects.remove(previous,do_unlink=True)
    for mesh in meshes:
        for modifier in list(mesh.modifiers):
            if modifier.type=='ARMATURE': mesh.modifiers.remove(modifier)
        mesh.vertex_groups.clear()
    if prefix:
        for action in [a for a in bpy.data.actions if a.name.startswith(prefix)]: bpy.data.actions.remove(action)
    if id=='banana':
        total=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
        limit=9000 if total>7000 else 3400
        if total>limit:
            target=max(meshes,key=lambda o:len(o.data.polygons)); own=sum(len(p.vertices)-2 for p in target.data.polygons)
            select([target]); mod=target.modifiers.new('Banana curved silhouette budget','DECIMATE'); mod.ratio=max(.35,(limit-(total-own))/own)
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Remove prior whole-root clips: the world transform must remain canonical.
    game.animation_data_clear(); game.location=(0,0,0); game.rotation_euler=(0,0,0); game.scale=(1,1,1)
    data=bpy.data.armatures.new('RIG-'+id); arm=bpy.data.objects.new('RIG-'+id,data); scene.collection.objects.link(arm); arm.parent=game
    select([arm]); bpy.ops.object.mode_set(mode='EDIT')
    layout={'body':((0,0,.23),(0,0,.61)), 'head':((0,0,.61),(0,0,.9)), 'left':((-.115,0,.2),(-.115,0,.04)), 'right':((.115,0,.2),(.115,0,.04)), 'secondary':((0,.06,.48),(0,.12,.77))}
    for name,(head,tail) in layout.items():
        bone=data.edit_bones.new(id+'_'+name); bone.head=head; bone.tail=tail
        if name in ('head','secondary'): bone.parent=data.edit_bones[id+'_body']
    bpy.ops.object.mode_set(mode='OBJECT'); bodytype=profile(id)
    for mesh in meshes:
        groups={name:mesh.vertex_groups.new(name=id+'_'+name) for name in layout}
        for vertex in mesh.data.vertices:
            x,y,z=vertex.co; weights={'body':1.0}
            if bodytype not in ('float','long') and z<.28:
                foot=max(0,min(1,(.28-z)/.13)); weights={'body':1-foot, 'left' if x<0 else 'right':foot}
            elif z>.57:
                head=min(.85,(z-.57)/.22); weights={'body':1-head,'head':head}
            elif bodytype=='long' and y>.05:
                tail=min(.65,(y-.05)*3); weights={'body':1-tail,'secondary':tail}
            for name,weight in weights.items():
                if weight>0: groups[name].add([vertex.index],weight,'REPLACE')
        mod=mesh.modifiers.new('Local toy joints','ARMATURE'); mod.object=arm; mod.use_deform_preserve_volume=False
    arm.animation_data_create(); phase=(sum(ord(c) for c in id)%9)/9
    duration=40 if bodytype=='float' else 32 if bodytype=='long' else 24 if bodytype=='quadruped' else 28
    poses={'idle':duration+13,'move':duration+1,'skill':25,'fall':19,'recover':19}
    for name,end in poses.items():
        clip=prefix+name; action=bpy.data.actions.new(clip); arm.animation_data.action=action
        for frame in sorted(set([1,round(end*.25),round(end*.5),round(end*.75),end])):
            t=(frame-1)/(end-1); wave=math.sin(t*math.pi*2); hump=math.sin(t*math.pi)
            for bone in arm.pose.bones: bone.rotation_mode='XYZ'; bone.rotation_euler=(0,0,0); bone.location=(0,0,0); bone.scale=(1,1,1)
            body=arm.pose.bones[id+'_body']; head=arm.pose.bones[id+'_head']; left=arm.pose.bones[id+'_left']; right=arm.pose.bones[id+'_right']; secondary=arm.pose.bones[id+'_secondary']
            if name=='idle':
                body.rotation_euler.z=wave*(.009+phase*.007); head.rotation_euler.y=wave*.018
                if bodytype=='float': body.location.y=hump*.012
            elif name=='move':
                body.rotation_euler.z=wave*(.025+phase*.015); head.rotation_euler.z=-wave*.018
                if bodytype=='float': body.location.y=hump*.035; head.rotation_euler.x=wave*.04
                elif bodytype=='long': body.rotation_euler.y=wave*.05; secondary.rotation_euler.y=-wave*.14
                elif bodytype=='wheel': body.rotation_euler.x=.045*hump; left.rotation_euler.x=wave*.1; right.rotation_euler.x=-wave*.1
                else: left.rotation_euler.x=wave*(.22+phase*.07); right.rotation_euler.x=-wave*(.22+phase*.07)
            elif name=='skill':
                body.rotation_euler.x=-hump*(.09+phase*.06); head.rotation_euler.x=hump*.09; secondary.rotation_euler.z=hump*.15
                body.scale=(1+hump*.025,1-hump*.035,1+hump*.025)
            # Fall/recovery intentionally contain no second body spin: the
            # server-state driven pawn-fall pose is the sole tilt authority.
            elif name in ('fall','recover'): head.rotation_euler.x=(-hump if name=='fall' else hump)*.065
            channels=[(body,'rotation_euler'),(head,'rotation_euler')]
            if name=='move': channels.extend([(left,'rotation_euler'),(right,'rotation_euler'),(secondary,'rotation_euler')])
            if name=='skill': channels.extend([(body,'scale'),(secondary,'rotation_euler')])
            if bodytype=='float' and name in ('idle','move'): channels.append((body,'location'))
            if name in ('fall','recover'): channels=[(head,'rotation_euler')]
            for bone,prop in channels: bone.keyframe_insert(prop,frame=frame,group=bone.name)
        track=arm.animation_data.nla_tracks.new(); track.name=clip; strip=track.strips.new(clip,1,action); strip.name=clip; track.mute=True
    arm.animation_data.action=None; scene.frame_set(1)
    game['motion_profile']=bodytype; game['motion_variant']=round(phase,3); game['root_motion']=False
    return arm

def export(path,roots):
    objects=[]
    for root in roots: objects.extend([root,*root.children])
    select(objects)
    temporary=ROOT/'tmp'/('motion-'+path.stem+'.glb')
    if temporary.exists(): temporary.unlink()
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=False,export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=False,export_optimize_animation_keep_anim_object=False,export_extras=True,export_texcoords=False,export_tangents=False,export_skins=True,export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    temporary.replace(path)

def update_base():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'toy-racers.blend'))
    roots=sorted([o for o in bpy.context.scene.objects if o.name.startswith('toy_') and o.type=='EMPTY'],key=lambda o:o.name)
    for root in roots: rig(root,root.name[4:],root.name[4:]+'-')
    export(OUT/'toy-racers.glb',roots)
    for root in roots:
        for obj in [root,*root.children]: obj.hide_set(False); obj.hide_render=False
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'toy-racers.blend'),compress=True)
    path=OUT/'toy-racers.manifest.json'; manifest=json.loads(path.read_text()); manifest['version']=3
    for row in manifest['models']:
        root=next(r for r in roots if r.name=='toy_'+row['id'])
        row.update(motionProfile=profile(row['id']),animations=['idle','move','skill','fall','recover'],bones=5,triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children if o.type=='MESH'))
    manifest['totalTriangles']=sum(m['triangles'] for m in manifest['models'])
    manifest['bytes']=manifest['optimizedBytes']=(OUT/'toy-racers.glb').stat().st_size; manifest['skeletalAnimation']=True
    path.write_text(json.dumps(manifest,indent=2)+'\n')

def update_economy():
    # Low tier reuses the same five-joint standard on independently reduced meshes.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=ROOT/'tmp/toy-racers-economy-base.glb'
    if not source.exists(): raise RuntimeError('Run export-blender-economy.py to create the canonical unrigged low-tier input first.')
    bpy.ops.import_scene.gltf(filepath=str(source))
    # Imported glTF is Y-up; work in Blender's native Z-up before authoring rigs.
    roots=sorted([o for o in bpy.context.scene.objects if o.name.startswith('toy_') and o.type=='EMPTY'],key=lambda o:o.name)
    for root in roots: rig(root,root.name[4:],root.name[4:]+'-')
    export(OUT/'toy-racers-economy.glb',roots)
    path=OUT/'toy-racers-economy.manifest.json'; manifest=json.loads(path.read_text()); manifest['version']=3; manifest['skeletalAnimation']=True
    for row in manifest['models']:
        root=next(r for r in roots if r.name=='toy_'+row['id'])
        row.update(motionProfile=profile(row['id']),animations=['idle','move','skill','fall','recover'],bones=5,triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children if o.type=='MESH'))
    manifest['totalTriangles']=sum(m['triangles'] for m in manifest['models'])
    manifest['bytes']=manifest['optimizedBytes']=(OUT/'toy-racers-economy.glb').stat().st_size
    path.write_text(json.dumps(manifest,indent=2)+'\n')
    print('BASE_RIGGED',len(roots),flush=True)

def update_second():
    path=OUT/'second-wind/manifest.json'; manifest=json.loads(path.read_text())
    for row in manifest['models']+manifest['variants']:
        id=row['id']; bpy.ops.wm.open_mainfile(filepath=str(ROOT/row['editableSource']))
        for action in list(bpy.data.actions): bpy.data.actions.remove(action)
        game=bpy.data.objects[row['node']]; rig(game,id,''); target=OUT/'second-wind'/(id+'.glb'); export(target,[game])
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/row['editableSource']),compress=True)
        row.update(bytes=target.stat().st_size,motionProfile=profile(id),bones=5)
        print('RIGGED',id,row['bytes'],flush=True)
    manifest.update(version=2,skeletalAnimation=True,totalBytes=sum(m['bytes'] for m in manifest['models']+manifest['variants']))
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

if '--geometry' in sys.argv: geometry()
if '--rig-base' in sys.argv: update_base()
if '--rig-economy' in sys.argv: update_economy()
if '--rig-second' in sys.argv: update_second()
