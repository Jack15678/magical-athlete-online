"""Read-only close-up/front rendering for Switcharoo's centred mouth repair."""
import bpy,math,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
label=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--label=')),'after')
if '--refresh-master' in sys.argv:
    master=ROOT/'assets/blender/second-wind.blend'
    bpy.ops.wm.open_mainfile(filepath=str(master))
    old=bpy.data.objects['toy_switcharoo']
    reviews=[o for o in bpy.data.objects if o.name.startswith('QA-toy_switcharoo')]
    review_matrix=reviews[0].matrix_world.copy() if reviews else None
    for obj in [*old.children,old,*reviews]: bpy.data.objects.remove(obj,do_unlink=True)
    with bpy.data.libraries.load(str(ROOT/'assets/blender/second-wind/switcharoo.blend'),link=False) as (available,loaded):
        loaded.objects=[name for name in available.objects if name=='toy_switcharoo' or name.startswith('switcharoo_toy-sw-')]
    for obj in loaded.objects:
        bpy.context.scene.collection.objects.link(obj); obj.hide_render=True; obj.hide_set(True)
    if review_matrix:
        for child in bpy.data.objects['toy_switcharoo'].children:
            obj=bpy.data.objects.new('QA-toy_switcharoo',child.data); bpy.context.scene.collection.objects.link(obj); obj.matrix_world=review_matrix
    bpy.ops.wm.save_as_mainfile(filepath=str(master),compress=True)
path=ROOT/'.local/second-wind-research/switcharoo-before.blend' if label=='before' else ROOT/'assets/blender/second-wind/switcharoo.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
scene=bpy.context.scene
for obj in scene.objects: obj.hide_render=True
root=bpy.data.objects['toy_switcharoo']
for obj in [root,*root.children]: obj.hide_render=False; obj.hide_set(False)
camera_data=bpy.data.cameras.new('Switcharoo-QA'); camera=bpy.data.objects.new('Switcharoo-QA',camera_data); scene.collection.objects.link(camera); scene.camera=camera; camera_data.type='ORTHO'
target=Vector((0,0,.49))
for name,location,energy,size in [('Key',(-3,-4,6),350,4),('Fill',(4,-1,3),200,4),('Rim',(0,3,5),300,3)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location; obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.25,.25,.25); scene.render.engine='CYCLES'; scene.cycles.samples=8; scene.cycles.use_denoising=True; scene.render.threads_mode='FIXED'; scene.render.threads=1
scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'; scene.render.resolution_percentage=100
directory=ROOT/'docs/evidence/second-wind'; directory.mkdir(parents=True,exist_ok=True)
head=next(o for o in bpy.data.objects['EDIT-switcharoo'].children if '-kangaroo-head-' in o.name)
head_centre=sum((Vector(v) for v in head.bound_box),Vector())/8
views=[('face',Vector((head_centre.x,0,head_centre.z)),.39,(640,640))]
if label!='before': views.append(('front',Vector((0,0,.49)),1.12,(640,800)))
for view,target,scale,resolution in views:
    camera.location=(target.x,-4,target.z); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); camera_data.ortho_scale=scale
    scene.render.resolution_x,scene.render.resolution_y=resolution; scene.render.filepath=str(directory/('switcharoo-'+label+'-'+view+'.png')); bpy.ops.render.render(write_still=True)
print('SWITCHAROO_QA_RENDERED',label,flush=True)
