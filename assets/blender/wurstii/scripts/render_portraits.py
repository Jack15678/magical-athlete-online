"""Render all completed Blender sources uniformly using Eevee; geometry is unchanged."""
import bpy,os,json,sys,time
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chars=json.load(open(ROOT+'/characters.json'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for ch in chars:
 if args and ch['id'] not in args:continue
 ready=os.environ.get('WURSTII_READY_FILE')
 while ready and ch['id'] not in json.load(open(ready)):time.sleep(2)
 p=ROOT+'/blend/'+ch['id']+'.blend';bpy.ops.wm.open_mainfile(filepath=p)
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE_NEXT';sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.resolution_percentage=100
 sc.render.film_transparent=True;sc.render.image_settings.color_mode='RGBA';sc.render.image_settings.file_format='PNG';sc.render.filepath=ROOT+'/'+ch['portraitFile'];sc.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=p,compress=True);bpy.ops.render.render(write_still=True)
 print('PORTRAIT_DONE',ch['id'],flush=True)
