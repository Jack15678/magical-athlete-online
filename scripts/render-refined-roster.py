"""Render the shipping GLBs in actual Blender; front sheets also supply avatars."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'docs/evidence/refinement-20261022';QA.mkdir(parents=True,exist_ok=True)
packs=[a.split('=',1)[1] for a in sys.argv if a.startswith('--pack=')] or ['extra-mile','leaf']
for pack in packs:
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
    manifest=json.loads((ROOT/'public/models'/pack/'manifest.json').read_text())
    models=manifest['models'];cols=7 if pack=='extra-mile' else 6;rows=math.ceil(len(models)/cols);roots=[]
    for i,model in enumerate(models):
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/pack/(model['id']+'.glb')))
        root=bpy.data.objects[model['node']];root.animation_data_clear();root.location=((i%cols-(cols-1)/2)*1.109333,0,(rows-1-i//cols)*1.3+.15);roots.append(root)
        text=bpy.data.curves.new('QA-label','FONT');text.body=model['id'].replace('extra-mile-','').replace('leaf-','');text.size=.075;text.align_x='CENTER';ob=bpy.data.objects.new('QA-label',text);scene.collection.objects.link(ob);ob.location=(root.location.x,-.05,root.location.z-.11);ob.rotation_euler=(math.pi/2,0,0)
    cd=bpy.data.cameras.new('QA-camera');cam=bpy.data.objects.new('QA-camera',cd);scene.collection.objects.link(cam);target=Vector((0,0,rows*1.3/2));cam.location=(0,-20,target.z);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=cols*1.109333;scene.camera=cam
    for name,loc,energy,size in [('Key',(-4,-5,10),900,6),('Fill',(5,-3,5),500,5),('Rim',(0,4,8),800,4)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
    scene.world=bpy.data.worlds.new('Toy-background');scene.world.color=(.25,.3,.27);scene.render.engine='CYCLES';scene.cycles.samples=3;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=cols*256;scene.render.resolution_y=rows*300;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
    for view,angle in [('front',0),('side',-math.pi/2),('back',math.pi)]:
        for root in roots:root.rotation_euler.z=angle
        scene.render.filepath=str(QA/(pack+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    print('ROSTER_RENDERED',pack,len(models),flush=True)
