"""Blender banana quality sample, matching the user's miniature-stadium reference.

Preserves the original banana silhouette. Builds real volume, face and soles;
exports independently demand-loaded high/economy variants and an editable source.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
code=(ROOT/'scripts/generate-second-wind-models.py').read_text(encoding='utf8')
exec(compile(code[:code.index('models=[]; roots=[]; edit_roots=[]')],str(ROOT/'scripts/generate-second-wind-models.py'),'exec'))
OUT=ROOT/'public/models/banana';OUT.mkdir(parents=True,exist_ok=True)
root=bpy.data.objects.new('EDIT-banana',None);scene.collection.objects.link(root);current={'id':'banana','root':root}
def orb(color,p,size,tag):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24 if max(size)>.07 else 20,ring_count=12,radius=1)
    return add(bpy.context.object,color,tag,p,size)
# Closed swept skin with 33 round cross-sections and smoothly changing radius.
verts=[];faces=[];steps=32;radial=20
for i in range(steps+1):
    t=i/steps;u=1-t
    p=Vector((u*u*u*(-.27)+3*u*u*t*.05+3*u*t*t*.36+t*t*t*.13,u*u*u*.31+3*u*u*t*.24+3*u*t*t*.67+t*t*t*.94,0))
    tangent=Vector((3*u*u*(.05+.27)+6*u*t*(.36-.05)+3*t*t*(.13-.36),3*u*u*(.24-.31)+6*u*t*(.67-.24)+3*t*t*(.94-.67),0)).normalized()
    normal=Vector((-tangent.y,tangent.x,0));r=.033+.098*math.sin(math.pi*t)**.8
    for j in range(radial):
        a=j/radial*math.pi*2;v=p+normal*(math.cos(a)*r)+Vector((0,0,math.sin(a)*r*1.05));verts.append(tuple(v))
for i in range(steps):
    for j in range(radial):faces.append((i*radial+j,i*radial+(j+1)%radial,(i+1)*radial+(j+1)%radial,(i+1)*radial+j))
faces.extend([tuple(range(radial-1,-1,-1)),tuple(steps*radial+j for j in range(radial))])
mesh=bpy.data.meshes.new('banana-continuous-skin');mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new('banana-continuous-skin',mesh);scene.collection.objects.link(ob);body=add(ob,'yellow','continuous-curved-peel')
surface=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons])
def skin_front(x,up):
    hit=surface.ray_cast(Vector((x,-3,up)),Vector((0,1,0)))[0]
    if hit is None:raise RuntimeError('Face point is outside curved peel: '+str((x,up)))
    return -hit.y
def surface_tube(tag,points,color='ink',radius=.012):
    # Every centre sample is attached to the curved peel; preserve the real
    # tubular section instead of flattening its vertices into a decal.
    centres=[Vector((x,-skin_front(x,y)-.004,y)) for x,y in points];vs=[];fs=[];around=8
    for i,centre in enumerate(centres):
        tangent=(centres[min(i+1,len(centres)-1)]-centres[max(0,i-1)]).normalized();front=Vector((0,-1,0));side=tangent.cross(front).normalized()
        for j in range(around):
            a=j/around*math.pi*2;vs.append(tuple(centre+front*(math.cos(a)*radius)+side*(math.sin(a)*radius)))
    for i in range(len(centres)-1):
        for j in range(around):fs.append((i*around+j,i*around+(j+1)%around,(i+1)*around+(j+1)%around,(i+1)*around+j))
    fs.extend([tuple(range(around-1,-1,-1)),tuple((len(centres)-1)*around+j for j in range(around))])
    data=bpy.data.meshes.new(tag);data.from_pydata(vs,[],fs);data.update();obj=bpy.data.objects.new('GEO-banana-'+tag,data);scene.collection.objects.link(obj);obj.parent=root;data.materials.append(MATS[color])
    import bmesh
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    for p in data.polygons:p.use_smooth=True
    return obj
K('orange',(.115,.995,0),.043,.038,.12,'stem',rot=(0,0,.24));orb('brown',(.101,1.054,0),(.042,.012,.043),'stem-cut')
L('cream',[(-.24,.325,-.028),(-.02,.37,-.102),(.21,.64,-.103),(.15,.91,-.04)],.009,'back-peel-seam')
for x,y in [(.10,.647),(.227,.639)]:
    z=skin_front(x,y)+.020
    orb('paper',(x,y,z),(.048,.073,.029),'eye-white');orb('ink',(x+.008,y-.005,z+.026),(.023,.043,.016),'eye-pupil')
    orb('paper',(x+.001,y+.015,z+.041),(.009,.013,.005),'eye-glint');orb('paper',(x+.016,y-.017,z+.04),(.004,.006,.003),'eye-small-glint')
    brow=[]
    for bx,by in [(x-.014,y+.075),(x+.002,y+.083),(x+.018,y+.075)]:
        # The curved upper peel narrows, so the eyebrow follows its surface.
        for attempt in range(20):
            try:skin_front(bx,by);break
            except RuntimeError:bx+=(.17-bx)*.15
        brow.append((bx,by))
    surface_tube('brow',brow,'brown',.006)
mouth=[]
for i in range(17):
    t=i/16;u=1-t;mouth.append((u*u*.099+2*u*t*.163+t*t*.226,u*u*.557+2*u*t*.493+t*t*.557))
surface_tube('centred-smile',mouth)
orb('pink',(.163,.532,skin_front(.163,.532)+.008),(.024,.007,.006),'smile-tongue')
L('yellow',[(-.025,.49,0),(-.18,.572,.018),(-.267,.545,.066)],.032,'left-arm');orb('yellow',(-.272,.546,.07),(.047,.047,.045),'left-hand')
L('yellow',[(.22,.46,-.005),(.29,.424,.025),(.304,.382,.063)],.032,'right-arm');orb('yellow',(.31,.385,.07),(.045,.048,.043),'right-hand')
for x,top in [(-.066,.34),(.142,.405)]:
    L('yellow',[(x,.115,.025),(x,top,0)],.031,'connected-leg')
    orb('paper',(x,.025,.075),(.082,.021,.123),'cream-sole');orb('ink',(x,.077,.072),(.079,.059,.117),'rounded-shoe')
    K('ink',(x,.13,.025),.04,.038,.034,'shoe-cuff')
normalize(root);game=merge_game(root,'banana');game['edition']='original';game['qualityReference']='user miniature stadium 2026-10-22'
motion={'__file__':str(ROOT/'scripts/refine-racer-motion.py'),'__name__':'racer_motion'}
exec(compile((ROOT/'scripts/refine-racer-motion.py').read_text(encoding='utf8'),motion['__file__'],'exec'),motion)
motion['rig'](game,'banana','banana-');motion['export'](OUT/'banana.glb',[game])
for obj in [root,*root.children]:obj.hide_render=True;obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/banana.blend'),compress=True)
def row(node,path):
    meshes=[o for o in node.children if o.type=='MESH'];return {'id':'banana','url':'/models/banana/'+path.name,'bytes':path.stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'draws':len(meshes),'bones':5,'animations':['idle','move','skill','fall','recover'],'source':'assets/blender/banana.blend'}
high=row(game,OUT/'banana.glb');game.name='HIGH-toy_banana'
low=bpy.data.objects.new('toy_banana',None);scene.collection.objects.link(low)
for material in MATS.values():
    copies=[]
    for source in root.children:
        if source.type!='MESH' or source.data.materials[0]!=material:continue
        data=bpy.data.meshes.new_from_object(source.evaluated_get(bpy.context.evaluated_depsgraph_get()));obj=bpy.data.objects.new('LOW-'+source.name,data);scene.collection.objects.link(obj);copies.append(obj)
        if len(data.polygons)>90 and not any(tag in source.name for tag in ('glint','smile','brow')):
            select([obj]);mod=obj.modifiers.new('Protected facial economy mesh','DECIMATE');mod.ratio=.4 if any(tag in source.name for tag in ('eye','shoe','sole','hand')) else .32;bpy.ops.object.modifier_apply(modifier=mod.name)
    if not copies:continue
    select(copies)
    if len(copies)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='banana_'+material.name;obj.parent=low
motion['rig'](low,'banana','banana-');motion['export'](OUT/'banana-economy.glb',[low]);economy=row(low,OUT/'banana-economy.glb')
(OUT/'manifest.json').write_text(json.dumps({'version':1,'generator':'Blender '+bpy.app.version_string,'reference':'user supplied miniature stadium image, 2026-10-22','high':high,'economy':economy},indent=2)+'\n')
print('BANANA_REFERENCE_DONE',high,economy,flush=True)
