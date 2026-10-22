"""Read-only Blender source and closed-volume audit; writes inspectable QA evidence."""
import bpy,bmesh,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'public/models/second-wind/manifest.json').read_text(encoding='utf8'))
records=[]
for model in manifest['models']+manifest['variants']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/model['editableSource']))
    edit=bpy.data.objects.get('EDIT-'+model['id']); root=bpy.data.objects.get(model['node'])
    assert edit is not None and root is not None
    assert len(edit.children)>=5, 'Editable named construction must remain present (Null has only a void and two pairs of eye parts)'
    assert all(o.name.startswith('GEO-') for o in edit.children)
    assert sorted(a.name for a in bpy.data.actions)==['fall','idle','move','recover','skill']
    boundaries=0; loose=0
    for child in root.children:
        bm=bmesh.new(); bm.from_mesh(child.data)
        boundaries+=sum(e.is_boundary for e in bm.edges); loose+=sum(e.is_wire for e in bm.edges); bm.free()
    record={'id':model['id'],'source':model['editableSource'],'sourceSha256':hashlib.sha256((ROOT/model['editableSource']).read_bytes()).hexdigest(),'glbSha256':hashlib.sha256((ROOT/'public/models/second-wind'/(model['id']+'.glb')).read_bytes()).hexdigest(),'editableParts':len(edit.children),'gameMeshes':len(root.children),'boundaryEdges':boundaries,'looseEdges':loose,'clips':sorted(a.name for a in bpy.data.actions)}
    if model['id']=='switcharoo':
        centre=lambda obj: sum((Vector(v) for v in obj.bound_box),Vector())/8
        head=next(o for o in edit.children if '-kangaroo-head-' in o.name)
        snout=next(o for o in edit.children if '-kangaroo-snout-' in o.name)
        smile=next(o for o in edit.children if '-centred-smile-' in o.name)
        nostrils=[o for o in edit.children if '-nostril-' in o.name]
        record['facialAlignment']={'headX':centre(head).x,'snoutX':centre(snout).x,'smileX':centre(smile).x,'nostrilMidpointX':sum(centre(o).x for o in nostrils)/len(nostrils),'nostrils':len(nostrils)}
        assert max(abs(record['facialAlignment'][key]-centre(head).x) for key in ('snoutX','smileX','nostrilMidpointX'))<.00001
    records.append(record)
    assert boundaries==0 and loose==0, 'All game components need closed volume: '+str(record)
out=ROOT/'docs/evidence/second-wind/source-audit.json'; out.write_text(json.dumps({'blender':bpy.app.version_string,'sources':records,'passed':True},indent=2)+'\n',encoding='utf8')
print('SOURCE_AUDIT_PASSED',len(records),flush=True)
