"""Blender 5.2: refine the established 36 toy designs, save editable source, export GLB.

node scripts/generate-3d-assets.mjs --blender-source
blender --background --python scripts/refine-blender-models.py -- --samples
blender --background --python scripts/refine-blender-models.py
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
SOURCE = ROOT / 'assets' / 'blender'
QA = ROOT / 'docs' / 'evidence' / 'blender'
for path in (OUT, SOURCE, QA): path.mkdir(parents=True, exist_ok=True)
data = json.loads((ROOT / 'tmp' / 'blender-source.json').read_text(encoding='utf8'))
SAMPLES = '--samples' in sys.argv
designed = [d for d in data['designs'] if not SAMPLES or d['id'] in ('hare', 'gunk')]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30
C = Matrix.Rotation(math.pi / 2, 4, 'X')  # original +Y up/+Z face -> Blender +Z up/-Y face
materials = {}
for name, value in data['colors'].items():
    rgb = tuple(int(value[i:i+2], 16) / 255 for i in (1, 3, 5))
    linear = tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)
    m = bpy.data.materials.new('toy-' + name); m.use_nodes = True
    m.node_tree.nodes.clear()
    bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = .62 if name == 'paper' else .48
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Coat Weight'].default_value = .12
    bsdf.inputs['Coat Roughness'].default_value = .5
    m.diffuse_color = (*linear, 1); materials[m.name] = m

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    if objects: bpy.context.view_layer.objects.active = objects[0]

def finish(obj, name, color, matrix, parent):
    obj.name = name
    obj.data.transform(matrix @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.materials.clear(); obj.data.materials.append(materials[color])
    obj.parent = parent
    for face in obj.data.polygons: face.use_smooth = True
    return obj

def orb(name, color, location, size, parent, segments=16):
    if isinstance(size, (int, float)): size = (size,) * 3
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=10, radius=1)
    result = finish(bpy.context.object, 'GEO-' + name, 'toy-' + color,
                    C @ Matrix.Translation(location) @ Matrix.Diagonal((*size, 1)), parent)
    result['part_type'] = 'SphereGeometry'
    return result

def line(name, color, points, radius, parent):
    cv = bpy.data.curves.new(name, 'CURVE'); cv.dimensions = '3D'
    cv.resolution_u = 8; cv.bevel_depth = radius; cv.bevel_resolution = 2; cv.use_fill_caps = True
    spline = cv.splines.new('BEZIER'); spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points): p.co = co; p.handle_left_type = 'AUTO'; p.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new('GEO-' + name, cv); scene.collection.objects.link(obj)
    select([obj]); bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object, 'GEO-' + name, 'toy-' + color, C, parent)

def base_part(part, parent):
    p, typ = part['parameters'], part['type']
    matrix = Matrix([part['matrix'][i:i+4] for i in range(0, 16, 4)]).transposed()
    if parent.name == 'EDIT-blimp' and typ == 'TorusGeometry':
        matrix.translation.x = -.15  # Keep the airship band clear of both eyes.
    if typ == 'SphereGeometry':
        radius = max(matrix.to_scale())
        segments, rings = (24, 16) if radius > .15 else (14, 10) if radius > .035 else (10, 8)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
        obj = finish(bpy.context.object, part['name'], part['color'], C @ matrix, parent)
    else:
        points = part['positions']; verts = [points[i:i+3] for i in range(0, len(points), 3)]
        indices = part['indices'] or list(range(len(verts)))
        faces = [indices[i:i+3] for i in range(0, len(indices), 3)]
        mesh = bpy.data.meshes.new(part['name']); mesh.from_pydata(verts, [], faces); mesh.update()
        obj = bpy.data.objects.new(part['name'], mesh); scene.collection.objects.link(obj)
        finish(obj, part['name'], part['color'], C @ matrix, parent)
        if typ in ('BoxGeometry', 'CylinderGeometry', 'ConeGeometry'):
            bm = bmesh.new(); bm.from_mesh(mesh)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
            bmesh.ops.dissolve_limit(bm, angle_limit=.0001, verts=list(bm.verts), edges=list(bm.edges))
            bm.to_mesh(mesh); bm.free()
            bevel = obj.modifiers.new('Soft molded edge', 'BEVEL')
            bevel.width = .008 if typ == 'BoxGeometry' else .004
            bevel.segments = 3; bevel.limit_method = 'ANGLE'
            bevel.angle_limit = .45
            bevel.harden_normals = True
            weighted = obj.modifiers.new('Stable toy normals', 'WEIGHTED_NORMAL'); weighted.keep_sharp = True
    obj['part_type'] = typ
    if typ == 'SphereGeometry' and matrix.translation.y <= .075 and max(matrix.to_scale()) < .13:
        obj['foot'] = True
    if part.get('role') == 'eye-pupil':
        # Molded glints sit on the front surface, rather than a flat eye decal.
        v = matrix.translation; scale = matrix.to_scale()
        orb(part['name'] + '-glint', 'paper', (v.x - scale.x * .22, v.y + scale.y * .28, v.z + scale.z * .95),
            (scale.x * .3, scale.y * .2, scale.z * .18), parent, 10)
    return obj

def connect_feet(root):
    """Artist-placed short legs: never connect a shoe through a coat or to a prop."""
    id = root.name.removeprefix('EDIT-')
    settings = {
        'alchemist': ('blue', .12, .2), 'cheerleader': ('pink', .12, .2),
        'dicemonger': ('yellow', .12, .32), 'egg': ('paper', .12, .23),
        'genius': ('yellow', .12, .17), 'heckler': ('red', .12, .31),
        'huge-baby': ('blue', .12, .22), 'hypnotist': ('blue', .12, .2),
        'mastermind': ('red', .12, .34), 'mouth': ('red', .12, .29),
        'party-animal': ('yellow', .12, .25), 'romantic': ('pink', .12, .4),
        'scoocher': ('blue', .12, .27), 'suckerfish': ('blue', .12, .35),
    }
    if id in settings:
        color, gap, end = settings[id]
        for d in (-1,1): line(id + '-ankle-' + str(d), color, [(d*gap,.09,.035),(d*gap,end,.015)], .038, root)
    elif id == 'copycat':
        for d, color in [(-1,'blue'),(1,'pink')]: line(id + '-ankle-' + str(d), color, [(d*.16,.09,.035),(d*.14,.19,.015)], .035, root)
    elif id == 'banana':
        line('banana-left-ankle', 'yellow', [(-.12,.09,.035),(-.14,.25,0)], .03, root)
        line('banana-right-ankle', 'yellow', [(.12,.09,.035),(.1,.42,0)], .03, root)
    elif id == 'inchworm':
        for i in range(4): line(id + '-leg-' + str(i), 'green', [(-.21+i*.14,.08,.09),(-.21+i*.14,.12+i*.07,.06)], .025, root)
    elif id == 'leaptoad':
        for d in (-1,1): line(id + '-leg-' + str(d), 'green', [(d*.21,.09,.035),(d*.18,.26,0)], .045, root)
    elif id == 'sisyphus':
        line('sisyphus-left-leg', 'yellow', [(-.13,.09,.035),(-.13,.22,.05)], .035, root)
        line('sisyphus-right-leg', 'yellow', [(.13,.09,.035),(-.03,.22,.05)], .035, root)

notes = {}
def refine(id, root):
    O = lambda tag, color, p, s: orb(id + '-' + tag, color, p, s, root)
    L = lambda tag, color, p, r=.01: line(id + '-' + tag, color, p, r, root)
    # Every existing design is distinct; refinements reinforce that design on all sides.
    if id == 'hare':
        O('belly', 'paper', (0, .36, .173), (.12, .15, .027))
        for d in (-1, 1):
            O('muzzle' + str(d), 'paper', (d * .043, .555, .206), (.053, .043, .037))
            O('inner-ear' + str(d), 'paper', (d * .12, .975, .049), (.035, .17, .014))
            L('shoulder' + str(d), 'yellow', [(d * .16, .49, 0), (d * .23, .43, .04), (d * .24, .34, .1)], .037)
            O('paw' + str(d), 'yellow', (d * .24, .34, .1), (.045, .055, .047))
            O('hock' + str(d), 'yellow', (d * .12, .16, .015), (.06, .11, .06))
            L('toe' + str(d), 'pink', [(d * .16 - .035, .09, .12), (d * .16, .094, .145), (d * .16 + .035, .09, .12)], .008)
        O('nose-tip', 'pink', (0, .576, .253), (.025, .019, .02))
        L('muzzle-mouth', 'ink', [(0,.561,.253),(0,.541,.248),(.021,.533,.243)], .006)
        notes[id] = 'Rounded muzzle, molded eye glints, inner ears, belly, connected arms/paws, toe seams, round rear tail'
    elif id == 'gunk':
        greens = [o for o in root.children if o.type == 'MESH' and o.data.materials[0].name == 'toy-green']
        select(greens); bpy.ops.object.join(); body = bpy.context.object
        remesh = body.modifiers.new('Continuous slime surface', 'REMESH'); remesh.mode = 'VOXEL'; remesh.voxel_size = .021; remesh.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        relax = body.modifiers.new('Organic surface relaxation', 'SMOOTH'); relax.factor = 1.2; relax.iterations = 5
        bpy.ops.object.modifier_apply(modifier=relax.name)
        decimate = body.modifiers.new('Mobile slime topology', 'DECIMATE'); decimate.ratio = .6
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        for i, (x, y, z, s) in enumerate([(-.14,.48,-.17,.035),(.17,.36,-.14,.046),(0,.6,-.13,.027),(.2,.5,.03,.024)]): O('rear-bubble' + str(i), 'aqua', (x,y,z), s)
        notes[id] = 'Voxel-fused asymmetrical slime body, relaxed continuous side/back surface, molded eyes, rear and side bubbles'
    else:
        # Each row is a unique physical detail, authored in original toy coordinates.
        specs = {
          'alchemist': [('flask-rim','paper',[(.061,.69,0),(.085,.72,.04),(.065,.76,.02)],.012),('rear-flask-seam','aqua',[(0,.2,-.13),(.12,.35,-.17),(.09,.5,-.12)],.009)],
          'baba-yaga': [('back-window-a','orange',[(-.1,.58,-.163),(.1,.58,-.163)],.014),('back-window-b','orange',[(0,.48,-.163),(0,.68,-.163)],.014),('roof-ridge','paper',[(-.23,.85,-.19),(0,1.02,0),(.23,.85,.19)],.01)],
          'banana': [('peel-back-ridge','orange',[(-.19,.21,-.07),(.02,.4,-.1),(.18,.72,-.08),(.14,.92,-.045)],.012)],
          'blimp': [('back-gore','paper',[(-.23,.61,-.1),(0,.79,-.12),(.23,.61,-.1)],.01)],
          'centaur': [('mane','ink',[(0,.94,.03),(0,.81,-.07),(0,.67,-.07)],.028),('saddle-seam','yellow',[(-.18,.35,-.12),(0,.41,-.15),(.18,.35,-.12)],.013)],
          'cheerleader': [('ponytail','pink',[(.15,.83,-.08),(.22,.8,-.13),(.19,.64,-.16)],.04),('skirt-hem','yellow',[(-.17,.2,.09),(0,.18,.15),(.17,.2,.09)],.012)],
          'coach': [('cap-seam','paper',[(-.16,.94,0),(0,.95,-.15),(.16,.94,0)],.01),('jacket-back','paper',[(-.13,.5,-.09),(0,.35,-.18),(.13,.5,-.09)],.012)],
          'copycat': [('tail-blue','blue',[(-.16,.27,-.08),(-.25,.43,-.17),(-.18,.52,-.16)],.028),('tail-pink','pink',[(.16,.27,-.08),(.25,.43,-.17),(.18,.52,-.16)],.028)],
          'dicemonger': [('back-pip-a','red',[(-.12,.65,-.204),(-.12,.65,-.216)],.03),('back-pip-b','red',[(.12,.45,-.204),(.12,.45,-.216)],.03)],
          'duelist': [('coat-tail','red',[(-.08,.34,-.17),(0,.16,-.2),(.08,.34,-.17)],.037),('helmet-back','ink',[(-.13,.78,-.11),(0,.87,-.15),(.13,.78,-.11)],.017)],
          'egg': [('back-shell-crack','orange',[(-.19,.41,-.12),(-.08,.45,-.2),(0,.4,-.213),(.09,.45,-.19),(.19,.42,-.12)],.011)],
          'flip-flop': [('sole-seam','paper',[(-.18,.34,-.075),(0,.1,-.085),(.18,.34,-.075),(.17,.73,-.075)],.012)],
          'genius': [('brain-rear-fold','violet',[(-.17,.7,-.08),(-.08,.81,-.13),(.04,.74,-.135),(.16,.83,-.08)],.012)],
          'heckler': [('cup-back-rim','paper',[(-.18,.63,-.1),(0,.66,-.2),(.18,.63,-.1)],.012)],
          'huge-baby': [('diaper-back','paper',[(-.15,.27,-.08),(0,.33,-.17),(.15,.27,-.08)],.026)],
          'hypnotist': [('robe-back-fold','violet',[(-.12,.65,-.11),(-.06,.45,-.2),(-.12,.21,-.15)],.012)],
          'inchworm': [('back-segment-stripe','yellow',[(-.18,.25,-.11),(-.04,.34,-.12),(.1,.39,-.12),(.2,.49,-.12)],.012)],
          'lackey': [('apron-back-tie','paper',[(-.13,.43,-.12),(0,.46,-.18),(.13,.43,-.12)],.015)],
          'leaptoad': [('back-spot-a','yellow',[(-.12,.41,-.13),(-.11,.43,-.145)],.035),('back-spot-b','yellow',[(.12,.35,-.145),(.11,.37,-.16)],.026)],
          'legs': [('knee-a','paper',[(-.135,.39,.04),(-.15,.36,.065)],.046),('knee-b','paper',[(.135,.39,.04),(.15,.36,.065)],.046)],
          'lovable-loser': [('back-patch-stitch','yellow',[(-.07,.42,-.17),(0,.36,-.19),(.07,.42,-.17)],.013)],
          'magician': [('cape-collar','red',[(-.13,.57,-.08),(0,.52,-.17),(.13,.57,-.08)],.025),('hat-back-band','red',[(-.17,.83,-.02),(0,.83,-.196),(.17,.83,-.02)],.018)],
          'mastermind': [('chair-back-scroll','yellow',[(-.14,.7,-.16),(0,.76,-.17),(.14,.7,-.16)],.02)],
          'mouth': [('rear-lip-contour','pink',[(-.2,.45,-.09),(0,.55,-.19),(.2,.45,-.09)],.018)],
          'party-animal': [('back-confetti','pink',[(-.12,.45,-.16),(0,.38,-.19),(.12,.45,-.16)],.012)],
          'rocket-scientist': [('rear-panel-seam','blue',[(-.08,.66,-.14),(-.08,.38,-.14),(.08,.38,-.14),(.08,.66,-.14)],.009)],
          'romantic': [('heart-back-emboss','red',[(-.12,.68,-.114),(0,.5,-.121),(.12,.68,-.114)],.013)],
          'scoocher': [('seat-back-trim','paper',[(-.15,.29,-.08),(0,.3,-.1),(.2,.29,-.08)],.014)],
          'sisyphus': [('boulder-rear-vein','paper',[(-.05,.7,-.19),(.1,.78,-.21),(.22,.68,-.16)],.012)],
          'skipper': [('collar-back','paper',[(-.12,.57,-.09),(0,.45,-.18),(.12,.57,-.09)],.025)],
          'stickler': [('rear-ruler-edge','orange',[(-.13,.18,-.122),(-.13,.85,-.122)],.012)],
          'suckerfish': [('back-fin-ray','paper',[(-.21,.44,-.035),(-.07,.51,-.16),(.12,.46,-.15)],.01)],
          'third-wheel': [('rear-hub','yellow',[(0,.36,-.065),(0,.36,-.09)],.06)],
          'twin': [('rear-bond','yellow',[(-.12,.45,-.1),(0,.49,-.13),(.12,.45,-.1)],.024)],
        }
        for tag, color, points, radius in specs[id]: L(tag, color, points, radius)
        notes[id] = ', '.join(s[0] for s in specs[id]) + '; rounded molded edges, smoother organic surfaces and eye glints'

roots = []
stats = []
for design in designed:
    id = design['id']; root = bpy.data.objects.new('EDIT-' + id, None); scene.collection.objects.link(root)
    for part in design['parts']: base_part(part, root)
    refine(id, root)
    connect_feet(root)
    bpy.context.view_layer.update()
    all_vertices = [o.matrix_world @ Vector(v) for o in root.children if o.type == 'MESH' for v in o.bound_box]
    low = Vector(tuple(min(v[i] for v in all_vertices) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in all_vertices) for i in range(3)))
    extent = high - low; factor = min(1.015 / extent.z, .59 / extent.x, .59 / extent.y)
    translation = Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    normalize = Matrix.Scale(factor, 4) @ Matrix.Translation(translation)
    for o in root.children: o.data.transform(normalize)
    root['refinement'] = notes[id]; root['source_design'] = id
    # Editable source remains independent of render-optimized palette merges.
    export_root = bpy.data.objects.new('toy_' + id, None); scene.collection.objects.link(export_root)
    for material in materials.values():
        originals = [o for o in root.children if o.type == 'MESH' and o.data.materials[0] == material]
        if not originals: continue
        copies = []
        for original in originals:
            mesh = bpy.data.meshes.new_from_object(original.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            obj = bpy.data.objects.new(id + '_' + material.name, mesh); scene.collection.objects.link(obj); copies.append(obj)
        select(copies)
        if len(copies) > 1: bpy.ops.object.join()
        merged = bpy.context.object; merged.parent = export_root; merged.name = id + '_' + material.name
    roots.append(export_root)
    verts = [Vector(v) for o in export_root.children for v in o.bound_box]
    # Bevels are evaluated only in the game copies. Re-seat the final evaluated
    # surface exactly on zero, including the rocket's tapered flame tip.
    final_min_z = min(v.z for v in verts)
    if abs(final_min_z) > 1e-8:
        delta = Matrix.Translation((0, 0, -final_min_z))
        for o in [*root.children, *export_root.children]: o.data.transform(delta)
        verts = [Vector(v) for o in export_root.children for v in o.bound_box]
    dims = [max(v[i] for v in verts) - min(v[i] for v in verts) for i in range(3)]
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in export_root.children)
    stats.append(dict(id=id, node=export_root.name, triangles=triangles, draws=len(export_root.children), bounds=[round(dims[0],4),round(dims[2],4),round(dims[1],4)], pivotY=0, refinement=notes[id]))
    for o in [root, *root.children]: o.hide_render = True; o.hide_set(True)
    print('REFINED', id, triangles, flush=True)

manifest = dict(version=2, generator='Blender ' + bpy.app.version_string, units='metres', up='+Y', forward='+Z', pivot='ground-centre', models=stats, totalTriangles=sum(s['triangles'] for s in stats), materialCount=len(materials), textureCount=0)
select([o for root in roots for o in [root, *root.children]])
path = ROOT / 'tmp' / 'toy-racers.samples.glb' if SAMPLES else OUT / 'toy-racers.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_extras=True, export_texcoords=False, export_tangents=False, export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
manifest['bytes'] = path.stat().st_size
manifest['optimizedBytes'] = path.stat().st_size
manifest['compression'] = 'EXT_meshopt_compression'
manifest_path = ROOT / 'tmp' / 'toy-racers.samples.manifest.json' if SAMPLES else OUT / 'toy-racers.manifest.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
blend_path = ROOT / 'tmp' / 'toy-racers.samples.blend' if SAMPLES else SOURCE / 'toy-racers.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)

# True Blender orthographic front/side/back review, using the shipping geometry.
for root in roots:
    root.hide_render = True
    for obj in root.children: obj.hide_render = True
review = ('hare', 'gunk') if SAMPLES else tuple(d['id'] for d in designed)
columns = 3 if SAMPLES else 6
for index, id in enumerate(review):
    source = next(root for root in roots if root.name == 'toy_' + id)
    for view in range(3 if SAMPLES else 1):
        x = (view - 1) * 1.45 if SAMPLES else (index % columns - 2.5) * 1.25
        z = (1 - index) * 1.5 if SAMPLES else (5 - index // columns) * 1.32
        rotation = Matrix.Rotation(view * -math.pi/2, 4, 'Z')
        for child in source.children:
            copy = bpy.data.objects.new('QA-' + id, child.data); scene.collection.objects.link(copy)
            copy.matrix_world = Matrix.Translation((x, 0, z)) @ rotation
        font = bpy.data.curves.new('Label', 'FONT'); font.body = id + (' / ' + ('front','side','back')[view] if SAMPLES else '')
        font.size = .13 if SAMPLES else .11; font.align_x = 'CENTER'
        text = bpy.data.objects.new('Label', font); scene.collection.objects.link(text); text.location = (x, -.05, z - .15); text.rotation_euler = (math.pi/2, 0, 0); font.materials.append(materials['toy-paper'])
camera_data = bpy.data.cameras.new('QA-camera'); camera = bpy.data.objects.new('QA-camera', camera_data); scene.collection.objects.link(camera)
target = Vector((0,0,1.15 if SAMPLES else 3.7)); camera.location = (0,-12,target.z + .6)
camera.rotation_euler = (target - camera.location).to_track_quat('-Z','Y').to_euler(); camera_data.type = 'ORTHO'; camera_data.ortho_scale = 4.5 if SAMPLES else 8.2; scene.camera = camera
for name, location, energy, size in [('Key',(-3,-4,7),500,5),('Fill',(4,-1,3),250,4),('Rim',(1,3,5),400,3)]:
    light = bpy.data.lights.new(name, 'AREA'); light.energy = energy; light.shape = 'DISK'; light.size = size
    obj = bpy.data.objects.new(name, light); scene.collection.objects.link(obj); obj.location = location; obj.rotation_euler = (target - obj.location).to_track_quat('-Z','Y').to_euler()
scene.world.color = (.35,.35,.35)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
scene.render.resolution_x = 1500 if SAMPLES else 1800; scene.render.resolution_y = 1100 if SAMPLES else 1800; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(QA / ('representatives-front-side-back.png' if SAMPLES else 'all-36-front.png'))
bpy.ops.render.render(write_still=True)
print(json.dumps(manifest), flush=True)
