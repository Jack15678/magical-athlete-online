import { CHARACTERS } from '../shared/characters.js';
import { TRACKS, RACE_POINTS } from '../shared/tracks.js';
import type { GameState, GameAction, GameMode, Player, Racer, Task, PendingChoice, RaceResult } from '../shared/types.js';

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
export function effectivePower(s: GameState, r: Racer): string {
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
function powers(s: GameState, power: string) { return order(s).filter(r => effectivePower(s,r) === power); }
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

export function createGame(players: Player[], seed: number, mode: GameMode = 'multiplayer'): GameState {
  return { mode, phase:'lobby', round:0, players:structuredClone(players), deck:[], discard:[], racers:[], turn:0, turnCount:0, queue:[], logs:[], results:[], rngState:(seed>>>0)||0x9e3779b9, randomLog:[], track:'mild', flags:{} };
}
function snake(s: GameState, first: string, twice = false) {
  const i=s.players.findIndex(p=>p.id===first); const ids=s.players.map((_,j)=>s.players[(i+j)%s.players.length]!.id);
  const once=[...ids,...ids.toReversed()]; return twice?[...once,...once]:once;
}
export function startGame(s: GameState): void {
  if (s.phase!=='lobby' || s.players.length<(s.mode==='practice'?1:2) || s.players.length>8 || (s.mode==='practice'&&s.players.length!==1)) throw Error('需要2～8名玩家才能开始；自己练习需要1名玩家');
  s.players.forEach(p=>{p.score=0;p.hand=[];p.used=[];p.selection=[];}); s.round=1;s.results=[];s.logs=[];s.racers=[];s.queue=[];s.pending=undefined;
  s.deck=shuffle(s,CHARACTERS.map(c=>c.id));s.discard=[];
  if(s.mode==='practice'){
    s.draft={market:CHARACTERS.map(c=>c.id),order:[s.players[0]!.id],cursor:0,batch:0};s.phase='draft';
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
  s.racers=s.players.flatMap(p=>p.selection.map((id,i)=>({id:`${p.id}:${s.round}:${i}`,playerId:p.id,characterId:id,position:0,tripped:false,finished:false,eliminated:false,flags:{}})));
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
  const placements=currentPlacements(s);const rank=forcedRank??placements.length+1;if(rank>2)return;
  r.finished=true;r.rank??=rank;r.position=TRACKS[s.track].finish;
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
function previewMove(s:GameState,r:Racer,distance:number,departures:string[],power=effectivePower(s,r)) {
  let count=Math.abs(distance);let end=r.position;let jumps=0;const direction=Math.sign(distance);
  while(count>0){end+=direction;if(end<0){end=0;break;}if(end>=TRACKS[s.track].finish){end+=direction*(count-1);break;}
    const occupied=active(s).some(x=>x.id!==r.id&&!departures.includes(x.id)&&x.position===end);
    if(power==='leaptoad'&&occupied){jumps++;continue;}count--;}
  const blocked=end>TRACKS[s.track].finish?powers(s,'stickler').filter(x=>x.id!==r.id):[];
  return{end:blocked.length?r.position:Math.max(0,end),jumps,blocked};
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
  const powerSnapshot=Object.fromEntries(active(s).map(r=>[r.id,effectivePower(s,r)]));
  const group=`g${(s.flags.motionSeq=Number(s.flags.motionSeq??0)+1)}`;
  const destinations:Record<string,number>={};const jumpCounts:Record<string,number>={};
  const extra:Work[]=[];const movingIds=moving.filter(p=>p.follow||p.distance!==0||t.kind==='warp').map(p=>p.racerId);
  for(const p of moving){
    const r=racer(s,p.racerId)!;if(p.follow)continue;
    let end=p.position??r.position;let jumps=0;
    if(t.kind!=='warp'){
      const projected=previewMove(s,r,p.distance??0,movingIds,powerSnapshot[r.id]);end=projected.end;jumps=projected.jumps;
      if(projected.blocked.length) {log(s,'cancel',`${name(r)}超过精确终点距离，整次移动取消`,{source:r.id,cause:'stickler'});extra.push(...projected.blocked.map(x=>({kind:'powerDone',racerId:x.id,power:'stickler'})));}
    }
    destinations[r.id]=Math.max(0,end);jumpCounts[r.id]=jumps;
  }
  for(const p of moving.filter(p=>p.follow))destinations[p.racerId]=destinations[p.follow!]??before[p.racerId]!;
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
    for(const banana of crossed.filter(x=>powerSnapshot[x.id]==='banana'))passEffects.push({kind:'ability',racerId:banana.id,power:'banana',effects:[{kind:'trip',racerId:r.id,source:banana.id}]});
    if(powerSnapshot[r.id]==='centaur'){
      const positions=[...new Set(crossed.map(x=>before[x.id]!))];for(const pos of positions)passEffects.push({kind:'ability',racerId:r.id,power:'centaur',effects:[{kind:'move',plans:crossed.filter(x=>before[x.id]===pos).map(x=>({racerId:x.id,distance:-2})),cause:'centaur'}]});
    }
    for(let i=0;i<(jumpCounts[r.id]??0);i++)extra.push({kind:'powerDone',racerId:r.id,power:'leaptoad'});
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
    const power=effectivePower(s,source);
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
  }
  const fishDone=moved.filter(p=>p.follow).map(p=>({kind:'powerDone',racerId:p.racerId,power:'suckerfish'}));
  push(s,...board,{kind:'refreshCopies'},...orderEffectTasks(s,[...passEffects,...stops]),...extra,...fishDone);
}
function orderEffectTasks(s:GameState,tasks:Work[]):Work[] { const ids=order(s).map(r=>r.id);return tasks.toSorted((a,b)=>ids.indexOf(String(a.racerId))-ids.indexOf(String(b.racerId))); }

function beforeRace(s:GameState,r:Racer) {
  const power=effectivePower(s,r);const prepared=(r.flags.preparedPowers??=[]) as string[];if(prepared.includes(power)||r.characterId==='copycat')return;prepared.push(power);
  if(power==='sisyphus'){points(s,r,4,'西西弗斯赛前奖励');push(s,{kind:'powerDone',racerId:r.id,power});}
  if(power==='egg'){
    if(s.deck.length<3){const unassigned=CHARACTERS.map(c=>c.id).filter(id=>!s.players.some(p=>p.hand.includes(id)||p.used.includes(id))&&!s.racers.some(x=>x.characterId===id));s.deck=shuffle(s,unassigned);log(s,'house-rule','蛋的未分配候选不足，按公开房规重新洗候选');}
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
  const power=effectivePower(s,r);r.flags.skipMain=power==='hare'&&!(s.mode==='practice'&&active(s).length===1)&&active(s).every(x=>x.id===r.id||x.position<r.position);r.flags.blimpBonus=r.position<TRACKS[s.track].secondCorner?3:-1;
  log(s,'turn',`轮到${owner(s,r).name}的${name(r)}`,{source:r.id});
  push(s,{kind:'turnStartPower',racerId:r.id},...powers(s,'duelist').map(d=>({kind:'duelCheck',racerId:d.id})),{kind:'mainReady',racerId:r.id},{kind:'endTurn',racerId:r.id});
}
function turnStartPower(s:GameState,r:Racer) {
  const power=effectivePower(s,r);
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
  if(r.tripped){r.tripped=false;log(s,'recover',`${name(r)}起身，代替主移动`,{source:r.id});return;}
  const power=effectivePower(s,r);
  if(power==='genius'&&!r.flags.geniusAsked){r.flags.geniusAsked=true;ask(s,r,'genius','预测主移动骰面',[...Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{id:'skip',label:'不预测'}],{},true);push(s,{kind:'mainReady',racerId:r.id});return;}
  if(power==='legs'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'legs','要直接以5作为主移动基础距离吗？',yesNo,{},true);return;}
  if(power==='flip-flop'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'flip-flop','交换位置代替主移动？',[...targetOptions(s,active(s).filter(x=>x.id!==r.id).map(x=>x.id)),{id:'skip',label:'正常掷骰'}],{},true);return;}
  s.flags.awaitRoll=true;
}
function rerollWindow(s:GameState,r:Racer,face:number) {
  const counts=(r.flags.rerolls??={}) as Record<string,number>;
  const sources=order(s).filter(x=>(effectivePower(s,x)==='dicemonger'&&!(counts[x.id]??0))||(x.id===r.id&&effectivePower(s,x)==='magician'&&(counts[x.id]??0)<2));
  if(sources.length){ask(s,r,'reroll',`掷出${face}，要重掷吗？`,[{id:'reroll',label:'重掷'},{id:'keep',label:'保留'}],{face,sources:sources.map(x=>x.id)},true);}
  else push(s,{kind:'finalRoll',racerId:r.id,face});
}
function finalRoll(s:GameState,r:Racer,face:number) {
  if(!live(r))return;
  s.lastRoll={racerId:r.id,face,distance:face};log(s,'roll',`${name(r)}最终骰面为${face}`,{source:r.id});
  const firstTasks:Work[]=[];
  if(r.flags.geniusGuess===face){r.flags.extraTurn=true;firstTasks.push({kind:'powerDone',racerId:r.id,power:'genius'});}
  if(face===1){for(const skipper of powers(s,'skipper'))firstTasks.push({kind:'ability',racerId:skipper.id,effects:[{kind:'setNext',racerId:skipper.id}]});}
  if(face===6){for(const lackey of powers(s,'lackey').filter(x=>x.id!==r.id))firstTasks.push({kind:'ability',racerId:lackey.id,effects:[{kind:'move',racerId:lackey.id,distance:2,cause:'lackey'}]});}
  const worms=face===1?powers(s,'inchworm').filter(x=>x.id!==r.id):[];
  if(worms.length){push(s,...firstTasks,...worms.map(x=>({kind:'ability',racerId:x.id,effects:[{kind:'move',racerId:x.id,distance:1,cause:'inchworm'}]})));return;}
  const power=effectivePower(s,r);
  if(power==='sisyphus'&&face===6){push(s,{kind:'ability',racerId:r.id,effects:[{kind:'warp',racerId:r.id,position:0,cause:power},{kind:'gain',racerId:r.id,amount:-1}]},...firstTasks);return;}
  if(power==='alchemist'&&face<=2){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power});return;}
  if(power==='rocket-scientist'){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power});return;}
  push(s,...firstTasks,{kind:'mainMove',racerId:r.id,base:face});
}
function mainMove(s:GameState,r:Racer,base:number) {
  if(!live(r))return;
  let distance=base;const effects:Work[]=[];const power=effectivePower(s,r);
  if(power==='blimp'){distance+=Number(r.flags.blimpBonus??(r.position<15?3:-1));effects.push({kind:'powerDone',racerId:r.id,power});}
  if(power==='hare'){distance+=2;effects.push({kind:'powerDone',racerId:r.id,power});}
  if(power==='party-animal'){const bonus=active(s).filter(x=>x.id!==r.id&&x.position===r.position).length;distance+=bonus;if(bonus)effects.push({kind:'powerDone',racerId:r.id,power});}
  for(const source of order(s)){
    const p=effectivePower(s,source);
    if(p==='coach'&&source.position===r.position){distance++;effects.push({kind:'powerDone',racerId:source.id,power:p});}
    // Product house rule for this modifier only: in two-player races, Slime
    // spares every racer owned by its controller. Other powers keep their own
    // printed "another athlete" targeting semantics.
    if(p==='gunk'&&source.id!==r.id&&!(s.players.length===2&&source.playerId===r.playerId)){distance--;effects.push({kind:'powerDone',racerId:source.id,power:p});}
  }
  if(s.lastRoll?.racerId===r.id)s.lastRoll.distance=distance;
  push(s,{kind:'move',racerId:r.id,distance,cause:'main'},...effects);
}
function endTurn(s:GameState,r:Racer) {
  s.flags.awaitRoll=false;r.flags.mainAsked=false;r.flags.geniusAsked=false;
  const tasks:Work[]=[];if(live(r)&&Math.abs(r.position-Number(r.flags.turnStart??r.position))<=1)for(const h of powers(s,'heckler'))tasks.push({kind:'ability',racerId:h.id,effects:[{kind:'move',racerId:h.id,distance:2,cause:'heckler'}]});
  push(s,...tasks,{kind:'advance',racerId:r.id});
}
function advance(s:GameState,r:Racer) {
  if(s.phase!=='race')return;
  const overrides=(s.flags.nextOverride??[]) as string[];let next=overrides.shift();s.flags.nextOverride=overrides;
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
  if(c.kind==='copycat'){r.flags.copyTarget=id;r.flags.copyPower=copyPower(s,r);return;}
  if(c.kind==='suckerfish'){
    const motionTask=ctx.motion as Work;
    if(id==='use'){motionTask.plans.push({racerId:r.id,follow:ctx.lead});log(s,'power',`${name(r)}选择随行`,{source:r.id,cause:'suckerfish'});}
    push(s,motionTask);return;
  }
  if(c.kind==='reroll'){
    if(id==='keep'){push(s,{kind:'finalRoll',racerId:r.id,face:ctx.face});return;}
    const source=racer(s,ctx.sources[0])!;const counts=r.flags.rerolls as Record<string,number>;counts[source.id]=(counts[source.id]??0)+1;
    const work:Work[]=[];if(effectivePower(s,source)==='dicemonger'&&source.id!==r.id)work.push({kind:'move',racerId:source.id,distance:1,cause:'dicemonger'});
    work.push({kind:'powerDone',racerId:source.id,power:effectivePower(s,source)},{kind:'rollDie',racerId:r.id});
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
    ask(s,r,'duel-roll',`${name(r)}，请掷决斗骰`,[{id:'roll',label:'掷决斗骰'}],{duelistId:r.id,targetId:target.id});return;
  }
  if(c.kind==='duel-roll'){
    const duelist=racer(s,String(ctx.duelistId)),target=racer(s,String(ctx.targetId));
    if(id!=='roll'||!duelist||!target||!live(duelist)||!live(target)||duelist.position!==target.position)throw Error('决斗双方已不在同格或不再参赛');
    const participant=ctx.firstFace===undefined?duelist:target;
    if(r.id!==participant.id||c.playerId!==participant.playerId)throw Error('决斗投掷控制权与当前参赛选手不一致');
    if(ctx.firstFace===undefined){
      const firstFace=random(s,`${name(duelist)}决斗`);
      // The first result is private continuation state, not a public log or
      // projected choice. Neither participant sees it before both have rolled.
      ask(s,target,'duel-roll',`${name(target)}，请掷决斗骰`,[{id:'roll',label:'掷决斗骰'}],{duelistId:duelist.id,targetId:target.id,firstFace});return;
    }
    const a=Number(ctx.firstFace);if(!Number.isInteger(a)||a<1||a>6)throw Error('决斗骰子存档无效');
    const b=random(s,`${name(target)}决斗`);
    log(s,'duel-dice',`${name(duelist)} ${a} : ${b} ${name(target)}`,{source:duelist.id,targets:[duelist.id,target.id],faces:[a,b],cause:'duelist'});
    log(s,'duel',`${name(duelist)} ${a} : ${b} ${name(target)}`,{source:duelist.id,targets:[target.id],cause:'duelist'});
    usePower(s,duelist,[{kind:'move',racerId:a>=b?duelist.id:target.id,distance:2,cause:'duelist'}]);return;
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
    case 'beforeRace':if(r)beforeRace(s,r);break;
    case 'beginTurn':if(r)beginTurn(s,r);break;
    case 'turnStartPower':if(r&&live(r))turnStartPower(s,r);break;
    case 'mainReady':if(r)mainReady(s,r);break;
    case 'endTurn':if(r)endTurn(s,r);break;
    case 'advance':if(r)advance(s,r);break;
    case 'rollDie':if(r&&live(r)){const face=random(s,`${name(r)}主移动`);s.lastRoll={racerId:r.id,face,distance:face};log(s,'die',`${name(r)}掷出${face}`,{source:r.id});rerollWindow(s,r,face);}break;
    case 'finalRoll':if(r)finalRoll(s,r,t.face);break;
    case 'mainMove':if(r)mainMove(s,r,t.base);break;
    case 'baseChoice':if(r)ask(s,r,t.power,t.power==='alchemist'?'要改为基础移动4格吗？':'要加倍骰面并在移动后绊倒吗？',yesNo,{face:t.face},true);break;
    case 'ability':if(r&&live(r))usePower(s,r,t.effects,t.power??effectivePower(s,r));break;
    case 'gain':if(r)points(s,r,t.amount,name(r));break;
    case 'setNext':((s.flags.nextOverride??=[]) as string[]).push(t.racerId);break;
    case 'trip':if(r&&live(r)){r.tripped=true;log(s,'trip',`${name(r)}绊倒`,{source:t.source,targets:[r.id]});}break;
    case 'eliminate':eliminate(s,t.racerId,t.source);break;
    case 'move':case 'warp':motion(s,t);break;
    case 'powerDone':
      // Every individual power activation generates its own response, including
      // separate Leaptoad skipped spaces and distinct passive modifier uses.
      for(const sc of powers(s,'scoocher').filter(x=>x.id!==t.racerId).toReversed())push(s,{kind:'ability',racerId:sc.id,effects:[{kind:'move',racerId:sc.id,distance:1,cause:'scoocher'}]});
      break;
    case 'board':if(r&&live(r)){
      const special=TRACKS[s.track].specials[r.position];if(!special)break;
      if(special.kind==='star')points(s,r,1,'赛道星格');
      if(special.kind==='trip')push(s,{kind:'trip',racerId:r.id,source:'track'});
      if(special.kind==='arrow')push(s,{kind:'move',racerId:r.id,distance:special.move,cause:'track-arrow'});
    }break;
    case 'duelCheck':if(r&&live(r)&&effectivePower(s,r)==='duelist'){
      const targets=active(s).filter(x=>x.id!==r.id&&x.position===r.position);if(targets.length)ask(s,r,'duelist','要向同格角色发起决斗吗？',[...targetOptions(s,targets.map(x=>x.id)),{id:'skip',label:'不决斗'}],{},true);
    }break;
    case 'refreshCopies':for(const copy of active(s).filter(x=>String(x.flags.power??x.characterId)==='copycat')){
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
  let budget=0;const seen=new Map<string,Task[]>((s.flags.resolutionSeen??[]) as [string,Task[]][]);
  while(s.phase==='race'&&!s.pending&&s.queue.length){
    if(++budget>3000){s.flags.continuation=true;s.flags.resolutionSeen=[...seen];return;}
    const signature=JSON.stringify({racers:s.racers.map(r=>({id:r.id,p:r.position,t:r.tripped,f:r.finished,e:r.eliminated,flags:r.flags})),scores:s.players.map(p=>p.score),next:s.queue[0],rng:s.rngState});
    const earlier=seen.get(signature);
    // A nested repeated branch grows a continuation stack while returning the
    // complete board and next effect to the same state. Static repeated effects
    // (e.g. two skipped spaces) shrink the queue and are not called loops.
    if(earlier&&s.queue.length>earlier.length){
      const tail=earlier.slice(1);const suffix=s.queue.slice(s.queue.length-tail.length);
      if(JSON.stringify(suffix)===JSON.stringify(tail)){
        log(s,'loop','相同位置、状态和待处理效果重现，完成一轮后停止重复分支');s.queue=structuredClone(tail);seen.clear();continue;
      }
    }
    if(!earlier)seen.set(signature,structuredClone(s.queue));
    task(s,s.queue.shift()! as Work);
    if(s.flags.awaitRoll)break;
  }
  s.flags.continuation=false;
  // A choice suspends the same causal branch. In particular, declining a Fish
  // prompt must not erase the loop history for a mandatory Baby/Scoocher loop.
  if(s.pending)s.flags.resolutionSeen=[...seen];
  else delete s.flags.resolutionSeen;
}
export function applyGameAction(s:GameState,playerId:string,action:GameAction):void {
  const p=s.players.find(x=>x.id===playerId);if(!p)throw Error('你不在本局参赛席位中');
  if(action.type==='start'){startGame(s);return;}
  if(action.type==='practice-team'){
    if(s.mode!=='practice'||s.phase!=='draft'||s.round!==1||s.players.length!==1)throw Error('现在不能选择练习阵容');
    if(action.characterIds.length!==4||new Set(action.characterIds).size!==4||action.characterIds.some(id=>!character(id)))throw Error('请从完整牌池选择4张不同角色牌');
    p.hand=[...action.characterIds];
    // Earlier practice saves can be midway through a two-batch draft. Replace
    // that incomplete hand atomically and return every unchosen printed card
    // to the candidate pool, preserving the stored shuffle and random history.
    const remaining=CHARACTERS.map(c=>c.id).filter(id=>!p.hand.includes(id));
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
  if(s.pending){const c=s.pending;if(c.kind==='duel-roll'&&!s.players.find(p=>p.id===c.playerId)?.isAI)return;const opt=c.options.find(o=>o.id==='skip')??c.options.find(o=>o.id==='keep')??c.options[0];if(opt)return{playerId:c.playerId,action:{type:'choose',choiceId:c.id,optionId:opt.id}};}
  const immediate=systemAction(s);if(immediate)return immediate;
  const r=racer(s,s.currentRacerId!);if(r&&s.flags.awaitRoll)return{playerId:r.playerId,action:{type:'roll'}};
  return;
}

/** Turn setup is an authority-owned transition, independent of the die button. */
export function systemAction(s:GameState):{playerId:string;action:GameAction}|undefined {
  if(s.phase==='race'&&!s.pending&&(s.flags.continuation||s.flags.needsBegin))return{playerId:s.players[0]!.id,action:{type:'next'}};
}
