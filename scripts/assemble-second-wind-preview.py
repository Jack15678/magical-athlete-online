"""Create a lightweight inspectable master from individually editable .blend sources."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'public/models/second-wind/manifest.json').read_text(encoding='utf8'))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.render.fps=30
for model in manifest['models']+manifest['variants']:
    with bpy.data.libraries.load(str(ROOT/model['editableSource']),link=False) as (available,loaded):
        loaded.objects=[name for name in available.objects if name==model['node'] or name.startswith(model['id']+'_toy-sw-')]
    for ob in loaded.objects:
        scene.collection.objects.link(ob); ob.hide_render=True; ob.hide_set(True)
for index,model in enumerate(manifest['models']):
    root=bpy.data.objects[model['node']]; x=(index%6-2.5)*1.375; z=(5-index//6)*1.65+.28
    for child in root.children:
        ob=bpy.data.objects.new('QA-'+model['node'],child.data); scene.collection.objects.link(ob); ob.matrix_world=Matrix.Translation((x,0,z))
    data=bpy.data.curves.new('QA-label','FONT'); data.body=model['id']; data.align_x='CENTER'; data.size=.085; ob=bpy.data.objects.new('QA-label',data); scene.collection.objects.link(ob); ob.location=(x,-.05,z-.12); ob.rotation_euler=(math.pi/2,0,0)
    if bpy.data.materials.get('toy-sw-paper'): data.materials.append(bpy.data.materials['toy-sw-paper'])
camera_data=bpy.data.cameras.new('SecondWind-review-camera'); camera=bpy.data.objects.new('SecondWind-review-camera',camera_data); scene.collection.objects.link(camera)
target=Vector((0,0,4.95)); camera.location=(0,-15,4.95); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); camera_data.type='ORTHO'; camera_data.ortho_scale=9.9; scene.camera=camera
for name,loc,energy,size in [('Key',(-4,-5,10),950,6),('Fill',(5,-2,5),650,5),('Rim',(0,4,8),1100,4)]:
    light=bpy.data.lights.new(name,'AREA'); light.energy=energy; light.shape='DISK'; light.size=size; ob=bpy.data.objects.new(name,light); scene.collection.objects.link(ob); ob.location=loc; ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.19,.19,.19); scene.render.engine='CYCLES'; scene.cycles.samples=6; scene.cycles.use_denoising=True; scene.render.threads_mode='FIXED'; scene.render.threads=1
scene.render.resolution_x=1800; scene.render.resolution_y=2160; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/second-wind.blend'),compress=True)
print('ASSEMBLED_SECOND_WIND',len(manifest['models']),flush=True)
