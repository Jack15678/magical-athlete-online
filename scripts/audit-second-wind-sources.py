"""Read-only Blender source and closed-volume audit; writes inspectable QA evidence."""
import bpy,bmesh,json,hashlib
from pathlib import Path
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
    records.append(record)
    assert boundaries==0 and loose==0, 'All game components need closed volume: '+str(record)
out=ROOT/'docs/evidence/second-wind/source-audit.json'; out.write_text(json.dumps({'blender':bpy.app.version_string,'sources':records,'passed':True},indent=2)+'\n',encoding='utf8')
print('SOURCE_AUDIT_PASSED',len(records),flush=True)
