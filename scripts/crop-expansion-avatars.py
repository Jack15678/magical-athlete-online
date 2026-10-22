"""192px avatars cropped from our Blender renders, without copying author art."""
from pathlib import Path
from PIL import Image, ImageOps
import json
ROOT=Path(__file__).resolve().parents[1]
for pack,cols in [('extra-mile',7),('leaf',6)]:
    folder=ROOT/'public/models'/pack;avatars=folder/'avatars';avatars.mkdir(exist_ok=True)
    manifest=json.loads((folder/'manifest.json').read_text())
    image=Image.open(ROOT/'docs/evidence/refinement-20261022'/(pack+'-front.png')).convert('RGBA')
    for i,model in enumerate(manifest['models']):
        x=i%cols*256;y=i//cols*300
        crop=image.crop((x,y+18,x+256,y+274));bbox=crop.getbbox()
        if bbox:crop=crop.crop(bbox)
        sculpture=ImageOps.contain(crop,(170,170),Image.Resampling.LANCZOS)
        avatar=Image.new('RGBA',(192,192));avatar.alpha_composite(sculpture,((192-sculpture.width)//2,(192-sculpture.height)//2))
        avatar.save(avatars/(model['id']+'.png'),optimize=True)
        model['avatar']='/models/'+pack+'/avatars/'+model['id']+'.png'
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('MODEL_AVATARS',pack,len(manifest['models']))
