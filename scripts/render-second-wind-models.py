"""Render the editable shipping source and crop authored local avatar previews.
Uses the source's actual game mesh instances and keeps editing parts untouched.
blender --background --threads 1 --python scripts/render-second-wind-models.py
"""
import bpy,math,json
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'docs/evidence/second-wind'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/second-wind.blend'))
scene=bpy.context.scene; scene.cycles.samples=6; scene.render.threads_mode='FIXED'; scene.render.threads=4
objects=[o for o in scene.objects if o.name.startswith('QA-toy_')]
original={o.name:o.matrix_world.copy() for o in objects}
for view,angle in [('front',0),('side',-math.pi/2),('back',math.pi)]:
    for obj in objects:
        m=original[obj.name]; p=m.translation; obj.matrix_world=Matrix.Translation(p) @ Matrix.Rotation(angle,4,'Z')
    scene.render.filepath=str(QA/('all-36-'+view+'.png')); bpy.ops.render.render(write_still=True)
    print('RENDERED_SECOND_WIND',view,flush=True)
