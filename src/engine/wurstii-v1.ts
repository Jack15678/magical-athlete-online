// Frozen rules from 3bb2abe: existing Wurstii games keep their original 102-card catalog and behavior.
import { ORIGINAL_CHARACTERS } from '../shared/characters.js';
import { SECOND_WIND_CHARACTERS } from '../shared/second-wind.js';
import { WURSTII_CHARACTERS } from '../shared/wurstii.js';
const TWO_EDITIONS = [...ORIGINAL_CHARACTERS, ...SECOND_WIND_CHARACTERS];
const CHARACTERS = [...TWO_EDITIONS, ...WURSTII_CHARACTERS];
const characterPool = (pool: CharacterPool = 'original') => pool === 'all' ? CHARACTERS : pool === 'wurstii' ? [...ORIGINAL_CHARACTERS, ...WURSTII_CHARACTERS] : pool === 'mixed' ? TWO_EDITIONS : pool === 'second-wind' ? SECOND_WIND_CHARACTERS : ORIGINAL_CHARACTERS;
const practiceCharacters = () => CHARACTERS;
import { WURSTII_V1_RULES_VERSION as CURRENT_RULES_VERSION } from '../shared/rules-versions.js';
import { TRACKS, RACE_POINTS } from '../shared/tracks.js';
import type { GameState, GameAction, GameMode, CharacterPool, Player, Racer, Task, PendingChoice, RaceResult } from '../shared/types.js';

// Every continuation is JSON data. No callback, socket, timer or future die lives
// in the rules state, so the exact pending interaction survives a server restart.
type Work = Task & Record<string, any>;
const character = (id: string) => CHARACTERS.find(c => c.id === id);
const name = (r: Racer) => character(r.characterId)?.nameZh ?? r.characterId;
const live = (r: Racer) => !r.finished && !r.eliminated;
const racer = (s: GameState, id: string) => s.racers.find(r => r.id === id);
const active = (s: GameState) => s.racers.filter(live);
const owner = (s: GameState, r: Racer) => s.players.find(p => p.id === r.playerId)!;
const push = (s: GameState, ...tasks: Work[]) => s.queue.unshift(...tasks);
function log(s: GameState, type: string, text: string, detail: Record<string, any> = {}) {
  s.logs.push({ id: (s.logs.at(-1)?.id ?? 0) + 1, type, text, ...detail });
}
function random(s: GameState, reason: string, max = 6): number {
  const forced = s.flags.testDice as number[] | undefined;
  let value: number;
  if (forced?.length && max === 6) value = forced.shift()!;
  else { let x = s.rngState >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rngState = x >>> 0; value = Math.floor((s.rngState / 4294967296) * max) + 1; }
  s.randomLog.push({ index: s.randomLog.length, reason, value });
  return value;
}
function shuffle(s: GameState, input: string[]) {
  const cards = [...input];
  for (let i = cards.length - 1; i > 0; i--) { const j = random(s, '洗牌', i + 1) - 1; [cards[i], cards[j]] = [cards[j]!, cards[i]!]; }
  return cards;
}
function rollOff(s: GameState, ids: string[]) {
  let candidates = [...ids];
  for (;;) {
    const rolls = candidates.map(id => ({ id, face: random(s, '先手比较') }));
    log(s, 'roll-off', rolls.map(x => `${s.players.find(p => p.id === x.id)?.name ?? x.id}：${x.face}`).join('，'));
    const best = Math.max(...rolls.map(x => x.face)); candidates = rolls.filter(x => x.face === best).map(x => x.id);
    if (candidates.length === 1) return candidates[0]!;
  }
}
function order(s: GameState, rs = active(s)): Racer[] {
  const current = racer(s, s.currentRacerId ?? ''); const seat = current ? owner(s, current).seat : Number(s.flags.firstSeat ?? 0);
  const n = s.players.length;
  const fixed = baseOrder(s);
  return [...rs].sort((a,b) => (((owner(s,a).seat-seat+n)%n) - ((owner(s,b).seat-seat+n)%n)) || fixed.indexOf(a.id)-fixed.indexOf(b.id));
}
/** Racer IDs, never character IDs or player IDs. Old saves used array order. */
function baseOrder(s: GameState): string[] { return s.baseTurnOrder ?? s.racers.map(r => r.id); }
function printedPower(s: GameState, r: Racer): string {
  const base = String(r.flags.power ?? r.flags.copiedPower ?? r.characterId);
  if (base !== 'copycat') return base;
  if(typeof r.flags.copyPower==='string')return r.flags.copyPower;
  return copyPower(s,r);
}
function copyPower(s:GameState,r:Racer):string {
  const competitors = active(s); if (!competitors.length) return 'copycat';
  const lead = Math.max(...competitors.map(x => x.position));
  const leaders = competitors.filter(x => x.position === lead && x.id !== r.id && x.characterId !== 'copycat');
  const model = leaders.find(x => x.id === r.flags.copyTarget) ?? leaders[0];
  // Copycat copies printed text. In particular, Twin's selected power is not
  // recursively inherited, and a passed before-race window never reopens.
  return model?.characterId ?? 'copycat';
}
const dispatchPowers = new WeakMap<Racer,string>();
function rawPowers(s:GameState,r:Racer):string[] {
  const result=[printedPower(s,r)];
  for(const acquired of ((r.flags.acquiredPowers??[]) as string[])){
    const power=acquired==='copycat'?String(r.flags.copyPower??copyPower(s,r)):acquired;
    if(!result.includes(power))result.push(power);
  }
  return result;
}
/** Null is evaluated from the rear forwards: a disabled Null cannot disable another racer. */
export function disabledBy(s:GameState,r:Racer):string[] {
  const enabled:Racer[]=[];
  for(const candidate of active(s).toSorted((a,b)=>a.position-b.position)){
    if(!enabled.some(n=>n.position<candidate.position)&&rawPowers(s,candidate).includes('null'))enabled.push(candidate);
  }
  return enabled.filter(n=>n.id!==r.id&&n.position<r.position).map(n=>n.id);
}
export function effectivePowers(s:GameState,r:Racer):string[] { return disabledBy(s,r).length?[]:rawPowers(s,r); }
export function effectivePower(s:GameState,r:Racer):string { return disabledBy(s,r).length?'disabled':dispatchPowers.get(r)??printedPower(s,r); }
export function abilityState(s:GameState,r:Racer) { return { powers:effectivePowers(s,r),disabledBy:disabledBy(s,r),copiedFrom:r.flags.copiedFrom,acquired:r.flags.acquiredPowers??[],krakenRemaining:r.flags.krakenUsed?0:1,form:r.flags.form??'normal',mount:r.flags.hogOwnerId }; }
function hasPower(s:GameState,r:Racer,power:string) { return effectivePowers(s,r).includes(power); }
function powers(s: GameState, power: string) { return order(s).filter(r => hasPower(s,r,power)); }
function dispatch(s:GameState,r:Racer,power:string,run:()=>void){ if(!hasPower(s,r,power))return;dispatchPowers.set(r,power);try{run();}finally{dispatchPowers.delete(r);} }

function points(s: GameState, r: Racer, delta: number, cause: string) {
  const p = owner(s,r); const previous = p.score; p.score = Math.max(0,p.score+delta);
  log(s, 'score', `${p.name} ${p.score >= previous ? '+' : ''}${p.score-previous}分（${cause}）`, { source:r.id });
}
function ask(s: GameState, r: Racer, kind: string, title: string, options: {id:string;label:string}[], context: Record<string,any>, optional = false) {
  if (!options.length) return;
  const seq = Number(s.flags.choiceSeq ?? 0)+1; s.flags.choiceSeq = seq;
  s.pending = { id:`c${seq}`, playerId:r.playerId, racerId:r.id, title, kind, options, optional, context };
}
const yesNo = [{id:'use',label:'使用技能'}, {id:'skip',label:'不使用'}];
function targetOptions(s: GameState, ids: string[]) { return ids.map(id => ({id,label: name(racer(s,id)!)})); }
function usePower(s: GameState, r: Racer, tasks: Work[], power = effectivePower(s,r)) {
  log(s,'power',`${name(r)}发动「${character(power)?.nameZh ?? power}」`,{source:r.id,cause:power});
  push(s,...tasks,{kind:'powerDone',racerId:r.id,power});
}

export function createGame(players: Player[], seed: number, mode: GameMode = 'multiplayer', pool: CharacterPool = 'original'): GameState {
  return { mode, characterPool:pool, rulesVersion:CURRENT_RULES_VERSION, phase:'lobby', round:0, players:structuredClone(players), deck:[], discard:[], racers:[], turn:0, turnCount:0, queue:[], logs:[], results:[], rngState:(seed>>>0)||0x9e3779b9, randomLog:[], track:'mild', flags:{} };
}
function snake(s: GameState, first: string, twice = false) {
  const i=s.players.findIndex(p=>p.id===first); const ids=s.players.map((_,j)=>s.players[(i+j)%s.players.length]!.id);
  const once=[...ids,...ids.toReversed()]; return twice?[...once,...once]:once;
}
export function startGame(s: GameState): void {
  if (s.phase!=='lobby' || s.players.length<(s.mode==='practice'?1:2) || s.players.length>8 || (s.mode==='practice'&&s.players.length!==1)) throw Error('需要2～8名玩家才能开始；自己练习需要1名玩家');
  s.players.forEach(p=>{p.score=0;p.hand=[];p.used=[];p.selection=[];}); s.round=1;s.results=[];s.logs=[];s.racers=[];s.queue=[];s.pending=undefined;
  s.rulesVersion??=CURRENT_RULES_VERSION;s.deck=shuffle(s,characterPool(s.characterPool).map(c=>c.id));s.discard=[];
  if(s.mode==='practice'){
    s.draft={market:practiceCharacters().map(c=>c.id),order:[s.players[0]!.id],cursor:0,batch:0};s.phase='draft';
    log(s,'phase','自己练习：从完整角色牌池自由选择4张不同角色牌');
    log(s,'house-rule','自己练习：每场单独出场；没有其他选手时，野兔正常移动以便练习。');return;
  }
  const first=rollOff(s,s.players.map(p=>p.id));s.flags.draftFirst=first;
  s.draft={market:s.deck.splice(0,s.players.length===2?8:s.players.length*2),order:snake(s,first,s.players.length===2),cursor:0,batch:0};s.phase='draft';
  log(s,'phase',s.players.length>6?'7～8人扩展选秀开始':'选秀开始');
}
function beginSelection(s: GameState) {
  s.phase='selection';s.draft=undefined;s.pending=undefined;s.queue=[];s.baseTurnOrder=undefined;s.players.forEach(p=>p.selection=[]);
  log(s,'phase',`第${s.round}场：${s.round%2?'温和一英里':'狂野荒野'}，请暗选${s.players.length===2?2:1}名角色`);
}
function prepareRace(s: GameState) {
  if(s.round===1) s.flags.firstPlayer=rollOff(s,s.players.map(p=>p.id));
  s.flags.roundStartScores=Object.fromEntries(s.players.map(p=>[p.id,p.score]));
  s.racers=s.players.flatMap(p=>p.selection.map((id,i)=>({id:`${p.id}:${s.round}:${i}`,identityPlayerId:p.id,playerId:p.id,characterId:id,position:0,tripped:false,finished:false,eliminated:false,flags:{}})));
  for(const extra of ((s.flags.reRunners??[]) as {playerId:string;characterId:string}[])){const p=s.players.find(p=>p.id===extra.playerId);if(p)s.racers.push({id:`${p.id}:${s.round}:extra:${s.racers.length}`,identityPlayerId:p.id,playerId:p.id,characterId:extra.characterId,position:0,tripped:false,finished:false,eliminated:false,flags:{reRunnerExtra:true}} as Racer);}
  s.racers.sort((a,b)=>s.players.findIndex(p=>p.id===a.playerId)-s.players.findIndex(p=>p.id===b.playerId));
  for(const p of s.players){ for(const id of p.selection){p.hand.splice(p.hand.indexOf(id),1);p.used.push(id);} }
  s.track=s.round%2?'mild':'wild';s.phase='race';s.turnCount=0;s.flags.placements=[];s.flags.eliminations=[];s.flags.nextOverride=[];s.flags.loopSeen=[];
  const first=s.players.find(p=>p.id===s.flags.firstPlayer)??s.players[0]!;
  const initial=s.racers.find(r=>r.playerId===first.id)!;s.currentRacerId=initial.id;s.turn=s.racers.indexOf(initial);
  const start=s.racers.indexOf(initial);s.baseTurnOrder=[...s.racers.slice(start),...s.racers.slice(0,start)].map(r=>r.id);
  log(s,'reveal',s.racers.map(r=>`${owner(s,r).name}：${name(r)}`).join('，'));
  if(s.players.length===2)log(s,'turn-order',`本场固定行动顺序：${s.baseTurnOrder.map(id=>{const r=racer(s,id)!;return `${owner(s,r).name}的${name(r)}`;}).join(' → ')}`);
  push(s,...order(s).map(r=>({kind:'beforeRace',racerId:r.id})),{kind:'refreshCopies'},{kind:'beginTurn',racerId:initial.id});
}
function currentPlacements(s:GameState):RaceResult['placements'] { return (s.flags.placements??=[]) as RaceResult['placements']; }
function finish(s:GameState,r:Racer, forcedRank?:number) {
  if(!live(r)&&forcedRank===undefined)return;
  if(forcedRank===undefined&&currentPlacements(s).length===0){const doubles=powers(s,'doppelgangster').filter(x=>!x.flags.doppelUsed);if(doubles.length){for(const d of doubles){d.flags.doppelUsed=true;d.flags.acquiredPowers=[...((d.flags.acquiredPowers??[]) as string[]),...effectivePowers(s,r).filter(p=>p!=='doppelgangster')];log(s,'copy',`${name(d)}淘汰首位冲线者并获得其能力`,{source:d.id,targets:[r.id],cause:'doppelgangster'});}eliminate(s,r.id,doubles[0]!.id);return;}}
  const placements=currentPlacements(s);const rank=forcedRank??placements.length+1;if(rank>2)return;
  r.finished=true;r.rank??=rank;r.position=TRACKS[s.track].finish;
  for(const step of powers(s,'stepdad'))if(step.flags.stepTarget===r.id&&rank===1)points(s,step,3,'继父的冠军奖励');
  const value=RACE_POINTS[Math.max(0,s.round-1)]?.[rank-1]??0;owner(s,r).score+=value;
  placements.push({racerId:r.id,playerId:r.playerId,characterId:r.characterId,rank,points:value});
  const history=(s.flags.historyPowers??={}) as Record<string,string>;history[r.characterId]=effectivePower(s,r);
  log(s,'finish',`${owner(s,r).name}的${name(r)}获得第${rank}名，+${value}分`,{source:r.id});
  if(rank===1){
    const minds=order(s,s.racers.filter(x=>!x.eliminated&&String(x.flags.prediction??'')===r.id&&effectivePower(s,x)==='mastermind')).sort((a,b)=>Number(a.characterId==='copycat')-Number(b.characterId==='copycat'));
    if(minds.length){finish(s,minds[0]!,2);return;}
    const remaining=active(s);
    if(remaining.length===1){finish(s,remaining[0]!,2);return;}
  }
  if(rank===2)endRace(s);
}
function endRace(s:GameState) {
  if(s.phase!=='race')return;
  const runnerUp=currentPlacements(s).find(p=>p.rank===2)?.racerId;
  for(const r of s.racers)if(runnerUp&&r.flags.wilyPrediction===runnerUp&&!r.flags.wilyPaid&&hasPower(s,r,'wurstii-dr-wily')){
    r.flags.wilyPaid=true;points(s,r,3,'威利博士猜中亚军');
  }
  for(const g of powers(s,'gloth'))if(g.position<=TRACKS[s.track].secondCorner)points(s,g,3,'葛洛斯未超过第二弯道');
  for(const r of s.racers)if(hasPower(s,r,'re-runner')||r.characterId==='re-runner'){const entries=(s.flags.reRunners??=[]) as {playerId:string;characterId:string}[];const id=r.playerId;if(!entries.some(x=>x.playerId===id&&x.characterId===r.characterId))entries.push({playerId:id,characterId:r.characterId});}
  s.results.push({round:s.round,placements:structuredClone(currentPlacements(s))});
  if(s.players.length===2){
    const scores=s.flags.roundStartScores as Record<string,number>??{};const min=Math.min(...s.players.map(p=>p.score-(scores[p.id]??0)));const tied=s.players.filter(p=>p.score-(scores[p.id]??0)===min);
    s.flags.firstPlayer=tied.length===1?tied[0]!.id:rollOff(s,tied.map(p=>p.id));
  }else{
    const eliminated=(s.flags.eliminations??[]) as string[];const candidates=eliminated.length?[racer(s,eliminated[0]!)!]:s.racers.filter(r=>!r.finished&&!r.eliminated);
    const back=candidates.length?Math.min(...candidates.map(r=>r.position)):0;const tied=[...new Set(candidates.filter(r=>r.position===back).map(r=>r.playerId))];
    s.flags.firstPlayer=tied.length===1?tied[0]:tied.length?rollOff(s,tied):s.players[0]!.id;
  }
  s.phase=s.round>=4?'finished':'results';s.queue=[];s.pending=undefined;s.flags.awaitRoll=false;
  log(s,'phase',s.phase==='finished'?'四场比赛结束，按累计分数结算；同分共享胜利':`第${s.round}场结束`);
}
function checkOnlyRacer(s:GameState) { if(s.phase!=='race')return;const remaining=active(s);if(remaining.length===1){finish(s,remaining[0]!);if(s.phase==='race')endRace(s);}if(!remaining.length&&s.phase==='race')endRace(s); }
function eliminate(s:GameState,id:string,source:string) {
  const r=racer(s,id);if(!r||!live(r))return;r.eliminated=true;((s.flags.eliminations??=[]) as string[]).push(id);
  log(s,'eliminate',`${name(r)}被淘汰`,{source,targets:[id]});checkOnlyRacer(s);
}
export function enqueueMove(s:GameState,racerId:string,distance:number,cause='test'):void { s.queue.push({kind:'move',racerId,distance,cause}); }
export function enqueueWarp(s:GameState,racerId:string,position:number,cause='test'):void { s.queue.push({kind:'warp',racerId,position,cause}); }
function previewMove(s:GameState,r:Racer,distance:number,departures:string[],ps=effectivePowers(s,r)) {
  let count=Math.abs(distance);let end=r.position;const jumps:string[]=[];const direction=Math.sign(distance);
  while(count>0){end+=direction;if(end<0){end=0;break;}if(end>=TRACKS[s.track].finish){end+=direction*(count-1);break;}
    const occupied=active(s).some(x=>x.id!==r.id&&!departures.includes(x.id)&&x.position===end);
    const jump=ps.find(p=>((p==='leaptoad'||p==='wurstii-mario')&&occupied)||(p==='wurstii-frogger'&&wurstiiMilestone(end)));
    if(jump){jumps.push(jump);continue;}count--;}
  const blocked=end>TRACKS[s.track].finish?powers(s,'stickler').filter(x=>x.id!==r.id):[];
  const capped=!blocked.length&&ps.includes('wurstii-diddy-kong')&&end>TRACKS[s.track].finish;
  if(capped)end=TRACKS[s.track].finish-1;
  return{end:blocked.length?r.position:Math.max(0,end),jumps,blocked,capped};
}
function motion(s:GameState,t:Work) {
  const plans: {racerId:string;distance?:number;position?:number;follow?:string}[]=t.plans??[{racerId:t.racerId,distance:t.distance,position:t.position}];
  const moving=plans.filter(p=>{const r=racer(s,p.racerId);return r&&live(r);});
  if(!moving.length)return;
  if(t.kind!=='warp'&&!t.fishChecked){
    const fish=order(s).filter(r=>effectivePower(s,r)==='suckerfish'&&!moving.some(p=>p.racerId===r.id)&&!t.fishAsked?.includes(r.id));
    const departures=moving.filter(p=>p.distance!==0).map(p=>p.racerId);
    for(const f of fish){const lead=moving.find(p=>!p.follow&&racer(s,p.racerId)!.position===f.position&&previewMove(s,racer(s,p.racerId)!,p.distance??0,departures).end!==f.position);if(lead){
      const next={...t,plans:moving,fishAsked:[...(t.fishAsked??[]),f.id]};
      ask(s,f,'suckerfish',`${name(f)}要随${name(racer(s,lead.racerId)!)}一起移动吗？`,yesNo,{motion:next,lead:lead.racerId},true);return;
    }}
  }
  const before=Object.fromEntries(active(s).map(r=>[r.id,r.position]));
  const powerSnapshot=Object.fromEntries(active(s).map(r=>[r.id,effectivePowers(s,r)]));
  const group=`g${(s.flags.motionSeq=Number(s.flags.motionSeq??0)+1)}`;
  const destinations:Record<string,number>={};const jumpCounts:Record<string,string[]>={};
  const extra:Work[]=[];const movingIds=moving.filter(p=>p.follow||p.distance!==0||t.kind==='warp').map(p=>p.racerId);
  for(const p of moving){
    const r=racer(s,p.racerId)!;if(p.follow)continue;
    let end=p.position??r.position;let jumps:string[]=[];
    if(t.kind!=='warp'){
      const projected=previewMove(s,r,p.distance??0,movingIds,powerSnapshot[r.id]);end=projected.end;jumps=projected.jumps;
      if(projected.blocked.length) {log(s,'cancel',`${name(r)}超过精确终点距离，整次移动取消`,{source:r.id,cause:'stickler'});extra.push(...projected.blocked.map(x=>({kind:'powerDone',racerId:x.id,power:'stickler'})));}
      if(projected.capped)extra.push({kind:'powerDone',racerId:r.id,power:'wurstii-diddy-kong'});
    }
    destinations[r.id]=Math.max(0,end);jumpCounts[r.id]=jumps;
  }
  for(const p of moving.filter(p=>p.follow)){
    const end=destinations[p.follow!]??before[p.racerId]!;
    const capped=t.kind!=='warp'&&end>TRACKS[s.track].finish&&powerSnapshot[p.racerId]?.includes('wurstii-diddy-kong');
    destinations[p.racerId]=capped?TRACKS[s.track].finish-1:end;
    if(capped)extra.push({kind:'powerDone',racerId:p.racerId,power:'wurstii-diddy-kong'});
  }
  const priority=order(s).map(r=>r.id);
  const movedCandidates=moving.filter(p=>destinations[p.racerId]!==before[p.racerId]||t.kind==='warp');
  const moved:typeof moving=[];
  const appendMotion=(p:typeof moving[number])=>{moved.push(p);for(const follower of movedCandidates.filter(x=>x.follow===p.racerId).toSorted((a,b)=>priority.indexOf(a.racerId)-priority.indexOf(b.racerId)))appendMotion(follower);};
  for(const p of movedCandidates.filter(p=>!p.follow).toSorted((a,b)=>priority.indexOf(a.racerId)-priority.indexOf(b.racerId)))appendMotion(p);
  for(const p of moved)racer(s,p.racerId)!.position=Math.min(TRACKS[s.track].finish,destinations[p.racerId]!);
  log(s,t.kind==='warp'?'warp':'move',moved.map(p=>`${name(racer(s,p.racerId)!)} ${before[p.racerId]} → ${racer(s,p.racerId)!.position}`).join('，')||'没有产生移动',{source:t.racerId,targets:moved.map(p=>p.racerId),before:moved.map(p=>before[p.racerId]!),after:moved.map(p=>racer(s,p.racerId)!.position),group,cause:t.cause});
  // Rank the followed racer before followers while preserving simultaneous arrival.
  for(const p of moved){const r=racer(s,p.racerId)!;if(r.position>=TRACKS[s.track].finish){finish(s,r);if(s.phase!=='race')return;}}
  const passEffects:Work[]=[];
  if(t.kind!=='warp')for(const p of moved){const r=racer(s,p.racerId)!;const start=before[r.id]!;const end=destinations[r.id]!;
    const crossed=active(s).filter(x=>!movingIds.includes(x.id)&&(start-before[x.id]!)*(end-before[x.id]!)<0).sort((a,b)=>(before[a.id]!-before[b.id]!)*Math.sign(end-start));
    for(const banana of crossed.filter(x=>powerSnapshot[x.id]?.includes('banana')))passEffects.push({kind:'ability',racerId:banana.id,power:'banana',effects:[{kind:'trip',racerId:r.id,source:banana.id}]});
    if(powerSnapshot[r.id]?.includes('centaur')){
      const positions=[...new Set(crossed.map(x=>before[x.id]!))];for(const pos of positions)passEffects.push({kind:'ability',racerId:r.id,power:'centaur',effects:[{kind:'move',plans:crossed.filter(x=>before[x.id]===pos).map(x=>({racerId:x.id,distance:-2})),cause:'centaur'}]});
    }
    for(const penguin of crossed.filter(x=>powerSnapshot[x.id]?.includes('penguin')))passEffects.push({kind:'ability',racerId:penguin.id,power:'penguin',effects:[{kind:'trip',racerId:penguin.id,source:r.id}]});
    if(powerSnapshot[r.id]?.includes('bite-mark')&&r.flags.form==='were-mouth')for(const target of crossed)passEffects.push({kind:'ability',racerId:r.id,power:'bite-mark',effects:[{kind:'eliminate',racerId:target.id,source:r.id}]});
    if(r.flags.magicPassTrip)for(const target of crossed)passEffects.push({kind:'ability',racerId:r.id,power:'magical-athlete',effects:[{kind:'trip',racerId:target.id,source:r.id}]});
    if(crossed.length&&powerSnapshot[r.id]?.includes('streaker'))passEffects.push({kind:'ability',racerId:r.id,power:'streaker',effects:[{kind:'gain',racerId:r.id,amount:1}]});
    for(const power of jumpCounts[r.id]??[])extra.push({kind:'powerDone',racerId:r.id,power});
  }
  const arrivals=moved.filter(p=>live(racer(s,p.racerId)!)).map(p=>p.racerId);
  // Huge Baby's exclusion is a replacement placement, not an extra movement.
  let exclusionChanged=true;
  // Each replacement strictly lowers the displaced racer's position, so this
  // terminates without an arbitrary activation cap even with several Babies.
  while(exclusionChanged){exclusionChanged=false;
  for(const baby of powers(s,'huge-baby'))if(baby.position>0){
    for(const displaced of active(s).filter(r=>r.id!==baby.id&&r.position===baby.position)){
      const previous=displaced.position;displaced.position=baby.position-1;
      exclusionChanged=true;
      log(s,'place',`${name(displaced)}被大宝宝放到身后${displaced.position}格`,{source:baby.id,targets:[displaced.id],before:[previous],after:[displaced.position],cause:'huge-baby'});
      if(!arrivals.includes(displaced.id))arrivals.push(displaced.id);
      extra.push({kind:'powerDone',racerId:baby.id,power:'huge-baby'});
      if(effectivePower(s,displaced)==='banana'&&movingIds.includes(baby.id))passEffects.push({kind:'ability',racerId:displaced.id,power:'banana',effects:[{kind:'trip',racerId:baby.id,source:displaced.id}]});
    }
  }
  }
  const board=arrivals.map(id=>({kind:'board',racerId:id}));const stops:Work[]=[];
  for(const source of order(s)){
    for(const power of effectivePowers(s,source)){
    if(power==='romantic')for(const id of arrivals){const r=racer(s,id)!;const sharing=active(s).filter(x=>x.position===r.position);if(sharing.length===2&&sharing.some(x=>!arrivals.includes(x.id)))stops.push({kind:'ability',racerId:source.id,power,effects:[{kind:'move',racerId:source.id,distance:2,cause:'romantic'}]});}
    if(power==='baba-yaga'){
      const targets=active(s).filter(x=>x.id!==source.id&&x.position===source.position&&(arrivals.includes(source.id)!==arrivals.includes(x.id)));
      for(const target of targets)stops.push({kind:'ability',racerId:source.id,power,effects:[{kind:'trip',racerId:target.id,source:source.id}]});
    }
    if(power==='mouth'&&arrivals.includes(source.id)){
      const shared=active(s).filter(x=>x.id!==source.id&&x.position===source.position);
      if(shared.length===1&&!arrivals.includes(shared[0]!.id))stops.push({kind:'ability',racerId:source.id,power,effects:[{kind:'eliminate',racerId:shared[0]!.id,source:source.id}]});
    }
    if(power==='duelist')stops.push({kind:'duelCheck',racerId:source.id});
    if(power==='hotel')for(const id of arrivals){const target=racer(s,id)!;if(target.id!==source.id&&target.position===source.position&&!arrivals.includes(source.id))stops.push({kind:'hotelPay',racerId:source.id,targetId:id});}
    }
  }
  for(const carrier of active(s).filter(x=>x.flags.hogOwnerId)){const targets=order(s,active(s).filter(x=>x.id!==carrier.id&&x.position===carrier.position&&arrivals.includes(x.id)&&!arrivals.includes(carrier.id)));for(const target of targets)stops.push({kind:'hogTake',racerId:target.id,hogOwnerId:carrier.flags.hogOwnerId});}
  const fishDone=moved.filter(p=>p.follow).map(p=>({kind:'powerDone',racerId:p.racerId,power:'suckerfish'}));
  push(s,...board,{kind:'refreshCopies'},...orderEffectTasks(s,[...passEffects,...stops]),...extra,...fishDone);
}
function orderEffectTasks(s:GameState,tasks:Work[]):Work[] { const ids=order(s).map(r=>r.id);return tasks.toSorted((a,b)=>ids.indexOf(String(a.racerId))-ids.indexOf(String(b.racerId))); }

function beforeRace(s:GameState,r:Racer) {
  const power=effectivePower(s,r);if(secondWindBeforeRace(s,r,power))return;const prepared=(r.flags.preparedPowers??=[]) as string[];if(prepared.includes(power)||r.characterId==='copycat')return;prepared.push(power);
  if(power==='wurstii-hoagie'||power==='wurstii-tails'){
    r.position=power==='wurstii-hoagie'?24:8;
    log(s,'place',`${name(r)}从${r.position}格出发`,{source:r.id,targets:[r.id],after:[r.position],cause:power});
    push(s,{kind:'powerDone',racerId:r.id,power});
  }
  if(power==='wurstii-dr-wily')askTarget(s,r,power,'预测本场亚军',active(s));
  if(power==='sisyphus'){points(s,r,4,'西西弗斯赛前奖励');push(s,{kind:'powerDone',racerId:r.id,power});}
  if(power==='egg'){
    if(s.deck.length<3){const unassigned=(s.mode==='practice'?practiceCharacters():characterPool(s.characterPool)).map(c=>c.id).filter(id=>!s.players.some(p=>p.hand.includes(id)||p.used.includes(id))&&!s.racers.some(x=>x.characterId===id));s.deck=shuffle(s,unassigned);log(s,'house-rule','蛋的未分配候选不足，按公开房规重新洗候选');}
    const cards=s.deck.splice(0,3);s.discard.push(...cards);
    ask(s,r,'egg','选择蛋要复制的能力',cards.map(id=>({id,label:character(id)?.nameZh??id})),{cards});
  }
  if(power==='twin'){
    const cards=[...new Set(s.results.flatMap(result=>result.placements.filter(p=>p.rank===1).map(p=>p.characterId)))];
    if(cards.length)ask(s,r,'twin','选择此前冠军的能力',[...cards.map(id=>({id,label:character(id)?.nameZh??id})),{id:'skip',label:'不复制'}],{cards},true);
  }
}
function beginTurn(s:GameState,r:Racer) {
  if(!live(r)){advance(s,r);return;}s.currentRacerId=r.id;s.turn=s.racers.indexOf(r);s.turnCount++;s.flags.awaitRoll=false;s.flags.loopSeen=[];r.flags.turnStart=r.position;r.flags.turnPower=effectivePower(s,r);r.flags.rerolls={};r.flags.geniusGuess=undefined;r.flags.mainBonus=0;
  r.flags.turnsTaken=Number(r.flags.turnsTaken??0)+1;
  r.flags.burtAsked=false;r.flags.burtGuess=undefined;r.flags.wurstiiFace=undefined;
  const power=effectivePower(s,r);r.flags.mainRolled=false;r.flags.mainDirection=undefined;r.flags.magicPassTrip=false;r.flags.showOffPrevious=undefined;r.flags.showOffTotal=0;r.flags.mainSelection=undefined;r.flags.criticAsked=[];r.flags.skipMain=hasPower(s,r,'hare')&&!(s.mode==='practice'&&active(s).length===1)&&active(s).every(x=>x.id===r.id||x.position<r.position);r.flags.blimpBonus=r.position<TRACKS[s.track].secondCorner?3:-1;
  log(s,'turn',`轮到${owner(s,r).name}的${name(r)}`,{source:r.id});
  push(s,{kind:'turnStartPower',racerId:r.id},...powers(s,'duelist').map(d=>({kind:'duelCheck',racerId:d.id})),{kind:'mainReady',racerId:r.id},{kind:'endTurn',racerId:r.id});
}
function turnStartPower(s:GameState,r:Racer) {
  const power=effectivePower(s,r);if(secondWindTurnStart(s,r,power))return;
  if(wurstiiTurnStart(s,r,power))return;
  if(power==='lovable-loser'&&active(s).every(x=>x.id===r.id||x.position>r.position))usePower(s,r,[{kind:'gain',racerId:r.id,amount:1}]);
  if(power==='party-animal')usePower(s,r,[{kind:'move',plans:active(s).filter(x=>x.id!==r.id).map(x=>({racerId:x.id,distance:Math.sign(r.position-x.position)})),cause:power}]);
  if(power==='cheerleader')ask(s,r,power,'要为末位角色加油吗？',yesNo,{},true);
  if(power==='hypnotist')ask(s,r,power,'要召唤哪名角色？',[...targetOptions(s,active(s).filter(x=>x.id!==r.id).map(x=>x.id)),{id:'skip',label:'不使用'}],{},true);
  if(power==='third-wheel'){
    const positions=[...new Set(active(s).map(x=>x.position))].filter(pos=>active(s).filter(x=>x.position===pos).length===2);
    ask(s,r,power,'要传送到哪一个双人格？',[...positions.map(pos=>({id:String(pos),label:`第${pos}格`})),{id:'skip',label:'不使用'}],{},true);
  }
  if(power==='mastermind'&&!r.flags.mindUsed&&r.flags.turnsTaken===1){r.flags.mindUsed=true;ask(s,r,power,'预测本场冠军',targetOptions(s,active(s).map(x=>x.id)),{});}
}
function mainReady(s:GameState,r:Racer) {
  if(!live(r))return;
  if(r.flags.skipMain){log(s,'skip',`${name(r)}独自领先，跳过主移动`,{source:r.id});push(s,{kind:'powerDone',racerId:r.id,power:'hare'});return;}
  if(r.tripped&&!hasPower(s,r,'penguin')){r.tripped=false;log(s,'recover',`${name(r)}起身，代替主移动`,{source:r.id});return;}
  const mainPowers=effectivePowers(s,r).filter(p=>['genius','legs','flip-flop','mole','cheatah','mr-dice-guy','wurstii-hoagie','wurstii-pitfall-harry','wurstii-burt'].includes(p)||(p==='wurstii-eric'&&wurstiiMilestone(Number(r.flags.turnStart))));
  if(mainPowers.length>1&&!r.flags.mainSelection){ask(s,r,'main-ability','选择本次主移动使用的能力',mainPowers.map(p=>({id:p,label:character(p)?.nameZh??p})),{});return;}
  const power=String(r.flags.mainSelection??mainPowers[0]??effectivePower(s,r));if(secondWindMainReady(s,r,power))return;
  if(power==='wurstii-hoagie'||(power==='wurstii-eric'&&wurstiiMilestone(Number(r.flags.turnStart)))){usePower(s,r,[{kind:'mainMove',racerId:r.id,base:power==='wurstii-hoagie'?1:6}],power);return;}
  if(power==='wurstii-pitfall-harry'&&!r.flags.mainAsked){
    r.flags.mainAsked=true;const position=nearestAhead(s,r);
    if(position!==undefined){ask(s,r,power,`传送到前方最近的第${position}格，代替主骰？`,yesNo,{position},true);return;}
  }
  if(power==='wurstii-burt'&&!r.flags.burtAsked){r.flags.burtAsked=true;ask(s,r,power,'预测本次主骰的最终点数',Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{});push(s,{kind:'mainReady',racerId:r.id});return;}
  if(power==='genius'&&!r.flags.geniusAsked){r.flags.geniusAsked=true;ask(s,r,'genius','预测主移动骰面',[...Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{id:'skip',label:'不预测'}],{},true);push(s,{kind:'mainReady',racerId:r.id});return;}
  if(power==='legs'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'legs','要直接以5作为主移动基础距离吗？',yesNo,{},true);return;}
  if(power==='flip-flop'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'flip-flop','交换位置代替主移动？',[...targetOptions(s,active(s).filter(x=>x.id!==r.id).map(x=>x.id)),{id:'skip',label:'正常掷骰'}],{},true);return;}
  s.flags.awaitRoll=true;
}
function rerollWindow(s:GameState,r:Racer,face:number) {
  const critics=powers(s,'critic').filter(c=>c.id!==r.id&&r.position>c.position&&!((r.flags.criticAsked??[]) as string[]).includes(c.id));
  if(critics.length){const c=critics[0]!;r.flags.criticAsked=[...((r.flags.criticAsked??[]) as string[]),c.id];ask(s,c,'critic',`要让${name(r)}重掷主移动吗？`,yesNo,{target:r.id,face},true);return;}
  const counts=(r.flags.rerolls??={}) as Record<string,number>;
  const rerollLimits:Record<string,number>={magician:2,'wurstii-diddy-kong':3,'wurstii-dixie-kong':1};
  const sources=order(s).flatMap(x=>effectivePowers(s,x).filter(power=>(power==='dicemonger'&&(counts[`${x.id}:${power}`]??0)<1)||(x.id===r.id&&(counts[`${x.id}:${power}`]??0)<(rerollLimits[power]??0))).map(power=>({racerId:x.id,power,key:`${x.id}:${power}`})));
  if(sources.length){ask(s,r,'reroll',`掷出${face}，要重掷吗？`,[{id:'reroll',label:'重掷'},{id:'keep',label:'保留'}],{face,sources},true);}
  else push(s,{kind:'finalRoll',racerId:r.id,face});
}
function finalRoll(s:GameState,r:Racer,face:number) {
  if(!live(r))return;
  const firstTasks:Work[]=[];
  if(secondWindFinalRoll(s,r,face,firstTasks))return;
  s.lastRoll={racerId:r.id,face,distance:face};log(s,'roll',`${name(r)}最终骰面为${face}`,{source:r.id});
  r.flags.wurstiiFace=face;
  if(r.flags.burtGuess===face&&hasPower(s,r,'wurstii-burt'))push(s,{kind:'wurstiiBurtBonus',racerId:r.id});
  if(r.flags.geniusGuess===face){r.flags.extraTurn=true;firstTasks.push({kind:'powerDone',racerId:r.id,power:'genius'});}
  if(face===1){for(const skipper of powers(s,'skipper'))firstTasks.push({kind:'ability',racerId:skipper.id,effects:[{kind:'setNext',racerId:skipper.id}]});}
  if(face===6){for(const lackey of powers(s,'lackey').filter(x=>x.id!==r.id))firstTasks.push({kind:'ability',racerId:lackey.id,effects:[{kind:'move',racerId:lackey.id,distance:2,cause:'lackey'}]});}
  firstTasks.sort((a,b)=>order(s).findIndex(x=>x.id===a.racerId)-order(s).findIndex(x=>x.id===b.racerId));
  if(hasPower(s,r,'magical-athlete')||(hasPower(s,r,'icarus')&&face===6)){push(s,...firstTasks);return;}
  const worms=face===1?powers(s,'inchworm').filter(x=>x.id!==r.id):[];
  if(worms.length){push(s,...firstTasks,...worms.map(x=>({kind:'ability',racerId:x.id,effects:[{kind:'move',racerId:x.id,distance:1,cause:'inchworm'}]})));return;}
  const power=effectivePower(s,r);
  if(hasPower(s,r,'sisyphus')&&face===6){push(s,{kind:'ability',racerId:r.id,effects:[{kind:'warp',racerId:r.id,position:0,cause:power},{kind:'gain',racerId:r.id,amount:-1}]},...firstTasks);return;}
  if(hasPower(s,r,'wurstii-lizzie')&&face<=2){push(s,...firstTasks,{kind:'wurstiiLizzie',racerId:r.id,face});return;}
  if(hasPower(s,r,'alchemist')&&face<=2){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power:'alchemist'});return;}
  if(hasPower(s,r,'rocket-scientist')){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power:'rocket-scientist'});return;}
  push(s,...firstTasks,{kind:'mainMove',racerId:r.id,base:face});
}
function mainMove(s:GameState,r:Racer,base:number) {
  if(!live(r))return;
  let distance=Number(r.flags.showOffDistance??base);r.flags.showOffDistance=undefined;const effects:Work[]=[];const power=effectivePower(s,r);
  distance=secondWindDistance(s,r,distance);
  for(const p of effectivePowers(s,r)){
    let bonus=0;
    if(p==='wurstii-bart-simpson'){const target=racer(s,String(r.flags.bartTarget));if(target&&live(target)&&target.position>r.position)bonus=2;}
    if(p==='wurstii-chip-n-dale'&&Number(r.flags.wurstiiFace)>=5)bonus=2;
    if(p==='wurstii-falco-lombardi')bonus=active(s).filter(x=>x.position>r.position).length;
    if(p==='wurstii-rockford')bonus=active(s).filter(x=>Math.abs(x.position-r.position)<=1).length;
    if(bonus){distance+=bonus;effects.push({kind:'powerDone',racerId:r.id,power:p});}
  }
  if(hasPower(s,r,'blimp')){distance+=Number(r.flags.blimpBonus??(r.position<15?3:-1));effects.push({kind:'powerDone',racerId:r.id,power});}
  if(hasPower(s,r,'hare')){distance+=2;effects.push({kind:'powerDone',racerId:r.id,power});}
  if(hasPower(s,r,'party-animal')){const bonus=active(s).filter(x=>x.id!==r.id&&x.position===r.position).length;distance+=bonus;if(bonus)effects.push({kind:'powerDone',racerId:r.id,power});}
  for(const source of order(s)){
    for(const p of effectivePowers(s,source)){
    if(p==='coach'&&source.position===r.position){distance++;effects.push({kind:'powerDone',racerId:source.id,power:p});}
    // Product house rule for this modifier only: in two-player races, Slime
    // spares every racer owned by its controller. Other powers keep their own
    // printed "another athlete" targeting semantics.
    if(p==='gunk'&&source.id!==r.id&&!(s.players.length===2&&source.playerId===r.playerId)){distance--;effects.push({kind:'powerDone',racerId:source.id,power:p});}
    }
  }
  if(r.flags.mainDirection===-1){distance=-distance;r.flags.mainDirection=undefined;}
  if(s.lastRoll?.racerId===r.id)s.lastRoll.distance=distance;
  push(s,{kind:'move',racerId:r.id,distance,cause:'main'},...effects);
}
function endTurn(s:GameState,r:Racer) {
  s.flags.awaitRoll=false;r.flags.mainAsked=false;r.flags.geniusAsked=false;
  const tasks:Work[]=[];if(live(r))tasks.push(...effectivePowers(s,r).map(power=>({kind:'swEndTurn',racerId:r.id,power})));if(live(r)&&Math.abs(r.position-Number(r.flags.turnStart??r.position))<=1)for(const h of powers(s,'heckler'))tasks.push({kind:'ability',racerId:h.id,effects:[{kind:'move',racerId:h.id,distance:2,cause:'heckler'}]});
  const wurstiiTasks=wurstiiEndTasks(s,r);
  push(s,...(wurstiiTasks.length?orderEffectTasks(s,[...tasks,...wurstiiTasks]):tasks),{kind:'advance',racerId:r.id});
}
function advance(s:GameState,r:Racer) {
  if(s.phase!=='race')return;
  const overrides=(s.flags.nextOverride??[]) as string[];let next=overrides.shift();s.flags.nextOverride=overrides;
  if(!next&&live(r)&&Number(r.flags.wurstiiExtraTurns)>0){next=r.id;r.flags.wurstiiExtraTurns=Number(r.flags.wurstiiExtraTurns)-1;}
  if(!next&&r.flags.extraTurn&&live(r))next=r.id;r.flags.extraTurn=false;
  if(!next){const fixed=baseOrder(s);for(let i=1;i<=fixed.length;i++){const candidate=racer(s,fixed[(fixed.indexOf(r.id)+i)%fixed.length]!);if(candidate&&live(candidate)){next=candidate.id;break;}}}
  if(!next){endRace(s);return;}
  s.currentRacerId=next;s.turn=s.racers.findIndex(x=>x.id===next);
  // Do not begin another player's turn inside a completed action: this leaves
  // an observable boundary and keeps mandatory recovery turns finite per call.
  s.flags.needsBegin=true;
}

function processChoice(s:GameState,c:PendingChoice,id:string) {
  const r=racer(s,c.racerId!)!;const ctx=c.context as Record<string,any>;
  if(c.kind==='wurstii-bart-simpson'){r.flags.bartTarget=id;log(s,'target',`${name(r)}指定${name(racer(s,id)!)}`,{source:r.id,targets:[id],cause:c.kind});push(s,{kind:'powerDone',racerId:r.id,power:c.kind});return;}
  if(c.kind==='wurstii-dr-wily'){r.flags.wilyPrediction=id;log(s,'prediction',`${name(r)}预测${name(racer(s,id)!)}获得亚军`,{source:r.id,targets:[id],cause:c.kind});push(s,{kind:'powerDone',racerId:r.id,power:c.kind});return;}
  if(c.kind==='wurstii-burt'){r.flags.burtGuess=Number(id);log(s,'prediction',`${name(r)}预测主骰为${id}`,{source:r.id,cause:c.kind});return;}
  if(c.kind==='wurstii-lakitu'){usePower(s,r,[{kind:'warp',racerId:id,position:r.position,cause:c.kind}],c.kind);return;}
  if(c.kind==='wurstii-pitfall-harry'){if(id==='use')usePower(s,r,[{kind:'warp',racerId:r.id,position:ctx.position,cause:c.kind}],c.kind);else push(s,{kind:'mainReady',racerId:r.id});return;}
  if(secondWindChoice(s,r,c,id))return;
  if(c.kind==='copycat'){r.flags.copyTarget=id;r.flags.copyPower=copyPower(s,r);return;}
  if(c.kind==='suckerfish'){
    const motionTask=ctx.motion as Work;
    if(id==='use'){motionTask.plans.push({racerId:r.id,follow:ctx.lead});log(s,'power',`${name(r)}选择随行`,{source:r.id,cause:'suckerfish'});}
    push(s,motionTask);return;
  }
  if(c.kind==='reroll'){
    if(id==='keep'){push(s,{kind:'finalRoll',racerId:r.id,face:ctx.face});return;}
    const selected=typeof ctx.sources[0]==='string'?{racerId:ctx.sources[0],power:effectivePower(s,racer(s,ctx.sources[0])!),key:ctx.sources[0]}:ctx.sources[0];const source=racer(s,selected.racerId)!;const counts=r.flags.rerolls as Record<string,number>;counts[selected.key]=(counts[selected.key]??0)+1;
    const work:Work[]=[];if(selected.power==='dicemonger'&&source.id!==r.id)work.push({kind:'move',racerId:source.id,distance:1,cause:'dicemonger'});
    work.push({kind:'powerDone',racerId:source.id,power:selected.power},{kind:'rollDie',racerId:r.id});
    log(s,'reroll',`${name(r)}舍弃${ctx.face}，选择重掷`,{source:source.id});push(s,...work);return;
  }
  if(c.kind==='egg'||c.kind==='twin'){
    if(id==='skip')return;const hist=s.flags.historyPowers as Record<string,string>|undefined;
    if(c.kind==='egg')r.flags.eggCardId??=id;else r.flags.twinCardId=id;
    r.flags.power=c.kind==='twin'?(hist?.[id]??id):id;log(s,'copy',`${name(r)}本场复制${character(id)?.nameZh??id}`,{source:r.id,cause:c.kind,selectedCardId:id});push(s,{kind:'beforeRace',racerId:r.id},{kind:'powerDone',racerId:r.id,power:c.kind});return;
  }
  if(c.kind==='mastermind'){r.flags.prediction=id;log(s,'prediction',`${name(r)}预测${name(racer(s,id)!)}夺冠`,{source:r.id,targets:[id]});return;}
  if(c.kind==='genius'){if(id!=='skip')r.flags.geniusGuess=Number(id);return;}
  if(c.kind==='legs'){if(id==='use')usePower(s,r,[{kind:'mainMove',racerId:r.id,base:5}]);else push(s,{kind:'mainReady',racerId:r.id});return;}
  if(c.kind==='flip-flop'){
    if(id==='skip'){push(s,{kind:'mainReady',racerId:r.id});return;}const other=racer(s,id)!;usePower(s,r,[{kind:'warp',plans:[{racerId:r.id,position:other.position},{racerId:id,position:r.position}],cause:'flip-flop'}]);return;
  }
  if(c.kind==='alchemist'||c.kind==='rocket-scientist'){
    const base=id==='use'?(c.kind==='alchemist'?4:ctx.face*2):ctx.face;
    const work:Work[]=[{kind:'mainMove',racerId:r.id,base}];if(id==='use'&&c.kind==='rocket-scientist')work.push({kind:'trip',racerId:r.id,source:r.id});
    if(id==='use')usePower(s,r,work,c.kind);else push(s,...work);return;
  }
  if(c.kind==='duelist'){
    if(id==='skip')return;const target=racer(s,id);if(!target||!live(target)||!live(r)||target.position!==r.position)throw Error('决斗对象已经不在同格');
    r.flags.duelInProgress=true;ask(s,r,'duel-roll',`${name(r)}，请掷决斗骰`,[{id:'roll',label:'掷决斗骰'}],{duelistId:r.id,targetId:target.id});return;
  }
  if(c.kind==='duel-roll'){
    const duelist=racer(s,String(ctx.duelistId)),target=racer(s,String(ctx.targetId));
    if(id!=='roll'||!duelist||!target||!live(duelist)||!live(target)||duelist.position!==target.position)throw Error('决斗双方已不在同格或不再参赛');
    const participant=ctx.firstFace===undefined?duelist:target;
    if(r.id!==participant.id||c.playerId!==participant.playerId)throw Error('决斗投掷控制权与当前参赛选手不一致');
    push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'duel',faces:[],context:ctx});return;
  }
  if(id==='skip')return;
  if(c.kind==='cheerleader'){
    const min=Math.min(...active(s).map(x=>x.position));usePower(s,r,[{kind:'move',plans:active(s).filter(x=>x.position===min).map(x=>({racerId:x.id,distance:2})),cause:c.kind},{kind:'move',racerId:r.id,distance:1,cause:c.kind}]);
  }
  if(c.kind==='hypnotist'){const target=racer(s,id);if(target&&live(target))usePower(s,r,[{kind:'warp',racerId:id,position:r.position,cause:c.kind}]);}
  if(c.kind==='third-wheel'){
    const pos=Number(id);if(active(s).filter(x=>x.position===pos).length!==2)throw Error('该格已不是恰好两名角色');usePower(s,r,[{kind:'warp',racerId:r.id,position:pos,cause:c.kind}]);
  }
}

function task(s:GameState,t:Work) {
  const r=racer(s,String(t.racerId??''));
  switch(t.kind){
    case 'wurstiiEnd':if(r&&live(r))dispatch(s,r,t.power,()=>wurstiiEnd(s,r,t));break;
    case 'wurstiiSpotFollow':if(r&&live(r)&&hasPower(s,r,'wurstii-spot')){const target=racer(s,t.targetId);if(target&&live(target)&&target.position>r.position)push(s,{kind:'move',racerId:r.id,distance:2,cause:'wurstii-spot'});}break;
    case 'wurstiiBurtBonus':if(r&&live(r)&&hasPower(s,r,'wurstii-burt'))usePower(s,r,[{kind:'move',racerId:r.id,distance:5,cause:'wurstii-burt'}],'wurstii-burt');break;
    case 'wurstiiLizzie':if(r&&live(r)){const position=nearestAhead(s,r);if(position!==undefined&&hasPower(s,r,'wurstii-lizzie'))usePower(s,r,[{kind:'warp',racerId:r.id,position,cause:'wurstii-lizzie'}],'wurstii-lizzie');else push(s,{kind:'mainMove',racerId:r.id,base:t.face});}break;
    case 'beforeRace':if(r)push(s,...effectivePowers(s,r).map(power=>({kind:'beforeRacePower',racerId:r.id,power})));break;
    case 'beforeRacePower':if(r)dispatch(s,r,t.power,()=>beforeRace(s,r));break;
    case 'beginTurn':if(r)beginTurn(s,r);break;
    case 'turnStartPower':if(r&&live(r))push(s,...effectivePowers(s,r).map(power=>({kind:'turnStartOne',racerId:r.id,power})));break;
    case 'turnStartOne':if(r&&live(r))dispatch(s,r,t.power,()=>turnStartPower(s,r));break;
    case 'swEndTurn':if(r&&live(r))dispatch(s,r,t.power,()=>secondWindEndTurn(s,r,t.power));break;
    case 'swRollEffect':if(r&&live(r))dispatch(s,r,t.power,()=>secondWindRollEffect(s,r,t));break;
    case 'swRoll':if(r&&live(r))secondWindRoll(s,r,t);break;
    case 'swFinal':if(r&&live(r))rerollWindow(s,r,t.face);break;
    case 'mainReady':if(r)mainReady(s,r);break;
    case 'endTurn':if(r)endTurn(s,r);break;
    case 'advance':if(r)advance(s,r);break;
    case 'rollDie':if(r&&live(r))push(s,{kind:'rollBatch',racerId:r.id,count:hasPower(s,r,'mr-dice-guy')?6:1,purpose:hasPower(s,r,'mr-dice-guy')?'mr-dice-guy':'main',faces:[]});break;
    case 'rollBatch':if(r&&live(r))rollBatch(s,r,t);break;
    case 'finalRoll':if(r)finalRoll(s,r,t.face);break;
    case 'mainMove':if(r)mainMove(s,r,t.base);break;
    case 'baseChoice':if(r)ask(s,r,t.power,t.power==='alchemist'?'要改为基础移动4格吗？':'要加倍骰面并在移动后绊倒吗？',yesNo,{face:t.face},true);break;
    case 'ability':if(r&&live(r))usePower(s,r,t.effects,t.power??effectivePower(s,r));break;
    case 'hotelPay':if(r&&live(r)){const target=racer(s,t.targetId);if(target&&live(target)&&target.position===r.position){if(owner(s,target).score>=1){points(s,target,-1,'旅馆住宿费');points(s,r,1,'旅馆住宿收入');}else push(s,{kind:'trip',racerId:target.id,source:r.id});}}break;
    case 'hogTake':if(r&&live(r)){const previous=s.racers.filter(x=>x.flags.hogOwnerId===t.hogOwnerId);for(const x of previous)delete x.flags.hogOwnerId;r.flags.hogOwnerId=t.hogOwnerId;log(s,'mount',`${name(r)}夺走野猪坐骑`,{source:r.id,cause:'hog-knight',changes:[...previous.filter(x=>x.id!==r.id).map(x=>({racerId:x.id,mount:null})),{racerId:r.id,mount:String(t.hogOwnerId)}]});}break;
    case 'gain':if(r)points(s,r,t.amount,name(r));break;
    case 'setNext':((s.flags.nextOverride??=[]) as string[]).push(t.racerId);break;
    case 'trip':if(r&&live(r)){r.tripped=true;log(s,'trip',`${name(r)}绊倒`,{source:t.source,targets:[r.id]});}break;
    case 'eliminate':eliminate(s,t.racerId,t.source);break;
    case 'move':case 'warp':motion(s,t);break;
    case 'powerDone':
      // Every individual power activation generates its own response, including
      // separate Leaptoad skipped spaces and distinct passive modifier uses.
      for(const sc of order(s).filter(x=>x.id!==t.racerId).toReversed())for(const power of effectivePowers(s,sc).filter(p=>p==='scoocher'||p==='wurstii-mr-game-and-watch').toReversed())push(s,{kind:'ability',racerId:sc.id,power,effects:[{kind:'move',racerId:sc.id,distance:1,cause:power}]});
      break;
    case 'board':if(r&&live(r)){
      const special=TRACKS[s.track].specials[r.position];if(!special)break;
      if(special.kind==='star')points(s,r,1,'赛道星格');
      if(special.kind==='trip')push(s,{kind:'trip',racerId:r.id,source:'track'});
      if(special.kind==='arrow')push(s,{kind:'move',racerId:r.id,distance:special.move,cause:'track-arrow'});
    }break;
    case 'duelCheck':if(r&&live(r)&&hasPower(s,r,'duelist')&&!r.flags.duelInProgress){
      const targets=active(s).filter(x=>x.id!==r.id&&x.position===r.position);if(targets.length)ask(s,r,'duelist','要向同格角色发起决斗吗？',[...targetOptions(s,targets.map(x=>x.id)),{id:'skip',label:'不决斗'}],{},true);
    }break;
    case 'refreshCopies':for(const copy of active(s).filter(x=>(String(x.flags.power??x.characterId)==='copycat'||((x.flags.acquiredPowers??[]) as string[]).includes('copycat')))){
      const lead=Math.max(...active(s).map(x=>x.position));const targets=active(s).filter(x=>x.id!==copy.id&&x.characterId!=='copycat'&&x.position===lead);
      const power=copyPower(s,copy);if(copy.flags.lastCopyPower!==power){if(copy.flags.lastCopyPower==='mastermind')delete copy.flags.prediction;copy.flags.lastCopyPower=power;}copy.flags.copyPower=power;
      if(targets.length>1&&!targets.some(x=>x.id===copy.flags.copyTarget)){ask(s,copy,'copycat','选择一名并列领先者作为模仿对象',targetOptions(s,targets.map(x=>x.id)),{});push(s,{kind:'refreshCopies'});break;}
      if(targets.length===1)copy.flags.copyTarget=targets[0]!.id;
    }break;
    default:throw Error(`无法识别规则事件：${t.kind}`);
  }
}
/** Bounded work is resumable, never an arbitrary limit on valid power chains. */
export function resolveTasks(s:GameState):void {
  let budget=0;const suppressed=new Set<string>((s.flags.resolutionSuppressed??[]) as string[]);const scoreSeen=new Map<string,number[]>((s.flags.resolutionSeenScores??[]) as [string,number[]][]);const seen=new Map<string,Task[]>((s.flags.resolutionSeen??[]) as [string,Task[]][]);
  while(s.phase==='race'&&!s.pending&&s.queue.length){
    if(++budget>3000){s.flags.continuation=true;s.flags.resolutionSeen=[...seen];s.flags.resolutionSuppressed=[...suppressed];s.flags.resolutionSeenScores=[...scoreSeen];return;}
    const signature=JSON.stringify({racers:s.racers.map(r=>({id:r.id,p:r.position,t:r.tripped,f:r.finished,e:r.eliminated,flags:r.flags})),next:s.queue[0],rng:s.rngState});
    if(suppressed.has(signature)){s.queue.shift();continue;}
    const earlier=seen.get(signature);
    // A nested repeated branch grows a continuation stack while returning the
    // complete board and next effect to the same state. Static repeated effects
    // (e.g. two skipped spaces) shrink the queue and are not called loops.
    if(earlier&&s.queue.length>earlier.length){
      const tail=earlier.slice(1);const suffix=s.queue.slice(s.queue.length-tail.length);
      if(JSON.stringify(suffix)===JSON.stringify(tail)&&!s.players.some((p,i)=>p.score<(scoreSeen.get(signature)?.[i]??p.score))){
        log(s,'loop','相同位置、状态和待处理效果重现，完成一轮后停止重复分支');s.queue=structuredClone(tail);suppressed.add(signature);seen.clear();continue;
      }
    }
    if(!earlier||s.players.some((p,i)=>p.score<(scoreSeen.get(signature)?.[i]??p.score))){if(seen.size>=256){const oldest=seen.keys().next().value!;seen.delete(oldest);scoreSeen.delete(oldest);}seen.set(signature,[...s.queue]);scoreSeen.set(signature,s.players.map(p=>p.score));}
    task(s,s.queue.shift()! as Work);
    if(s.flags.awaitRoll)break;
  }
  s.flags.continuation=false;
  // A choice suspends the same causal branch. In particular, declining a Fish
  // prompt must not erase the loop history for a mandatory Baby/Scoocher loop.
  if(s.pending){s.flags.resolutionSeen=[...seen];s.flags.resolutionSuppressed=[...suppressed];s.flags.resolutionSeenScores=[...scoreSeen];}
  else {delete s.flags.resolutionSeen;delete s.flags.resolutionSuppressed;delete s.flags.resolutionSeenScores;}
}
export function applyGameAction(s:GameState,playerId:string,action:GameAction):void {
  const p=s.players.find(x=>x.id===playerId);if(!p)throw Error('你不在本局参赛席位中');
  if(action.type==='start'){startGame(s);return;}
  if(action.type==='practice-team'){
    if(s.mode!=='practice'||s.phase!=='draft'||s.round!==1||s.players.length!==1)throw Error('现在不能选择练习阵容');
    if(action.characterIds.length!==4||new Set(action.characterIds).size!==4||action.characterIds.some(id=>!practiceCharacters().some(c=>c.id===id)))throw Error('请从完整牌池选择4张不同角色牌');
    p.hand=[...action.characterIds];
    // Earlier practice saves can be midway through a two-batch draft. Replace
    // that incomplete hand atomically and return every unchosen printed card
    // to the candidate pool, preserving the stored shuffle and random history.
    const remaining=practiceCharacters().map(c=>c.id).filter(id=>!p.hand.includes(id));
    s.deck=[...new Set([...s.deck.filter(id=>remaining.includes(id)),...remaining])];
    log(s,'practice-team',`${p.name}的练习阵容：${p.hand.map(id=>character(id)!.nameZh).join('、')}`);beginSelection(s);return;
  }
  if(action.type==='draft'){
    if(s.mode==='practice')throw Error('请从完整牌池一次确认4张练习角色牌');
    if(s.phase!=='draft'||!s.draft)throw Error('现在不是选秀阶段');const d=s.draft;if(d.order[d.cursor]!==playerId)throw Error('还没有轮到你选秀');
    const index=d.market.indexOf(action.characterId);if(index<0)throw Error('这张角色牌不在候选区');d.market.splice(index,1);p.hand.push(action.characterId);d.cursor++;log(s,'draft',`${p.name}选择${character(action.characterId)?.nameZh}`,{cause:action.characterId});
    if(d.cursor===d.order.length){if(d.batch===0){const fi=s.players.findIndex(x=>x.id===s.flags.draftFirst);const first=s.players[(fi+1)%s.players.length]!.id;d.batch=1;d.cursor=0;d.order=snake(s,first,s.players.length===2);d.market=s.deck.splice(0,s.players.length===2?8:s.players.length*2);}else beginSelection(s);}return;
  }
  if(action.type==='select'){
    if(s.phase!=='selection')throw Error('现在不是暗选阶段');if(p.selection.length)throw Error('暗选已确认，等待所有玩家揭示');const n=s.players.length===2?2:1;
    if(action.characterIds.length!==n||new Set(action.characterIds).size!==n||action.characterIds.some(id=>!p.hand.includes(id)))throw Error(`请选择${n}名不同且未使用的角色`);
    p.selection=[...action.characterIds];if(s.players.every(x=>x.selection.length===n)){prepareRace(s);resolveTasks(s);}return;
  }
  if(action.type==='next'){
    if(s.phase==='results'){s.round++;beginSelection(s);return;}
    if(s.phase==='race'&&(s.flags.continuation||s.flags.needsBegin)){
      if(s.flags.needsBegin){s.flags.needsBegin=false;const current=racer(s,s.currentRacerId!);if(current)push(s,{kind:'beginTurn',racerId:current.id});}resolveTasks(s);return;
    }throw Error('现在不能继续下一阶段');
  }
  if(s.phase!=='race')throw Error('当前没有正在进行的比赛');
  if(action.type==='choose'){
    const pending=s.pending;if(!pending||pending.id!==action.choiceId)throw Error('该选择已经过期');if(pending.playerId!==playerId)throw Error('这个选择需要对应玩家操作');if(!pending.options.some(o=>o.id===action.optionId))throw Error('不合法的技能选项');
    s.pending=undefined;processChoice(s,pending,action.optionId);resolveTasks(s);return;
  }
  if(action.type==='roll'){
    const r=racer(s,s.currentRacerId!);if(!r||r.playerId!==playerId)throw Error('还没有轮到你的角色');if(s.pending)throw Error('请先完成待处理选择');
    if(s.flags.needsBegin||s.flags.continuation)throw Error('回合开始事件正在由系统处理，请稍候');
    if(!s.flags.awaitRoll)throw Error('当前角色尚未进入掷骰阶段');s.flags.awaitRoll=false;push(s,{kind:'rollDie',racerId:r.id});resolveTasks(s);return;
  }
  throw Error('这个操作不适用于当前阶段');
}
/** Pure scheduling policy: no mutation, RNG calls, or information reveal. */
export function automaticAction(s:GameState):{playerId:string;action:GameAction}|undefined {
  if(s.mode==='practice'&&s.phase==='draft'&&s.draft)return{playerId:s.players[0]!.id,action:{type:'practice-team',characterIds:s.draft.market.slice(0,4)}};
  if(s.phase==='draft'&&s.draft){const id=s.draft.order[s.draft.cursor],card=s.draft.market[0];if(id&&card)return{playerId:id,action:{type:'draft',characterId:card}};}
  if(s.phase==='selection'){const n=s.players.length===2?2:1;const p=s.players.find(x=>x.selection.length!==n);if(p)return{playerId:p.id,action:{type:'select',characterIds:p.hand.slice(0,n)}};}
  if(s.phase==='results')return{playerId:s.players[0]!.id,action:{type:'next'}};
  if(s.phase!=='race')return;
  if(s.pending){const c=s.pending;if(!s.players.find(p=>p.id===c.playerId)?.isAI)return;const opt=c.options.find(o=>o.id==='skip')??c.options.find(o=>o.id==='keep')??c.options[0];if(opt)return{playerId:c.playerId,action:{type:'choose',choiceId:c.id,optionId:opt.id}};}
  const immediate=systemAction(s);if(immediate)return immediate;
  const r=racer(s,s.currentRacerId!);if(r&&s.flags.awaitRoll)return{playerId:r.playerId,action:{type:'roll'}};
  return;
}

/** Turn setup is an authority-owned transition, independent of the die button. */
export function systemAction(s:GameState):{playerId:string;action:GameAction}|undefined {
  if(s.phase==='race'&&!s.pending&&(s.flags.continuation||s.flags.needsBegin))return{playerId:s.players[0]!.id,action:{type:'next'}};
}
/** A die belongs to an on-board racer. Stunner changes the result, never the RNG log. */
function wurstiiMilestone(position:number):boolean { return position>=5&&position<=25&&position%5===0; }
function nearestAhead(s:GameState,r:Racer):number|undefined {
  const ahead=active(s).filter(x=>x.position>r.position);
  return ahead.length?Math.min(...ahead.map(x=>x.position)):undefined;
}
function wurstiiTurnStart(s:GameState,r:Racer,power:string):boolean {
  if(power==='wurstii-bart-simpson'){
    if(r.flags.turnsTaken===1)askTarget(s,r,power,'指定本场要追赶的选手',active(s).filter(x=>x.id!==r.id));
    return true;
  }
  if(power==='wurstii-lakitu'){askTarget(s,r,power,'选择必须召唤到自己所在格的选手',active(s).filter(x=>x.id!==r.id));return true;}
  if(power==='wurstii-olaf'&&(r.position===5||r.position===10)){usePower(s,r,[{kind:'warp',racerId:r.id,position:20,cause:power}],power);return true;}
  const someoneFinished=currentPlacements(s).some(p=>p.racerId!==r.id);
  if(power==='wurstii-bullet-bill'&&someoneFinished&&!r.flags.bulletUsed){r.flags.bulletUsed=true;usePower(s,r,[{kind:'move',racerId:r.id,distance:8,cause:power}],power);return true;}
  if(power==='wurstii-fluffin-puffins'&&someoneFinished&&Number(r.flags.puffinUses??0)<3){r.flags.puffinUses=Number(r.flags.puffinUses??0)+1;usePower(s,r,[{kind:'gain',racerId:r.id,amount:1}],power);return true;}
  return false;
}
/** Capture one end-of-turn event before any reacting character moves its target. */
function wurstiiEndTasks(s:GameState,ending:Racer):Work[] {
  if(!live(ending))return [];
  const tasks:Work[]=[];
  const milestone=wurstiiMilestone(ending.position);
  for(const source of order(s))for(const power of effectivePowers(s,source)){
    const own=source.id===ending.id,other=!own,ahead=ending.position>source.position;
    const triggers=(power==='wurstii-bucky-ohare'&&other&&milestone)
      ||(power==='wurstii-dry-bones'&&other&&milestone)
      ||(power==='wurstii-jason-vorhees'&&other&&[28,29].includes(ending.position))
      ||(power==='wurstii-knuckles'&&own&&ending.flags.turnsTaken===1&&!ending.flags.knucklesUsed)
      ||(power==='wurstii-olaf'&&own&&[5,10].includes(ending.position))
      ||(power==='wurstii-simon-belmont'&&own&&milestone)
      ||(power==='wurstii-yoshi'&&active(s).some(x=>x.id!==ending.id&&x.position===ending.position))
      ||(power==='wurstii-rollercoaster-tycoon-guest'&&own&&milestone)
      ||(other&&ahead&&milestone&&(power==='wurstii-spot'||power==='wurstii-piranha-plant'));
    if(triggers)tasks.push({kind:'wurstiiEnd',racerId:source.id,power,targetId:ending.id,position:ending.position});
  }
  return tasks;
}
function wurstiiEnd(s:GameState,r:Racer,t:Work) {
  const power=String(t.power),target=racer(s,String(t.targetId));
  if(!target)return;
  const effects:Work[]=[];
  if(power==='wurstii-bucky-ohare')effects.push({kind:'move',racerId:r.id,distance:1,cause:power});
  if(power==='wurstii-dry-bones'){
    const seen=(r.flags.dryBonesTargets??=[]) as string[];
    if(seen.includes(target.id))return;seen.push(target.id);
    effects.push({kind:'gain',racerId:target.id,amount:-1});
  }
  if(power==='wurstii-jason-vorhees'&&live(target))effects.push({kind:'warp',racerId:target.id,position:20,cause:power});
  if(power==='wurstii-knuckles'){r.flags.knucklesUsed=true;r.flags.wurstiiExtraTurns=Number(r.flags.wurstiiExtraTurns??0)+2;}
  if(power==='wurstii-olaf')effects.push({kind:'warp',racerId:r.id,position:20,cause:power});
  if(power==='wurstii-simon-belmont')r.flags.extraTurn=true;
  if(power==='wurstii-yoshi')effects.push({kind:'move',racerId:r.id,distance:2,cause:power});
  if(power==='wurstii-rollercoaster-tycoon-guest')effects.push({kind:'gain',racerId:r.id,amount:1});
  if(power==='wurstii-spot'&&live(target))effects.push({kind:'warp',racerId:target.id,position:Math.max(0,target.position-5),cause:power},{kind:'wurstiiSpotFollow',racerId:r.id,targetId:target.id});
  if(power==='wurstii-piranha-plant')effects.push({kind:'warp',racerId:r.id,position:Number(t.position),cause:power});
  usePower(s,r,effects,power);
}
function rollFor(s:GameState,r:Racer,reason:string):number {
  const raw=random(s,reason);
  const stunners=powers(s,'stunner').filter(x=>x.id!==r.id&&Math.abs(x.position-r.position)<=1);
  if(stunners.length){log(s,'die-modified',`${name(r)}的骰面被惊艳者固定为1`,{source:stunners[0]!.id,targets:[r.id],faces:[raw,1],cause:'stunner'});return 1;}
  return raw;
}
function extremeTargets(s:GameState,lead:boolean){const all=active(s);const n=(lead?Math.max:Math.min)(...all.map(x=>x.position));return all.filter(x=>x.position===n);}
function askTarget(s:GameState,r:Racer,kind:string,title:string,targets:Racer[],context:Record<string,any>={},optional=false){ask(s,r,kind,title,[...targetOptions(s,targets.map(x=>x.id)),...(optional?[{id:'skip',label:'放弃'}]:[])],context,optional);}
function secondWindBeforeRace(s:GameState,r:Racer,p:string):boolean {
  const prepared=(r.flags.swPrepared??=[]) as string[];if(prepared.includes(p))return true;
  if(!['hog-knight','nepo-baby','soulmate','understudy','stepdad','re-runner'].includes(p))return false;
  prepared.push(p);
  if(p==='hog-knight'){r.flags.hogOwnerId=r.id;log(s,'mount',`${name(r)}骑上野猪`,{source:r.id,cause:p,changes:[{racerId:r.id,mount:r.id}]});}
  if(p==='nepo-baby'){r.position=TRACKS[s.track].firstCorner;log(s,'place',`${name(r)}从第一弯道出发`,{source:r.id,after:[r.position],cause:p});}
  if(p==='re-runner')r.flags.reRunnerPlayerId=r.playerId;
  if(p==='stepdad'){const fixed=baseOrder(s),idx=fixed.indexOf(r.id);r.flags.stepTarget=fixed[(idx+1)%fixed.length];}
  if(p==='soulmate'||p==='understudy')askTarget(s,r,p,p==='soulmate'?'选择一名对方选手作为灵魂伴侣':'复制一名对方选手的印刷能力',active(s).filter(x=>x.playerId!==r.playerId));
  return true;
}
function secondWindTurnStart(s:GameState,r:Racer,p:string):boolean {
  const others=active(s).filter(x=>x.id!==r.id);
  if(p==='diva') {const last=extremeTargets(s,false).some(x=>x.id===r.id);askTarget(s,r,p,last?'选择领跑者交换位置':'选择末位选手交换位置',extremeTargets(s,last));return true;}
  if(p==='kingtripper'){askTarget(s,r,p,'要绊倒哪名领跑者？',extremeTargets(s,true),{},true);return true;}
  if(p==='kraken'){if(!r.flags.krakenUsed&&others.length)ask(s,r,p,'发动本场一次的海怪技能？',yesNo,{},true);return true;}
  if(p==='tail'){const ahead=others.filter(x=>x.position>r.position);if(ahead.length){const pos=Math.min(...ahead.map(x=>x.position));ask(s,r,p,`传送到第${pos-1}格？`,yesNo,{position:pos-1},true);}return true;}
  if(p==='soulmate'){const mate=racer(s,String(r.flags.soulmateTarget));if(mate&&live(mate)&&Math.abs(mate.position-r.position)<=5)usePower(s,r,[{kind:'warp',racerId:r.id,position:mate.position,cause:p}],p);return true;}
  if(p==='speed-demon'){if(others.length&&others.every(x=>r.position-x.position>=4))eliminate(s,r.id,r.id);return true;}
  if(p==='spoilsport'){if(others.length&&others.every(x=>x.position-r.position>=5)){points(s,r,3,'输不起取消比赛');s.flags.cancelledRace=true;log(s,'cancel-race','输不起取消本场；未颁发的名次不再计分',{source:r.id,cause:p});endRace(s);}return true;}
  return false;
}
function secondWindMainReady(s:GameState,r:Racer,p:string):boolean {
  if(p==='mole'&&!r.flags.mainAsked&&active(s).every(x=>x.id===r.id||Math.abs(x.position-r.position)>1)){r.flags.mainAsked=true;ask(s,r,p,'要以6格代替主移动掷骰吗？',yesNo,{},true);return true;}
  if(p==='cheatah'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,p,'秘密设定主移动点数',Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{});return true;}
  if(p==='mr-dice-guy'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'mr-dice-roll','掷六颗主移动骰子',[{id:'roll',label:'掷六骰'}],{});return true;}
  return false;
}
function secondWindFinalRoll(s:GameState,r:Racer,face:number,tasks:Work[]):boolean {
  // Replacing a roll (Mr Dice / Cheatah / Show-Off) is fully decided before
  // observers react. No abandoned or secret number enters the public pipeline.
  if(hasPower(s,r,'show-off')&&!r.flags.showOffResolved){r.flags.showOffPrevious=face;r.flags.showOffTotal=face;ask(s,r,'show-off',`已累计${face}，继续投掷还是停止？`,[{id:'stop',label:'停止并移动'},{id:'roll',label:'继续投掷'}],{previous:face,total:face},true);return true;}
  for(const source of order(s))for(const p of effectivePowers(s,source)) {
    if((source.id===r.id&&['bite-mark','icarus','mush','magical-athlete'].includes(p))||(source.id!==r.id&&p==='nemesis'))tasks.push({kind:'swRollEffect',racerId:source.id,targetId:r.id,power:p,face});
  }
  if(face===3&&powers(s,'le-saboteur').some(x=>x.id!==r.id))r.flags.mainDirection=-1;
  return false;
}
function secondWindRollEffect(s:GameState,r:Racer,t:Work) {
  const face=Number(t.face),target=racer(s,String(t.targetId));
  if(t.power==='bite-mark'&&face<=2){r.flags.form='were-mouth';log(s,'transform',`${name(r)}变为狼人巨口`,{source:r.id,cause:'bite-mark',changes:[{racerId:r.id,form:'were-mouth'}]});}
  if(t.power==='icarus'&&face===6)eliminate(s,r.id,r.id);
  if(t.power==='mush'&&face<=2){const id=s.deck.shift();if(id){s.discard.push(id);r.flags.acquiredPowers=[...((r.flags.acquiredPowers??[]) as string[]),id];log(s,'acquire',`${name(r)}获得${character(id)?.nameZh??id}的能力`,{source:r.id,cause:'mush',selectedCardId:id});}}
  if(t.power==='nemesis'&&target&&live(target))ask(s,r,'nemesis',`要跟掷${name(target)}的${face}点吗？`,yesNo,{face},true);
  if(t.power==='magical-athlete'){
    if(face===1)usePower(s,r,[{kind:'mainMove',racerId:r.id,base:7}],t.power);
    if(face===2)askTarget(s,r,'magical-last','选择一名末位选手传送到自己',extremeTargets(s,false));
    if(face===3)askTarget(s,r,'magical-warp','选择传送目标并绊倒对方',active(s).filter(x=>x.id!==r.id));
    if(face===4){r.flags.extraTurn=true;usePower(s,r,[{kind:'mainMove',racerId:r.id,base:4}],t.power);}
    if(face===5)askTarget(s,r,'magical-lead','选择一名领跑者后退5格',extremeTargets(s,true));
    if(face===6){r.flags.magicPassTrip=true;usePower(s,r,[{kind:'mainMove',racerId:r.id,base:6}],t.power);}
  }
}
function secondWindDistance(s:GameState,r:Racer,distance:number):number {
  const ps=effectivePowers(s,r);
  if(ps.includes('blunderdog')){if(extremeTargets(s,false).some(x=>x.id===r.id)){if(r.flags.mainRolled)distance*=3;}else r.flags.mainDirection=-1;}
  if(ps.includes('penguin')&&r.tripped&&r.flags.mainRolled){distance*=2;log(s,'power',`${name(r)}绊倒状态下将主骰加倍`,{source:r.id,cause:'penguin'});}
  if(ps.includes('gloth'))distance--;
  if(ps.includes('icarus'))distance+=3;
  if(ps.includes('overtaker'))distance+=active(s).filter(x=>x.position>r.position).length;
  if(ps.includes('speed-demon'))distance+=owner(s,r).score;
  // A stolen hog is an object carried by its rider, independent of rider powers.
  if(r.flags.hogOwnerId)distance+=2;
  for(const source of order(s)){
    if(hasPower(s,source,'null')&&r.position>source.position)distance--;
    if(hasPower(s,source,'stepdad')&&source.flags.stepTarget===r.id)distance+=2;
  }
  return distance;
}
function secondWindEndTurn(s:GameState,r:Racer,p:string) {
  const others=active(s).filter(x=>x.id!==r.id);
  if(p==='hopfrog'&&others.some(x=>x.position-r.position===1)){r.flags.extraTurn=true;log(s,'extra-turn',`${name(r)}获得额外回合`,{source:r.id,cause:p});}
  if(p==='switcharoo')askTarget(s,r,p,'要与哪名邻近选手交换控制权？',others.filter(x=>Math.abs(x.position-r.position)<=1),{},true);
  if(p==='the-hose')push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'the-hose',faces:[]});
  r.flags.magicPassTrip=false;r.flags.showOffResolved=false;
}
function secondWindRoll(s:GameState,r:Racer,t:Work){if(t.power==='mr-dice-guy')push(s,{kind:'rollBatch',racerId:r.id,count:6,purpose:'mr-dice-guy',faces:[]});}
function secondWindChoice(s:GameState,r:Racer,c:PendingChoice,id:string):boolean {
  const ctx=c.context as Record<string,any>,kind=c.kind;
  if(kind==='main-ability'){r.flags.mainSelection=id;push(s,{kind:'mainReady',racerId:r.id});return true;}
  if(kind==='mole'){if(id==='use')usePower(s,r,[{kind:'mainMove',racerId:r.id,base:6}],'mole');else push(s,{kind:'mainReady',racerId:r.id});return true;}
  if(kind==='understudy'){const target=racer(s,id)!;r.flags.power=target.characterId;r.flags.copiedFrom=target.id;log(s,'copy',`${name(r)}复制${name(target)}的印刷能力`,{source:r.id,targets:[target.id],selectedCardId:target.characterId,cause:kind});push(s,{kind:'beforeRace',racerId:r.id});return true;}
  if(kind==='soulmate'){r.flags.soulmateTarget=id;return true;}
  if(kind==='diva'){const target=racer(s,id)!;usePower(s,r,[{kind:'warp',plans:[{racerId:r.id,position:target.position},{racerId:target.id,position:r.position}],cause:kind}],kind);return true;}
  if(kind==='kingtripper'){if(id!=='skip')usePower(s,r,[{kind:'trip',racerId:id,source:r.id}],kind);return true;}
  if(kind==='kraken'){if(id==='use'){r.flags.krakenUsed=true;const others=active(s).filter(x=>x.id!==r.id);usePower(s,r,[{kind:'warp',plans:others.map(x=>({racerId:x.id,position:r.position})),cause:kind},...others.map(x=>({kind:'trip',racerId:x.id,source:r.id}))],kind);}return true;}
  if(kind==='tail'){if(id==='use')usePower(s,r,[{kind:'warp',racerId:r.id,position:ctx.position,cause:kind}],kind);return true;}
  if(kind==='critic'){const target=racer(s,ctx.target)!;if(id==='use')usePower(s,r,[{kind:'rollDie',racerId:target.id}],kind);else rerollWindow(s,target,ctx.face);return true;}
  if(kind==='nemesis'){if(id==='use')push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'nemesis',faces:[],context:ctx});return true;}
  if(kind==='cheatah'){
    r.flags.cheatahSecret=Number(id);const seat=owner(s,r).seat;const right=[...s.players].sort((a,b)=>((seat-a.seat+s.players.length)%s.players.length)-((seat-b.seat+s.players.length)%s.players.length)).find(x=>x.id!==r.playerId);
    if(!right){const face=Number(id);delete r.flags.cheatahSecret;push(s,{kind:'mainMove',racerId:r.id,base:face});return true;}
    const guessRacer=active(s).find(x=>x.playerId===right.id)??r;ask(s,guessRacer,'cheatah-guess',`猜测${name(r)}的秘密点数`,Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{cheatahId:r.id,secret:Number(id)});s.pending!.playerId=right.id;return true;
  }
  if(kind==='cheatah-guess'){const cheatah=racer(s,ctx.cheatahId)!;const face=Number(ctx.secret);delete cheatah.flags.cheatahSecret;log(s,'secret-reveal',`${name(cheatah)}设定${face}；猜测${id}${Number(id)===face?'，猜中！':'，未猜中'}`,{source:cheatah.id,faces:[face,Number(id)],cause:'cheatah'});if(Number(id)!==face)push(s,{kind:'mainMove',racerId:cheatah.id,base:face});return true;}
  if(kind==='mr-dice-roll'){push(s,{kind:'swRoll',racerId:r.id,power:'mr-dice-guy'});return true;}
  if(kind==='mr-dice-pick'){push(s,{kind:'swFinal',racerId:r.id,face:Number(id)});return true;}
  if(kind==='show-off'){
    if(id==='stop'){r.flags.showOffResolved=true;r.flags.showOffDistance=Number(ctx.total);push(s,{kind:'finalRoll',racerId:r.id,face:Number(ctx.previous)});return true;}
    push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'show-off',faces:[],context:ctx});return true;
  }
  if(kind==='magical-last'){usePower(s,r,[{kind:'warp',racerId:id,position:r.position,cause:'magical-athlete'}],'magical-athlete');return true;}
  if(kind==='magical-warp'){const target=racer(s,id)!;usePower(s,r,[{kind:'warp',racerId:r.id,position:target.position,cause:'magical-athlete'},{kind:'trip',racerId:id,source:r.id}],'magical-athlete');return true;}
  if(kind==='magical-lead'){usePower(s,r,[{kind:'move',racerId:id,distance:-5,cause:'magical-athlete'}],'magical-athlete');return true;}
  if(kind==='switcharoo'){
    if(id==='skip')return true;const target=racer(s,id)!;const former=r.playerId;r.playerId=target.playerId;target.playerId=former;
    // Card custody moves too; points and reconnection remain keyed by stable player IDs.
    for(const p of s.players){if(p.id===former){const ix=p.used.indexOf(r.characterId);if(ix>=0)p.used[ix]=target.characterId;}else if(p.id===r.playerId){const ix=p.used.indexOf(target.characterId);if(ix>=0)p.used[ix]=r.characterId;}}
    log(s,'control',`${name(r)}与${name(target)}交换控制权`,{source:r.id,targets:[r.id,target.id],cause:kind,changes:[{racerId:r.id,playerId:r.playerId},{racerId:target.id,playerId:target.playerId}]});return true;
  }
  return false;
}
/** Each die and forced reroll is a JSON continuation. Party Pooper's movement,
 * including any target choices it triggers, finishes before the replacement die. */
function rollBatch(s:GameState,r:Racer,t:Work){
  const faces=(t.faces??[]) as number[];const face=rollFor(s,r,t.purpose==='main'?`${name(r)}主移动`:`${name(r)} ${t.purpose}`);
  const poopers=face===6?powers(s,'party-pooper'):[];
  if(poopers.length){
    log(s,'reroll','扫兴鬼强制重掷6点',{source:r.id,cause:'party-pooper'});
    push(s,...poopers.map(p=>({kind:'ability',racerId:p.id,power:'party-pooper',effects:[{kind:'move',racerId:p.id,distance:1,cause:'party-pooper'}]})),{...t,faces:[...faces]});return;
  }
  faces.push(face);
  if(faces.length<Number(t.count)){push(s,{...t,faces});return;}
  const ctx=(t.context??{}) as Record<string,any>;
  if(t.purpose==='main'){r.flags.mainRolled=true;s.lastRoll={racerId:r.id,face,distance:face};log(s,'die',`${name(r)}掷出${face}`,{source:r.id});rerollWindow(s,r,face);return;}
  if(t.purpose==='mr-dice-guy'){
    r.flags.mainRolled=true;
    const repeats=[...new Set(faces)].filter(n=>faces.filter(x=>x===n).length>1);
    log(s,'multi-dice',`${name(r)}掷出六骰：${faces.join('、')}`,{source:r.id,faces,cause:t.purpose});
    if(repeats.length)ask(s,r,'mr-dice-pick','选择出现两次以上的点数',repeats.map(n=>({id:String(n),label:`${n}（${faces.filter(x=>x===n).length}次）`})),{});
    else {s.phase='paused';s.flags.ruleHold={code:'mr-dice-no-repeat',message:'六颗主骰各不相同，没有合法重复点数；官方处理待核实，已保留队列暂停本场。'};log(s,'rule-hold',String((s.flags.ruleHold as Record<string,string>).message),{source:r.id,cause:t.purpose});}
    return;
  }
  if(t.purpose==='nemesis'){log(s,'ability-dice',`${name(r)}跟掷${face}`,{source:r.id,faces:[face],cause:t.purpose});if(face===ctx.face)usePower(s,r,[{kind:'move',racerId:r.id,distance:face,cause:t.purpose}],t.purpose);return;}
  if(t.purpose==='the-hose'){log(s,'ability-dice',`${name(r)}水管范围${face}`,{source:r.id,faces:[face],cause:t.purpose});usePower(s,r,active(s).filter(x=>x.id!==r.id&&x.position>r.position&&x.position-r.position<=face).map(x=>({kind:'trip',racerId:x.id,source:r.id})),t.purpose);return;}
  if(t.purpose==='show-off'){
    log(s,'die',`${name(r)}追加掷出${face}`,{source:r.id,faces:[face],cause:t.purpose});
    if(face<=Number(ctx.previous)){r.flags.showOffResolved=true;log(s,'skip','新骰不大于前骰，显摆精主移动取消',{source:r.id,cause:t.purpose});}
    else ask(s,r,'show-off',`累计${Number(ctx.total)+face}；继续或停止？`,[{id:'stop',label:'停止并移动'},{id:'roll',label:'继续投掷'}],{previous:face,total:Number(ctx.total)+face},true);
    return;
  }
  if(t.purpose==='duel'){
    const duelist=racer(s,String(ctx.duelistId)),target=racer(s,String(ctx.targetId));if(!duelist||!target)return;
    if(ctx.firstFace===undefined){ask(s,target,'duel-roll',`${name(target)}，请掷决斗骰`,[{id:'roll',label:'掷决斗骰'}],{duelistId:duelist.id,targetId:target.id,firstFace:face});return;}
    delete duelist.flags.duelInProgress;const a=Number(ctx.firstFace),b=face;if(!Number.isInteger(a)||a<1||a>6)throw Error('决斗骰子存档无效');
    log(s,'duel-dice',`${name(duelist)} ${a} : ${b} ${name(target)}`,{source:duelist.id,targets:[duelist.id,target.id],faces:[a,b],cause:'duelist'});
    log(s,'duel',`${name(duelist)} ${a} : ${b} ${name(target)}`,{source:duelist.id,targets:[target.id],cause:'duelist'});
    usePower(s,duelist,[{kind:'move',racerId:a>=b?duelist.id:target.id,distance:2,cause:'duelist'}],'duelist');
  }
}
