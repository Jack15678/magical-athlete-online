import bpy,sys,os,json,math
from mathutils import Vector
DIR=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,DIR)
import toy
OUT=os.path.dirname(DIR)
CHARS=json.load(open(OUT+'/characters.json'))
for d in ['models','portraits','blend','views','reports']:os.makedirs(OUT+'/'+d,exist_ok=True)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def render_setup():
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=False;sc.render.film_transparent=True
 sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.resolution_percentage=100
 sc.world.color=(.5,.5,.5)
 sc.view_settings.view_transform='AgX'
 for name,loc,power,size in [('Key',(-3,-4,5),450,4),('Fill',(4,-2,3),250,3),('Rim',(0,3,4),500,3)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,.45))
 bpy.ops.object.camera_add(location=(1.4,-3,1.3));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.2;sc.camera=cam;aim(cam,(0,0,.43));return cam

def build(ch):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);toy.PARTS.clear()
 ident=ch['id']
 if ident in ['wurstii-mario','wurstii-magikarp','wurstii-fluffin-puffins','wurstii-bullet-bill','wurstii-mr-game-and-watch','wurstii-spot','wurstii-piranha-plant']:import batch_special as mod
 elif ident in ['wurstii-bart-simpson','wurstii-dr-wily','wurstii-eric','wurstii-hoagie','wurstii-jason-vorhees','wurstii-olaf','wurstii-pitfall-harry','wurstii-simon-belmont','wurstii-rollercoaster-tycoon-guest','wurstii-rockford','wurstii-burt']:import batch_humans as mod
 else:import batch_animals as mod
 mod.build(ident)
 # bake each component's material to corner vertex colors, shared single matte draw
 m=bpy.data.materials.new('Toy matte vertex palette');m.use_nodes=True;nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.82;bs.inputs['Specular IOR Level'].default_value=.25
 vc=nt.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';nt.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
 for o in toy.PARTS:
  ca=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  color=o.data.materials[0].diffuse_color[:]
  # Material swatches authored in display sRGB, convert to linear vertex values
  color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color[:3])+(1,)
  for loop in ca.data:loop.color=color
  o.data.materials.clear();o.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT')
 for o in toy.PARTS:o.select_set(True)
 bpy.context.view_layer.objects.active=toy.PARTS[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=ident+'_geometry'
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 # bake world coordinates, preserve subparts as disconnected but editable mesh islands
 coords=[mesh.matrix_world @ v.co for v in mesh.data.vertices];lo=Vector([min(v[i] for v in coords) for i in range(3)]);hi=Vector([max(v[i] for v in coords) for i in range(3)]);dim=hi-lo
 factor=min(.88/dim.z,.54/dim.x,.54/dim.y);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 for v,p in zip(mesh.data.vertices,coords):v.co=(p-center)*factor
 mesh.location=(0,0,0);mesh.rotation_euler=(0,0,0);mesh.scale=(1,1,1)
 mesh.data.calc_loop_triangles();tri=len(mesh.data.loop_triangles)
 if tri>7800:
  dec=mesh.modifiers.new('Mobile triangle budget','DECIMATE');dec.ratio=7700/tri;bpy.context.view_layer.objects.active=mesh;bpy.ops.object.modifier_apply(modifier=dec.name)
 mesh.data.calc_loop_triangles();tri=len(mesh.data.loop_triangles)
 root=bpy.data.objects.new(ch['rootNode'],None);bpy.context.collection.objects.link(root);mesh.parent=root
 root['characterId']=ident;root['nameZh']=ch['nameZh'];root['back_design']='Inferred from supplied front sprite';root['portrait_method']='Blender 3D render, not hand-drawn'
 for name,end,states in [('idle',48,[(1,0,1,1),(24,0,1.025,.99),(48,0,1,1)]),('move',24,[(1,0,1,1),(6,0,.90,1.04),(12,.06,1.03,.99),(18,0,.94,1.03),(24,0,1,1)]),('skill',36,[(1,0,1,1),(12,0,.90,1.05),(22,.045,1.06,.97),(36,0,1,1)])]:
  root.animation_data_create();act=bpy.data.actions.new(name);root.animation_data.action=act
  for f,z,h,w in states:
   root.location=(0,0,z);root.scale=(w,w,h);root.keyframe_insert(data_path='location',frame=f);root.keyframe_insert(data_path='scale',frame=f)
  track=root.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,act);root.animation_data.action=None
 root.location=(0,0,0);root.scale=(1,1,1)
 sc=bpy.context.scene;sc.render.fps=24;sc.frame_set(1)
 bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);root.select_set(True);bpy.context.view_layer.objects.active=root
 path=OUT+'/'+ch['modelFile']
 bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
 cam=render_setup();sc.cycles.samples=128;sc.render.resolution_x=1024;sc.render.resolution_y=1024
 # camera frame centered on actual normalized height, keeps entire geometry and margin
 height=dim.z*factor;cam.data.ortho_scale=max(1.02,dim.x*factor*1.4);aim(cam,(0,0,height/2));sc.render.filepath=OUT+'/'+ch['portraitFile'];sc.render.engine='BLENDER_EEVEE_NEXT';bpy.ops.wm.save_as_mainfile(filepath=OUT+'/blend/'+ident+'.blend')
 if not os.environ.get('SKIP_PORTRAIT'):bpy.ops.render.render(write_still=True)
 # Reimport actual delivered GLB into empty scene for orthographic audits
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=path)
 cam=render_setup();sc.render.resolution_x=512;sc.render.resolution_y=512;cam.data.ortho_scale=1.06
 for view,pos in [('front',(0,-3,height/2)),('side',(3,0,height/2)),('back',(0,3,height/2))]:
  cam.location=pos;aim(cam,(0,0,height/2));sc.render.filepath=OUT+'/views/'+ident+'_'+view+'.png';bpy.ops.render.render(write_still=True)
 print('DONE',ident,tri,flush=True)
 json.dump({'id':ident,'nameZh':ch['nameZh'],'triangles':tri,'modelFile':ch['modelFile'],'portraitFile':ch['portraitFile'],'blendFile':'blend/'+ident+'.blend','animations':['idle','move','skill'],'portraitMethod':'Blender transparent 3D render','backside':'inferred','modelBytes':os.path.getsize(path)},open(OUT+'/reports/'+ident+'.json','w'),ensure_ascii=False,indent=2)

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for ch in CHARS:
 if not args or ch['id'] in args:build(ch)
