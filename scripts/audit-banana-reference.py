"""Read-only face/peel contact audit for the shipping reference banana."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/blender/banana.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
edit=bpy.data.objects['EDIT-banana'];body=next(o for o in edit.children if 'continuous-curved-peel' in o.name)
bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons])
mouth=next(o for o in edit.children if 'centred-smile' in o.name);samples=[]
for i in range(0,len(mouth.data.vertices),8):
    points=[v.co for v in mouth.data.vertices[i:i+8]];centre=sum(points,Vector())/len(points)
    hit=bvh.ray_cast(Vector((centre.x,-3,centre.z)),Vector((0,1,0)))[0]
    assert hit is not None,'Mouth centre sample falls outside peel silhouette'
    samples.append({'point':list(centre),'surfaceGap':hit.y-centre.y})
assert all(.003<=s['surfaceGap']<=.006 for s in samples)
eyes=[]
for eye in [o for o in edit.children if 'eye-white' in o.name]:
    verts=[v.co for v in eye.data.vertices];centre=(Vector(tuple(min(p[k] for p in verts) for k in range(3)))+Vector(tuple(max(p[k] for p in verts) for k in range(3))))/2
    hit=bvh.ray_cast(Vector((centre.x,-3,centre.z)),Vector((0,1,0)))[0];assert hit is not None,'Eye centre lies outside the banana'
    back=max(p.y for p in verts);gap=hit.y-back;assert -.018<gap<.003,'Eye must contact/intersect peel rather than float'
    eyes.append({'name':eye.name,'centre':list(centre),'backGap':gap})
assert len(eyes)==2
record={'passed':True,'source':'assets/blender/banana.blend','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'mouthSurfaceSamples':samples,'eyes':eyes,'glbSha256':{name:hashlib.sha256((ROOT/'public/models/banana'/name).read_bytes()).hexdigest() for name in ('banana.glb','banana-economy.glb')}}
path=ROOT/'docs/evidence/refinement-20261022/banana-face-audit.json';path.write_text(json.dumps(record,indent=2)+'\n')
print('BANANA_FACE_CONTACT_PASSED',len(samples),[round(s['surfaceGap'],6) for s in (samples[0],samples[len(samples)//2],samples[-1])],eyes,flush=True)
