"""Leaf fan expansion toys from the author's actual transparent gamepiece PNGs.

Run Blender --background --threads 1 --python this.py -- --only=catfish.
Original PNGs remain research inputs, not redistributed card art.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
code=(ROOT/'scripts/generate-second-wind-models.py').read_text(encoding='utf8')
exec(compile(code[:code.index('models=[]; roots=[]; edit_roots=[]')],str(ROOT/'scripts/generate-second-wind-models.py'),'exec'))
OUT=ROOT/'public/models/leaf'; OUT.mkdir(parents=True,exist_ok=True)
SOURCES=ROOT/'assets/blender/leaf'; SOURCES.mkdir(parents=True,exist_ok=True)
short=next(a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')); id='leaf-'+short
root=bpy.data.objects.new('EDIT-'+id,None);scene.collection.objects.link(root);current={'id':id,'root':root}
traits=[]
def note(t): traits.append(t)
def quadruped(color):
    O(color,(0,.45,0),(.19,.21,.34),'body');
    for x in (-.13,.13):
        for z in (-.22,.22): L(color,[(x,.42,z),(x,.08,z)],.042,'leg'); O('ink',(x,.045,z+.02),(.05,.04,.07),'hoof')
    L(color,[(0,.48,.21),(0,.75,.26)],.12,'neck'); O(color,(0,.83,.27),(.14,.2,.15),'head'); O(color,(0,.73,.4),(.1,.075,.14),'muzzle'); E(y=.89,z=.39,gap=.06,s=.032)
    for x in (-.095,.095): K(color,(x,1.02,.28),.045,0,.17,'ear')
    L('ink',[(0,.55,-.3),(0,.26,-.43)],.027,'tail')
def bird(color='pink'):
    O(color,(0,.39,0),(.22,.2,.29),'bird-body'); O(color,(.04,.69,.18),(.17,.18,.15),'bird-head'); E(x=.04,y=.75,z=.31,gap=.055,s=.03)
    for x in (-.19,.19): O(color,(x,.43,0),(.065,.16,.25),'wing')
    L(color,[(0,.3,-.2),(0,.2,-.4)],.065,'tail')

if short=='catfish':
    O('blue',(0,.3,.07),(.26,.22,.32),'fish-head'); L('blue',[(0,.32,-.1),(.05,.53,-.32),(.04,.78,-.35)],.105,'fish-tail'); E(y=.35,z=.36,gap=.14,s=.045); L('paper',[(-.18,.26,.3),(-.37,.3,.39)],.014,'left-whisker'); L('paper',[(.18,.26,.3),(.37,.3,.39)],.014,'right-whisker')
    for x in (-.26,.26): O('blue',(x,.29,-.02),(.1,.035,.15),'side-fin')
    note('blue catfish, curled upright tail, pale belly and long white whiskers')
elif short=='crash-dummy':
    human('orange','orange');
    for y in (.3,.4,.5): B('brown',(0,y,.143),(.3,.012,.014),'dummy-panel-seam')
    O('ink',(0,.69,.185),(.05,.05,.015),'crash-target'); L('yellow',[(-.037,.69,.205),(.037,.69,.205)],.009,'crash-cross'); note('orange segmented crash dummy with black calibration target and articulated joints')
elif short=='dark-horse':
    quadruped('blue'); L('ink',[(0,1.0,.16),(0,.8,.07),(0,.6,.06)],.055,'black-mane'); note('blue four-legged horse with long face, black mane/tail and dark hooves')
elif short=='kangaroo':
    feet('orange',gap=.14); O('orange',(0,.38,0),(.2,.3,.15),'kangaroo-body'); O('cream',(0,.4,.13),(.12,.18,.025),'pouch'); L('orange',[(0,.26,-.07),(.13,.12,-.36),(.28,.05,-.43)],.065,'long-tail'); O('orange',(0,.79,.03),(.14,.17,.12),'head');
    for x in (-.09,.09): O('orange',(x,1.0,.02),(.037,.19,.032),'ear')
    E(y=.85,z=.14,gap=.05,s=.03); O('pink',(0,.76,.2),(.055,.035,.06),'nose'); arms('orange',y=.56,wide=.21); note('orange kangaroo, tall ears, cream pouch, long support tail and large feet')
elif short=='loan-shark':
    K('blue',(0,.5,0),.26,.09,.8,'upright-shark'); O('ink',(0,.54,.18),(.15,.17,.025),'wide-grin');
    for x in (-.11,-.055,0,.055,.11): K('orange',(x,.64,.21),.03,0,.13,'tooth',rot=(0,0,math.pi))
    hat('red',y=.96,brim=.2,top=.12,band='red'); E(y=.81,z=.13,gap=.055,s=.022); note('blue upright shark, red fedora and broad orange-toothed grin')
elif short=='lonely-wolf':
    quadruped('grey'); O('ink',(0,.73,.52),(.065,.05,.035),'black-nose'); L('paper',[(-.13,.75,.35),(0,.65,.4),(.13,.75,.35)],.018,'ruff'); note('grey quadruped wolf, pointed ears, black nose and pale chest ruff')
elif short=='nepo-baby':
    human('paper','pink'); O('pink',(0,.44,0),(.28,.32,.19),'large-baby'); K('pink',(0,.92,0),.23,.23,.14,'pink-beanie'); O('yellow',(0,.59,.22),(.06,.045,.02),'pacifier');
    for i in range(7): O('yellow',((i-3)*.055,.44-abs(i-3)*.012,.19),.018,'gold-chain')
    note('pink baby with pink knit cap, gold necklace, orange pacifier and white diaper; distinct Leaf version')
elif short=='philanthropist':
    human('blue','brown'); hat('blue',y=.88,top=.22,band='violet'); L('yellow',[(.07,.46,.15),(.14,.49,.15)],.018,'vest-pocket'); note('brown narrow philanthropist, powder-blue waistcoat/top hat and pink hat band')
elif short=='race-car':
    B('red',(0,.22,0),(.45,.16,.72),'formula-car'); K('red',(0,.27,.4),.16,0,.34,'nose',rot=(math.pi/2,0,0)); B('red',(0,.35,-.3),(.68,.055,.18),'rear-spoiler'); B('red',(0,.15,.36),(.68,.05,.17),'front-wing')
    for x in (-.28,.28):
        for z in (-.24,.25):
            O('ink',(x,.14,z),(.085,.14,.14),'wheel'); O('orange',(x*1.23,.14,z),(.015,.065,.065),'wheel-hub')
    O('paper',(0,.4,.04),(.15,.065,.09),'windshield'); E(y=.42,z=.12,gap=.07,s=.027); note('red Formula racing car with four black tyres, front wing, rear spoiler and windshield eyes')
elif short=='revolutionary':
    human('violet','pink'); hat('violet',y=.88,top=.16,brim=.22,band='violet'); L('violet',[(0,1.02,0),(.2,1.11,-.03),(.4,1.07,-.06)],.035,'long-hat-tail'); O('pink',(.09,.7,.19),(.11,.055,.07),'long-nose'); L('yellow',[(-.31,.08,0),(-.25,.79,0)],.018,'walking-staff'); note('pink revolutionary in purple coat and long floppy hat, black boots and walking staff')
elif short=='sole-survivor':
    human('orange','orange'); K('olive',(0,.91,0),.22,.17,.17,'survivor-helmet');
    for i in range(9): L('olive',[((i-4)*.045,.33,.15),((i-4)*.055,.17,.15)],.019,'grass-skirt')
    for x in (-.12,-.06,0,.06,.12): L('ink',[(x,.65,.18),(x,.41,.19)],.023,'long-moustache')
    L('brown',[(.29,.05,0),(.29,.9,0)],.023,'spear'); K('grey',(.29,.96,0),.06,0,.16,'spear-tip'); note('orange survivor, olive helmet, long striped moustache, grass skirt and spear')
elif short=='sore-loser':
    human('blue','orange'); O('orange',(.09,.7,.18),(.15,.075,.09),'large-nose');
    for x in (-.32,.32): O('orange',(x,.55,.06),(.085,.08,.08),'angry-fist')
    L('ink',[(-.12,.85,.15),(-.04,.81,.18)],.015,'angry-brow'); L('ink',[(.12,.85,.15),(.04,.81,.18)],.015,'angry-brow'); note('orange angry athlete with enormous nose, blue shorts and raised clenched fists')
elif short=='spiteful-spirit':
    O('orange',(0,.35,0),(.24,.3,.14),'flame-body');
    for i in range(7): L('orange',[((i-3)*.055,.45,0),((i-3)*.065,.73,0),((i-3)*.05+.025,.87-abs(i-3)*.065,0)],.035,'flame-tip')
    E(y=.43,z=.14,gap=.08,s=.036,pupil='red'); L('red',[(-.14,.26,.135),(-.06,.31,.16),(0,.26,.17),(.07,.3,.16),(.14,.25,.135)],.014,'flame-grimace'); note('orange living flame, multiple curved flame tips, glowing narrow eyes and jagged red mouth')
elif short=='toucan':
    bird(); O('yellow',(.01,.7,.25),(.15,.17,.04),'yellow-face'); O('blue',(.07,.68,.42),(.1,.09,.26),'large-blue-beak'); O('orange',(.07,.67,.63),(.087,.075,.065),'orange-beak-tip'); E(x=-.04,y=.78,z=.32,gap=.035,s=.027); note('pink toucan, bright yellow face patch and oversized blue beak with orange tip')
elif short=='triangle-man':
    verts=[(-.35,.22,-.09),(.35,.22,-.09),(0,.91,-.09),(-.35,.22,.09),(.35,.22,.09),(0,.91,.09)]; faces=[(2,1,0),(3,4,5),(1,4,3,0),(2,5,4,1),(0,3,5,2)]
    mesh=bpy.data.meshes.new('triangle-solid');mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new('triangle-solid',mesh);scene.collection.objects.link(ob); add(ob,'yellow','closed-triangle'); feet('ink'); E(y=.58,z=.1,gap=.055,s=.024); smile(y=.47,z=.1,w=.07); O('pink',(0,.3,.11),(.08,.025,.02),'bowtie'); note('solid yellow triangular prism with green sides, pink bow tie, short legs and black shoes')
elif short=='zombie':
    human('blue','olive');
    for x in (-.28,.28): L('olive',[(x*.55,.52,0),(x,.54,.18),(x,.53,.3)],.037,'outstretched-arm')
    O('pink',(-.075,.86,.02),(.1,.045,.1),'exposed-brain'); B('brown',(0,.2,0),(.32,.2,.25),'brown-pants'); note('green zombie, exposed pink brain patch, torn blue shirt, brown trousers and outstretched arms')
elif short=='thespian':
    human('red','orange');
    for i in range(5): K('yellow',((i-2)*.07,.97,0),.04,0,.18,'stage-crown')
    O('brown',(0,.58,.17),(.12,.15,.04),'stage-beard'); O('blue',(.32,.52,.09),(.13,.16,.027),'comedy-mask'); E(x=.32,y=.55,z=.12,gap=.045,s=.025); L('paper',[(-.16,.62,.14),(.16,.62,.14)],.035,'ruff'); note('crowned orange stage actor, red cape, white ruff, brown beard and separate blue tragedy mask')
elif short=='filmmaker':
    human('paper','olive');
    for x in (-.14,-.07,0,.07,.14): L('green',[(x,.89,-.03),(x-.04,.74,-.12),(x-.06,.49,-.14)],.027,'long-green-hair')
    B('grey',(.26,.76,.1),(.24,.21,.24),'film-camera'); K('ink',(.26,.75,.3),.08,.08,.14,'camera-lens',rot=(math.pi/2,0,0)); O('grey',(.18,.91,.05),.065,'camera-reel'); O('grey',(.33,.91,.05),.065,'camera-reel'); note('green-haired filmmaker in white shirt/light-blue jeans, yellow boots and volumetric grey movie camera')
else: raise ValueError(short)

normalize(root);game=merge_game(root,id);game['edition']='leaf'
motion={'__file__':str(ROOT/'scripts/refine-racer-motion.py'),'__name__':'racer_motion'}
exec(compile((ROOT/'scripts/refine-racer-motion.py').read_text(encoding='utf8'),motion['__file__'],'exec'),motion)
motion['rig'](game,id,'');motion['export'](OUT/(id+'.glb'),[game])
meshes=[o for o in game.children if o.type=='MESH'];pts=[Vector(v) for o in meshes for v in o.bound_box];dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
row={'id':id,'node':game.name,'url':'/models/leaf/'+id+'.glb','bytes':(OUT/(id+'.glb')).stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'draws':len(meshes),'bounds':[round(dims[0],5),round(dims[2],5),round(dims[1],5)],'pivotY':0,'animations':['idle','move','skill','fall','recover'],'bones':5,'motionProfile':motion['profile'](id),'editableSource':'assets/blender/leaf/'+id+'.blend','referenceChecked':True,'reference':'https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete','referenceFile':'PNG_Images_-_Leaf\u0027s_Fan_Expansion.zip / Gamepiece images / '+short,'referenceDate':'2026-10-22','recognition':'; '.join(traits),'inferred':'Author transparent gamepiece PNGs inform silhouettes/colors/props. Unseen back and side details and joints are project interpretations, not author-approved exact sculpts.'}
for obj in [root,*root.children]:obj.hide_render=True;obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/(id+'.blend')),compress=True)
(SOURCES/(id+'.json')).write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('LEAF_MODEL_DONE',id,row['triangles'],row['bytes'],flush=True)
