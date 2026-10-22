import bpy, math, json, os, sys
from mathutils import Vector
PARTS=[]
def mat(c):
 if isinstance(c,str): c=tuple(int(c.lstrip('#')[i:i+2],16)/255 for i in (0,2,4))
 name='C_'+str(c); m=bpy.data.materials.get(name)
 if not m:
  m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.78
 return m
def finish(o,n,c):
 o.name=n;o.data.materials.append(mat(c));PARTS.append(o)
 for p in o.data.polygons:p.use_smooth=True
 return o
def ell(n,p,s,c,seg=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p);o=bpy.context.object;o.scale=s;return finish(o,n,c)
def box(n,p,s,c,bevel=.12):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Soft toy edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,n,c)
def rod(n,a,b,r,c,r2=None):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return finish(o,n,c)
def path(n,pts,r,c):
 for i in range(len(pts)-1):rod(n+str(i),pts[i],pts[i+1],r,c);ell(n+' joint'+str(i),pts[i],(r,r,r),c,12,6)
 ell(n+' end',pts[-1],(r,r,r),c,12,6)
def poly(n,verts,c,thick=.07):
 # points in XZ plane at given y, extruded in Y
 v=[(x,y-thick/2,z) for x,y,z in verts]+[(x,y+thick/2,z) for x,y,z in verts];N=len(verts)
 faces=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],faces);me.update();o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);return finish(o,n,c)
def eyes(x,y,z,spread=.12,size=.065,white='#fff9e9',pupil='#162435'):
 for side in [-1,1]:
  ell('eye white',(x+side*spread,y,z),(size,size*.45,size*1.15),white);ell('pupil',(x+side*spread,y-size*.4,z),(size*.43,size*.20,size*.65),pupil,12,8)
def humanoid(skin='#efb68c',shirt='#d53c43',pants='#244b8f',hair='#533526',wide=1):
 ell('torso',(0,0,1.15),(.36*wide,.24,.43),shirt)
 for side in [-1,1]:
  rod('leg',(side*.17,0,.85),(side*.18,0,.28),.14,pants)
  ell('boot',(side*.18,-.10,.15),(.18,.28,.15),'#49352e')
  rod('upper arm',(side*.31*wide,0,1.39),(side*.46*wide,-.015,1.02),.12,shirt)
  ell('hand',(side*.47*wide,-.04,.91),(.13,.12,.15),skin)
 ell('hair',(0,.04,1.94),(.33,.26,.36),hair)
 ell('head',(0,-.03,1.91),(.32,.27,.33),skin)
 eyes(0,-.29,1.99)
 ell('nose',(0,-.33,1.87),(.075,.08,.09),skin)
 return None
