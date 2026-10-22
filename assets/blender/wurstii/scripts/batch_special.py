from toy import *
def build(id):
 if id=='wurstii-mario':
  red='#d73532';blue='#245caf';skin='#f4bd91';brown='#633c29';white='#fff8e8'
  ell('overalls',(0,0,1.02),(.38,.27,.43),blue)
  for s in [-1,1]:
   rod('trouser',(s*.19,0,.85),(s*.19,0,.29),.16,blue)
   ell('shoe',(s*.19,-.12,.17),(.21,.31,.17),brown)
   rod('sleeve',(s*.31,0,1.36),(s*.52,-.02,1.04),.145,red)
   ell('rounded shoulder',(s*.31,0,1.36),(.15,.15,.15),red,12,6)
   ell('white glove',(s*.54,-.05,.94),(.17,.14,.18),white)
   box('strap',(s*.19,-.245,1.30),(.10,.05,.32),blue,.025)
   ell('button',(s*.19,-.28,1.19),(.045,.025,.045),'#f3c94e',12,6)
  ell('red shirt',(0,.015,1.37),(.32,.24,.23),red)
  ell('hair back',(0,.075,1.86),(.35,.27,.36),brown)
  ell('head',(0,-.035,1.85),(.35,.29,.34),skin)
  for s in [-1,1]:ell('ear',(s*.34,-.01,1.85),(.085,.08,.12),skin)
  eyes(0,-.30,1.98,.105,.065)
  for s in [-1,1]:
   ell('eyebrow',(s*.105,-.303,2.087),(.077,.027,.025),brown,12,6)
   ell('mustache',(s*.12,-.326,1.76),(.15,.048,.055),brown)
  ell('round nose',(0,-.395,1.83),(.135,.13,.12),skin)
  ell('cap crown',(0,.015,2.13),(.38,.30,.20),red)
  ell('cap visor',(0,-.29,2.10),(.34,.23,.055),red)
  ell('cap emblem',(0,-.276,2.19),(.095,.025,.083),white,16,8)
  # embossed M is character logo, not caption
  path('M',[(-.05,-.306,2.15),(-.05,-.306,2.23),(0,-.31,2.18),(.05,-.306,2.23),(.05,-.306,2.15)],.012,red)
 elif id=='wurstii-magikarp':
  silver='#b8bdc7';dark='#555d6d';cream='#f1ece2'
  ell('fish body',(0,0,1.0),(.51,.33,.65),silver)
  # mouth front, sculpted dark cavity with torus lip
  ell('mouth cavity',(0,-.325,1.00),(.23,.055,.23),dark)
  bpy.ops.mesh.primitive_torus_add(major_radius=.215,minor_radius=.047,major_segments=20,minor_segments=8,location=(0,-.37,1.0),rotation=(math.pi/2,0,0));finish(bpy.context.object,'round lips',cream)
  for s in [-1,1]:
   ell('eye',(s*.35,-.235,1.28),(.115,.075,.145),cream)
   ell('pupil',(s*.35,-.302,1.28),(.043,.02,.075),'#202633',12,8)
   poly('side fin',[(s*.38,-.01,1.05),(s*.83,-.02,1.16),(s*.65,-.03,.80),(s*.40,-.02,.77)],cream,.08)
   path('barbel',[(s*.14,-.4,.9),(s*.31,-.40,.71),(s*.45,-.30,.63)],.025,cream)
   for z in [.8,1.02,1.2]:
    ell('scale mark',(s*.42,-.13,z),(.055,.035,.07),dark,10,6)
  poly('dorsal fin',[(-.22,0,1.5),(-.30,0,1.86),(-.08,0,1.7),(0,0,2.03),(.12,0,1.73),(.30,0,1.88),(.22,0,1.49)],cream,.10)
  poly('bottom fin',[(-.2,0,.53),(-.32,0,.22),(0,0,.38),(.26,0,.22),(.17,0,.55)],cream,.10)
  # broad fan tail visible from side/back, attached behind
  rod('tail stem',(0,.2,.8),(0,.60,.79),.15,silver)
  poly('tail fan',[(-.12,.57,.76),(-.5,.73,1.16),(-.35,.72,.75),(-.51,.73,.42),(.0,.59,.68),(.51,.73,.42),(.35,.72,.75),(.5,.73,1.16),(.12,.57,.76)],cream,.10)
 elif id=='wurstii-fluffin-puffins':
  def bird(x,y,z,k):
   def E(n,p,s,c,seg=14,rings=8):return ell(n,tuple((x,y,z)[i]+p[i]*k for i in range(3)),tuple(v*k for v in s),c,seg,rings)
   E('blue bird body',(0,0,.34),(.27,.22,.30),'#7471bd')
   E('white breast',(0,-.13,.40),(.23,.16,.25),'#fff7db')
   E('head',(0,-.01,.68),(.25,.23,.23),'#fff7db')
   for s in [-1,1]:
    E('wing',(s*.24,.01,.38),(.10,.16,.20),'#eee8dc')
    E('eye',(s*.095,-.216,.73),(.035,.022,.05),'#222b39',12,6)
    E('yellow foot',(s*.13,-.07,.07),(.115,.18,.07),'#eab74c')
   E('beak',(0,-.29,.60),(.12,.17,.07),'#e9b13e')
   E('crest',(.06,.0,.88),(.075,.085,.09),'#fff7db')
  bird(.35,.14,0,1.35);bird(-.44,.10,0,.80);bird(-.13,-.28,0,.67);bird(.42,-.39,0,.58)
 elif id=='wurstii-bullet-bill':
  ell('bullet body',(0,.10,.60),(.42,.67,.42),'#262b33')
  rod('rear rim',(0,.57,.60),(0,.75,.60),.43,'#454b56')
  eyes(0,-.47,.73,.19,.09)
  for s in [-1,1]:
   rod('arm',(s*.34,-.01,.51),(s*.51,-.22,.40),.095,'#333b44');ell('glove',(s*.51,-.25,.40),(.14,.15,.14),'#fff4da')
   ell('brow',(s*.19,-.51,.86),(.15,.04,.04),'#111923').rotation_euler[1]=s*.2
 elif id=='wurstii-mr-game-and-watch':
  c='#252b34'
  ell('round silhouette head',(0,0,1.73),(.30,.18,.30),c);ell('nose',(.30,-.02,1.75),(.21,.15,.12),c)
  ell('torso',(0,0,1.13),(.22,.17,.40),c)
  for s in [-1,1]:
   path('arm',[(s*.12,0,1.36),(s*.43,0,1.19),(s*.63,0,1.47)],.075,c);ell('mitten',(s*.64,0,1.5),(.13,.12,.14),c)
   path('leg',[(s*.1,0,.85),(s*.27,0,.48),(s*.48,-.01,.30)],.08,c);ell('flat shoe',(s*.49,-.04,.24),(.22,.18,.10),c)
 elif id=='wurstii-spot':
  red='#cf303b';white='#faf4df';black='#202936'
  ell('red spot',(0,0,1.15),(.32,.18,.43),red)
  for s in [-1,1]:
   path('thin arm',[(s*.27,0,1.28),(s*.48,0,1.4),(s*.65,0,1.5 if s==1 else 1.18)],.035,black)
   ell('glove',(s*.66,-.01,1.5 if s==1 else 1.18),(.13,.09,.075),white)
   rod('leg',(s*.12,0,.80),(s*.16,0,.28),.035,black);ell('sneaker',(s*.18,-.08,.18),(.16,.22,.12),white)
   ell('sunglass',(s*.14,-.167,1.31),(.14,.04,.10),black)
  rod('glasses bridge',(-.1,-.18,1.32),(.1,-.18,1.32),.025,black)
  rod('yoyo string',(.68,0,1.45),(.68,0,.5),.012,white);ell('yoyo',(.68,0,.44),(.105,.06,.105),red)
 elif id=='wurstii-piranha-plant':
  green='#4eaa55';red='#d54743';white='#fff4db'
  # pipe is identity container, not added board base
  rod('green pipe',(0,0,0),(0,0,.63),.30,green);rod('pipe rim',(0,0,.54),(0,0,.72),.35,'#79c570')
  rod('stem',(0,0,.64),(0,0,1.40),.08,'#39743e')
  for s in [-1,1]:
   ell('leaf',(s*.21,0,1.02),(.26,.07,.12),green).rotation_euler[1]=s*-.45
  ell('flower head',(0,0,1.67),(.40,.31,.40),red)
  ell('open mouth',(0,-.28,1.70),(.30,.055,.24),'#352b37')
  for s in [-1,1]:
   for x,z in [(.12,1.85),(.25,1.75),(.15,1.54)]:ell('white spot',(s*x,-.225,z),(.065,.045,.065),white,12,6)
  for x in [-.18,0,.18]:
   poly('upper tooth',[(x-.055,-.34,1.87),(x+.055,-.34,1.87),(x,-.35,1.74)],white,.05)
   poly('lower tooth',[(x-.05,-.34,1.53),(x+.05,-.34,1.53),(x,-.35,1.65)],white,.05)
 else:raise ValueError(id)
