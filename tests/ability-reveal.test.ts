import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameEvent, RoomView } from '../src/shared/types.js';
import { abilityRevealForEvent } from '../src/client/ability-reveal.js';
import { beatDuration, completeBeat, createPlayback, receiveRoom, skipPlayback } from '../src/client/presentation.js';

const room=(version=1,logs:GameEvent[]=[]):RoomView=>({code:'ABILITIES',version,selfId:'p',hostId:'p',maxPlayers:2,timeoutSeconds:0,deadline:null,rulesStatus:'',phase:'race',round:1,players:[{id:'p',name:'小明',seat:0,color:'#cf6a55',ready:true,connected:true,score:0,handCount:0,used:[],selected:true}],racers:[{id:'egg',playerId:'p',characterId:'egg',position:0,tripped:false,finished:false,eliminated:false,flags:{publicAbilities:{powers:['banana'],ownedPowers:['banana'],entries:[{id:'banana',origin:'copy',duration:'race'}]}}}],logs,results:[],track:'mild'});

test('ability reveal describes the event grant, source and expiry rather than later current powers',()=>{
  const grant:GameEvent={id:7,type:'copy',source:'egg',cause:'egg',selectedCardId:'copycat',grantedPowerIds:['legs'],grantDuration:'race',text:'复制已确认'};
  const reveal=abilityRevealForEvent(grant,room())!;
  assert.deepEqual(reveal.powers,['legs']);assert.match(reveal.recipient,/蛋.*1号小明/);
  assert.match(reveal.title,/抽到新能力/);assert.match(reveal.source,/蛋.*模仿/);assert.equal(reveal.duration,'持续至本场结束');
  assert.ok(!JSON.stringify(reveal).includes('banana'));
  assert.equal(abilityRevealForEvent({...grant,cause:'leaf-thespian',grantDuration:'next-turn'},room())!.duration,'下次自身回合开始失效');
  assert.equal(abilityRevealForEvent({...grant,cause:'copycat',grantDuration:'source-change'},room())!.duration,'随复制目标变化');
});

test('multiple grants retain distinct event snapshots and empty grants never invent abilities',()=>{
  const first:GameEvent={id:1,type:'copy',source:'egg',cause:'doppelgangster',grantedPowerIds:['legs','hare'],grantDuration:'race',text:'继承'};
  const second={...first,id:2,grantedPowerIds:['genius']};
  assert.deepEqual(abilityRevealForEvent(first,room())!.powers,['legs','hare']);
  assert.deepEqual(abilityRevealForEvent(second,room())!.powers,['genius']);
  const empty=abilityRevealForEvent({...first,grantedPowerIds:[],selectedCardId:'banana'},room())!;
  assert.deepEqual(empty.powers,[]);assert.equal(empty.title,'本次未获得新能力');
});

test('Filmmaker reveals only the public count even if private text, selected card and flags are supplied',()=>{
  const state=room();state.racers[0]!.flags.secretLeafHand=['legs','banana'];
  const reveal=abilityRevealForEvent({id:9,type:'draw',source:'egg',cause:'leaf-filmmaker',selectedCardId:'legs',grantedPowerIds:['banana'],text:'抽取7张私人影片手牌。大长腿、香蕉'},state)!;
  assert.equal(reveal.privateDrawCount,7);assert.deepEqual(reveal.powers,[]);
  assert.doesNotMatch(JSON.stringify(reveal),/legs|banana|大长腿|香蕉/);
});

test('fresh reveal tours entrants before batched pre-race effects and private choice in both motion modes',()=>{
  const initial={...room(),phase:'selection' as const,racers:[]};
  const confirmed={...room(2,[{id:1,type:'reveal',text:'揭示'},{id:2,type:'power',source:'egg',text:'赛前技能'},{id:3,type:'move',source:'egg',targets:['egg'],before:[0],after:[3],text:'赛前移动'}]),pending:{id:'choice',playerId:'p',kind:'egg',title:'选择',options:[],optional:false},waitingFor:'p'};
  confirmed.racers[0]!.position=3;
  const state=receiveRoom(createPlayback(initial),confirmed);
  assert.deepEqual(state.queue.map(beat=>beat.kind),['intro','skill','move']);
  assert.equal(state.racers[0]!.position,0);
  for(const reducedMotion of [false,true]){
    assert.equal(beatDuration(state.queue[0]!,{reducedMotion,speed:4}),reducedMotion?1000:1350);
    const afterIntro=completeBeat(state);assert.equal(afterIntro.queue[0]!.kind,'skill');assert.equal(afterIntro.racers[0]!.position,0);
    const afterSkill=completeBeat(afterIntro);assert.equal(afterSkill.queue[0]!.kind,'move');
    const done=completeBeat(afterSkill);assert.equal(done.queue.length,0);assert.equal(done.confirmed.pending?.id,'choice');assert.equal(done.racers[0]!.position,3);
  }
});

test('grant notifications deduplicate by confirmed event id and do not replay history, reconnect or skip',()=>{
  const initial=room(),grant:GameEvent={id:1,type:'acquire',source:'egg',cause:'mush',selectedCardId:'legs',grantedPowerIds:['legs'],grantDuration:'race',text:'获得'};
  const confirmed=room(2,[grant]);let state=receiveRoom(createPlayback(initial),confirmed);
  assert.equal(state.queue[0]!.abilityReveal?.eventId,1);assert.ok(beatDuration(state.queue[0]!,{reducedMotion:true,speed:4})>=3000);
  state=receiveRoom(state,{...confirmed,version:3});assert.equal(state.queue.length,1);
  state=completeBeat(state);assert.equal(receiveRoom(state,{...confirmed,version:4}).queue.length,0);
  assert.equal(createPlayback(confirmed).queue.length,0);
  assert.equal(receiveRoom(state,confirmed,{reconnect:true}).queue.length,0);
  assert.equal(skipPlayback(receiveRoom(createPlayback(initial),confirmed)).queue.length,0);
});
