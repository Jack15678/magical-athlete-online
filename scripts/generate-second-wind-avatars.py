"""Crop game-model previews out of the real Blender front render, no source art copied.
Run with a Python runtime containing Pillow after render-second-wind-models.py.
"""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'public/models/second-wind'
manifest=json.loads((out/'manifest.json').read_text(encoding='utf8'))
image=Image.open(ROOT/'docs/evidence/second-wind/all-36-front.png').convert('RGB')
for i,model in enumerate(manifest['models']):
    x=(i%6)*300; y=(i//6)*360
    # Omit the label below each sculpture; 192px keeps model-review previews small.
    crop=image.crop((x+10,y+35,x+290,y+315)).resize((192,192),Image.Resampling.LANCZOS)
    crop.save(out/'avatars'/(model['id']+'.png'),optimize=True)
print('Generated',len(manifest['models']),'local 192px game-sculpture previews.')
