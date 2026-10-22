"""Reference-matched toy adaptations of eleven humanoid/special-shape Wurstii sprites.
All geometry authored here; unseen backs are inferred. Blender Z up, -Y front.
"""
from toy import *
SKIN='#efb08a'; BLACK='#17202a'; WHITE='#fff7e6'
def e(n,p,s,c):return ell(n,p,s,c,16,8)
def detail(n,p,s,c):return ell(n,p,s,c,12,6)
def limb(n,a,b,r,c):
 o=rod(n,a,b,r,c)
 if n in ('lab sleeve','bare muscular arm','sleeve','short arm','bare biceps','upper arm'):
  detail(n+' rounded shoulder',a,(r,r,r),c)
 return o
def face(z=1.87,skin=SKIN,wide=.31,nose=.08):
 e('head',(0,-.03,z),(wide,.255,.32),skin)
 eyes(0,-.273,z+.06,spread=wide*.4,size=.058)
 detail('nose',(0,-.325,z-.035),(nose,.10,.08),skin)
def boots(z=.14,x=.18,c='#49342b'):
 for s in [-1,1]:e('shoe',(s*x,-.10,z),(.17,.25,z),c)
def ears(z,skin=SKIN,width=.32):
 for s in [-1,1]:detail('ear',(s*width,0,z),(.075,.065,.11),skin)
def belt(z,width=.37,c='#38312b'):
 box('belt',(0,-.015,z),(width*2,.49,.085),c,.025);box('buckle',(0,-.276,z),(.15,.035,.11),'#e3b944',.015)
def bart():
 yellow='#f3d82d';blue='#3874d3';red='#ec633c'
 # Distinct tall yellow cranium and saw-tooth haircut.
 box('long yellow head',(0,0,1.88),(.53,.45,.65),yellow,.09)
 for i in range(5):rod('hair spike',( -.235+i*.117,0,2.14),(-.235+i*.117,0,2.32+(i%2)*.025),.075,yellow,0)
 ears(1.91,yellow,.29);eyes(0,-.235,1.99,.115,.085)
 detail('upper lip',(0,-.26,1.74),(.24,.10,.10),yellow);detail('nose',(0,-.33,1.90),(.085,.1,.065),yellow)
 e('red t shirt',(0,0,1.20),(.31,.225,.39),red)
 for s in [-1,1]:
  e('short sleeve',(s*.29,0,1.37),(.13,.15,.16),red);limb('bare arm',(s*.34,0,1.30),(s*.40,-.02,1.00),.085,yellow);detail('four finger hand',(s*.4,-.03,.94),(.11,.10,.12),yellow)
  box('blue shorts',(s*.145,0,.82),(.27,.35,.28),blue,.06)
  limb('yellow calf',(s*.145,0,.72),(s*.145,0,.23),.075,yellow)
  e('sneaker',(s*.145,-.08,.14),(.13,.22,.12),blue);box('white sole',(s*.145,-.08,.052),(.25,.38,.055),WHITE,.025)
def wily():
 for s in [-1,1]:
  limb('black trouser',(s*.16,0,.77),(s*.17,0,.18),.12,BLACK);e('black shoe',(s*.17,-.10,.12),(.17,.25,.12),BLACK)
 e('white labcoat',(0,0,1.14),(.38,.25,.49),WHITE)
 for s in [-1,1]:
  limb('lab sleeve',(s*.31,0,1.40),(s*.48,-.02,.97),.13,WHITE);detail('hand',(s*.47,-.04,.89),(.13,.10,.14),SKIN)
  poly('coat lapel',[(s*.04,-.26,1.48),(s*.25,-.235,1.37),(s*.13,-.27,1.13)],'#dedfd6',.025)
 box('coat front seam',(0,-.253,1.03),(.025,.018,.52),'#c3c5c1',.006)
 poly('black tie',[(0,-.287,1.43),(-.065,-.287,1.25),(0,-.287,1.13),(.065,-.287,1.25)],BLACK,.025)
 e('bald cranium',(0,0,1.91),(.32,.25,.35),'#e7c899');ears(1.87,'#e7c899')
 eyes(0,-.24,1.98,.13,.06);detail('bulbous nose',(0,-.31,1.90),(.105,.12,.10),'#e7c899')
 for s in [-1,1]:
  for j in range(3):poly('wild white hair',[(s*.23,.01,1.86+j*.12),(s*(.49-.04*j),0,1.88+j*.14),(s*.26,.02,2.04+j*.10)],WHITE,.15)
  poly('white moustache',[(s*.02,-.31,1.86),(s*.29,-.30,1.85),(s*.23,-.31,1.74),(s*.05,-.32,1.76)],WHITE,.07)
  rod('angry brow',(s*.06,-.282,2.075),(s*.22,-.25,2.12),.035,WHITE)
 detail('mouth',(0,-.273,1.72),(.10,.025,.045),BLACK)
def viking(olaf=False):
 green='#50b837'; red='#cc3b22';cloth=green if olaf else '#235099';hair='#e6c52c' if olaf else '#df4323';wide=.48 if olaf else .34
 for s in [-1,1]:
  e('boot',(s*.22,-.08,.14),(.20,.25,.14),'#c4c5ba' if olaf else '#d64b28')
  limb('leg',(s*.20,0,.20),(s*.20,0,.72),.16,cloth)
 e('tunic',(0,0,1.02),(wide,.29,.48),cloth)
 belt(.79,wide)
 for s in [-1,1]:
  limb('bare muscular arm',(s*(wide-.04),0,1.35),(s*(wide+.13),-.03,1.04),.145,SKIN)
  e('fist',(s*(wide+.14),-.06,.94),(.15,.13,.15),SKIN)
  if not olaf:e('red wrist guard',(s*(wide+.10),-.03,1.10),(.15,.14,.09),red)
 face(1.69,SKIN,.31,.12);ears(1.68)
 # Beards are real tapered solids, not texture planes.
 e('beard',(0,-.26,1.43),(.30,.13,.39),hair)
 for s in [-1,1]:
  e('moustache',(s*.12,-.35,1.67),(.16,.065,.07),hair)
  e('side hair',(s*.29,.02,1.58),(.09,.14,.33),hair)
 if not olaf:
  for s in [-1,1]:e('braided beard',(s*.10,-.27,1.15),(.085,.09,.27),hair);detail('beard clasp',(s*.10,-.28,.96),(.09,.08,.05),'#e9b742')
 e('steel helmet',(0,.015,1.98),(.35,.28,.21),'#929da3')
 box('helmet rim',(0,-.015,1.91),(.69,.52,.085),'#e1e1d3',.04)
 for s in [-1,1]:
  path('helmet horn',[(s*.27,0,2.04),(s*.39,0,2.10),(s*.43,0,2.31)],.055, '#dfc64e' if olaf else WHITE)
 if olaf:
  # Large wooden shield follows the green/yellow Lost Vikings reference.
  e('shield iron rim',(.65,-.01,.93),(.10,.30,.70),'#c9c9bd')
  e('wood shield',(.72,-.02,.93),(.055,.25,.63),'#9c6235')
  for yy in [-.13,.13]:rod('shield metal band',(.765,yy,.41),(.765,yy,1.45),.025,'#bdbeb5')
  detail('shield boss',(.79,-.02,.93),(.08,.09,.10),'#bdbeb5')
 else:
  # Metal kneecaps from the red-bearded running sprite.
  for s in [-1,1]:detail('knee armor',(s*.21,-.14,.58),(.13,.08,.13),'#d7ded9')
def hoagie():
 skin='#ee9c87';blue='#405a75';black='#20242a'
 for s in [-1,1]:
  e('wide jeans leg',(s*.24,0,.47),(.25,.27,.38),blue);e('sneaker',(s*.24,-.09,.13),(.24,.29,.12),black);box('shoe trim',(s*.24,-.19,.08),(.35,.15,.05),WHITE,.02)
 e('round belly',(0,0,.93),(.55,.31,.36),skin)
 e('black concert shirt',(0,.005,1.10),(.62,.375,.49),black)
 for s in [-1,1]:
  e('sleeve',(s*.51,0,1.34),(.18,.23,.21),black);e('bare arm',(s*.60,-.01,1.03),(.15,.18,.31),skin);e('hand',(s*.57,-.08,.82),(.13,.14,.14),skin)
 e('long dark hair',(0,.10,1.71),(.48,.28,.47),black)
 e('face',(0,-.06,1.79),(.30,.25,.27),skin);eyes(0,-.285,1.86,.11,.046);detail('nose',(0,-.33,1.77),(.10,.08,.065),skin)
 for s in [-1,1]:e('hair lock',(s*.32,-.04,1.60),(.15,.21,.35),black)
 e('blue cap',(0,.025,2.015),(.29,.25,.16),'#233eae');e('cap brim',(0,-.20,2.01),(.32,.23,.035),'#233eae')
 # Skull shirt emblem modelled in geometry.
 detail('shirt skull',(0,-.367,1.21),(.12,.025,.13),WHITE)
 for s in [-1,1]:detail('skull eye',(s*.045,-.396,1.24),(.027,.009,.036),black);rod('emblem flame',(s*.15,-.362,1.15),(s*.34,-.309,1.25),.03,'#eab440')
 box('skull jaw',(0,-.374,1.09),(.13,.04,.07),WHITE,.02)
def jason():
 purple='#6c29b8';teal='#4ce2cc';dark='#22203d'
 for s in [-1,1]:
  e('combat boot',(s*.18,-.07,.13),(.18,.28,.13),purple);limb('trouser',(s*.17,0,.19),(s*.17,0,.86),.15,purple)
 e('purple jacket',(0,0,1.22),(.37,.25,.43),purple);belt(.86,.36,dark)
 for s in [-1,1]:
  limb('sleeve',(s*.30,0,1.42),(s*.47,-.02,1.03),.13,purple);e('teal glove',(s*.48,-.07,.95),(.13,.12,.16),teal)
 e('dark hood',(0,.015,1.90),(.31,.26,.37),dark)
 e('cyan hockey mask',(0,-.16,1.90),(.27,.16,.34),teal)
 for s in [-1,1]:
  detail('eye cutout',(s*.105,-.306,1.98),(.057,.018,.041),dark)
  for z in [1.83,1.72]:detail('mask ventilation',(s*.12,-.288,z),(.021,.014,.023),dark)
 detail('mask nose',(0,-.326,1.88),(.032,.015,.036),dark)
 for x in [-.07,0,.07]:detail('mask forehead holes',(x,-.274,2.11),(.018,.014,.021),dark)
 # A small blunt toy machete; no bloody treatment.
 rod('machete handle',(.48,-.08,.91),(.50,-.10,.72),.055,'#303139')
 poly('blunt machete',[(.46,-.1,.73),(.56,-.1,.73),(.62,-.1,.29),(.50,-.1,.24)],'#a5b4bb',.055)
def harry():
 cyan='#33d2cf';dark='#167c9e';skin='#f0b49e'
 for s in [-1,1]:
  limb('trouser',(s*.16,0,.18),(s*.17,0,.85),.13,cyan);e('dark boot',(s*.17,-.10,.13),(.16,.26,.13),dark)
 e('explorer shirt',(0,0,1.19),(.31,.22,.43),cyan);belt(.86,.30,dark)
 for s in [-1,1]:
  e('rolled sleeve',(s*.29,0,1.38),(.12,.14,.17),cyan);limb('bare forearm',(s*.35,-.01,1.26),(s*.43,-.03,1.00),.082,skin);detail('hand',(s*.43,-.06,.95),(.11,.10,.12),skin)
 face(1.87,skin,.28);ears(1.85,skin,.28)
 e('hat crown',(0,.01,2.12),(.28,.25,.25),cyan);e('wide fedora brim',(0,-.025,2.04),(.40,.33,.045),cyan)
 box('hat band',(0,-.01,2.10),(.55,.45,.06),dark,.03)
 for s in [-1,1]:box('shirt pocket',(s*.13,-.215,1.28),(.13,.035,.14),dark,.02)
 # Exploratory pack supplies unseen rear completion without changing identity.
 box('small satchel',(.30,.04,.93),(.19,.18,.27),'#208c9c',.04)
def simon():
 brown='#943e25';gold='#d9914b';skin='#e8ae78';dark='#4e271e'
 for s in [-1,1]:
  e('tall leather boot',(s*.18,0,.30),(.15,.17,.29),brown);e('boot toe',(s*.18,-.14,.10),(.16,.24,.10),brown)
  limb('bare upper leg',(s*.16,0,.47),(s*.16,0,.94),.13,skin)
 e('leather torso',(0,0,1.23),(.33,.23,.42),brown);belt(.91,.32,dark)
 for s in [-1,1]:
  e('shoulder guard',(s*.28,0,1.47),(.16,.24,.12),gold)
  limb('bare biceps',(s*.32,0,1.39),(s*.45,-.02,1.17),.105,skin)
  limb('bracer',(s*.45,-.02,1.17),(s*.49,-.06,1.02),.115,brown);detail('fist',(s*.49,-.07,.96),(.12,.11,.13),skin)
 e('long russet hair',(0,.10,1.88),(.34,.25,.41),brown);face(1.9,skin,.27)
 for s in [-1,1]:e('side locks',(s*.26,.02,1.80),(.085,.13,.28),brown)
 box('headband',(0,-.26,2.07),(.51,.045,.065),gold,.02)
 # Whip rests in a side loop rather than acting as a base.
 path('leather whip',[(.50,-.08,.94),(.64,-.04,.70),(.65,.04,.42),(.52,.12,.31),(.42,.14,.48)],.023,dark)
 poly('chest harness',[(-.25,-.21,1.47),(-.17,-.24,1.50),(.25,-.22,1.04),(.16,-.24,1.01)],gold,.025)
def guest():
 green='#39763e';pants='#337875';skin='#c68a60';hair='#603c26'
 e('torso',(0,0,1.15),(.36,.24,.43),green)
 for s in [-1,1]:
  limb('leg',(s*.17,0,.85),(s*.18,0,.21),.14,pants)
  e('boot',(s*.18,-.10,.15),(.18,.28,.15),'#49352e')
  limb('upper arm',(s*.31,0,1.39),(s*.46,-.015,1.02),.12,green)
  e('hand',(s*.47,-.04,.91),(.13,.12,.15),skin)
 e('hair',(0,.04,1.94),(.33,.26,.36),hair)
 face(1.91,skin,.32)
 # Brown side-swept hair, green polo and narrow brown belt.
 e('swept brown fringe',(-.07,-.135,2.13),(.28,.16,.11),hair)
 belt(.88,.33,hair)
 for s in [-1,1]:poly('polo collar',[(s*.02,-.225,1.53),(s*.16,-.22,1.47),(s*.075,-.24,1.34)],'#74a361',.025)
 box('ticket pocket',(-.16,-.23,1.20),(.15,.03,.15),'#2a6036',.02)
 box('small daypack',(0,.245,1.18),(.42,.22,.43),'#8e643f',.08)
def rockford():
 pink='#f4a195';dark='#332c30'
 # A squat miner, with oversized peach helmet and tiny feet.
 for s in [-1,1]:
  e('boot',(s*.19,-.07,.13),(.19,.24,.13),dark);e('short leg',(s*.15,0,.36),(.14,.15,.21),pink)
 e('peach suit',(0,0,.80),(.38,.25,.38),pink)
 for s in [-1,1]:
  limb('short arm',(s*.31,0,.96),(s*.49,-.02,.80),.11,pink);detail('mitten',(s*.49,-.04,.75),(.13,.12,.12),pink)
 box('square face',(0,0,1.30),(.62,.43,.58),pink,.10)
 for s in [-1,1]:box('dark vertical eye',(s*.13,-.224,1.36),(.065,.027,.14),dark,.015)
 e('miner helmet',(0,.01,1.64),(.44,.32,.25),pink);e('helmet brim',(0,-.035,1.53),(.49,.37,.047),dark)
 for s in [-1,1]:box('helmet vent',(s*.16,-.286,1.69),(.11,.025,.045),dark,.01)
 detail('helmet side lamp',(.42,-.04,1.64),(.07,.11,.12),WHITE)
 for s in [-1,1]:rod('suspender',(s*.22,-.23,1.02),(s*.07,-.255,.67),.035,dark)
 detail('suit button',(0,-.26,.58),(.04,.02,.045),dark)
def burt():
 skin='#efc791';blue='#507cc9';white='#e7f2da';dark='#242c34'
 # Burt the Bashful: enormous striped trousers, bare belly and little hair.
 e('blue round trousers',(0,0,.73),(.59,.37,.63),blue)
 # Curved raised vertical ivory strips, terminating naturally under the waistband.
 for x in [-.38,-.13,.13,.38]:
  z=.73; yy=-.37*math.sqrt(max(.1,1-(x/.62)**2));e('ivory trouser stripe',(x,yy+.02,z),(.07,.035,.48),white)
 for s in [-1,1]:e('little blue foot',(s*.23,-.06,.10),(.21,.24,.10),blue)
 e('bare rounded upper body',(0,0,1.51),(.51,.33,.37),skin)
 # Side-on long muzzle from reference is adapted into full-volume front-facing snout.
 e('long nose',(0,-.31,1.62),(.29,.24,.105),skin)
 detail('mouth line',(0,-.49,1.54),(.18,.026,.022),dark)
 for s in [-1,1]:
  detail('small eye',(s*.18,-.295,1.77),(.032,.02,.045),dark)
  detail('pink cheek',(s*.36,-.22,1.55),(.09,.04,.10),'#e98883')
 e('white waistband',(0,-.015,1.17),(.57,.35,.105),white)
 for s in [-1,1]:box('waistband dash',(s*.31,-.31,1.18),(.16,.028,.025),dark,.005)
 path('one wispy hair',[(-.13,.00,1.84),(-.22,.01,2.00),(-.35,.01,2.06)],.025,dark)
 for x in [.08,.19]:rod('short crown hair',(x,0,1.83),(x,0,1.96),.035,dark)
BUILDERS={'bart-simpson':bart,'dr-wily':wily,'eric':lambda:viking(False),'hoagie':hoagie,'jason-vorhees':jason,'olaf':lambda:viking(True),'pitfall-harry':harry,'simon-belmont':simon,'rollercoaster-tycoon-guest':guest,'rockford':rockford,'burt':burt}
def build(id):
 key=id.removeprefix('wurstii-')
 if key not in BUILDERS:return False
 BUILDERS[key]();return True
