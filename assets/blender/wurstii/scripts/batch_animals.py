"""Reference-informed toy geometry. Blender Z-up, front -Y. Hidden surfaces inferred."""
from toy import *

def E(n,p,s,c):return ell(n,p,s,c,14,8)
def S(n,p,s,c):return ell(n,p,s,c,10,6)
def eye_pair(y,z,spread=.14,size=.07,x=0):
 for q in [-1,1]:
  S('ivory eye',(x+q*spread,y,z),(size,.035,size*1.2),'#fffbed')
  S('dark pupil',(x+q*spread,y-.03,z),(.032,.019,.047),'#182333')
def ears(c,z=2.1):
 for q in [-1,1]:
  E('outer ear',(q*.28,0,z),(.14,.09,.20),c)
  S('inner ear',(q*.28,-.081,z),(.085,.025,.12),'#efc3a1')
def shoes(c='#db3839',z=.13):
 for q in [-1,1]:
  E('shoe',(q*.18,-.11,z),(.19,.28,.13),c)
  E('sole',(q*.18,-.10,z-.07),(.19,.27,.055),'#fff8df')
def glove(q,x=.48,z=1.0):
 E('glove',(q*x,-.08,z),(.16,.14,.18),'#fff9ec')
 S('thumb',(q*(x-.11),-.17,z+.02),(.085,.09,.1),'#fff9ec')
def toon_body(c,bib=None):
 E('body',(0,.015,1.0),(.31,.25,.46),c)
 if bib:E('belly patch',(0,-.228,1.02),(.23,.045,.31),bib)
 for q in [-1,1]:rod('leg',(q*.16,0,.73),(q*.18,0,.18),.105,c)
def monkey(dixie=False):
 brown='#915435';tan='#e8bf83';pink='#dc4082';red='#dd3e32';cloth=pink if dixie else red
 toon_body(brown);E('shirt',(0,.015,1.10),(.34,.29,.36),cloth)
 E('head',(0,-.01,1.73),(.34,.27,.33),brown)
 E('face',(0,-.228,1.78),(.245,.10,.25),tan)
 E('muzzle',(0,-.34,1.61),(.28,.18,.17),tan)
 eye_pair(-.327,1.86,.105,.061);S('nostril L',(-.09,-.508,1.65),(.028,.018,.025),'#503523');S('nostril R',(.09,-.508,1.65),(.028,.018,.025),'#503523')
 for q in [-1,1]:
  E('ear',(q*.34,0,1.77),(.13,.075,.15),brown);S('ear inner',(q*.35,-.065,1.77),(.08,.02,.09),tan)
  S('round shoulder',(q*.29,0,1.28),(.10,.10,.10),brown);rod('arm',(q*.29,0,1.28),(q*.44,-.1,.69),.10,brown);E('hand',(q*.44,-.12,.60),(.13,.14,.16),tan)
  E('foot',(q*.18,-.12,.12),(.16,.26,.12),tan)
 path('curled tail',[(0,.21,.78),(.29,.35,.72),(.47,.36,1.06),(.46,.33,1.42),(.30,.32,1.54)],.065,brown)
 E('cap',(0,.005,2.035),(.35,.28,.12),cloth);E('cap brim',(0,-.29,1.98),(.35,.23,.055),cloth)
 if dixie:
  # characteristic high blonde ponytail flowing behind cap, not a separate prop
  path('pony braid',[(0,.15,2.08),(-.22,.24,2.31),(-.47,.23,2.21),(-.50,.24,1.83),(-.40,.24,1.54)],.16,'#f4cf45')
 else:
  poly('shirt star',[(-.13,-.279,1.15),(-.05,-.279,1.16),(0,-.279,1.27),(.05,-.279,1.16),(.13,-.279,1.15),(.06,-.279,1.08),(.08,-.279,.98),(0,-.279,1.03),(-.08,-.279,.98),(-.06,-.279,1.08)],'#f6d84c',.065)
def tails():
 orange='#e8a02a';white='#fff7e8';toon_body(orange,white);shoes()
 # Two individually readable fox tails with cream tapered tips
 for q in [-1,1]:
  o=E('fox tail '+str(q),(q*.32,.31,.77),(.23,.22,.60),orange);o.rotation_euler[1]=q*.48
  o=E('white tail tip '+str(q),(q*.54,.32,1.19),(.18,.20,.30),white);o.rotation_euler[1]=q*.48
 E('fox head',(0,-.01,1.73),(.42,.30,.35),orange)
 for q in [-1,1]:
  poly('pointed fox ear',[(q*.15,0,1.95),(q*.38,0,2.31),(q*.45,0,1.91)],orange,.15)
  poly('ear cream',[(q*.23,-.085,1.99),(q*.37,-.085,2.21),(q*.39,-.085,1.98)],white,.012)
  E('cheek fluff',(q*.22,-.25,1.62),(.23,.11,.15),white)
  S('round shoulder',(q*.28,0,1.26),(.09,.09,.09),orange);rod('fox arm',(q*.28,0,1.26),(q*.46,-.04,1.00),.09,orange);glove(q)
 eye_pair(-.297,1.82,.15,.10);E('cream muzzle',(0,-.30,1.59),(.23,.12,.13),white);S('fox nose',(0,-.418,1.66),(.07,.06,.05),'#252b33')
 # sculpted forehead tuft
 poly('forehead tuft',[(-.20,-.15,2.02),(-.04,-.17,2.25),(.13,-.17,2.04),(.27,-.15,2.08),(.15,-.15,1.90)],orange,.13)
def knuckles():
 red='#d73543';toon_body(red);shoes('#b43b38')
 E('red head',(0,0,1.77),(.38,.29,.34),red)
 for q in [-1,1]:
  for i in range(3):
   path('dreadlock',[(q*(.24+i*.055),.05+i*.07,1.98),(q*(.36+i*.055),.08+i*.05,1.62),(q*(.30+i*.07),.10+i*.07,1.39)],.085,red)
  S('round shoulder',(q*.27,0,1.28),(.10,.10,.10),red);rod('red arm',(q*.27,0,1.28),(q*.43,-.10,1.11),.10,red);glove(q,.46,1.11)
  for t in [-1,1]:rod('glove spike',(q*.46+t*.055,-.13,1.25),(q*.46+t*.055,-.14,1.40),.055,'#fff9ec',.012)
  E('shoe green cuff',(q*.18,0,.27),(.145,.16,.09),'#5b9671');E('shoe yellow stripe',(q*.18,-.29,.15),(.12,.05,.035),'#eac64b')
 E('muzzle',(0,-.275,1.62),(.25,.12,.13),'#efc49b');eye_pair(-.28,1.81,.125,.08);S('nose',(0,-.393,1.69),(.07,.05,.04),'#202933')
 poly('white chest crescent',[(-.22,-.247,1.27),(-.12,-.28,1.10),(0,-.287,1.06),(.12,-.28,1.10),(.22,-.247,1.27),(.10,-.28,1.18),(0,-.287,1.16),(-.10,-.28,1.18)],'#fff5df',.02)
 path('short tail',[(0,.21,.83),(0,.36,.82),(0,.45,1.02)],.065,red)
def yoshi():
 green='#52af45';ivory='#fff8df';E('dino body',(0,.04,.87),(.34,.29,.43),green);E('belly',(0,-.23,.88),(.24,.06,.34),ivory)
 E('neck',(0,-.01,1.30),(.24,.22,.37),green);E('head',(0,-.01,1.68),(.30,.26,.35),green)
 E('big nose snout',(0,-.34,1.61),(.37,.35,.27),green)
 for q in [-1,1]:
  E('eye tower',(q*.13,-.045,1.93),(.14,.16,.24),green);E('eye white',(q*.13,-.17,1.97),(.095,.055,.16),ivory);S('eye pupil',(q*.13,-.216,1.98),(.038,.025,.09),'#172c2a')
  S('nostril',(q*.15,-.625,1.71),(.034,.02,.025),'#25683d');S('round shoulder',(q*.25,0,1.09),(.095,.095,.095),green);rod('arm',(q*.25,0,1.09),(q*.40,-.16,.96),.095,green);E('hand',(q*.40,-.19,.93),(.12,.12,.12),green)
  rod('leg',(q*.18,.01,.58),(q*.21,-.01,.20),.12,green);E('orange shoe',(q*.21,-.12,.14),(.18,.28,.14),'#d98438')
 E('saddle white rim',(0,.29,1.04),(.25,.09,.27),ivory);E('red saddle',(0,.36,1.05),(.20,.06,.21),'#c94839')
 rod('tail',(0,.20,.65),(0,.67,.42),.19,green,.025)
 for z in [1.47,1.70,1.90]:E('orange back spine',(0,.25,z),(.10,.12,.09),'#dd8340')
def drybones():
 ivory='#e7e3d7';gray='#666b72';E('shell',(0,.15,1.0),(.40,.22,.46),gray);E('shell rim',(0,.23,1.0),(.35,.15,.39),ivory)
 # raised shell panel geometry
 for x,z in [(0,1.06),(-.18,1.02),(.18,1.02),(0,.82),(0,1.30)]:E('shell plate',(x,.35,z),(.14,.045,.14),'#b4b6b1')
 E('rib body',(0,-.07,1.0),(.29,.24,.36),ivory)
 for z in [.83,1.0,1.17]:E('rib line',(0,-.293,z),(.24,.022,.025),gray)
 E('skull',(0,-.03,1.72),(.30,.25,.37),ivory);E('long skull muzzle',(0,-.30,1.49),(.28,.27,.17),ivory)
 for q in [-1,1]:
  E('dark eye socket',(q*.13,-.25,1.78),(.10,.055,.145),'#252b33');S('eye light',(q*.13,-.298,1.79),(.043,.018,.067),'#fff8e5')
  S('nose hole',(q*.10,-.535,1.53),(.035,.018,.035),'#31363d');S('round bone shoulder',(q*.26,0,1.22),(.08,.08,.08),ivory);rod('upper arm',(q*.26,0,1.22),(q*.40,-.04,1.00),.075,ivory);E('bone elbow',(q*.40,-.04,1.00),(.095,.09,.095),ivory);rod('forearm',(q*.40,-.04,1.0),(q*.43,-.14,.84),.065,ivory);E('bone hand',(q*.43,-.15,.81),(.12,.10,.10),ivory)
  rod('bone leg',(q*.17,0,.72),(q*.20,-.02,.21),.08,ivory);E('gray shoe',(q*.20,-.14,.14),(.19,.30,.14),gray)
 for x in [-.13,0,.13]:rod('tooth seam',(x,-.546,1.38),(x,-.546,1.45),.011,gray)
def frogger():
 green='#65bf35';yellow='#e4e94b';E('frog body',(0,0,.62),(.43,.36,.30),green);E('frog back',(0,.08,.78),(.34,.27,.14),yellow)
 E('broad head',(0,-.23,.83),(.42,.25,.22),green);E('chin',(0,-.36,.72),(.29,.10,.07),yellow)
 for q in [-1,1]:
  E('raised eye',(q*.26,-.24,1.04),(.15,.15,.16),green);S('magenta eye',(q*.26,-.36,1.07),(.083,.035,.085),'#bf499b');S('pupil',(q*.26,-.39,1.07),(.038,.02,.055),'#20362b')
  E('haunch',(q*.43,.18,.44),(.23,.27,.20),green);rod('lower back leg',(q*.50,.15,.38),(q*.67,-.11,.10),.09,green)
  rod('front arm',(q*.34,-.20,.62),(q*.49,-.46,.10),.085,green)
  for x,y in [(q*.67,-.11),(q*.49,-.46)]:
   E('webbed foot',(x,y-.10,.08),(.15,.20,.08),green)
   for d in [-1,0,1]:S('toe',(x+d*.085,y-.25,.08),(.045,.08,.045),yellow)
 for z in [.58,.72]:S('back spot',(0,.30,z),(.08,.035,.05),'#92cf45')
def lakitu():
 ivory='#fff9e8';green='#488c47';yellow='#dfb447'
 # cloud is an intrinsic body element, not a game base
 for x,y,z,s in [(0,0,.47,.43),(-.30,0,.39,.30),(.30,0,.39,.30),(0,-.20,.35,.32),(-.20,.20,.40,.28),(.20,.20,.40,.28)]:E('cloud puff',(x,y,z),(s,s*.76,s*.78),ivory)
 for q in [-1,1]:S('cloud eye',(q*.12,-.427,.44),(.028,.020,.055),green)
 path('cloud smile',[(-.12,-.42,.29),(0,-.452,.25),(.12,-.42,.29)],.018,green)
 E('shell',(0,.08,1.07),(.27,.22,.32),green);E('body',(0,-.10,1.05),(.23,.20,.28),yellow);E('head',(0,-.08,1.45),(.28,.25,.29),yellow)
 for q in [-1,1]:
  E('goggle frame',(q*.13,-.31,1.50),(.14,.055,.16),green);E('goggle glass',(q*.13,-.355,1.50),(.105,.025,.13),ivory);S('pupil',(q*.13,-.38,1.50),(.036,.018,.065),green)
  S('round shoulder',(q*.19,-.04,1.14),(.075,.075,.075),yellow);rod('arm',(q*.19,-.04,1.14),(q*.34,-.20,.88),.075,yellow);E('hand',(q*.34,-.20,.88),(.09,.09,.09),yellow)
 E('nose',(0,-.35,1.32),(.10,.13,.075),yellow)
 for i in range(3):rod('head hair',(0,.02,1.70),(i*.055-.055,.02,1.89-(abs(i-1)*.04)),.025,'#b57f32')
def lizzie():
 green='#70a93b';belly='#b5cf63';E('reptile body',(0,.03,.94),(.37,.29,.53),green);E('belly',(0,-.24,.94),(.26,.07,.40),belly)
 E('neck',(0,0,1.45),(.25,.22,.25),green);E('reptile head',(0,-.04,1.74),(.34,.26,.32),green);E('snout',(0,-.29,1.62),(.33,.19,.18),green)
 for q in [-1,1]:
  E('eye ridge',(q*.18,-.10,1.98),(.14,.14,.12),green);S('eye',(q*.18,-.227,1.99),(.06,.025,.064),'#f2eeb2');S('pupil',(q*.18,-.25,1.99),(.025,.012,.044),'#28402a');S('round shoulder',(q*.30,0,1.25),(.11,.11,.11),green);S('round elbow',(q*.49,-.08,1.04),(.11,.11,.11),green);rod('arm',(q*.30,0,1.25),(q*.49,-.08,1.04),.11,green);rod('forearm',(q*.49,-.08,1.04),(q*.52,-.25,1.10),.085,green)
  E('claw hand',(q*.52,-.27,1.10),(.12,.11,.10),green);rod('leg',(q*.21,0,.58),(q*.26,-.02,.20),.14,green);E('foot',(q*.26,-.17,.13),(.20,.30,.13),green)
  for d in [-1,0,1]:rod('toe claw',(q*.26+d*.08,-.36,.13),(q*.26+d*.08,-.47,.09),.04,belly,.005)
 path('mouth',[(-.22,-.43,1.57),(0,-.48,1.54),(.22,-.43,1.57)],.016,'#3e6c30')
 rod('tail',(0,.23,.65),(0,.80,.26),.23,green,.035)
 for z in [.62,.89,1.17,1.42]:rod('dorsal scale',(0,.16,z),(0,.43,z+.10),.10,'#528332',.008)
def falco():
 blue='#4b65ad';white='#e7e9e6';yellow='#edbf3d';E('jacket',(0,0,1.10),(.34,.25,.40),white);E('red undershirt',(0,-.245,1.15),(.12,.025,.29),'#b24944')
 for q in [-1,1]:
  rod('trouser leg',(q*.16,0,.82),(q*.18,0,.23),.12,'#566477');E('boot',(q*.18,-.10,.15),(.16,.27,.15),'#4b3f35');S('round shoulder',(q*.28,0,1.35),(.11,.11,.11),white);rod('sleeve',(q*.28,0,1.35),(q*.44,-.05,1.02),.11,white);E('blue hand',(q*.45,-.08,.91),(.12,.11,.14),blue)
  poly('jacket lapel',[(q*.07,-.257,1.44),(q*.25,-.24,1.32),(q*.12,-.269,1.15)],'#b9c5ce',.02)
 E('bird head',(0,-.015,1.83),(.31,.25,.34),blue)
 for i in range(3):poly('swept crest',[(-.24+i*.11,.07,2.00),(-.42+i*.10,.10,2.35-i*.05),(.02+i*.07,.05,2.12)],blue,.14)
 E('beak',(0,-.31,1.72),(.19,.28,.105),yellow);rod('beak tip',(0,-.38,1.73),(0,-.65,1.69),.095,yellow,.008)
 eye_pair(-.247,1.93,.12,.065)
 for q in [-1,1]:E('red eye brow',(q*.12,-.277,2.015),(.10,.03,.035),'#c95148')
 rod('belt',(0,-.02,.87),(0,-.02,.94),.30,'#564338');box('buckle',(0,-.295,.91),(.12,.035,.10),yellow,.015)
def bucky():
 green='#84ac43';tan='#dcc189';pink='#ce4679';E('space suit',(0,0,1.04),(.33,.25,.43),pink)
 for q in [-1,1]:
  rod('leg',(q*.17,0,.75),(q*.21,0,.23),.12,pink);E('orange boot',(q*.21,-.1,.14),(.18,.27,.14),'#cc863e');S('round shoulder',(q*.28,0,1.32),(.12,.12,.12),pink);rod('sleeve',(q*.28,0,1.32),(q*.45,-.06,1.1),.12,pink);E('orange gauntlet',(q*.47,-.07,1.01),(.14,.14,.17),'#cc863e');E('long rabbit ear',(q*.19,.04,2.24),(.13,.11,.36),green);E('ear inner',(q*.19,-.055,2.25),(.07,.023,.24),'#bfd878')
 E('rabbit head',(0,-.015,1.76),(.33,.26,.35),green);E('tan muzzle',(0,-.285,1.63),(.24,.12,.13),tan);eye_pair(-.26,1.85,.12,.075);S('rabbit nose',(0,-.398,1.70),(.065,.035,.045),'#617b37')
 for q in [-1,1]:box('front tooth',(q*.035,-.39,1.54),(.055,.04,.09),'#fff8dd',.008)
 E('space helmet band',(0,.02,2.00),(.35,.265,.06),'#627f35');E('visor jewel',(-.18,-.23,2.01),(.065,.045,.06),pink)
 box('belt',(0,0,.90),(.65,.44,.09),'#d7b251',.04);box('belt buckle',(0,-.25,.90),(.14,.05,.12),tan,.02)
 # blue compact backpack, clearly part of suit
 box('jet pack',(0,.25,1.16),(.40,.20,.48),'#866f83',.07)
def chipdale():
 for idx,q in enumerate([-1,1]):
  start=len(PARTS);brown='#8f5733' if idx==0 else '#b66432';tan='#ecd1a1'
  E('chipmunk body',(0,0,.68),(.22,.18,.32),brown)
  if idx==0:E('cream chest',(0,-.16,.69),(.16,.035,.23),tan)
  E('chipmunk head',(0,0,1.12),(.27,.21,.26),brown);E('muzzle',(0,-.19,1.04),(.22,.10,.12),tan)
  for s in [-1,1]:
   S('round ear',(s*.22,.02,1.31),(.09,.07,.10),brown);S('ear inset',(s*.22,-.04,1.31),(.05,.018,.065),tan);S('round shoulder',(s*.19,0,.86),(.065,.065,.065),brown);rod('arm',(s*.19,0,.86),(s*.29,-.04,.57),.065,brown);S('hand',(s*.29,-.05,.53),(.075,.07,.08),tan);rod('leg',(s*.11,0,.43),(s*.14,-.015,.115),.065,brown);E('foot',(s*.14,-.09,.09),(.10,.15,.09),brown)
   S('eye white',(s*.085,-.195,1.17),(.065,.035,.095),'#fff8e9');S('eye pupil',(s*.085,-.223,1.17),(.027,.016,.055),'#252a2e')
  S('nose',(0,-.285,1.08),(.055,.04,.04),'#3b2c24' if idx==0 else '#be4539');box('tooth',(0,-.28,.98),(.07,.03,.065),'#fff8e9',.009)
  E('tail',(0,.20,.57),(.13,.15,.24),brown);E('tail stripe',(0,.335,.59),(.04,.015,.19),'#472d25')
  if idx==0:
   E('ranger hat brim',(0,0,1.36),(.33,.25,.04),'#c9ab78');E('ranger hat crown',(0,.02,1.45),(.22,.18,.13),'#d5b887');E('hat ribbon',(0,.015,1.38),(.23,.19,.035),'#624736');E('jacket',(0,.015,.74),(.24,.19,.25),'#885d3d');E('jacket opening',(0,-.176,.75),(.105,.025,.22),tan)
  else:
   E('red vacation shirt',(0,.015,.74),(.24,.195,.25),'#d54632')
   for x,z in [(-.10,.84),(.12,.71),(-.09,.60)]:S('shirt flower',(x,-.177,z),(.04,.015,.035),'#f5d589')
   poly('head tuft',[(-.10,0,1.30),(0,0,1.48),(.09,0,1.31)],brown,.10)
  for o in PARTS[start:]:o.location.x+=q*.37

def build(id):
 name=id.replace('wurstii-','')
 f={'bucky-ohare':bucky,'chip-n-dale':chipdale,'diddy-kong':lambda:monkey(False),'dixie-kong':lambda:monkey(True),'dry-bones':drybones,'falco-lombardi':falco,'frogger':frogger,'knuckles':knuckles,'lakitu':lakitu,'lizzie':lizzie,'tails':tails,'yoshi':yoshi}.get(name)
 if f:f();return True
 return False
