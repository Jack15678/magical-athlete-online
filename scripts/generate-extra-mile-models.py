"""Original 3D toy interpretations of visually inspected Extra Mile cards.

Blender --background --threads 1 --python this.py -- --only=cletus
Card fronts: author ExtraMile.pdf pp. 1,3,5,7, checked 2026-10-22.
Only verified/playable IDs are connected to the game by the character registry.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[1]
# Reuse the established primitive/material/closed-volume export functions.
code=(ROOT/'scripts/generate-second-wind-models.py').read_text(encoding='utf8')
exec(compile(code[:code.index('models=[]; roots=[]; edit_roots=[]')],str(ROOT/'scripts/generate-second-wind-models.py'),'exec'))
OUT=ROOT/'public/models/extra-mile'; OUT.mkdir(parents=True,exist_ok=True)
SOURCES=ROOT/'assets/blender/extra-mile'; SOURCES.mkdir(parents=True,exist_ok=True)
short=next(a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')); id='extra-mile-'+short
root=bpy.data.objects.new('EDIT-'+id,None); scene.collection.objects.link(root); current={'id':id,'root':root}
traits=[]
def note(text): traits.append(text)
def head(body='orange',skin='orange'): human(body=body,skin=skin)
def nose(color='orange',size=(.1,.07,.12),x=0,y=.66,z=.23): O(color,(x,y,z),size,'nose')
def stick(color='brown',x=.33): L(color,[(x,.04,0),(x,.93,0)],.018,'staff')
def bag(x=-.25,y=.44,color='cream'): O(color,(x,y,-.035),(.17,.2,.15),'sack')
def bird(color='paper',long=False):
    feet('yellow'); O(color,(0,.3,0),(.22,.2,.16),'bird-body'); L(color,[(.07,.34,0),(.07,.67,0),(.03,.78,.03)],.067 if long else .11,'neck'); O(color,(.03,.79,.02),(.13,.15,.12),'bird-head'); nose('yellow',(.14,.045,.17),x=.06,y=.75,z=.16); E(x=.03,y=.83,z=.125,gap=.055,s=.03)
def crown():
    for i in range(5): K('yellow',((i-2)*.067,.985,0),.043,0,.2,'crown-point')
    K('yellow',(0,.9,0),.2,.2,.06,'crown-band')

if short=='gingy':
    head('brown','brown'); O('blue',(0,.5,.16),(.08,.045,.035),'bow'); O('blue',(-.06,.5,.16),(.06,.065,.03),'bow-left'); O('blue',(.06,.5,.16),(.06,.065,.03),'bow-right')
    for y in (.32,.4): O('blue',(0,y,.155),.025,'button')
    for x in (-.22,.22): L('paper',[(x,.38,0),(x,.44,.02),(x,.48,0)],.016,'icing')
    L('paper',[(.3,.16,0),(.3,.86,0),(.37,.93,0),(.4,.84,0)],.025,'candy-cane')
    for y in (.25,.4,.55,.7): L('red',[(.28,y,0),(.32,y+.04,0)],.026,'candy-stripe')
    note('brown gingerbread body, blue bow/buttons, white icing and striped candy cane')
elif short=='school-bully':
    head('blue','grey'); O('olive',(0,.42,0),(.25,.28,.17),'gorilla-torso'); nose('grey',(.14,.08,.08)); K('ink',(0,.9,0),.21,.18,.12,'backwards-cap'); B('ink',(-.17,.88,-.06),(.22,.035,.16),'cap-brim'); L('brown',[(.28,.22,0),(.28,.48,0),(.2,.58,0),(.28,.48,0),(.36,.58,0)],.025,'slingshot'); note('grey gorilla, dark backward cap, blue shorts and wooden slingshot')
elif short=='saint-nick':
    head('red','paper'); O('paper',(0,.58,.19),(.14,.2,.06),'long-beard'); K('red',(0,1.01,0),.18,0,.35,'bishop-mitre'); L('yellow',[(0,.87,-.14),(0,1.17,0)],.012,'mitre-cross'); L('yellow',[(-.14,.98,-.08),(.14,.98,-.08)],.012,'mitre-crossbar'); bag(-.28,.48); stick('yellow'); L('yellow',[(.33,.88,0),(.4,1.01,0),(.46,.95,0),(.41,.9,0)],.021,'crozier'); note('red bishop mitre/coat, white beard, tan sack and golden crozier')
elif short=='totally-fair-ref':
    head('paper','grey'); nose('grey',(.16,.09,.1)); O('grey',(-.18,.76,.01),(.08,.15,.06),'ear'); O('grey',(.18,.76,.01),(.08,.15,.06),'ear'); K('ink',(0,.9,0),.23,.18,.1,'ref-cap')
    for x in (-.12,0,.12): B('ink',(x,.38,.14),(.035,.35,.02),'ref-shirt-stripe')
    note('grey dog referee, striped black/white shirt and black cap')
elif short=='scout':
    head('cream','red'); K('yellow',(0,.91,0),.31,.31,.035,'wide-hat'); K('yellow',(0,.99,0),.2,.09,.18,'hat-crown'); L('green',[(-.14,.53,.16),(.15,.29,.16)],.04,'scout-sash'); stick('green'); B('green',(.44,.79,0),(.23,.18,.035),'flag')
    for x,y in [(-.07,.48),(0,.41),(.07,.35)]: O('violet',(x,y,.2),.022,'badge')
    note('red scout, wide yellow hat, badge sash and green flag')
elif short=='heads':
    feet('paper',.18); arms('paper',.42,.32); O('orange',(0,.46,0),(.33,.065,.28),'coin-disc'); E(y=.62,z=.075,gap=.12,s=.052); L('brown',[(-.19,.48,.2),(.19,.48,.2)],.011,'coin-emboss'); note('horizontal copper coin, tall eyes and white limbs')
    for x in (-.18,.18): L('paper',[(x,.08,.04),(x,.43,.04)],.028,'connected-leg')
    for x in (-.12,.12): L('paper',[(x,.49,.075),(x,.61,.075)],.027,'eye-stalk')
elif short=='doc-paradox':
    head('paper','aqua'); hat('paper',y=.86,top=.12,brim=.24,band='green'); O('green',(0,.48,-.1),(.33,.52,.055),'portal-frame'); O('ink',(0,.48,-.155),(.27,.44,.02),'portal-depth'); L('brown',[(.18,.3,.18),(.26,.46,.18)],.055,'time-device'); note('blue scientist, swept white hair and upright green time portal')
elif short=='cletus':
    head('red','pink'); hat('brown',y=.87,brim=.31,top=.24,band='brown'); nose('pink',(.1,.045,.09)); L('brown',[(-.29,.33,.17),(.25,.55,.2)],.045,'rifle-stock'); L('grey',[(.05,.47,.2),(.43,.62,.2)],.022,'rifle-barrel'); note('pink hunter, tall brown hat, red shirt and long double barrel toy rifle')
elif short=='terrible-toddler':
    head('pink','pink'); O('ink',(0,.66,.19),(.15,.12,.04),'crying-mouth'); O('pink',(0,.6,.23),(.08,.03,.014),'tongue'); B('paper',(0,.23,.02),(.33,.15,.27),'diaper')
    for x in (-.23,.23): O('pink',(x,.74,0),(.09,.065,.05),'ear'); O('aqua',(x*.7,.85,.12),(.02,.045,.02),'tear')
    note('pink crying monkey baby, white diaper, large open mouth and ears')
elif short=='doctor-dice':
    feet('blue'); arms('blue',.49,.3); die((0,.58,0),.42); E(y=.66,z=.225,gap=.09,s=.036); O('grey',(0,.96,.02),(.14,.14,.025),'head-mirror'); L('grey',[(-.18,.62,.23),(-.17,.4,.23),(0,.36,.23)],.014,'stethoscope'); note('white die doctor, blue limbs, silver head mirror and stethoscope')
    for x in (-.12,.12): L('blue',[(x,.08,.04),(x,.43,.04)],.034,'connected-leg')
elif short=='witch-hazel':
    head('ink','green'); hat('ink',y=.9,top=.32,brim=.34,band='grey'); nose('green',(.06,.07,.18)); L('brown',[(-.36,.29,.1),(.4,.42,.1)],.022,'broomstick')
    for y in (.23,.27,.31): L('yellow',[(-.3,.29,.1),(-.48,y,.1)],.03,'broom-straw')
    note('green witch, crooked black hat, hooked nose and yellow broom')
elif short=='broken-clock':
    feet('brown'); O('yellow',(0,.52,0),(.32,.36,.11),'clock-disc'); E(y=.55,z=.12,gap=.075,s=.036); hat('ink',y=.88,brim=.23,top=.1,band='ink'); L('ink',[(-.15,.79,.11),(-.04,.68,.12),(-.14,.62,.12)],.009,'broken-clock-crack')
    for i in range(12):
        a=i*math.pi/6; B('ink',(math.sin(a)*.25,.52+math.cos(a)*.28,.108),(.015,.035,.014),'clock-index',rot=(0,0,-a))
    L('ink',[(0,.52,.13),(.12,.63,.13)],.012,'clock-hand'); note('cracked golden clock face, black bowler hat, moustache and brown feet')
elif short=='moneybags':
    head('green','pink'); nose('pink',(.13,.065,.09)); ears('pink',y=.87); hat('ink',y=.9,top=.23,band='violet'); L('pink',[(-.18,.28,-.11),(-.3,.32,-.13),(-.28,.39,-.12)],.025,'curly-tail'); note('pink pig, black top hat, green trousers and curled tail')
elif short=='honey-pot':
    K('blue',(0,.2,0),.27,.24,.29,'honey-jar'); K('yellow',(0,.35,0),.28,.25,.05,'honey-rim'); O('yellow',(0,.6,0),(.2,.26,.17),'bee-body'); E(y=.76,z=.15,gap=.06,s=.032)
    for y in (.47,.59,.68): K('ink',(0,y,0),.18,.18,.035,'bee-stripe')
    for x in (-.18,.18): O('paper',(x,.7,-.08),(.12,.18,.035),'bee-wing')
    L('brown',[(.15,.39,.12),(.29,.83,.12)],.022,'honey-dipper'); note('striped yellow bee, white wings and blue honey pot')
elif short=='whisper':
    O('violet',(0,.48,0),(.24,.4,.16),'ghost-body'); E(y=.69,z=.15,gap=.065,s=.032)
    for x in (-.16,0,.16): K('violet',(x,.1,0),.065,.09,.17,'ghost-hem')
    for x in (-.1,.1): O('violet',(x,.58,.2),(.07,.13,.05),'shy-hands')
    note('lavender ghost, pointed scalloped hem and hands covering its mouth')
elif short=='mr-fox':
    head('blue','orange'); ears('orange',y=.92); nose('paper',(.15,.065,.12)); O('ink',(0,.67,.35),.035,'black-nose'); B('brown',(-.29,.23,.08),(.22,.16,.1),'briefcase'); L('brown',[(.26,.65,.08),(.44,.65,.08)],.018,'balance-beam'); L('brown',[(.34,.39,.08),(.34,.75,.08)],.014,'balance-post')
    for x in (.26,.44): L('brown',[(x,.65,.08),(x,.5,.08)],.008,'balance-chain'); K('brown',(x,.48,.08),.07,.04,.04,'balance-pan')
    note('orange fox lawyer, navy suit, cream muzzle, briefcase and balance scales')
elif short=='pooh':
    head('yellow','yellow'); ears('yellow',y=.86,wide=.15); O('brown',(.17,.32,.15),(.13,.12,.1),'honey-pot')
    for x in (-.28,-.16,-.04):
        O('red',(x,1.08,.02),(.09,.12,.065),'red-balloon'); L('cream',[(x,1.0,.02),(-.2,.48,.08)],.004,'balloon-string')
    note('round pale yellow bear, honey pot and three red balloons')
elif short=='shuffler':
    feet('blue'); arms('blue',.4,.29); B('paper',(0,.59,0),(.42,.62,.14),'playing-card'); E(y=.72,z=.08,gap=.08,s=.04); O('ink',(0,.49,.086),(.1,.11,.012),'spade'); B('ink',(0,.39,.086),(.045,.07,.02),'spade-stem')
    for i in range(4): B('red',(.28,.65+i*.06,0),(.18,.025,.15),'flying-card')
    note('white playing card with black spade, blue limbs and red card stack')
elif short=='snub':
    head('red','pink'); O('pink',(-.2,.75,0),(.15,.23,.055),'elephant-ear'); O('pink',(.2,.75,0),(.15,.23,.055),'elephant-ear'); L('pink',[(0,.7,.17),(.03,.46,.23),(.11,.45,.23)],.06,'trunk'); note('pink elephant, large ears, short curled trunk and red striped shorts')
elif short=='thief':
    human(body='grey',skin='green',face=False); smile(); K('ink',(0,.89,0),.2,.16,.12,'beanie'); B('ink',(0,.72,.16),(.35,.08,.022),'eye-mask'); E(y=.72,z=.185,gap=.09,s=.025); bag(-.26,.52)
    for y in (.3,.4,.5): B('ink',(0,y,.15),(.34,.03,.02),'shirt-stripe')
    note('green burglar, dark beanie/mask, striped shirt and tan loot sack')
elif short=='gluebert':
    feet('paper'); arms('paper',.36,.24); K('paper',(0,.53,0),.18,.17,.5,'glue-bottle'); B('orange',(0,.54,.16),(.25,.3,.025),'orange-label'); K('orange',(0,.85,0),.1,.08,.12,'nozzle-base'); K('orange',(0,.98,0),.065,.018,.16,'glue-nozzle'); E(y=.6,z=.19,gap=.06,s=.027); smile(y=.48,z=.19,w=.06); note('white glue bottle, orange nozzle/label and white glue-puddle limbs')
elif short=='oddball':
    feet('ink',.12,y=.04); O('paper',(0,.46,0),(.31,.32,.24),'baseball'); E(y=.52,z=.23,gap=.11,s=.05); B('ink',(0,.53,.29),(.34,.025,.02),'glasses-bridge')
    for x in (-.2,.2):
        for y in (.3,.4,.5,.6,.7): L('red',[(x-.022,y,.2),(x+.014,y+.025,.2)],.008,'baseball-stitch')
    note('white baseball, red stitching, thick black spectacles and buck teeth')
elif short=='silly-goose':
    bird(long=True); K('red',(0,.95,.02),.16,.16,.08,'propeller-cap'); L('green',[(-.15,1.04,.02),(.15,1.04,.02)],.014,'propeller'); B('ink',(0,.83,.14),(.24,.055,.025),'sunglasses'); O('paper',(-.18,.31,-.05),(.19,.08,.08),'tail-feathers'); note('white long-neck goose, yellow beak, dark sunglasses and propeller cap')
elif short=='lazy-bones':
    B('red',(0,.28,0),(.48,.25,.4),'armchair-seat'); B('red',(0,.54,-.14),(.48,.6,.15),'armchair-back')
    for x in (-.26,.26): B('red',(x,.4,0),(.13,.23,.4),'chair-arm')
    O('paper',(0,.78,.05),(.14,.16,.12),'skull'); E(y=.8,z=.15,gap=.05,s=.028,pupil='ink'); L('paper',[(0,.64,.03),(0,.34,.08)],.027,'spine')
    for y in (.44,.5,.56): L('paper',[(-.12,y,.09),(0,y+.02,.11),(.12,y,.09)],.015,'rib')
    for x in (-.09,.09): L('paper',[(x,.35,.07),(x,.24,.27),(x,.1,.37)],.024,'leg')
    note('white skeleton reclining in a red armchair, visible ribs and long shin bones')
elif short=='dom-and-gary':
    head('orange','orange'); ears('orange'); L('orange',[(-.17,.26,-.08),(-.34,.4,-.1),(-.3,.64,-.08)],.035,'cat-tail'); O('grey',(.31,.34,.05),(.09,.12,.08),'mouse-body'); O('grey',(.31,.48,.07),(.1,.09,.07),'mouse-head'); O('grey',(.24,.54,.05),.055,'mouse-ear'); O('grey',(.38,.54,.05),.055,'mouse-ear'); note('orange cat with curled tail and separate small grey mouse companion')
elif short=='marksman':
    bird('grey'); L('brown',[(.3,.25,.02),(.4,.58,.02),(.3,.9,.02)],.018,'bow'); L('cream',[(.3,.25,.02),(.3,.9,.02)],.005,'bow-string'); L('brown',[(-.18,.5,.13),(.45,.5,.13)],.013,'arrow-shaft'); K('grey',(.45,.5,.13),.035,0,.1,'arrowhead',rot=(0,0,-math.pi/2)); note('grey long-beaked bird archer, wooden bow and arrow')
elif short=='echo':
    O('ink',(0,.46,0),(.15,.26,.1),'hanging-bat'); O('grey',(0,.24,.03),(.12,.11,.08),'bat-head'); E(y=.25,z=.11,gap=.04,s=.024); L('brown',[(-.3,.89,0),(.3,.89,0)],.035,'branch')
    for x in (-.1,.1): L('ink',[(x,.69,0),(x,.88,0)],.022,'hooked-foot'); O('ink',(x*1.4,.51,0),(.08,.25,.075),'folded-wing')
    note('upside-down dark bat hanging from a brown branch, folded wings and small ears')
elif short=='snake-eyes':
    L('green',[(-.18,.08,0),(.17,.1,.03),(0,.28,.04),(-.03,.52,.03),(.01,.78,.04)],.1,'snake-body'); O('green',(0,.81,.04),(.15,.13,.13),'snake-head'); E(y=.86,z=.16,gap=.06,s=.03); L('red',[(0,.76,.16),(.13,.65,.23)],.016,'forked-tongue'); die((-.09,.99,.02),.12); die((.1,.99,.02),.12); note('green coiled snake, cream belly, forked red tongue and two white dice above its eyes')
elif short=='king-pete':
    head('red','aqua'); crown(); L('cream',[(-.3,.91,0),(.26,.5,.1)],.03,'baseball-bat'); B('paper',(0,.39,.15),(.035,.15,.018),'jersey-one'); note('blue child king, pointed golden crown, red jersey and baseball bat')
elif short=='toll-troll':
    head('cream','olive'); ears('olive',y=.8,wide=.24); nose('olive',(.09,.075,.09));
    for i in range(7): K('brown',((i-3)*.053,.94,0),.04,0,.24,'spiky-hair',rot=(0,0,(i-3)*-.13))
    O('ink',(0,.62,.18),(.115,.07,.025),'open-mouth'); note('green troll, spiky brown hair, pointed ears and ragged cream tunic')
elif short=='robin-hood':
    head('green','grey'); hat('green',y=.88,top=.13,brim=.25,band='green'); L('paper',[(.08,.93,0),(.27,1.12,-.03)],.025,'hat-feather'); L('brown',[(.3,.2,.1),(.44,.55,.1),(.3,.92,.1)],.018,'longbow'); L('cream',[(.3,.2,.1),(.3,.92,.1)],.005,'bowstring'); note('grey archer, pointed green feathered hat/tunic, belt and longbow')
else: raise ValueError('Unknown verified Extra Mile appearance '+short)

normalize(root); game=merge_game(root,id); game['edition']='extra-mile'
# Local joint authoring shares the exact standard used by the existing 72 toys.
motion={'__file__':str(ROOT/'scripts/refine-racer-motion.py'),'__name__':'racer_motion'}
exec(compile((ROOT/'scripts/refine-racer-motion.py').read_text(encoding='utf8'),motion['__file__'],'exec'),motion)
motion['rig'](game,id,''); motion['export'](OUT/(id+'.glb'),[game])
meshes=[o for o in game.children if o.type=='MESH']; pts=[Vector(v) for o in meshes for v in o.bound_box]; dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
row={'id':id,'node':game.name,'url':'/models/extra-mile/'+id+'.glb','bytes':(OUT/(id+'.glb')).stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'draws':len(meshes),'bounds':[round(dims[0],5),round(dims[2],5),round(dims[1],5)],'pivotY':0,'animations':['idle','move','skill','fall','recover'],'bones':5,'motionProfile':motion['profile'](id),'editableSource':'assets/blender/extra-mile/'+id+'.blend','referenceChecked':True,'reference':'https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf','referenceDate':'2026-10-22','recognition':'; '.join(traits),'inferred':'Single-view card artwork informs the silhouette and identifying props. Side/back surfaces and joint placement are original project interpretations, not author-approved sculpts.'}
for obj in [root,*root.children]: obj.hide_render=True; obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/(id+'.blend')),compress=True)
(SOURCES/(id+'.json')).write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('EXTRA_MILE_MODEL_DONE',id,row['triangles'],row['bytes'],flush=True)
