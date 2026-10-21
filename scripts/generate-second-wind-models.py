"""Reference-informed, volumetric Second Wind toy sculptures for the existing board.

blender --background --threads 1 --python scripts/generate-second-wind-models.py
Optional --samples builds Bite Mark, Hog Knight, Null, Tail only; --no-render skips QA.
Only modelling expressions are procedural: each character below has an authored silhouette.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/second-wind'
QA = ROOT / 'docs/evidence/second-wind'
SOURCE = ROOT / 'assets/blender'
for p in (OUT, OUT/'avatars', QA, SOURCE): p.mkdir(parents=True, exist_ok=True)
(SOURCE/'second-wind').mkdir(parents=True,exist_ok=True)
SAMPLES = '--samples' in sys.argv
RENDER = '--no-render' not in sys.argv
ONLY = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')),None)
IDS = ['bite-mark','blunderdog','cheatah','critic','diva','doppelgangster','gloth','hog-knight','hopfrog','hotel','icarus','kingtripper','kraken','le-saboteur','magical-athlete','mole','mr-dice-guy','mush','nemesis','nepo-baby','null','overtaker','party-pooper','penguin','re-runner','show-off','soulmate','speed-demon','spoilsport','stepdad','streaker','stunner','switcharoo','tail','the-hose','understudy']
FILENAMES = ['Bite Mark','Blunderdog','Cheatah','Critic','Diva','Doppelgangster','Gloth','Hog Knight','Hopfrog','Hotel','Icarus','Kingtripper','Kraken','LeSaboteur','Magical Athlete','Mole','Mr. Dice Guy','Mush','Nemesis','Nepo Baby','Null','Overtaker','Party Pooper','Penguin','Re-Runner','Show-Off','Soulmate','Speed Demon','Spoilsport','Stepdad','Streaker','Stunner','Switcharoo','Tail','The Hose','Understudy']
PALETTE = {'ink':'26283a','paper':'fff6df','yellow':'f9d237','orange':'e98b3c','red':'e9503d','pink':'e86aab','violet':'9470ba','blue':'628fbc','green':'329251','olive':'8ca34d','aqua':'6bc5c5','brown':'967245','grey':'b9c1b4','cream':'e8d99b','dark':'15161b'}
NOTES = {}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene; scene.unit_settings.system = 'METRIC'; scene.render.fps = 30
C = Matrix.Rotation(math.pi/2, 4, 'X') # author x,up,front; Blender x,-front,up
MATS = {}
for key, color in PALETTE.items():
    rgb = tuple(int(color[i:i+2],16)/255 for i in (0,2,4))
    linear = tuple(c/12.92 if c < .04045 else ((c+.055)/1.055)**2.4 for c in rgb)
    mat = bpy.data.materials.new('toy-sw-'+key); mat.use_nodes = True
    mat.node_tree.nodes.clear(); bs = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
    bs.inputs['Base Color'].default_value=(*linear,1); bs.inputs['Roughness'].default_value=.5; bs.inputs['Metallic'].default_value=0; bs.inputs['Coat Weight'].default_value=.12
    mat.diffuse_color=(*linear,1); MATS[key]=mat

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    if objects: bpy.context.view_layer.objects.active=objects[0]

current=None; counter=0
def add(obj, color, tag, p=(0,0,0), scale=(1,1,1), rotation=(0,0,0)):
    global counter
    counter+=1; obj.name='GEO-'+current['id']+'-'+tag+'-'+str(counter)
    # Bake all author-space transforms into vertices, preserving a shared root pivot.
    rot=Matrix.Rotation(rotation[2],4,'Z') @ Matrix.Rotation(rotation[1],4,'Y') @ Matrix.Rotation(rotation[0],4,'X')
    obj.data.transform(C @ Matrix.Translation(p) @ rot @ Matrix.Diagonal((*scale,1)))
    obj.matrix_world=Matrix.Identity(4); obj.parent=current['root']; obj.data.materials.clear(); obj.data.materials.append(MATS[color])
    for f in obj.data.polygons: f.use_smooth=True
    return obj
def O(color,p,size,tag='orb'):
    if isinstance(size,(float,int)): size=(size,)*3
    radius=max(size); seg,rings=(20,12) if radius>.13 else (12,8) if radius>.035 else (8,6)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1)
    return add(bpy.context.object,color,tag,p,size)
def B(color,p,size,tag='block',rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=add(bpy.context.object,color,tag,p,size,rot)
    mod=obj.modifiers.new('Molded rounded edges','BEVEL'); mod.width=.012; mod.segments=2
    return obj
def K(color,p,r1,r2,h,tag='cone',rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=r1,radius2=r2,depth=h)
    # native z-axis -> author up y
    obj=bpy.context.object; obj.data.transform(Matrix.Rotation(-math.pi/2,4,'X'))
    return add(obj,color,tag,p,rotation=rot)
def L(color,pts,r=.018,tag='curve',taper=None):
    cv=bpy.data.curves.new('curve','CURVE'); cv.dimensions='3D'; cv.resolution_u=3; cv.bevel_depth=r; cv.bevel_resolution=1; cv.use_fill_caps=True
    spl=cv.splines.new('BEZIER'); spl.bezier_points.add(len(pts)-1)
    for i,(b,p) in enumerate(zip(spl.bezier_points,pts)):
        b.co=p; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
        if taper: b.radius=taper[i]
    ob=bpy.data.objects.new('GEO-curve',cv); scene.collection.objects.link(ob); select([ob]); bpy.ops.object.convert(target='MESH')
    return add(bpy.context.object,color,tag)
def E(x=0,y=.69,z=.205,gap=.073,s=.047,pupil='ink'):
    for d in (-1,1):
        O('paper',(x+d*gap,y,z),(s,s*1.2,s*.6),'eye-white'); O(pupil,(x+d*gap+.008,y,z+s*.55),(s*.4,s*.68,s*.23),'eye-pupil')
        O('paper',(x+d*gap+.004,y+s*.23,z+s*.79),s*.14,'eye-glint')
def smile(x=0,y=.58,z=.23,w=.11,color='ink'):
    L(color,[(x-w,y+.02,z),(x,y-.02,z+.01),(x+w,y+.02,z)],.012,'smile')
def feet(color='ink',gap=.12,y=.065,z=.04):
    for d in (-1,1): O(color,(d*gap,y,z),(.09,.065,.13),'shoe'); L(color,[(d*gap,y,z),(d*gap,.24,0)],.036,'ankle')
def arms(color='orange',y=.48,wide=.28):
    for d in (-1,1): L(color,[(d*.13,y+.06,0),(d*wide,y,0),(d*wide,y+.09,.08)],.035,'arm'); O(color,(d*wide,y+.09,.08),.047,'hand')
def human(body='blue',skin='orange',head=.23,face=True,limbs=True):
    feet(); O(body,(0,.36,0),(.19,.25,.14),'torso'); O(skin,(0,.69,0),(head,.22,.18),'head')
    if limbs: arms(skin)
    if face: E(); smile()
def hat(color='violet',y=.89,brim=.29,top=.16,band='red'):
    K(color,(0,y,0),brim,brim,.035,'hat-brim'); K(color,(0,y+top/2,0),.18,.17,top,'hat-crown'); K(band,(0,y+.05,0),.185,.185,.035,'hat-band')
def ears(color='orange',y=.86,wide=.15):
    for d in (-1,1): K(color,(d*wide,y,0),.09,0,.2,'ear',rot=(0,0,d*.25))
def star(color,p,size=.12,tag='star'):
    # Proper closed extruded star, not a paper plane.
    x,y,z=p; pts=[]
    for i in range(10):
        a=math.pi/2+i*math.pi/5; r=size if i%2==0 else size*.43; pts.append((x+math.cos(a)*r,y+math.sin(a)*r))
    v=[(px,py,z+dz) for dz in (-.012,.012) for px,py in pts]
    faces=[tuple(range(9,-1,-1)),tuple(range(10,20))]+[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
    mesh=bpy.data.meshes.new('star'); mesh.from_pydata(v,[],faces); mesh.update(); ob=bpy.data.objects.new('star',mesh); scene.collection.objects.link(ob); return add(ob,color,tag)
def die(p,size=.16,color='paper',pip='ink',n=6):
    B(color,p,(size,)*3,'rounded-die'); x,y,z=p
    points={1:[(0,0)],2:[(-1,1),(1,-1)],3:[(-1,1),(0,0),(1,-1)],4:[(-1,1),(1,1),(-1,-1),(1,-1)],5:[(-1,1),(1,1),(0,0),(-1,-1),(1,-1)],6:[(-1,1),(1,1),(-1,0),(1,0),(-1,-1),(1,-1)]}[n]
    for dx,dy in points: O(pip,(x+dx*size*.25,y+dy*size*.25,z+size*.51),size*.07,'dice-pip')
    for dz in (-1,1): O(pip,(x+size*.51,y,z+dz*size*.25),size*.07,'side-pip')
def notes(s,back='Back and side volumes extrapolated from the published single-view illustration.'):
    NOTES[current['id']]={'recognition':s,'inferred':back,'referenceChecked':True}

def build(id):
    if id in ('bite-mark','bite-mark-were'):
        if id=='bite-mark':
            human('paper','olive',face=False,limbs=False); O('violet',(0,.78,-.08),(.25,.22,.17),'purple-mane')
            # Face is in front of the complete mane volume; side spikes echo the portrait.
            O('olive',(0,.69,.04),(.2,.2,.18),'face'); E(y=.71,z=.222); ears('olive',.78,.23)
            for d in (-1,1): L('violet',[(d*.2,.87,-.04),(d*.23,.69,-.08),(d*.2,.5,-.06)],.055,'side-lock'); L('olive',[(d*.14,.48,0),(d*.24,.5,.05),(d*.12,.44,.22)],.034,'claw-arm')
            B('violet',(0,.47,.144),(.28,.06,.022),'shirt-collar'); smile(y=.58,z=.236)
            notes('Olive pointed ears, long purple mane, off-white ringer shirt, hunched claw hands.')
        else:
            feet('olive',.15); O('olive',(0,.45,0),(.25,.3,.19),'were-torso'); O('violet',(0,.73,-.04),(.31,.27,.23),'were-mane')
            O('olive',(0,.72,.1),(.3,.23,.21),'were-muzzle'); O('ink',(0,.67,.284),(.23,.12,.025),'open-maw')
            for d in (-1,1):
                K('olive',(d*.24,1,0),.12,0,.22,'were-ear'); L('olive',[(d*.22,.51,0),(d*.38,.46,.14),(d*.32,.56,.23)],.055,'were-arm')
            E(y=.84,z=.27,gap=.13,s=.052)
            for i in range(7): K('paper',(-.18+i*.06,.7,.31),.023,0,.085,'were-tooth',rot=(0,0,math.pi))
            notes('W.E.R.E.M.O.U.T.H. derived monster silhouette, same olive skin and purple mane, enlarged toothed maw.','Transformation sculpture is project interpretation; no official transformed reverse-view illustration was available. Side/back mane and claws inferred.')
    elif id=='blunderdog':
        human('red','yellow',face=False,limbs=False); ears('yellow',.88,.17); O('pink',(.13,.65,.2),(.09,.06,.05),'dog-nose'); B('blue',(0,.765,.185),(.39,.065,.025),'hero-mask'); E(y=.765,z=.212); smile(y=.59,z=.2); star('blue',(0,.4,.148),.14)
        for d in (-1,1): B('blue',(d*.12,.14,.01),(.12,.18,.1),'blue-boot'); L('yellow',[(d*.22,.54,0),(d*.31,.78,0),(d*.29,.94,.07)],.039,'raised-fist'); O('yellow',(d*.29,.94,.07),.07,'fist')
        B('blue',(0,.43,-.17),(.35,.43,.045),'rear-cape'); notes('Yellow masked dog, red super-suit with large blue star, raised fists, blue boots and cape.')
    elif id=='cheatah':
        human('green','orange'); ears(); O('orange',(.1,.65,.17),(.13,.08,.09),'cheetah-muzzle'); O('ink',(.18,.67,.23),.042,'nose')
        for x,y in [(-.11,.48),(.1,.4),(-.06,.32),(.11,.22),(-.13,.62),(.13,.6)]: O('ink',(x,y,.139 if y<.52 else .17),(.035,.028,.012),'cheetah-spots')
        for x,y in [(-.1,.4),(.08,.33),(0,.5)]: O('ink',(x,y,-.14),(.035,.025,.013),'rear-spots')
        die((-.29,.67,.08),.16,'paper','green'); L('orange',[(.1,.3,-.1),(.29,.22,-.18),(.31,.36,-.16)],.032,'tail'); notes('Orange spotted cheetah in a green spotted sweater, die in left paw, muzzle and curled tail.')
    elif id=='critic':
        feet('blue'); O('violet',(0,.49,-.12),(.3,.36,.19),'large-turtle-shell'); O('olive',(0,.4,.02),(.2,.28,.15),'green-jacket'); O('blue',(0,.78,.06),(.22,.2,.17),'turtle-head'); E(y=.84,z=.21)
        O('blue',(.13,.76,.19),(.15,.09,.09),'snout'); L('blue',[(.13,.44,.08),(.23,.61,.16),(.1,.66,.23)],.04,'thoughtful-hand'); K('paper',(-.24,.48,.12),.057,.07,.1,'cup')
        for yy in (.34,.48): O('ink',(.07,yy,.164),.014,'jacket-button')
        for x in (-.15,.05): L('ink',[(x-.05,.25,-.25),(x,.5,-.3),(x-.05,.72,-.23)],.009,'shell-plate-seam')
        notes('Blue turtle, tall purple shell, green jacket, chin-resting hand and cup; shell plate seams wrap onto the back.')
    elif id=='diva':
        feet('violet',.14); O('olive',(0,.48,0),(.26,.35,.18),'diva-body'); O('olive',(0,.8,0),(.24,.2,.18),'diva-head')
        for d in (-1,1):
            O('pink',(d*.23,.55,.04),(.1,.29,.11),'feather-boa')
            for j in range(7): O('pink',(d*(.21+.025*math.sin(j)),.3+j*.07,.11),.065,'boa-plume')
            O('ink',(d*.09,.84,.174),(.08,.035,.018),'sunglasses')
        L('ink',[(-.02,.84,.19),(.02,.84,.19)],.013,'glasses-bridge'); O('red',(0,.7,.185),(.085,.042,.027),'lips'); O('red',(0,.675,.19),(.06,.02,.028),'lower-lip')
        L('violet',[(.18,.6,.08),(.32,.65,.1),(.31,.91,.13)],.012,'mirror-handle'); O('violet',(.31,.95,.13),(.09,.11,.02),'hand-mirror'); notes('Broad olive diva in fluffy pink boa, dark sunglasses, prominent red lips, hand mirror.')
    elif id=='doppelgangster':
        # Two complete three-dimensional gangsters share a single racer instance.
        for d in (-1,1):
            x=d*.15; O('violet',(x,.35,0),(.145,.24,.12),'pinstripe-suit'); O('orange',(x,.67,.01),(.13,.17,.13),'gangster-head'); O('orange',(x,.66,.14),(.04,.09,.04),'long-nose')
            for k in (-1,0,1): L('ink',[(x+k*.055,.17,.113),(x+k*.055,.5,.113)],.006,'pinstripe')
            K('violet',(x,.84,0),.17,.17,.028,'fedora-brim'); K('violet',(x,.91,0),.115,.1,.13,'fedora'); K('red',(x,.86,0),.12,.12,.03,'hat-ribbon')
            E(x,.72,.14,.045,.026); B('yellow',(x,.44,.123),(.07,.11,.018),'shirt'); L('red',[(x,.49,.14),(x,.37,.15)],.016,'tie'); O('red',(x+.09,.45,.13),.033,'lapel-rose'); O('ink',(x,.06,.02),(.1,.06,.1),'shoes')
        notes('Two orange long-nosed gangsters, purple pinstripe suits and fedoras, red ties and lapel roses.','Second companion, backs of suits, collars and pinstripe wrapping extrapolated in 3D.')
    elif id=='gloth':
        feet(); K('dark',(0,.3,0),.24,.18,.5,'goth-robe'); O('dark',(0,.72,-.035),(.25,.23,.16),'black-hair'); O('paper',(0,.72,.045),(.2,.19,.15),'pale-face')
        for d in (-1,1): O('ink',(d*.09,.75,.18),(.064,.033,.012),'goth-eye-shadow'); L('violet',[(d*.18,.59,0),(d*.27,.88,.01),(d*.25,1,.04)],.037,'raised-purple-claws')
        E(y=.75,z=.196,gap=.085,s=.027)
        O('violet',(0,.68,.203),(.035,.026,.02),'purple-nose'); O('ink',(0,.6,.189),(.035,.018,.014),'goth-mouth')
        for d in (-1,1): K('violet',(d*.08,.52,.11),.06,0,.13,'spiked-collar',rot=(0,0,d*.6))
        notes('Goth sloth/panda, black robe and hair, pale face, purple nose/collar, long purple raised claws.')
    elif id=='hog-knight':
        feet('grey'); K('grey',(0,.36,0),.17,.15,.35,'armour'); O('grey',(0,.68,0),(.19,.22,.16),'helmet'); O('pink',(0,.68,.15),(.135,.15,.025),'pink-visor'); E(y=.72,z=.179,gap=.054,s=.029)
        for x in (-.04,.04): O('ink',(x,.62,.18),(.01,.025,.008),'visor-slot')
        for d in (-1,1): O('grey',(d*.19,.48,0),.075,'pauldron'); L('grey',[(d*.17,.46,0),(d*.25,.36,.08),(d*.2,.56,.12)],.045,'gauntlet-arm')
        L('grey',[(.24,.3,.09),(.26,.95,.07)],.022,'lance'); K('grey',(.26,1,.07),.05,0,.14,'lance-head'); notes('Grey plate-armour knight, pink inset visor, flared helmet, lance and gauntlets. Green hog is a transferable separate model.','Armour rear seams and the dismounted standing pose inferred. Mount rendered separately to follow service-owned rider state.')
    elif id=='hog-knight-hog':
        O('green',(0,.34,-.03),(.28,.25,.26),'green-boar-body'); O('green',(0,.52,.14),(.25,.22,.2),'boar-head'); O('green',(0,.44,.31),(.145,.1,.07),'snout')
        for d in (-1,1):
            O('ink',(d*.055,.46,.371),(.015,.022,.01),'nostril'); K('green',(d*.19,.76,.12),.095,0,.22,'boar-ear',rot=(0,0,d*.25)); K('paper',(d*.15,.4,.31),.045,0,.2,'tusk'); O('green',(d*.18,.16,.06),(.08,.15,.08),'front-leg'); O('green',(d*.18,.16,-.17),(.08,.15,.08),'back-leg')
        E(y=.61,z=.306,gap=.1,s=.04); O('red',(0,.37,.326),(.075,.027,.017),'boar-mouth'); L('green',[(0,.4,-.27),(.12,.4,-.34),(.1,.47,-.34),(0,.46,-.32)],.018,'curly-tail'); B('brown',(0,.53,-.08),(.25,.04,.19),'saddle')
        notes('Separate green boar mount, long ears, white tusks, pink mouth, four legs, saddle, curled tail.','Hog rear, saddle straps and back legs inferred from front view.')
    elif id=='hopfrog':
        feet('red',.18); O('red',(0,.34,0),(.26,.25,.19),'spring-frog-body'); O('red',(0,.58,.03),(.3,.2,.2),'wide-frog-face')
        for d in (-1,1): O('red',(d*.16,.78,.02),(.105,.16,.12),'raised-eye-tower'); O('paper',(d*.16,.8,.119),(.07,.12,.03),'eye'); O('ink',(d*.14,.81,.145),(.034,.08,.015),'pupil'); L('red',[(d*.2,.34,0),(d*.32,.48,0),(d*.29,.63,.06)],.037,'long-frog-arm')
        smile(y=.52,z=.224,w=.22); notes('Bright red broad-faced frog, two tall eye stalks, stretched spring-like legs and webbed feet.')
    elif id=='hotel':
        feet('brown',.18); B('red',(0,.43,0),(.51,.52,.35),'hotel-building')
        # Gabled roof is a closed triangular prism with a genuine back surface.
        verts=[(-.32,.65,-.22),(.32,.65,-.22),(0,.91,-.22),(-.32,.65,.22),(.32,.65,.22),(0,.91,.22)]
        mesh=bpy.data.meshes.new('roof'); mesh.from_pydata(verts,[],[(0,2,1),(3,4,5),(0,3,5,2),(2,5,4,1),(0,1,4,3)]); ob=bpy.data.objects.new('roof',mesh); scene.collection.objects.link(ob); add(ob,'red','gable-roof')
        K('red',(0,.92,-.04),.064,.064,.045,'chimney'); E(y=.52,z=.19,gap=.095,s=.052); O('red',(0,.44,.22),.072,'round-nose'); O('ink',(0,.3,.191),(.2,.075,.02),'hotel-grin')
        for i in range(7): O('paper',(-.15+i*.05,.315,.211),(.018,.027,.01),'tooth')
        for d in (-1,1): B('orange',(d*.26,.48,-.05),(.025,.13,.12),'side-window'); B('orange',(d*.13,.49,-.18),(.09,.12,.012),'back-window')
        star('yellow',(-.24,.48,.195),.045); notes('Walking red gable-roof hotel with broad white grin, round nose, chimney, side and rear windows.')
    elif id=='icarus':
        human('pink','yellow',face=False,limbs=False); hat('pink',.9,.22,.12,'pink'); E(y=.73,z=.203); smile(y=.6,z=.19)
        for d in (-1,1):
            O('green',(d*.28,.61,-.095),(.15,.42,.045),'long-green-wing')
            for k in (-1,0,1): L('olive',[(d*.28+k*.033,.24,-.133),(d*.28+k*.04,.81,-.13)],.006,'wing-rib')
            L('grey',[(d*.23,.25,.08),(d*.3,.85,.07)],.014,'wing-pole')
            L('yellow',[(d*.12,.49,0),(d*.27,.5,.03),(d*.3,.67,.05)],.032,'ski-pole-arm')
        B('pink',(0,.6,-.11),(.26,.18,.06),'wing-harness'); notes('Yellow aviator in pink coat/helmet, large green vertical wings with ribs and handheld poles; complete back harness.')
    elif id=='kingtripper':
        O('green',(0,.45,0),(.24,.25,.17),'royal-lizard'); O('green',(0,.72,.04),(.23,.2,.16),'lizard-head'); O('green',(.08,.65,.16),(.21,.08,.1),'long-grin'); E(y=.79,z=.19); smile(y=.62,z=.24,w=.15)
        feet('red'); arms('red',.42); B('violet',(0,.4,-.18),(.38,.45,.035),'royal-cape'); K('red',(0,.92,0),.22,.13,.13,'crown-cap')
        for d in (-1,1): L('red',[(0,.95,0),(d*.19,1.02,0),(d*.24,.94,.02)],.036,'jester-point'); O('yellow',(d*.24,.94,.02),.038,'jester-bell')
        L('yellow',[(.26,.2,.04),(.28,.65,.03)],.023,'sceptre'); O('red',(.28,.69,.03),.055,'sceptre-jewel'); notes('Green grinning lizard monarch, red/yellow jester crown, purple cape and golden sceptre.')
    elif id=='kraken':
        O('pink',(0,.49,0),(.21,.28,.17),'squid-mantle'); E(y=.42,z=.166,gap=.071,s=.042)
        for i in range(8):
            a=i*math.pi/4; x,z=math.cos(a)*.14,math.sin(a)*.14
            pts=[(x,.39,z),(math.cos(a)*.29,.24,math.sin(a)*.29),(math.cos(a)*.35,.45,math.sin(a)*.35),(math.cos(a)*.24,.56,math.sin(a)*.24)]
            L('pink',pts,.04,'tentacle')
            for j in (1,2): O('violet',(pts[j][0],pts[j][1]+.012,pts[j][2]+.032),.02,'suction-cup')
        K('cream',(0,.76,.06),.075,0,.2,'squid-crest'); notes('Pink kraken with eight curling volumetric tentacles, purple suction cups, cream mantle tip and focused eyes.')
    elif id=='le-saboteur':
        feet('ink'); O('paper',(0,.35,0),(.23,.23,.16),'striped-shirt'); O('green',(0,.71,.02),(.25,.22,.17),'croc-head'); O('green',(.1,.68,.16),(.23,.1,.1),'croc-snout'); E(y=.84,z=.15,gap=.09,s=.05)
        for y in (.22,.32,.42,.52): K('ink',(0,y,0),.218,.218,.043,'shirt-stripe')
        smile(y=.62,z=.23,w=.18); O('ink',(-.12,.9,-.02),(.14,.05,.11),'black-beret'); arms('yellow',.43); L('green',[(-.12,.25,-.12),(-.3,.2,-.22),(-.27,.31,-.27)],.035,'croc-tail'); notes('Green crocodile in black/white striped shirt, small black beret, large snout and yellow-gloved hands.')
    elif id=='magical-athlete':
        human('blue','orange'); K('blue',(0,.97,0),.27,0,.35,'wizard-hat'); B('blue',(0,.91,0),(.57,.035,.35),'wizard-brim')
        for x,y in [(-.08,.36),(.1,.48),(0,.68),(-.08,1.03)]: star('yellow',(x,y,.15 if y<.6 else .174),.08)
        L('violet',[(-.29,.75,.05),(.28,.75,.05)],.024,'staff-overhead'); O('yellow',(-.31,.75,.05),.05,'staff-tip'); L('orange',[(-.17,.5,0),(-.27,.74,.04)],.033,'raised-arm'); notes('Orange wizard athlete, blue star-covered robe and tall pointed hat, violet staff and golden star details.')
    elif id=='mole':
        O('orange',(0,.4,0),(.27,.38,.22),'rounded-mole'); O('orange',(0,.55,.17),(.14,.16,.1),'muzzle'); E(y=.66,z=.245,gap=.065,s=.033); O('red',(0,.55,.264),(.044,.03,.016),'pink-nose')
        for d in (-1,1): B('paper',(d*.03,.43,.247),(.045,.16,.035),'bucktooth'); O('red',(d*.17,.08,.07),(.08,.05,.09),'digging-paw'); L('ink',[(d*.04,.52,.267),(d*.21,.56,.23),(d*.29,.61,.2)],.005,'whisker'); L('ink',[(d*.04,.5,.264),(d*.23,.47,.22),(d*.29,.44,.19)],.005,'whisker')
        for x,y in [(-.14,.6),(.1,.75),(-.08,.7)]: O('olive',(x,y,-.03),(.045,.025,.025),'earth-clod')
        notes('Large orange burrowing mole, pink nose/paws, two rectangular buckteeth, long molded whiskers and earth clods on back.')
    elif id=='mr-dice-guy':
        human('blue','olive'); hat('violet',.89,.31,.15); O('red',(-.07,.53,.145),(.085,.06,.035),'bow-left'); O('red',(.07,.53,.145),(.085,.06,.035),'bow-right')
        for i,(x,y,z) in enumerate([(-.32,.74,.02),(.32,.84,.02),(-.24,.3,.07),(.25,.5,.05)]): die((x,y,z),.12,('yellow','green','pink','violet')[i],n=i+2)
        die((0,1.05,.02),.18,'blue','yellow'); notes('Olive dice magician, violet top hat with large numbered die, blue suit and red bow tie, four coloured floating dice.')
    elif id=='mush':
        feet('blue',.16); O('blue',(0,.43,0),(.28,.3,.2),'blue-mush-body')
        heads=[(-.17,.73,.05,.17),(.11,.64,.15,.18),(.16,.91,-.04,.12),(-.1,.98,-.05,.1)]
        for x,y,z,r in heads: O('blue',(x,y,z),(r,r*.9,r*.85),'absorbed-face'); E(x,y+.02,z+r*.7,r*.38,r*.24); O('ink',(x,y-r*.35,z+r*.75),(r*.6,r*.18,.012),'mouth')
        for j in range(4): B('paper',(-.22+j*.035,.65,.19),(.026,.05,.016),'mush-teeth')
        O('blue',(0,.65,-.15),(.16,.16,.14),'back-lobe'); notes('Asymmetric blue multi-face blob with four independently modelled expressions and rear lobe; no recycled base slime mesh.')
    elif id=='nemesis':
        feet('grey'); K('grey',(0,.34,0),.24,.17,.48,'classical-draped-robe'); O('grey',(0,.72,0),(.2,.21,.17),'statue-face'); E(y=.76,z=.17,s=.035); O('grey',(0,.69,.19),(.027,.055,.035),'statue-nose'); O('ink',(0,.59,.173),(.03,.035,.012),'open-mouth')
        for i in range(12):
            a=i*math.pi/6; O('grey',(math.sin(a)*.2,.83+math.cos(a)*.13,-.03),.063,'marble-curl')
        for d in (-1,1): L('paper',[(d*.13,.16,.15),(d*.1,.4,.17),(d*.18,.57,.12)],.013,'toga-fold')
        L('grey',[(.2,.15,.07),(.25,.97,.07)],.017,'straight-sword'); B('grey',(.25,.91,.07),(.1,.025,.035),'sword-guard'); notes('Pale classical statue, curled marble hair, draped toga with front/back folds, upright sword and open expression.')
    elif id=='nepo-baby':
        human('blue','pink',face=False); O('pink',(0,.7,.02),(.24,.25,.19),'round-baby-head'); E(y=.75,z=.211,s=.031); O('orange',(0,.65,.229),(.065,.043,.018),'pacifier'); O('ink',(0,.65,.248),(.023,.022,.008),'pacifier-hole'); hat('blue',.95,.31,.31,'red')
        for d in (-1,1): B('paper',(d*.075,.48,.145),(.1,.11,.025),'lapel')
        B('orange',(.1,.36,.155),(.07,.065,.02),'pocket-square'); L('orange',[(0,.49,.18),(0,.33,.18)],.021,'tie'); O('grey',(.28,.52,.06),(.07,.1,.04),'silver-rattle'); notes('Round pink baby with orange pacifier, oversized blue top hat, matching formal suit, orange tie and silver rattle.')
    elif id=='null':
        # The published card portrait is a dark grain field with only two white eyes.
        # A closed, matte void monolith translates its silhouette without fabricating anatomy.
        O('dark',(0,.46,0),(.25,.44,.19),'void-volume')
        for d in (-1,1): O('paper',(d*.035,.52,.186),(.018,.021,.008),'void-eye'); O('dark',(d*.035,.52,.194),(.007,.01,.004),'void-pupil')
        notes('Near-black closed void volume with tiny white eyes, matching the portrait without invented limbs.','Card portrait has no defined body boundary: rounded full-volume silhouette and unseen side/back are explicit project inference.')
    elif id=='overtaker':
        human('brown','blue',face=False); O('blue',(.11,.68,.16),(.16,.085,.075),'blue-snout'); E(y=.78,z=.17,s=.035); smile(y=.6,z=.175); K('cream',(0,.89,0),.21,.16,.18,'gravedigger-cap')
        for yy in (.87,.92,.97): L('grey',[(-.16,yy,.08),(0,yy+.015,.157),(.16,yy,.08)],.008,'cap-wrap')
        L('grey',[(.23,.11,.1),(.3,.85,.1)],.018,'shovel-handle'); B('grey',(.32,.9,.1),(.14,.17,.025),'shovel-blade'); L('cream',[(-.26,.37,.1),(-.27,.78,.1)],.013,'skull-staff'); O('cream',(-.27,.82,.1),(.09,.1,.07),'skull')
        for d in (-1,1): O('ink',(-.27+d*.035,.84,.163),.02,'skull-socket')
        notes('Blue gravedigger, cream wrapped cap, brown coat, shovel and skull-topped staff; sculpted snout and cap seams.')
    elif id=='party-pooper':
        human('pink','yellow',face=False); ears('yellow',.86,.18); O('yellow',(0,.68,.14),(.13,.11,.1),'cat-muzzle'); O('blue',(0,.72,.23),(.035,.05,.025),'blue-cat-nose'); E(y=.81,z=.19,s=.035); L('ink',[(-.07,.59,.2),(0,.61,.21),(.07,.59,.2)],.01,'grumpy-mouth'); hat('green',.94,.23,.1,'pink')
        L('green',[(-.02,1.04,0),(-.15,1.15,-.01),(-.27,1.04,.02)],.045,'nightcap-tail'); O('pink',(-.27,1.04,.02),.05,'pompom'); L('brown',[(-.25,.18,.1),(-.25,.58,.1)],.018,'candle-holder'); K('paper',(-.25,.61,.1),.033,.033,.24,'candle'); O('orange',(-.25,.77,.1),(.026,.06,.026),'flame')
        notes('Yellow grumpy cat, pink/green nightcap and pajamas, blue nose, tall candle and green rear nightcap tail.')
    elif id=='penguin':
        feet('orange',.14); O('violet',(0,.4,0),(.27,.35,.2),'penguin'); O('paper',(0,.36,.16),(.19,.28,.045),'white-shirtfront'); O('violet',(0,.77,0),(.2,.19,.15),'penguin-head'); E(y=.8,z=.151,s=.04); O('orange',(0,.72,.19),(.16,.04,.08),'orange-beak')
        for d in (-1,1): L('violet',[(d*.17,.56,-.02),(d*.38,.79,-.02),(d*.4,.99,0)],.06,'raised-flipper')
        for yy in (.22,.32,.42): O('ink',(0,yy,.21),.012,'shirt-button')
        O('brown',(-.13,.95,0),(.12,.035,.1),'hat'); notes('Purple/orange penguin with white buttoned belly, upraised long flippers, flat orange beak and little brown hat.')
    elif id=='re-runner':
        human('pink','orange',face=False,limbs=False); B('yellow',(0,.38,.143),(.055,.41,.023),'tracksuit-front-stripe')
        for d in (-1,1): L('yellow',[(d*.17,.18,-.03),(d*.18,.48,-.02),(d*.25,.49,.05)],.012,'tracksuit-stripe')
        O('grey',(0,.85,-.025),(.22,.13,.16),'curly-hair')
        for i in range(8): O('grey',(-.18+i*.05,.89+.025*math.sin(i),0),.06,'curl')
        B('violet',(0,.79,.177),(.38,.044,.025),'headband'); O('ink',(-.07,.76,.19),(.05,.022,.012),'shut-eye'); O('ink',(.07,.76,.19),(.05,.022,.012),'shut-eye'); smile(y=.58,z=.18)
        for d in (-1,1): L('orange',[(d*.17,.44,0),(d*.29,.29,.08),(d*.22,.3,.18)],.035,'runner-arm'); O('orange',(d*.22,.3,.18),.045,'runner-hand')
        notes('Grey curly-haired veteran runner, violet sweatband, pink tracksuit with yellow stripes and bent jogging arms.')
    elif id=='show-off':
        # Circus elephant standing on four roller-skate feet under a tall chair.
        O('violet',(0,.39,0),(.26,.23,.19),'elephant-body'); O('violet',(0,.64,.06),(.2,.18,.18),'elephant-head'); E(y=.7,z=.23,s=.03)
        for d in (-1,1): O('violet',(d*.21,.65,0),(.12,.14,.055),'elephant-ear'); O('violet',(d*.17,.17,.06),(.07,.16,.075),'elephant-leg'); O('pink',(d*.17,.07,.06),(.105,.055,.12),'roller-skate'); O('green',(d*.17,.055,.17),.04,'skate-wheel')
        L('violet',[(.07,.63,.2),(.15,.52,.24),(.21,.6,.25),(.17,.7,.24)],.053,'curved-trunk'); hat('pink',.83,.16,.1,'green')
        for d in (-1,1): L('orange',[(d*.31,.1,-.15),(d*.31,1.06,-.15)],.023,'chair-leg')
        B('aqua',(0,.98,-.15),(.6,.32,.05),'chair-back'); B('yellow',(0,1.15,-.15),(.65,.05,.055),'chair-top'); notes('Violet circus elephant, curled trunk, pink hat/skates with green wheels, tall cyan/yellow chair behind.')
    elif id=='soulmate':
        human('yellow','yellow',face=False); ears('yellow',.87,.18); O('yellow',(0,.68,.13),(.2,.15,.15),'muzzle'); E(y=.79,z=.231,gap=.095,s=.078); O('ink',(0,.58,.261),(.13,.1,.02),'joyful-mouth'); O('red',(0,.55,.286),(.075,.08,.01),'tongue')
        for d in (-1,1):
            # Closed heart-shaped pupils formed from two lobes and tapered lower tip.
            O('red',(d*.095-.018,.8,.294),.032,'heart-eye-lobe'); O('red',(d*.095+.018,.8,.294),.032,'heart-eye-lobe'); K('red',(d*.095,.775,.294),0,.047,.065,'heart-eye-tip')
        O('pink',(0,.695,.29),(.065,.035,.025),'pink-nose'); L('yellow',[(.1,.3,-.11),(.31,.4,-.12),(.28,.6,-.1)],.033,'love-tail'); notes('Bright yellow lovestruck creature, huge heart pupils, pink nose and open tongue smile, long curled tail.')
    elif id=='speed-demon':
        # Bike is part of the silhouette, not a board control object.
        for z in (-.2,.2):
            O('ink',(0,.16,z),(.075,.16,.16),'motorbike-wheel'); O('grey',(.07,.16,z),(.015,.095,.095),'wheel-hub')
        L('red',[(0,.26,-.2),(0,.32,0),(0,.29,.2)],.08,'red-motorcycle'); O('olive',(0,.6,-.035),(.22,.25,.15),'demon'); O('olive',(0,.84,0),(.21,.2,.17),'demon-head'); E(y=.84,z=.171,s=.027); O('olive',(0,.76,.2),(.08,.06,.07),'snout')
        O('blue',(0,.56,-.04),(.23,.2,.17),'blue-leather-jacket'); B('blue',(0,.5,-.18),(.25,.25,.03),'back-jacket-panel')
        for d in (-1,1): L('blue',[(d*.16,.68,0),(d*.22,.56,.15),(d*.14,.5,.23)],.04,'handlebar-arm'); K('olive',(d*.15,1.02,0),.06,0,.15,'horn'); L('orange',[(d*.1,.92,-.1),(d*.15,.88,-.3),(d*.07,.87,-.43)],.01,'streaming-hair')
        O('yellow',(0,.35,.29),(.085,.085,.02),'headlamp'); L('grey',[(-.18,.48,.23),(.18,.48,.23)],.018,'handlebars'); notes('Olive horned biker in blue jacket, orange streaming hair, complete red motorcycle, tyres/hubs, yellow headlamp.')
    elif id=='spoilsport':
        human('pink','pink',face=False); O('pink',(0,.7,.03),(.25,.25,.2),'pig-head'); O('pink',(0,.61,.22),(.115,.12,.06),'pig-snout'); E(y=.79,z=.207,s=.027)
        for d in (-1,1): K('pink',(d*.17,.91,0),.085,0,.14,'pig-ear'); O('ink',(d*.039,.63,.277),(.017,.027,.008),'nostril'); L('aqua',[(d*.08,.75,.22),(d*.07,.62,.25),(d*.14,.4,.21)],.024,'tear-stream')
        O('ink',(0,.48,.2),(.073,.045,.02),'crying-mouth'); L('pink',[(.1,.25,-.13),(.23,.29,-.21),(.17,.35,-.24),(.11,.32,-.19)],.022,'curly-pig-tail'); notes('Pink sobbing pig, large snout, raised brow/ears, physical blue tear streams and curly rear tail.')
    elif id=='stepdad':
        human('violet','violet',face=False); O('violet',(0,.76,.01),(.23,.24,.18),'walrus-head'); E(y=.8,z=.187,s=.03)
        for d in (-1,1): O('brown',(d*.055,.7,.211),(.065,.035,.021),'walrus-moustache'); K('paper',(d*.06,.63,.21),0,.024,.13,'walrus-tusk')
        B('paper',(0,.39,.151),(.23,.29,.025),'shirt');
        for x in (-.12,.12): B('red',(x,.39,.165),(.033,.32,.016),'red-suspenders')
        O('brown',(0,.53,.166),(.15,.055,.04),'bowtie'); L('orange',[(-.25,.33,.03),(-.29,.64,.08),(-.3,.84,.1)],.04,'foam-finger'); O('orange',(-.3,.88,.1),(.03,.11,.025),'raised-index'); notes('Violet walrus with brown moustache, white tusks, red suspenders, bow tie and orange raised foam finger.')
    elif id=='streaker':
        # The source portrays a comically elongated pale creature, not a human nude.
        O('cream',(0,.45,0),(.19,.35,.13),'long-pale-body'); O('cream',(.02,.77,.01),(.17,.25,.12),'pointed-head'); K('cream',(.02,1.03,0),.12,0,.24,'long-head-tip'); E(y=.84,z=.13,gap=.058,s=.034); O('cream',(0,.7,.155),(.055,.11,.035),'long-nose')
        for d in (-1,1): L('cream',[(d*.12,.48,0),(d*.26,.28,.02),(d*.22,.13,.08)],.03,'long-arm'); O('cream',(d*.22,.09,.08),(.08,.045,.06),'long-foot')
        L('cream',[(-.08,.3,-.06),(-.26,.34,-.13),(-.38,.46,-.08)],.035,'rear-tail'); smile(y=.54,z=.13,w=.075); notes('Pale elongated pointed creature, long hanging arms, big nose, narrow feet, and swept-back tail.')
    elif id=='stunner':
        feet('pink'); # Bell pepper body is five full longitudinal lobes around a core.
        O('orange',(0,.5,0),(.19,.32,.17),'pepper-core')
        for i in range(5):
            a=i*math.pi*2/5; O('orange',(math.cos(a)*.1,.5,math.sin(a)*.1),(.13,.31,.13),'pepper-lobe')
        K('brown',(0,.86,0),.052,.04,.16,'pepper-stem',rot=(0,0,-.25)); E(y=.61,z=.23,gap=.075,s=.034); O('red',(0,.43,.25),(.058,.025,.015),'red-lips'); O('red',(0,.407,.247),(.043,.017,.015),'lower-lip'); L('orange',[(-.17,.53,-.04),(-.32,.61,0),(-.27,.74,.03)],.04,'bent-pepper-arm'); notes('Orange bell pepper with five thick lobes, brown bent stalk, lashes, red lips, pink feet and coy raised arm.')
    elif id=='switcharoo':
        O('yellow',(0,.39,-.03),(.2,.25,.17),'kangaroo-haunch'); O('yellow',(0,.65,0),(.14,.24,.11),'kangaroo-neck'); O('yellow',(0,.84,.03),(.15,.15,.12),'kangaroo-head'); O('yellow',(.09,.8,.13),(.14,.055,.07),'kangaroo-snout')
        for d in (-1,1): K('yellow',(d*.09,1.08,0),.055,0,.32,'long-ear',rot=(0,0,d*.15)); O('yellow',(d*.15,.12,.1),(.075,.13,.17),'long-foot'); L('yellow',[(d*.09,.65,.03),(d*.2,.58,.09),(d*.12,.54,.17)],.025,'small-arm')
        for d in (-1,1): O('pink',(d*.065,.89,.134),(.053,.047,.014),'round-glasses'); O('paper',(d*.065,.89,.146),(.033,.03,.009),'lens'); O('ink',(d*.065,.89,.156),.013,'pupil')
        L('yellow',[(0,.3,-.13),(.22,.17,-.3),(.37,.1,-.31)],.055,'large-kangaroo-tail'); O('cream',(0,.42,.12),(.11,.13,.028),'pouch'); notes('Yellow kangaroo, very long ears/feet/tail, pink round glasses, cream pouch, slender tucked forearms.')
    elif id=='tail':
        # A tail is the character: no invented torso or humanoid appendages.
        L('green',[(-.31,.1,-.01),(-.12,.16,0),(.04,.35,0),(.14,.61,0),(.14,.8,0)],.15,'tail-body',taper=[.12,.55,.9,1,1])
        O('green',(.14,.8,0),(.15,.16,.15),'rounded-tail-tip')
        for i in range(5): K('olive',(-.2+i*.07,.2+i*.12,-.08),.06,0,.14,'tail-spike',rot=(.3,0,-.45))
        E(x=.14,y=.96,z=.09,gap=.065,s=.05)
        for d in (-1,1): L('green',[(d*.12,.15,.04),(d*.19,.08,.13)],.027,'tiny-tail-foot')
        notes('Standalone curled green dinosaur tail with olive triangular back spikes, top-mounted eyes and tiny feet.')
    elif id=='the-hose':
        # Several real round hoses coil in depth; nozzle is a closed tapered fitting.
        for i in range(3):
            x=(i-1)*.11; pts=[]
            for j in range(14):
                a=j*math.pi*2/13; pts.append((x+.14*math.cos(a),.39+.29*math.sin(a),-.04+i*.05))
            L('green',pts,.035,'coiled-hose')
        L('green',[(-.24,.2,0),(-.33,.15,.03),(-.3,.07,.09)],.038,'hose-tail'); L('green',[(.22,.37,.08),(.26,.65,.08),(.16,.77,.1)],.045,'upright-hose-neck')
        K('yellow',(.16,.79,.1),.065,.06,.16,'brass-nozzle',rot=(math.pi/2,0,0)); O('grey',(.16,.79,.19),(.07,.06,.015),'nozzle-face'); E(x=.14,y=.91,z=.09,gap=.061,s=.044)
        for x,y in [(.13,.78),(.16,.8),(.19,.78),(.16,.76)]: O('ink',(x,y,.207),.007,'spray-hole')
        notes('Three deep green garden-hose coils, upright eyed neck, brass nozzle with spray holes, hose tail; no opaque water-cone geometry.')
    elif id=='understudy':
        human('yellow','violet',face=False); O('violet',(.1,.69,.14),(.16,.06,.075),'long-theatre-nose'); E(y=.78,z=.17,s=.033); smile(y=.61,z=.18); hat('green',.91,.29,.08,'green')
        L('brown',[(-.16,.98,0),(-.27,1.1,-.02),(-.43,1.09,-.04)],.016,'feather-stem')
        for i in range(5): L('orange',[(-.21-i*.04,1.03,-.02),(-.3-i*.035,1.15-i*.014,-.02)],.012,'feather-vane')
        K('paper',(0,.52,0),.22,.18,.07,'ruff-collar');
        for i in range(12):
            a=i*math.pi/6; O('paper',(math.cos(a)*.19,.52,math.sin(a)*.14),(.045,.055,.045),'ruff-pleat')
        B('paper',(-.21,.42,.15),(.16,.24,.025),'script-sheet',rot=(0,0,.15))
        for yy in (.37,.42,.47): L('ink',[(-.26,yy,.17),(-.16,yy,.17)],.004,'script-line')
        notes('Violet long-nosed actor, yellow Elizabethan tunic, white pleated ruff, green feathered hat and handheld script.')
    else: raise ValueError('Missing authored model '+id)

def setup(id):
    global current,counter
    root=bpy.data.objects.new('EDIT-'+id,None); scene.collection.objects.link(root); root['id']=id; root['edition']='second-wind'; counter=0
    current={'id':id,'root':root}; build(id); return root

def normalize(root):
    # Consistent game footprint, while preserving each character's relative shape.
    bpy.context.view_layer.update()
    pts=[o.matrix_world @ Vector(v) for o in root.children for v in o.bound_box]
    lo=Vector(tuple(min(p[i] for p in pts) for i in range(3))); hi=Vector(tuple(max(p[i] for p in pts) for i in range(3))); dim=hi-lo
    # Local x and Blender y are width/depth. Existing toys share <=.6m footprint.
    factor=min(.98/dim.z,.6/max(dim.x,dim.y)); centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    matrix=Matrix.Diagonal((factor,factor,factor,1)) @ Matrix.Translation(-centre)
    for o in root.children: o.data.transform(matrix)

def merge_game(root,id):
    game=bpy.data.objects.new('toy_'+id,None); scene.collection.objects.link(game); game['characterId']=id; game['edition']='second-wind'
    deps=bpy.context.evaluated_depsgraph_get()
    for material in MATS.values():
        objects=[]
        for o in root.children:
            if o.data.materials[0] != material: continue
            mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps)); copy=bpy.data.objects.new(id+'_'+material.name,mesh); scene.collection.objects.link(copy); objects.append(copy)
        if not objects: continue
        select(objects)
        if len(objects)>1: bpy.ops.object.join()
        ob=bpy.context.object; ob.parent=game; ob.name=id+'_'+material.name
        # Curve conversion leaves coincident cap rings as separate vertices.
        # Weld these seams before decimation so each component is a closed volume.
        bm=bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free(); ob.data.update()
        # Maintain fine volumetric details while capping the large smooth surfaces.
        tris=sum(len(p.vertices)-2 for p in ob.data.polygons)
        if tris>1600:
            d=ob.modifiers.new('Mobile surface budget','DECIMATE'); d.ratio=max(.45,1600/tris); bpy.ops.object.modifier_apply(modifier=d.name)
    bpy.context.view_layer.update()
    pts=[Vector(v) for o in game.children for v in o.bound_box]; minz=min(p.z for p in pts)
    dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
    factor=min(.98/dims[2],.6/max(dims[:2]))
    matrix=Matrix.Diagonal((factor,factor,factor,1)) @ Matrix.Translation((0,0,-minz))
    for o in [*root.children,*game.children]: o.data.transform(matrix)
    bpy.context.view_layer.update()
    return game

def animations(game):
    game.animation_data_create()
    # Each exported clip animates a stable root only. Gameplay still owns position/state.
    poses={
      'idle':[(1,0,0,1),(16,.009,0,1.012),(31,0,0,1)],
      'move':[(1,0,-.06,1),(7,.045,.06,.96),(13,0,-.06,1),(19,.045,.06,.96),(25,0,-.06,1)],
      'skill':[(1,0,0,1),(6,-.018,0,.92),(12,.05,.12,1.08),(20,0,0,1)],
      'fall':[(1,0,0,1),(5,.02,-.15,1),(13,.22,math.pi/2,1),(18,.2,math.pi/2,1)],
      'recover':[(1,.2,math.pi/2,1),(10,.045,.25,.96),(18,0,0,1)],
    }
    rest_points=[Vector(v) for child in game.children for v in child.bound_box]
    for name,keys in poses.items():
        action=bpy.data.actions.new(name); game.animation_data.action=action
        for frame,z,angle,s in keys:
            if name in ('fall','recover'):
                transform=Matrix.Rotation(angle,4,'X') @ Matrix.Diagonal((1,1,s,1))
                z=max(0,-min((transform @ p).z for p in rest_points))
            game.location=(0,0,z); game.rotation_euler=(angle,0,0); game.scale=(1,1,s)
            for prop in ('location','rotation_euler','scale'): game.keyframe_insert(prop,frame=frame)
        track=game.animation_data.nla_tracks.new(); track.name=name; strip=track.strips.new(name,1,action); strip.name=name
        track.mute=True
    game.animation_data.action=None; game.location=(0,0,0); game.rotation_euler=(0,0,0); game.scale=(1,1,1); scene.frame_set(1)
    return list(poses)

models=[]; roots=[]; edit_roots=[]
todo=[id for id in IDS if not SAMPLES or id in ('bite-mark','hog-knight','null','tail')]+['bite-mark-were','hog-knight-hog']
if ONLY: todo=[ONLY]
for id in todo:
    edit=setup(id); normalize(edit); game=merge_game(edit,id); clips=animations(game)
    select([game,*game.children]); path=OUT/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=True,export_extras=True,export_texcoords=False,export_tangents=False,export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
    pts=[Vector(v) for o in game.children for v in o.bound_box]; dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in game.children)
    row={'id':id,'node':game.name,'url':'/models/second-wind/'+id+'.glb','avatar':'/avatars/second-wind/'+id+'.svg','avatarStyle':'flat-cartoon-svg','modelPreview':'/models/second-wind/avatars/'+id+'.png','bytes':path.stat().st_size,'triangles':tris,'draws':len(game.children),'bounds':[round(dims[0],5),round(dims[2],5),round(dims[1],5)],'pivotY':0,'animations':clips,**NOTES[id]}
    if id in IDS:
        from urllib.parse import quote
        row['referenceImage']='https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/'+quote(FILENAMES[IDS.index(id)]+'.png')
    else:
        row['variantOf']='bite-mark' if id=='bite-mark-were' else 'hog-knight'
        row.pop('avatar');row.pop('avatarStyle');row.pop('modelPreview') # modules do not appear as independently draftable cards
    models.append(row); roots.append(game); edit_roots.append(edit)
    for ob in [edit,*edit.children,game,*game.children]: ob.hide_render=True; ob.hide_set(True)
    row['editableSource']='assets/blender/second-wind/'+id+'.blend'
    print('EXPORTED',id,tris,path.stat().st_size,flush=True)

manifest={'version':1,'edition':'second-wind','generator':'Blender '+bpy.app.version_string,'source':'assets/blender/second-wind.blend','units':'metres','up':'+Y','forward':'+Z','pivot':'ground-centre','compression':'EXT_meshopt_compression','models':[m for m in models if m['id'] in IDS],'variants':[m for m in models if m['id'] not in IDS],'totalBytes':sum(m['bytes'] for m in models),'totalTriangles':sum(m['triangles'] for m in models),'materialCount':len(MATS),'textureCount':0,'referenceStatus':'36 fan-site illustrations visually inspected; closed-volume toy interpretations; unseen views explicitly inferred; not exact official production sculpts.'}
manifestpath=SOURCE/'second-wind'/(ONLY+'.json') if ONLY else OUT/('samples.manifest.json' if SAMPLES else 'manifest.json')
manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if ONLY:
    # Separate processes avoid the candidate build's cumulative dependency-graph crash.
    for ob in [roots[0],*roots[0].children]: ob.hide_render=False; ob.hide_set(False)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'second-wind'/(ONLY+'.blend')),compress=True)
    print('SECOND_WIND_ONE_DONE',ONLY,flush=True)
    sys.exit(0)

# Multi-view render uses exactly the exported mesh data, not a substitute high-poly scene.
def label(text,x,z):
    data=bpy.data.curves.new('QA-label','FONT'); data.body=text; data.align_x='CENTER'; data.size=.085; ob=bpy.data.objects.new('QA-label',data); scene.collection.objects.link(ob); ob.location=(x,-.05,z); ob.rotation_euler=(math.pi/2,0,0); data.materials.append(MATS['paper']); return ob
qaobjs=[]; cameradata=bpy.data.cameras.new('SecondWind-review-camera'); camera=bpy.data.objects.new('SecondWind-review-camera',cameradata); scene.collection.objects.link(camera)
camera.location=(0,-15,4.95); target=Vector((0,0,4.95)); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); cameradata.type='ORTHO'; cameradata.ortho_scale=9.9; scene.camera=camera
for name,loc,energy,size in [('Key',(-4,-5,10),950,6),('Fill',(5,-2,5),650,5),('Rim',(0,4,8),1100,4)]:
    light=bpy.data.lights.new(name,'AREA'); light.energy=energy; light.shape='DISK'; light.size=size; ob=bpy.data.objects.new(name,light); scene.collection.objects.link(ob); ob.location=loc; ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.19,.19,.19); scene.render.engine='CYCLES'; scene.cycles.samples=12; scene.cycles.use_denoising=True; scene.render.threads_mode='FIXED'; scene.render.threads=1
scene.render.resolution_x=1800; scene.render.resolution_y=2160; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False; scene.view_settings.view_transform='AgX'
for view,angle in [('front',0),('side',-math.pi/2),('back',math.pi)]:
    for ob in qaobjs: bpy.data.objects.remove(ob,do_unlink=True)
    qaobjs=[]
    for index,game in enumerate(roots):
        x=(index%6-2.5)*1.375; z=(5-index//6)*1.65+.28
        for child in game.children:
            copy=bpy.data.objects.new('QA-'+game.name,child.data); scene.collection.objects.link(copy); copy.matrix_world=Matrix.Translation((x,0,z)) @ Matrix.Rotation(angle,4,'Z'); qaobjs.append(copy)
        qaobjs.append(label(game.name.removeprefix('toy_'),x,z-.12))
    if RENDER:
        scene.render.filepath=str(QA/('all-36-'+view+('.samples' if SAMPLES else '')+'.png')); bpy.ops.render.render(write_still=True)
    if view=='front':
        # Keep a ready-to-inspect lineup in the .blend. Editable parts remain named and intact.
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/('second-wind.samples.blend' if SAMPLES else 'second-wind.blend')),compress=True)
print('SECOND_WIND_DONE',json.dumps({'models':len(manifest['models']),'bytes':manifest['totalBytes'],'triangles':manifest['totalTriangles']}),flush=True)
