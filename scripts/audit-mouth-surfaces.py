"""Read-only face-surface and shipping-geometry checks for the audited mouths.
Blender --background --threads 1 --python-exit-code 1 --python this.py
"""
import bpy,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
spec=json.loads((ROOT/'scripts/mouth-repair-targets.json').read_text());records=[]
def surface(hosts,p):
 hits=[]
 for obj in hosts:
  inv=obj.matrix_world.inverted();hit,point,_,_=obj.ray_cast(inv@Vector((p.x,-3,p.z)),inv.to_3x3()@Vector((0,1,0)))
  if hit:hits.append(obj.matrix_world@point)
 return min(hits,key=lambda p:p.y) if hits else None
for row in spec['targets']:
 id=row['id'];pack='extra-mile' if id.startswith('extra-mile-') else 'leaf' if id.startswith('leaf-') else 'second-wind' if (ROOT/'assets/blender/second-wind'/f'{id}.blend').exists() else 'base'
 source=ROOT/'assets/blender'/pack/f'{id}.blend' if pack!='base' else ROOT/'assets/blender/toy-racers.blend'
 bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.view_layer.update()
 edit=bpy.data.objects['EDIT-'+id];game=bpy.data.objects['toy_'+id];mouth=bpy.data.objects[row['mouth']]
 assert mouth.get('surfaceRepairVersion')==spec['version'],id
 original=json.loads(mouth['surfaceRepairOriginal'])['points'];coeff=np.polyfit([p[0] for p in original],[-p[1] for p in original],2)
 hosts=[bpy.data.objects[name] for name in row['hosts']]
 hosts.extend(o for o in edit.children if any(tag in o.name for tag in ('-snout-','-muzzle-','-long-grin-')))
 if id=='leaf-thespian':hosts.extend(o for o in edit.children if '-stage-beard-' in o.name)
 if id=='blunderdog':hosts.extend(o for o in edit.children if '-nose-' in o.name)
 if id=='extra-mile-saint-nick':hosts.extend(o for o in edit.children if '-long-beard-' in o.name)
 gaps=[];points=[mouth.matrix_world@v.co for v in mouth.data.vertices]
 for point,old in zip(points,original):
  hit=surface(hosts,point);assert hit is not None,(id,'missing facial host',list(point))
  thickness=-old[1]-float(np.polyval(coeff,old[0]));gaps.append(hit.y-point.y-thickness)
 assert min(gaps)>.00399 and max(gaps)<.00401,(id,min(gaps),max(gaps))
 tree=BVHTree.FromPolygons(points,[list(p.vertices) for p in mouth.data.polygons]);matched=0
 for obj in game.children:
  if obj.type!='MESH' or not obj.data.materials or obj.data.materials[0]!=mouth.data.materials[0]:continue
  for vertex in obj.data.vertices:
   hit=tree.find_nearest(obj.matrix_world@vertex.co)
   if hit[0] is not None and hit[3]<.00001:matched+=1
 assert matched>=8,(id,'shipping mouth no longer agrees with editable source',matched)
 eyes=len([o for o in edit.children if '-eye-white-' in o.name])
 if id=='extra-mile-thief':assert eyes==2,eyes
 glb=ROOT/'public/models'/pack/f'{id}.glb' if pack!='base' else ROOT/'public/models/toy-racers.glb'
 records.append({'id':id,'source':str(source.relative_to(ROOT)).replace('\\','/'),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'mouth':mouth.name,'hosts':list(dict.fromkeys(o.name for o in hosts)),'minCentrelineGap':round(min(gaps),8),'maxCentrelineGap':round(max(gaps),8),'sourceVertices':len(points),'matchedShippingVertices':matched,'eyePairs':eyes/2})
 print('MOUTH_SURFACE_PASSED',id,matched,flush=True)
out=ROOT/'docs/evidence/refinement-20261022/mouth-surface-repair.json';out.write_text(json.dumps({'version':spec['version'],'passed':True,'targetGap':spec['gap'],'models':records},indent=2)+'\n')
print('ALL_MOUTH_SURFACES_PASSED',len(records),flush=True)
