import { installLeaf } from './leaf-expansion.js';
import { enabledCharacterIds } from '../shared/room-config.js';
import { CHARACTERS, characterPool } from '../shared/characters.js';
import { TRACKS, RACE_POINTS } from '../shared/tracks.js';
import { createRandomStream, nextRandomWord, secureRandomSeed, uniformInteger, type RandomSeed } from '../shared/random.js';
import type { GameState, GameAction, GameMode, CharacterPool, Player, Racer, Task, PendingChoice, RaceResult } from '../shared/types.js';

// Every continuation is JSON data. No callback, socket, timer or future die lives
// in the rules state, so the exact pending interaction survives a server restart.
type Work = Task & Record<string, any>;
const character = (id: string) => CHARACTERS.find(c => c.id === id);
const name = (r: Racer) => String(r.flags.extraName ?? character(r.characterId)?.nameZh ?? r.characterId);
const live = (r: Racer) => !r.finished && !r.eliminated;
const racer = (s: GameState, id: string) => s.racers.find(r => r.id === id);
const active = (s: GameState) => s.racers.filter(live);
const owner = (s: GameState, r: Racer) => s.players.find(p => p.id === r.playerId)!;
const push = (s: GameState, ...tasks: Work[]) => s.queue.unshift(...tasks);
function log(s: GameState, type: string, text: string, detail: Record<string, any> = {}) {
  s.logs.push({ id: (s.logs.at(-1)?.id ?? 0) + 1, type, text, ...detail });
}
function random(s: GameState, reason: string, max = 6, stunnerOverridesRaw = false): number {
  const trace=s.flags.forcedCycleTrace as ForcedCycleTrace|undefined;
  if(!stunnerOverridesRaw||trace&&trace.expectedRandom!==exactRandomState(s))breakForcedCycle(s);
  const forced = s.flags.testDice as number[] | undefined;
  let value: number;
  if (forced?.length && max === 6) value = forced.shift()!;
  else if(s.randomStream)value=uniformInteger(max,()=>s.rngState=nextRandomWord(s.randomStream!));
  else { let x = s.rngState >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rngState = x >>> 0; value = Math.floor((s.rngState / 4294967296) * max) + 1; }
  s.randomLog.push({ index: s.randomLog.length, reason, value });
  if(stunnerOverridesRaw){const current=s.flags.forcedCycleTrace as ForcedCycleTrace|undefined;if(current?.version===2){current.stunnerDraws++;current.expectedRandom=exactRandomState(s);}}
  return value;
}
function shuffle(s: GameState, input: string[]) {
  const cards = [...input];
  for (let i = cards.length - 1; i > 0; i--) { const j = random(s, '洗牌', i + 1) - 1; [cards[i], cards[j]] = [cards[j]!, cards[i]!]; }
  return cards;
}
/** All ability draws use the same physical card zones. A private film hand,
 * current display, draft/selection card or reserved reference is never another
 * draw source, even in a recovered state with duplicated zone entries. */
function drawUnchosen(s:GameState,count:number):string[] {
  const enabled=new Set(enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));
  const held=new Set(s.players.flatMap(p=>[...p.hand,...p.used,...p.selection]));
  for(const r of s.racers){
    held.add(r.characterId);
    for(const id of ((r.flags.secretLeafHand??[]) as string[]))held.add(id);
    const displays=Array.isArray(r.flags.leafDisplayedCards)?r.flags.leafDisplayedCards as BorrowedPower[]:typeof r.flags.leafDisplayedCard==='string'?[{power:r.flags.leafDisplayedCard,source:''}]:[];
    for(const item of displays)held.add(item.power);
  }
  for(const id of s.draft?.market??[])held.add(id);
  if(s.pending?.kind==='egg')for(const id of ((s.pending.context as {cards?:string[]}).cards??[]))held.add(id);
  const cards:string[]=[],seen=new Set<string>();
  s.deck=s.deck.filter(id=>enabled.has(id)&&!held.has(id)&&!seen.has(id)&&Boolean(seen.add(id)));
  const inDeck=new Set(s.deck),discardSeen=new Set<string>();
  s.discard=s.discard.filter(id=>enabled.has(id)&&!held.has(id)&&!inDeck.has(id)&&!discardSeen.has(id)&&Boolean(discardSeen.add(id)));
  for(let i=0;i<count;i++){
    if(!s.deck.length&&s.discard.length){s.deck=shuffle(s,s.discard);s.discard=[];log(s,'shuffle','未选角色牌堆耗尽，洗公共弃牌堆。',{cause:'ability-deck'});}
    const id=s.deck.shift();if(!id)break;cards.push(id);
  }
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
/** Left means the next racer card in the race's fixed clockwise order. It is
 * independent of screen layout, track position and the card's current owner. */
export function stepdadTarget(s:GameState,r:Racer):Racer|undefined {
  const fixed=baseOrder(s),index=fixed.indexOf(r.id);
  if(index<0||fixed.length<2)return;
  const target=racer(s,fixed[(index+1)%fixed.length]!);
  return target&&target.id!==r.id?target:undefined;
}
function printedPower(s: GameState, r: Racer): string {
  const base = String(r.flags.power ?? r.flags.copiedPower ?? r.characterId);
  if (base !== 'copycat') return base;
  if(typeof r.flags.copyPower==='string')return r.flags.copyPower;
  return copyPower(s,r);
}
function copyPower(s:GameState,r:Racer):string {
  const model=copyModel(s,r);
  if(model)return model.characterId;
  // A tied leader is a real controller choice. Until it is confirmed, keep
  // the last confirmed text (or Copycat's own text on its first choice).
  return copyCandidates(s,r).length>1&&typeof r.flags.copyPower==='string'?r.flags.copyPower:'copycat';
}
function copyCandidates(s:GameState,r:Racer):Racer[] {
  const competitors = active(s); if (!competitors.length) return [];
  const lead = Math.max(...competitors.map(x => x.position));
  return competitors.filter(x => x.position === lead && x.id !== r.id && x.characterId !== 'copycat');
}
function copyModel(s:GameState,r:Racer):Racer|undefined {
  const leaders=copyCandidates(s,r);
  // Copycat copies printed text. In particular, Twin's selected power is not
  // recursively inherited, and a passed before-race window never reopens.
  return leaders.find(x=>x.id===r.flags.copyTarget)??(leaders.length===1?leaders[0]:undefined);
}
const dispatchPowers = new WeakMap<Racer,string>();
type BorrowedPower={power:string;source:string};
type PowerSource={sourceCardId?:string;sourceRacerId?:string;via?:string};
/** Old v3 saves stored the temporary card in acquiredPowers as well. Read that
 * representation without confusing it with a later, permanent acquisition. */
function permanentPowers(r:Racer):string[] {
  return [...new Set(((r.flags.acquiredPowers??[]) as string[]).filter(power=>
    Array.isArray(r.flags.leafBorrowedPowers)||r.flags.leafBorrowAlreadyPresent||power!==r.flags.leafBorrowedPower))];
}
function borrowedPowers(r:Racer):BorrowedPower[] {
  if(Array.isArray(r.flags.leafBorrowedPowers))return r.flags.leafBorrowedPowers as BorrowedPower[];
  const permanent=[String(r.flags.power??r.flags.copiedPower??r.characterId),...permanentPowers(r)];
  const source=typeof r.flags.leafBorrowSource==='string'?r.flags.leafBorrowSource:permanent.includes('leaf-thespian')?'leaf-thespian':permanent.includes('leaf-filmmaker')?'leaf-filmmaker':'';
  return typeof r.flags.leafBorrowedPower==='string'?[{power:r.flags.leafBorrowedPower,source}]:[];
}
function powerTokens(r:Racer):string[] { return [String(r.flags.power??r.flags.copiedPower??r.characterId),...permanentPowers(r),...borrowedPowers(r).map(item=>item.power)]; }
function ownedPowers(s:GameState,r:Racer):string[] { return [...new Set(powerTokens(r).map(power=>power==='copycat'?String(r.flags.copyPower??copyPower(s,r)):power))]; }
function rawPowers(s:GameState,r:Racer):string[] { return ownedPowers(s,r).filter(power=>!executionBlocks.get(s)?.has(`${r.id}:${power}`)); }
function preparePowerGrant(r:Racer,power:string) {
  // A cache belongs to a continuously owned Copycat layer. An expired borrow
  // cannot choose a target on behalf of a newly acquired, independent layer.
  if(power==='copycat'&&!powerTokens(r).includes('copycat')){delete r.flags.copyPower;delete r.flags.copyTarget;delete r.flags.lastCopyPower;}
}
function acquirePower(r:Racer,power:string,source:PowerSource={}) {
  preparePowerGrant(r,power);
  r.flags.acquiredPowers=[...new Set([...permanentPowers(r),power])];
  // Preserve provenance even when the same text is also temporarily borrowed.
  const sources=(r.flags.acquiredPowerSources??={}) as Record<string,PowerSource|PowerSource[]>;
  const previous=sources[power],grants=Array.isArray(previous)?previous:previous?[previous]:[];
  if(!grants.some(grant=>grant.sourceCardId===source.sourceCardId&&grant.sourceRacerId===source.sourceRacerId&&grant.via===source.via))grants.push(source);
  sources[power]=grants;
  if(r.flags.leafBorrowedPower===power)r.flags.leafBorrowAlreadyPresent=true;
}
const executionBlocks = new WeakMap<GameState,Set<string>>();
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
export function abilityState(s:GameState,r:Racer) {
  const target=ownedPowers(s,r).includes('stepdad')?stepdadTarget(s,r):undefined;
  type Entry={id:string;origin:'printed'|'copy'|'draw'|'acquired'|'temporary';sourceCardId?:string;sourceRacerId?:string;via?:string;duration:'race'|'next-turn'|'source-change'};
  const entries:Entry[]=[],base=String(r.flags.power??r.flags.copiedPower??r.characterId);
  const add=(token:string,entry:Omit<Entry,'id'>)=>entries.push({id:token==='copycat'?String(r.flags.copyPower??copyPower(s,r)):token,...entry,...(token==='copycat'?{origin:['temporary','acquired'].includes(entry.origin)?entry.origin:'copy' as const,sourceCardId:'copycat',...(copyModel(s,r)?{sourceRacerId:copyModel(s,r)!.id}:{}),duration:['temporary','acquired'].includes(entry.origin)?entry.duration:'source-change' as const,...(!entry.via?{via:'copycat'}:{})}:{})});
  add(base,{origin:base===r.characterId?'printed':r.flags.powerVia==='egg'||!r.flags.powerVia&&r.flags.eggCardId?'draw':'copy',duration:'race',...(typeof r.flags.powerVia==='string'?{via:r.flags.powerVia}:{}),...(base===r.characterId?{}:{sourceCardId:String(r.flags.powerSourceCard??r.flags.twinCardId??r.flags.eggCardId??base),...(typeof r.flags.copiedFrom==='string'?{sourceRacerId:r.flags.copiedFrom}:{})})});
  const sources=(r.flags.acquiredPowerSources??{}) as Record<string,PowerSource|PowerSource[]>;
  for(const power of permanentPowers(r))for(const grant of Array.isArray(sources[power])?sources[power] as PowerSource[]:[sources[power]??{}])add(power,{origin:'acquired',duration:'race',...grant});
  for(const item of borrowedPowers(r))add(item.power,{origin:'temporary',duration:'next-turn',sourceCardId:item.power,...(character(item.source)?{via:item.source}:{})});
  return { powers:effectivePowers(s,r),ownedPowers:ownedPowers(s,r),entries,disabledBy:disabledBy(s,r),copiedFrom:r.flags.copiedFrom,acquired:permanentPowers(r),krakenRemaining:r.flags.krakenUsed?0:1,form:r.flags.form??'normal',mount:r.flags.hogOwnerId,stepTargetId:target?.id,stepTargetControllerId:target?.playerId };
}
function hasPower(s:GameState,r:Racer,power:string) { return effectivePowers(s,r).includes(power); }
function powers(s: GameState, power: string) { return order(s).filter(r => hasPower(s,r,power)); }
function dispatch(s:GameState,r:Racer,power:string,run:()=>void){ if(!hasPower(s,r,power))return;dispatchPowers.set(r,power);try{run();}finally{dispatchPowers.delete(r);} }

function points(s: GameState, r: Racer, delta: number, cause: string) {
  const p = owner(s,r); const previous = p.score; p.score = Math.max(0,p.score+delta);if(p.score>previous)fanTrackIncome(s,r,p.score-previous);
  log(s, 'score', `${p.name} ${p.score >= previous ? '+' : ''}${p.score-previous}分（${cause}）`, { source:r.id });
}
function ask(s: GameState, r: Racer, kind: string, title: string, options: {id:string;label:string}[], context: Record<string,any>, optional = false) {
  if (!options.length) return;
  // A person can change this path. Choosing the same option again is never
  // evidence of a forced cycle, including an optional single-option prompt.
  if (optional || options.length > 1) breakForcedCycle(s);
  const seq = Number(s.flags.choiceSeq ?? 0)+1; s.flags.choiceSeq = seq;
  s.pending = { id:`c${seq}`, playerId:r.playerId, racerId:r.id, title, kind, options, optional, context };
}
function breakForcedCycle(s:GameState) { delete s.flags.forcedCycleTrace; }
interface ForcedCycleTrace {version:2;stunnerDraws:number;expectedRandom:string;states:{rules:string;random:string;stunnerDraws:number}[]}
function exactRandomState(s:GameState) { return JSON.stringify({rngState:s.rngState,randomStream:s.randomStream}); }
/** Compare rules states, not just positions. The only omitted fields are logs,
 * display IDs, resolver scratch space (empty at this boundary), and counters
 * that no rule reads. turnsTaken is read only as ===1 by Mastermind, so all
 * completed counts >=2 are equivalent. New counter-dependent rules must also
 * update this normalization. No hash or action-count threshold decides a hold. */
function forcedCycle(s:GameState,r:Racer):boolean {
  if(s.queue.length||s.pending||s.flags.continuation||s.flags.resolutionSeen||s.flags.resolutionSuppressed)return false;
  const {logs: _logs,randomLog: _randomLog,turnCount: _turnCount,...state}=s;
  const flags={...s.flags};
  for(const key of ['forcedCycleTrace','choiceSeq','motionSeq','loopSeen','resolutionSeen','resolutionSeenScores','resolutionSuppressed','resolutionDiagnostic'])delete flags[key];
  const rulesState:Record<string,unknown>={...state,beginRacerId:r.id,flags,racers:s.racers.map(item=>{
    const racerFlags=semanticRacerFlags(s,item);if(!powers(s,'leaf-triangle-man').length)delete racerFlags.secretLeafLastRaw;
    if(typeof racerFlags.turnsTaken==='number'&&Number.isInteger(racerFlags.turnsTaken)&&racerFlags.turnsTaken>=2)racerFlags.turnsTaken=2;
    return {...item,flags:racerFlags};
  })};
  // Keep key/nonce/algorithm and unknown stream fields. Only the audit cursor
  // and cached words may differ when every draw was unconditionally replaced
  // by Stunner. Raw faces currently have no rule observers, only log entries.
  delete rulesState.rngState;
  if(s.randomStream){const stream={...s.randomStream} as Record<string,unknown>;for(const key of ['counter','offset','words'])delete stream[key];rulesState.randomStream=stream;}
  const signature=JSON.stringify(rulesState,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
  const randomState=exactRandomState(s),stored=s.flags.forcedCycleTrace as ForcedCycleTrace|undefined;
  const prior=stored?.version===2&&stored.expectedRandom===randomState?stored:undefined;
  const states=prior?.states??[],stunnerDraws=prior?.stunnerDraws??0;
  if(states.some(entry=>entry.rules===signature&&(entry.random===randomState||entry.stunnerDraws!==stunnerDraws))){
    // v2's historical cross-turn draw remains in rules-v2.ts. The v3
    // contract never invents a race result when stopping a repeated branch.
    s.phase='paused';s.flags.continuation=true;
    s.flags.ruleHold={kind:'forced-cycle',message:'检测到完整规则状态重复的跨回合强制循环，已停止重复分支并暂停本房间；保留已完成的一遍、现有名次积分和待处理状态，未补判名次或宣布胜者。'};
    push(s,{kind:'beginTurn',racerId:r.id});
    log(s,'cycle-paused',String((s.flags.ruleHold as {message:string}).message),{source:r.id,cause:'forced-cycle'});
    return true;
  }
  // This is a memory bound only: forgetting an old state can miss a long cycle
  // but can never manufacture a repeat or pause after an arbitrary turn count.
  s.flags.forcedCycleTrace={version:2,stunnerDraws,expectedRandom:randomState,states:[...states.slice(-63),{rules:signature,random:randomState,stunnerDraws}]};
  return false;
}
const yesNo = [{id:'use',label:'使用技能'}, {id:'skip',label:'不使用'}];
function targetOptions(s: GameState, ids: string[]) { return ids.map(id => ({id,label: name(racer(s,id)!)})); }
function usePower(s: GameState, r: Racer, tasks: Work[], power = effectivePower(s,r), fallback:Work[] = []) {
  push(s,{kind:'activate',racerId:r.id,power,effects:tasks,fallback});
}

export function createGame(players: Player[], seed: RandomSeed = secureRandomSeed(), mode: GameMode = 'multiplayer', pool: CharacterPool = 'original'): GameState {
  return { mode, characterPool:pool, rulesVersion:'cmyk-base-aug2026-fan-v3', phase:'lobby', round:0, players:structuredClone(players), deck:[], discard:[], racers:[], turn:0, turnCount:0, queue:[], logs:[], results:[], rngState:(typeof seed==='number'?seed>>>0:0)||0x9e3779b9,...(typeof seed==='number'?{}:{randomStream:createRandomStream(seed)}), randomLog:[], track:'mild', flags:{} };
}
function snake(s: GameState, first: string, twice = false) {
  const i=s.players.findIndex(p=>p.id===first); const ids=s.players.map((_,j)=>s.players[(i+j)%s.players.length]!.id);
  const once=[...ids,...ids.toReversed()]; return twice?[...once,...once]:once;
}
export function startGame(s: GameState): void {
  if (s.phase!=='lobby' || s.players.length<(s.mode==='practice'?1:2) || s.players.length>8 || (s.mode==='practice'&&s.players.length!==1)) throw Error('需要2～8名玩家才能开始；自己练习需要1名玩家');
  s.players.forEach(p=>{p.score=0;p.hand=[];p.used=[];p.selection=[];}); s.round=1;s.results=[];s.logs=[];s.racers=[];s.queue=[];s.pending=undefined;
  s.rulesVersion??='cmyk-base-aug2026-sw-transcript-v1';s.deck=shuffle(s,enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));s.discard=[];
  if(s.mode==='practice'){
    s.draft={market:enabledCharacterIds(s.config,s.characterPool,true),order:[s.players[0]!.id],cursor:0,batch:0};s.phase='draft';
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
  breakForcedCycle(s);
  if(s.round===1) s.flags.firstPlayer=rollOff(s,s.players.map(p=>p.id));
  delete s.flags.fanIncome;delete s.flags.fanSecrets;delete s.flags.honeyPot;delete s.flags.fanPreviousDistance;
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
  if(forcedRank===undefined&&currentPlacements(s).length===0){const doubles=powers(s,'doppelgangster').filter(x=>!x.flags.doppelUsed);if(doubles.length){const inherited=[...effectivePowers(s,r)];for(const d of doubles){d.flags.doppelUsed=true;for(const power of inherited)acquirePower(d,power,{sourceRacerId:r.id,via:'doppelgangster'});log(s,'copy',`${name(d)}淘汰首位冲线者并获得其当前有效能力（不继承资源、次数或私人手牌）`,{source:d.id,targets:[r.id],cause:'doppelgangster',grantedPowerIds:inherited,grantDuration:'race'});}eliminate(s,r.id,doubles[0]!.id);return;}}
  const placements=currentPlacements(s);const rank=forcedRank??placements.length+1;if(rank>2)return;
  const championPower=printedPower(s,r);
  r.finished=true;r.rank??=rank;r.position=hasPower(s,r,em('doc-paradox'))?0:TRACKS[s.track].finish;
  for(const step of powers(s,'stepdad'))if(stepdadTarget(s,step)?.id===r.id&&rank===1)points(s,step,3,`继父：${name(r)}获得冠军`);
  const value=r.flags.gary?0:RACE_POINTS[Math.max(0,s.round-1)]?.[rank-1]??0;owner(s,r).score+=value;fanTrackIncome(s,r,value);
  placements.push({racerId:r.id,playerId:r.playerId,characterId:r.characterId,rank,points:value});
  if(rank===1){
    const history=(s.flags.historyPowers??={}) as Record<string,string>;history[r.characterId]=championPower;
    ((s.flags.championPowers??=[]) as {round:number;racerId:string;characterId:string;power:string}[]).push({round:s.round,racerId:r.id,characterId:r.characterId,power:championPower});
  }
  log(s,'finish',`${owner(s,r).name}的${name(r)}获得第${rank}名，+${value}分`,{source:r.id});
  if(rank===1){
    const copycatMind=(x:Racer)=>powerTokens(x).includes('copycat')&&!powerTokens(x).includes('mastermind');
    const minds=order(s,s.racers.filter(x=>!x.eliminated&&String(x.flags.prediction??'')===r.id&&hasPower(s,x,'mastermind'))).sort((a,b)=>Number(copycatMind(a))-Number(copycatMind(b)));
    if(minds.length){finish(s,minds[0]!,2);return;}
    const remaining=active(s);
    if(remaining.length===1){finish(s,remaining[0]!,2);return;}
  }
  if(rank===2)endRace(s);
}
function endRace(s:GameState,cycleDraw=false) {
  if(s.phase!=='race')return;
  leafRules.raceEnd(s,cycleDraw);fanRaceEnd(s,cycleDraw);
  if(!cycleDraw)for(const g of powers(s,'gloth'))if(g.position<=TRACKS[s.track].secondCorner)points(s,g,3,'葛洛斯未超过第二弯道');
  for(const r of s.racers)if(hasPower(s,r,'re-runner')||r.characterId==='re-runner'){const entries=(s.flags.reRunners??=[]) as {playerId:string;characterId:string}[];const id=r.playerId;if(!entries.some(x=>x.playerId===id&&x.characterId===r.characterId))entries.push({playerId:id,characterId:r.characterId});}
  s.results.push({round:s.round,placements:structuredClone(currentPlacements(s)),...(cycleDraw?{drawReason:'forced-cycle' as const}:{})});
  if(s.players.length===2){
    const scores=s.flags.roundStartScores as Record<string,number>??{};const min=Math.min(...s.players.map(p=>p.score-(scores[p.id]??0)));const tied=s.players.filter(p=>p.score-(scores[p.id]??0)===min);
    s.flags.firstPlayer=tied.length===1?tied[0]!.id:rollOff(s,tied.map(p=>p.id));
  }else{
    const eliminated=(s.flags.eliminations??[]) as string[];const candidates=eliminated.length?[racer(s,eliminated[0]!)!]:s.racers.filter(r=>!r.finished&&!r.eliminated);
    const back=candidates.length?Math.min(...candidates.map(r=>r.position)):0;const tied=[...new Set(candidates.filter(r=>r.position===back).map(r=>r.playerId))];
    s.flags.firstPlayer=tied.length===1?tied[0]:tied.length?rollOff(s,tied):s.players[0]!.id;
  }
  leafRules.releaseCards(s);s.phase=s.round>=4?'finished':'results';s.queue=[];s.pending=undefined;s.flags.awaitRoll=false;
  s.flags.needsBegin=false;breakForcedCycle(s);
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
  if(distance!==0){const glue=powers(s,em('gluebert')).filter(x=>x.id!==r.id&&!departures.includes(x.id)&&(r.position-x.position)*(end-x.position)<0);if(glue.length)end-=direction*Math.min(glue.length,Math.abs(end-r.position));}
  const blocked=end>TRACKS[s.track].finish?powers(s,'stickler').filter(x=>x.id!==r.id):[];
  return{end:blocked.length?r.position:Math.max(0,end),jumps,blocked};
}
function followingPreview(s:GameState,lead:Racer,distance:number,departures:string[],cause:unknown) {
  const preview=previewMove(s,lead,distance,departures,hasPower(s,lead,'leaptoad')?'leaptoad':effectivePower(s,lead));
  const from=lead.position,to=Math.min(TRACKS[s.track].finish,preview.end),delta=to-from;
  const moveType=cause==='main'?'主要移动':cause==='track-arrow'?'赛道箭头额外移动':`${character(String(cause))?.nameZh??'技能'}额外移动`;
  return {...preview,from,to,delta,moveType};
}
function motion(s:GameState,t:Work) {
  const plans: {racerId:string;distance?:number;position?:number;follow?:string}[]=t.plans??[{racerId:t.racerId,distance:t.distance,position:t.position}];
  const moving=plans.filter(p=>{const r=racer(s,p.racerId);return r&&live(r);});
  if(!moving.length)return;
  if(t.kind!=='warp'&&!t.fishChecked){
    const fish=order(s).filter(r=>hasPower(s,r,'suckerfish')&&!moving.some(p=>p.racerId===r.id)&&!t.fishAsked?.includes(r.id));
    const departures=moving.filter(p=>p.distance!==0).map(p=>p.racerId);
    for(const f of fish){const lead=moving.find(p=>!p.follow&&racer(s,p.racerId)!.position===f.position&&followingPreview(s,racer(s,p.racerId)!,p.distance??0,departures,t.cause).to!==f.position);if(lead){
      const leader=racer(s,lead.racerId)!,preview=followingPreview(s,leader,lead.distance??0,departures,t.cause);
      const progress=`${preview.delta>0?'前进':'后退'}${Math.abs(preview.delta)}格`;
      const jumps=preview.jumps?`；移动${Math.abs(lead.distance??0)}步并跳过${preview.jumps}个占用格`:'';
      const next={...t,plans:moving,fishAsked:[...(t.fishAsked??[]),f.id]};
      ask(s,f,'suckerfish',`${name(f)}要跟随${owner(s,leader).name}的${name(leader)}吗？${preview.moveType}：第${preview.from}格 → 第${preview.to}格（${progress}${jumps}）`,yesNo,{motion:next,lead:lead.racerId},true);return;
    }}
  }
  const before=Object.fromEntries(active(s).map(r=>[r.id,r.position]));
  const powerSnapshot=Object.fromEntries(active(s).map(r=>[r.id,effectivePowers(s,r)]));
  const group=`g${(s.flags.motionSeq=Number(s.flags.motionSeq??0)+1)}`;
  const destinations:Record<string,number>={};const jumpCounts:Record<string,number>={};
  const extra:Work[]=[];const movingIds=moving.filter(p=>p.follow||p.distance!==0||t.kind==='warp').map(p=>p.racerId);
  for(const p of moving){
    const r=racer(s,p.racerId)!;if(p.follow)continue;
    let end=p.position??r.position;let jumps=0;
    if(t.kind!=='warp'){
      const projected=previewMove(s,r,p.distance??0,movingIds,powerSnapshot[r.id]?.includes('leaptoad')?'leaptoad':powerSnapshot[r.id]?.[0]);end=projected.end;jumps=projected.jumps;
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
  for(const p of moved){const r=racer(s,p.racerId)!;if((hasPower(s,r,em('doc-paradox'))?r.position<=0:r.position>=TRACKS[s.track].finish)){finish(s,r);if(s.phase!=='race')return;}}
  const passEffects:Work[]=[];
  if(t.kind!=='warp')for(const p of moved){const r=racer(s,p.racerId)!;const start=before[r.id]!;const end=destinations[r.id]!;
    const crossed=active(s).filter(x=>!movingIds.includes(x.id)&&(start-before[x.id]!)*(end-before[x.id]!)<0).sort((a,b)=>(before[a.id]!-before[b.id]!)*Math.sign(end-start));
    passEffects.push(...fanPassTasks(s,r,crossed),...leafRules.passTasks(s,r,crossed));
    for(const banana of crossed.filter(x=>powerSnapshot[x.id]?.includes('banana')))passEffects.push({kind:'ability',racerId:banana.id,power:'banana',effects:[{kind:'trip',racerId:r.id,source:banana.id}]});
    if(powerSnapshot[r.id]?.includes('centaur')){
      const positions=[...new Set(crossed.map(x=>before[x.id]!))];for(const pos of positions)passEffects.push({kind:'ability',racerId:r.id,power:'centaur',effects:[{kind:'move',plans:crossed.filter(x=>before[x.id]===pos).map(x=>({racerId:x.id,distance:-2})),cause:'centaur'}]});
    }
    for(const penguin of crossed.filter(x=>powerSnapshot[x.id]?.includes('penguin')))passEffects.push({kind:'ability',racerId:penguin.id,power:'penguin',effects:[{kind:'trip',racerId:penguin.id,source:r.id}]});
    if(powerSnapshot[r.id]?.includes('bite-mark')&&r.flags.form==='were-mouth')for(const target of crossed)passEffects.push({kind:'ability',racerId:r.id,power:'bite-mark',effects:[{kind:'eliminate',racerId:target.id,source:r.id}]});
    if(r.flags.magicPassTrip)for(const target of crossed)passEffects.push({kind:'ability',racerId:r.id,power:'magical-athlete',effects:[{kind:'trip',racerId:target.id,source:r.id}]});
    if(crossed.length&&powerSnapshot[r.id]?.includes('streaker'))passEffects.push({kind:'ability',racerId:r.id,power:'streaker',effects:[{kind:'gain',racerId:r.id,amount:1}]});
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
      if(hasPower(s,displaced,'banana')&&movingIds.includes(baby.id))passEffects.push({kind:'ability',racerId:displaced.id,power:'banana',effects:[{kind:'trip',racerId:baby.id,source:displaced.id}]});
    }
  }
  }
  const board=arrivals.map(id=>({kind:'board',racerId:id}));const stops:Work[]=[...leafRules.stopTasks(s,arrivals,before,t),...fanStopTasks(s,arrivals,before,t)];
  if(t.cause==='main')for(const p of moved)racer(s,p.racerId)!.flags.fanMainDistance=racer(s,p.racerId)!.position-before[p.racerId]!;
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
function orderEffectTasks(s:GameState,tasks:Work[]):Work[] { const ids=order(s).map(r=>r.id);return tasks.toSorted((a,b)=>Number(b.priority==='pre-stop')-Number(a.priority==='pre-stop')||ids.indexOf(String(a.racerId))-ids.indexOf(String(b.racerId))); }

function beforeRace(s:GameState,r:Racer) {
  const power=effectivePower(s,r),base=String(r.flags.power??r.flags.copiedPower??r.characterId);
  // Copycat's printed-text layer and temporary Leaf layers never open a race
  // start window. An independent permanent acquisition of the same text can.
  if(!(base!=='copycat'&&base===power||permanentPowers(r).includes(power)&&power!=='copycat'))return;
  if(leafRules.beforeRace(s,r,power)||fanBeforeRace(s,r,power)||secondWindBeforeRace(s,r,power))return;const prepared=(r.flags.preparedPowers??=[]) as string[];if(prepared.includes(power))return;prepared.push(power);
  if(power==='sisyphus'){points(s,r,4,'西西弗斯赛前奖励');push(s,{kind:'powerDone',racerId:r.id,power});}
  if(power==='egg'){
    const cards=drawUnchosen(s,3);
    if(cards.length<3)log(s,'draw',`${name(r)}的合法未选牌仅余${cards.length}张；${cards.length?'从实际可得牌中选择':'没有可复制的牌，保留现有能力'}。`,{source:r.id,cause:'egg'});
    ask(s,r,'egg','选择蛋要复制的能力',cards.map(id=>({id,label:character(id)?.nameZh??id})),{cards});
  }
  if(power==='twin'){
    const enabled=new Set(enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));
    const snapshots=(s.flags.championPowers??[]) as {round:number;racerId:string;characterId:string;power:string}[],old=s.flags.historyPowers as Record<string,string>|undefined;
    const champions=s.results.flatMap(result=>result.placements.filter(p=>p.rank===1).map(p=>({...p,round:result.round,power:snapshots.find(h=>h.round===result.round&&h.racerId===p.racerId)?.power??old?.[p.characterId]??p.characterId}))).filter(p=>enabled.has(p.characterId)&&enabled.has(p.power));
    const counts=new Map<string,number>();for(const winner of champions)counts.set(winner.characterId,(counts.get(winner.characterId)??0)+1);
    const choices=champions.map(winner=>({...winner,id:counts.get(winner.characterId)!>1?`${winner.characterId}:race:${winner.round}:${winner.racerId}`:winner.characterId}));
    if(choices.length)ask(s,r,'twin','选择此前冠军的能力',[...choices.map(winner=>({id:winner.id,label:`${character(winner.characterId)?.nameZh??winner.characterId}${counts.get(winner.characterId)!>1?`（第${winner.round}场：${character(winner.power)?.nameZh??winner.power}）`:''}`})),{id:'skip',label:'不复制'}],{cards:choices.map(winner=>winner.characterId),champions:Object.fromEntries(choices.map(winner=>[winner.id,{characterId:winner.characterId,power:winner.power}]))},true);
  }
}
function beginTurn(s:GameState,r:Racer) {
  if(!live(r)){advance(s,r);return;}leafRules.turnBoundary(s,r);if(forcedCycle(s,r))return;s.currentRacerId=r.id;s.turn=s.racers.indexOf(r);s.turnCount++;s.flags.awaitRoll=false;s.flags.loopSeen=[];r.flags.turnStart=r.position;r.flags.turnPower=effectivePower(s,r);r.flags.rerolls={};r.flags.geniusGuess=undefined;r.flags.mainBonus=0;
  r.flags.turnsTaken=Number(r.flags.turnsTaken??0)+1;
  const power=effectivePower(s,r);r.flags.mainRolled=false;r.flags.mainDirection=undefined;r.flags.magicPassTrip=false;r.flags.showOffPrevious=undefined;r.flags.showOffTotal=0;r.flags.mainSelection=undefined;r.flags.criticAsked=[];r.flags.fanMainDistance=0;r.flags.emAsked=[];r.flags.headsFinal=false;r.flags.scoutFinal=false;r.flags.witchAllocated=false;r.flags.fanTax=0;r.flags.skipMain=hasPower(s,r,'hare')&&!(s.mode==='practice'&&active(s).length===1)&&active(s).every(x=>x.id===r.id||x.position<r.position);r.flags.blimpBonus=r.position<TRACKS[s.track].secondCorner?3:-1;
  s.flags.fanTurnPowerCount=0;
  log(s,'turn',`轮到${owner(s,r).name}的${name(r)}`,{source:r.id});
  push(s,{kind:'turnStartPower',racerId:r.id},...powers(s,'duelist').map(d=>({kind:'duelCheck',racerId:d.id})),{kind:'mainReady',racerId:r.id},{kind:'endTurn',racerId:r.id});
}
function turnStartPower(s:GameState,r:Racer) {
  const power=effectivePower(s,r);if(leafRules.turnStart(s,r,power)||fanTurnStart(s,r,power)||secondWindTurnStart(s,r,power))return;
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
  if(r.tripped&&r.flags.bullySource){ask(s,r,'em-bully-recover','校园恶霸：请掷恢复骰，1～3起身并移动，否则只起身',[{id:'roll',label:'掷恢复骰'}],{source:r.flags.bullySource,sourceId:r.flags.bullySource});return;}
  if(r.tripped&&!hasPower(s,r,'penguin')){r.tripped=false;log(s,'recover',`${name(r)}起身，代替主移动`,{source:r.id});leafRules.recover(s,r);return;}
  if(leafRules.mainReady(s,r))return;
  const mainPowers=effectivePowers(s,r).filter(p=>['genius','legs','flip-flop','mole','cheatah','mr-dice-guy'].includes(p));
  if(mainPowers.length>1&&!r.flags.mainSelection){ask(s,r,'main-ability','选择本次主移动使用的能力',mainPowers.map(p=>({id:p,label:character(p)?.nameZh??p})),{});return;}
  const power=String(r.flags.mainSelection??mainPowers[0]??effectivePower(s,r));if(secondWindMainReady(s,r,power))return;
  if(power==='genius'&&!r.flags.geniusAsked){r.flags.geniusAsked=true;ask(s,r,'genius','预测主移动骰面',[...Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{id:'skip',label:'不预测'}],{},true);push(s,{kind:'mainReady',racerId:r.id});return;}
  if(power==='legs'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'legs','要直接以5作为主移动基础距离吗？',yesNo,{},true);return;}
  if(power==='flip-flop'&&!r.flags.mainAsked){r.flags.mainAsked=true;ask(s,r,'flip-flop','交换位置代替主移动？',[...targetOptions(s,active(s).filter(x=>x.id!==r.id).map(x=>x.id)),{id:'skip',label:'正常掷骰'}],{},true);return;}
  if(fanMainReady(s,r))return;
  if(!stunnerSources(s,r).length)breakForcedCycle(s);s.flags.awaitRoll=true;
}
function rerollWindow(s:GameState,r:Racer,face:number) {
  const critics=powers(s,'critic').filter(c=>c.id!==r.id&&r.position>c.position&&!((r.flags.criticAsked??[]) as string[]).includes(c.id));
  if(critics.length){const c=critics[0]!;r.flags.criticAsked=[...((r.flags.criticAsked??[]) as string[]),c.id];ask(s,c,'critic',`要让${name(r)}重掷主移动吗？`,yesNo,{target:r.id,face},true);return;}
  const counts=(r.flags.rerolls??={}) as Record<string,number>;
  const sources=order(s).flatMap(x=>effectivePowers(s,x).filter(power=>(power==='dicemonger'&&(counts[`${x.id}:${power}`]??0)<1)||(x.id===r.id&&power==='magician'&&(counts[`${x.id}:${power}`]??0)<2)).map(power=>({racerId:x.id,power,key:`${x.id}:${power}`})));
  if(sources.length){ask(s,r,'reroll',`掷出${face}，要重掷吗？`,[{id:'reroll',label:'重掷'},{id:'keep',label:'保留'}],{face,sources},true);}
  else push(s,{kind:'finalRoll',racerId:r.id,face});
}
function finalRoll(s:GameState,r:Racer,face:number) {
  if(!live(r))return;
  const firstTasks:Work[]=[];
  if(leafRules.finalRoll(s,r,face,firstTasks)||fanFinalRoll(s,r,face,firstTasks))return;
  if(secondWindFinalRoll(s,r,face,firstTasks))return;
  s.lastRoll={racerId:r.id,face,distance:face};log(s,'roll',`${name(r)}最终骰面为${face}`,{source:r.id,faces:[face],cause:'main',rollKind:'main'});
  if(r.flags.geniusGuess===face)firstTasks.push({kind:'ability',racerId:r.id,power:'genius',effects:[emStep(r,'extra-turn')]});
  if(face===1){for(const skipper of powers(s,'skipper'))firstTasks.push({kind:'ability',racerId:skipper.id,effects:[{kind:'setNext',racerId:skipper.id}]});}
  if(face===6){for(const lackey of powers(s,'lackey').filter(x=>x.id!==r.id))firstTasks.push({kind:'ability',racerId:lackey.id,effects:[{kind:'move',racerId:lackey.id,distance:2,cause:'lackey'}]});}
  firstTasks.sort((a,b)=>order(s).findIndex(x=>x.id===a.racerId)-order(s).findIndex(x=>x.id===b.racerId));
  if(hasPower(s,r,'magical-athlete')||(hasPower(s,r,'icarus')&&face===6)){push(s,...firstTasks);return;}
  const worms=face===1?powers(s,'inchworm').filter(x=>x.id!==r.id):[];
  if(worms.length){push(s,...firstTasks,...worms.map(x=>({kind:'ability',racerId:x.id,effects:[{kind:'move',racerId:x.id,distance:1,cause:'inchworm'}]})));return;}
  const power=effectivePower(s,r);
  if(hasPower(s,r,'sisyphus')&&face===6){push(s,{kind:'ability',racerId:r.id,effects:[{kind:'warp',racerId:r.id,position:0,cause:power},{kind:'gain',racerId:r.id,amount:-1}]},...firstTasks);return;}
  if(hasPower(s,r,'alchemist')&&face<=2){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power:'alchemist'});return;}
  if(hasPower(s,r,'rocket-scientist')){push(s,...firstTasks,{kind:'baseChoice',racerId:r.id,face,power:'rocket-scientist'});return;}
  push(s,...firstTasks,{kind:'mainMove',racerId:r.id,base:face});
}
function mainMove(s:GameState,r:Racer,base:number) {
  if(!live(r))return;
  let distance=Number(r.flags.showOffDistance??r.flags.fanBase??base);r.flags.showOffDistance=undefined;delete r.flags.fanBase;const effects:Work[]=[];const power=effectivePower(s,r);
  distance=secondWindDistance(s,r,distance);
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
  distance=leafRules.distance(s,r,distance,base,effects);
  distance=fanDistance(s,r,distance,base,effects);
  if(s.lastRoll?.racerId===r.id)s.lastRoll.distance=distance;
  if(hasPower(s,r,em('witch-hazel'))&&distance>=0&&!r.flags.witchAllocated&&active(s).some(x=>x.id!==r.id)){ask(s,r,'em-witch-self',`女巫：共${distance}格，给自己前进几格？`,Array.from({length:distance+1},(_,i)=>({id:String(i),label:`自己前进${i}，目标后退${distance-i}`})),{distance,effects});return;}
  push(s,{kind:'move',racerId:r.id,distance,cause:'main'},...effects);
}
function endTurn(s:GameState,r:Racer) {
  leafRules.endTurn(s,r);s.flags.fanPreviousDistance=r.flags.fanMainDistance??0;
  s.flags.awaitRoll=false;r.flags.mainAsked=false;r.flags.geniusAsked=false;
  const tasks:Work[]=[];if(live(r))tasks.push(...effectivePowers(s,r).map(power=>({kind:'swEndTurn',racerId:r.id,power})));if(live(r)&&Math.abs(r.position-Number(r.flags.turnStart??r.position))<=1)for(const h of powers(s,'heckler'))tasks.push({kind:'ability',racerId:h.id,effects:[{kind:'move',racerId:h.id,distance:2,cause:'heckler'}]});
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
  if(leafRules.choice(s,r,c,id)||fanChoice(s,r,c,id)||secondWindChoice(s,r,c,id))return;
  if(c.kind==='copycat'){
    if(!copyCandidates(s,r).some(target=>target.id===id)){push(s,{kind:'refreshCopies'});return;}
    const previous=r.flags.copyPower,previousTarget=r.flags.copyTarget;r.flags.copyTarget=id;r.flags.copyPower=copyPower(s,r);r.flags.lastCopyPower=r.flags.copyPower;
    if(previous!==r.flags.copyPower||previousTarget!==id)log(s,'copy',`${name(r)}当前模仿${name(racer(s,id)!)}的印刷能力。`,{source:r.id,targets:[id],cause:'copycat',grantedPowerIds:r.flags.copyPower==='copycat'?[]:[r.flags.copyPower],grantDuration:'source-change'});
    return;
  }
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
    const enabled=new Set(enabledCharacterIds(s.config,s.characterPool,s.mode==='practice'));
    if(c.kind==='egg')for(const card of ((ctx.cards??[]) as string[]))if(enabled.has(card)&&!s.discard.includes(card))s.discard.push(card);
    const champion=(ctx.champions as Record<string,{characterId:string;power:string}>|undefined)?.[id],cardId=champion?.characterId??id;
    const inherited=c.kind==='twin'?(champion?.power??hist?.[id]??id):id;
    if(!enabled.has(cardId)||!enabled.has(inherited)){log(s,'cancel',`${name(r)}的复制来源已不在本房间启用角色包中，本次复制取消。`,{source:r.id,cause:c.kind});return;}
    if(c.kind==='egg')r.flags.eggCardId??=id;else r.flags.twinCardId=cardId;
    r.flags.power=inherited;r.flags.powerSourceCard=cardId;r.flags.powerVia=c.kind;
    log(s,'copy',`${name(r)}本场复制${character(cardId)?.nameZh??cardId}`,{source:r.id,cause:c.kind,selectedCardId:cardId,grantedPowerIds:[inherited],grantDuration:'race'});push(s,{kind:'beforeRace',racerId:r.id},{kind:'powerDone',racerId:r.id,power:c.kind});return;
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

function rawTask(s:GameState,t:Work) {
  const r=racer(s,String(t.racerId??''));
  switch(t.kind){
    case 'activate':if(r&&live(r)){log(s,'power',`${name(r)}发动「${character(t.power)?.nameZh??t.power}」`,{source:r.id,cause:t.power});push(s,...t.effects,{kind:'powerDone',racerId:r.id,power:t.power});}break;
    case 'fan':if(r&&live(r))fanTask(s,r,t);break;
    case 'leaf':if(r&&live(r))leafRules.task(s,r,t);break;
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
    case 'rollDie':if(r&&live(r))push(s,{kind:'rollBatch',racerId:r.id,count:r.flags.leafPhilanthropistRoll?2:hasPower(s,r,'mr-dice-guy')?6:hasPower(s,r,em('broken-clock'))?2:1,purpose:r.flags.leafPhilanthropistRoll?'leaf-philanthropist':hasPower(s,r,'mr-dice-guy')?'mr-dice-guy':hasPower(s,r,em('broken-clock'))?'em-broken-clock':'main',faces:[]});break;
    case 'rollBatch':if(r&&live(r))rollBatch(s,r,t);break;
    case 'finalRoll':if(r)finalRoll(s,r,t.face);break;
    case 'mainMove':if(r)mainMove(s,r,t.base);break;
    case 'baseChoice':if(r)ask(s,r,t.power,t.power==='alchemist'?'要改为基础移动4格吗？':'要加倍骰面并在移动后绊倒吗？',yesNo,{face:t.face},true);break;
    case 'ability':if(r&&live(r))usePower(s,r,t.effects,t.power??effectivePower(s,r));break;
    case 'hotelPay':if(r&&live(r)){const target=racer(s,t.targetId);if(target&&live(target)&&target.position===r.position){if(owner(s,target).score>=1){points(s,target,-1,'旅馆住宿费');points(s,r,1,'旅馆住宿收入');}else push(s,{kind:'trip',racerId:target.id,source:r.id});}}break;
    case 'hogTake':if(r&&live(r)){const previous=s.racers.filter(x=>x.flags.hogOwnerId===t.hogOwnerId);for(const x of previous)delete x.flags.hogOwnerId;r.flags.hogOwnerId=t.hogOwnerId;log(s,'mount',`${name(r)}夺走野猪坐骑`,{source:r.id,cause:'hog-knight',changes:[...previous.filter(x=>x.id!==r.id).map(x=>({racerId:x.id,mount:null})),{racerId:r.id,mount:String(t.hogOwnerId)}]});}break;
    case 'gain':if(r)points(s,r,t.amount,name(r));break;
    case 'setNext':((s.flags.nextOverride??=[]) as string[]).push(t.racerId);break;
    case 'trip':if(r&&live(r)){if(leafRules.preventTrip(s,r))break;if(hasPower(s,r,em('doctor-dice'))){usePower(s,r,[],em('doctor-dice'));break;}const wasTripped=r.tripped;r.tripped=true;leafRules.onTrip(s,r,wasTripped);log(s,'trip',`${name(r)}绊倒`,{source:t.source,targets:[r.id]});if(t.bullySource)r.flags.bullySource=t.bullySource;if(hasPower(s,r,em('pooh')))usePower(s,r,[{kind:'fan',racerId:r.id,step:'recover'}],em('pooh'));}break;
    case 'eliminate':eliminate(s,t.racerId,t.source);break;
    case 'move':case 'warp':motion(s,t);break;
    case 'powerDone':
      fanPowerDone(s,t);
      // Every individual power activation generates its own response, including
      // separate Leaptoad skipped spaces and distinct passive modifier uses.
      if(t.power==='leaf-lonely-wolf')break;
      for(const sc of powers(s,'scoocher').filter(x=>x.id!==t.racerId).toReversed())push(s,{kind:'ability',racerId:sc.id,effects:[{kind:'move',racerId:sc.id,distance:1,cause:'scoocher'}]});
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
    case 'refreshCopies':for(const copy of active(s).filter(x=>powerTokens(x).includes('copycat'))){
      const targets=copyCandidates(s,copy);
      if(targets.length>1&&!targets.some(x=>x.id===copy.flags.copyTarget)){
        if(disabledBy(s,copy).length)continue;
        ask(s,copy,'copycat','选择一名并列领先者作为模仿对象',targetOptions(s,targets.map(x=>x.id)),{});push(s,{kind:'refreshCopies'});break;
      }
      const power=copyPower(s,copy),previous=copy.flags.lastCopyPower,previousTarget=copy.flags.copyTarget;copy.flags.copyPower=power;
      if(targets.length===1)copy.flags.copyTarget=targets[0]!.id;
      if(!targets.length)delete copy.flags.copyTarget;
      if(previous!==power||previousTarget!==copy.flags.copyTarget){const model=copyModel(s,copy);log(s,'copy',model?`${name(copy)}当前模仿${name(model)}的印刷能力。`:`${name(copy)}当前没有可模仿的其他领跑者。`,{source:copy.id,targets:model?[model.id]:[],cause:'copycat',grantedPowerIds:power==='copycat'?[]:[power],grantDuration:'source-change'});}
      copy.flags.lastCopyPower=power;
    }break;
    default:throw Error(`无法识别规则事件：${t.kind}`);
  }
}
/** Bounded work is resumable, never an arbitrary limit on valid power chains. */
export function resolveTasks(s:GameState):void {
  const diagnostic=(s.flags.resolutionDiagnostic??={events:0,rngState:s.rngState,randomStream:s.randomStream?structuredClone(s.randomStream):undefined,startLogId:s.logs.at(-1)?.id??0}) as {events:number;rngState:number;randomStream?:unknown;startLogId:number};
  type Checkpoint={queueLength:number;tail:string};
  const seen=new Map<string,Checkpoint>((s.flags.resolutionSeen??[]) as [string,Checkpoint][]);
  let budget=0,historyBytes=[...seen].reduce((n,[key,value])=>n+key.length+value.tail.length,0);
  const save=()=>{s.flags.resolutionSeen=[...seen];delete s.flags.resolutionSeenScores;delete s.flags.resolutionSuppressed;};
  while(s.phase==='race'&&!s.pending&&s.queue.length){
    if(diagnostic.events>=9000){s.phase='paused';s.flags.ruleHold={kind:'resolution-diagnostic',message:'连锁超过独立诊断保护阈值，本房间已暂停。已保存完整状态、随机种子和待处理事件；请保留房间供排查后恢复，未判定循环或胜负。',...diagnostic};s.flags.continuation=true;save();log(s,'engine-paused',String((s.flags.ruleHold as {message:string}).message),{cause:'diagnostic-budget'});return;}
    if(++budget>3000){s.flags.continuation=true;save();return;}
    diagnostic.events++;
    const signature=resolutionSignature(s),earlier=seen.get(signature);
    if(earlier&&s.queue.length>earlier.queueLength){
      const tailLength=earlier.queueLength-1,tail=tailLength?s.queue.slice(-tailLength):[];
      if(JSON.stringify(tail)===earlier.tail){
        log(s,'loop','同一连锁的完整规则状态与待处理效果重现，保留已经完成的一遍结算，在重复分支开始前停止；其他效果继续。');
        s.queue=tail;seen.clear();historyBytes=0;continue;
      }
    }
    if(!earlier){
      const checkpoint={queueLength:s.queue.length,tail:JSON.stringify(s.queue.slice(1))};
      const bytes=signature.length+checkpoint.tail.length;
      // Forgetting a checkpoint may miss a very long cycle but cannot invent
      // one. Bound diagnostic scratch space independently of legal chain size.
      if(bytes<=96000){while(seen.size&&(seen.size>=256||historyBytes+bytes>96000)){const oldest=seen.keys().next().value!;const entry=seen.get(oldest)!;historyBytes-=oldest.length+entry.tail.length;seen.delete(oldest);}seen.set(signature,checkpoint);historyBytes+=bytes;}
    }
    task(s,s.queue.shift()! as Work);
    if(s.flags.awaitRoll)break;
  }
  s.flags.continuation=false;
  if(s.pending)save();else {delete s.flags.resolutionSeen;delete s.flags.resolutionSuppressed;delete s.flags.resolutionSeenScores;if(!s.queue.length)delete s.flags.resolutionDiagnostic;}
}

export function applyGameAction(s:GameState,playerId:string,action:GameAction):void {
  const p=s.players.find(x=>x.id===playerId);if(!p)throw Error('你不在本局参赛席位中');
  if(action.type==='start'){startGame(s);return;}
  if(action.type==='practice-team'){
    if(s.mode!=='practice'||s.phase!=='draft'||s.round!==1||s.players.length!==1)throw Error('现在不能选择练习阵容');
    if(action.characterIds.length!==4||new Set(action.characterIds).size!==4||action.characterIds.some(id=>!enabledCharacterIds(s.config,s.characterPool,true).includes(id)))throw Error('请从完整牌池选择4张不同角色牌');
    p.hand=[...action.characterIds];s.flags.fanDraftOrder=Object.fromEntries(action.characterIds.map((id,i)=>[id,i]));
    // Earlier practice saves can be midway through a two-batch draft. Replace
    // that incomplete hand atomically and return every unchosen printed card
    // to the candidate pool, preserving the stored shuffle and random history.
    const remaining=enabledCharacterIds(s.config,s.characterPool,true).filter(id=>!p.hand.includes(id));
    s.deck=[...new Set([...s.deck.filter(id=>remaining.includes(id)),...remaining])];
    log(s,'practice-team',`${p.name}的练习阵容：${p.hand.map(id=>character(id)!.nameZh).join('、')}`);beginSelection(s);return;
  }
  if(action.type==='draft'){
    if(s.mode==='practice')throw Error('请从完整牌池一次确认4张练习角色牌');
    if(s.phase!=='draft'||!s.draft)throw Error('现在不是选秀阶段');const d=s.draft;if(d.order[d.cursor]!==playerId)throw Error('还没有轮到你选秀');
    const index=d.market.indexOf(action.characterId);if(index<0)throw Error('这张角色牌不在候选区');d.market.splice(index,1);p.hand.push(action.characterId);((s.flags.fanDraftOrder??={}) as Record<string,number>)[action.characterId]=d.cursor;d.cursor++;log(s,'draft',`${p.name}选择${character(action.characterId)?.nameZh}`,{cause:action.characterId});
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
    delete s.flags.resolutionSeen;delete s.flags.resolutionSeenScores;delete s.flags.resolutionSuppressed;s.pending=undefined;processChoice(s,pending,action.optionId);resolveTasks(s);return;
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
function rollFor(s:GameState,r:Racer,reason:string):number {
  const stunners=stunnerSources(s,r);
  const raw=random(s,reason,6,stunners.length>0&&!powers(s,'leaf-triangle-man').length);r.flags.secretLeafLastRaw=raw;
  if(stunners.length){log(s,'die-modified',`${name(r)}的骰面被惊艳者固定为1`,{source:stunners[0]!.id,targets:[r.id],faces:[raw,1],cause:'stunner'});return 1;}
  return raw;
}
function stunnerSources(s:GameState,r:Racer){return powers(s,'stunner').filter(x=>x.id!==r.id&&Math.abs(x.position-r.position)<=1);}
function extremeTargets(s:GameState,lead:boolean){const all=active(s);const n=(lead?Math.max:Math.min)(...all.map(x=>x.position));return all.filter(x=>x.position===n);}
function askTarget(s:GameState,r:Racer,kind:string,title:string,targets:Racer[],context:Record<string,any>={},optional=false){if(!targets.length)return;ask(s,r,kind,title,[...targetOptions(s,targets.map(x=>x.id)),...(optional?[{id:'skip',label:'放弃'}]:[])],context,optional);}
function secondWindBeforeRace(s:GameState,r:Racer,p:string):boolean {
  const prepared=(r.flags.swPrepared??=[]) as string[];if(prepared.includes(p))return true;
  if(!['hog-knight','nepo-baby','soulmate','understudy','stepdad','re-runner'].includes(p))return false;
  prepared.push(p);
  if(p==='hog-knight'){r.flags.hogOwnerId=r.id;log(s,'mount',`${name(r)}骑上野猪`,{source:r.id,cause:p,changes:[{racerId:r.id,mount:r.id}]});}
  if(p==='nepo-baby'){r.position=TRACKS[s.track].firstCorner;log(s,'place',`${name(r)}从第一弯道出发`,{source:r.id,after:[r.position],cause:p});}
  if(p==='re-runner')r.flags.reRunnerPlayerId=r.playerId;
  if(p==='stepdad')r.flags.stepTarget=stepdadTarget(s,r)?.id;
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
  if(t.power==='mush'&&face<=2){const id=drawUnchosen(s,1)[0];if(id){s.discard.push(id);acquirePower(r,id,{sourceCardId:id,via:'mush'});log(s,'acquire',`${name(r)}获得${character(id)?.nameZh??id}的能力，不补用已经过的触发时机`,{source:r.id,cause:'mush',selectedCardId:id,grantedPowerIds:[id],grantDuration:'race'});if(id==='copycat')push(s,{kind:'refreshCopies'});}else log(s,'draw',`${name(r)}没有可抽取的合法未选牌，本次不获得新能力。`,{source:r.id,cause:'mush'});}
  if(t.power==='nemesis'&&target&&live(target))ask(s,r,'nemesis',`要跟掷${name(target)}的${face}点吗？`,yesNo,{face},true);
  if(t.power==='magical-athlete'){
    if(face===1)usePower(s,r,[{kind:'mainMove',racerId:r.id,base:7}],t.power);
    if(face===2)askTarget(s,r,'magical-last','选择一名末位选手传送到自己',extremeTargets(s,false));
    if(face===3)askTarget(s,r,'magical-warp','选择传送目标并绊倒对方',active(s).filter(x=>x.id!==r.id));
    if(face===4)usePower(s,r,[emStep(r,'extra-turn'),{kind:'mainMove',racerId:r.id,base:4}],t.power);
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
    if(hasPower(s,source,'stepdad')&&stepdadTarget(s,source)?.id===r.id)distance+=2;
  }
  return distance;
}
function secondWindEndTurn(s:GameState,r:Racer,p:string) {
  const others=active(s).filter(x=>x.id!==r.id);
  if(p==='hopfrog'&&others.some(x=>x.position-r.position===1)){r.flags.extraTurn=true;log(s,'extra-turn',`${name(r)}获得额外回合`,{source:r.id,cause:p});}
  if(p==='switcharoo')askTarget(s,r,p,'要与哪名邻近选手交换控制权？',others.filter(x=>Math.abs(x.position-r.position)<=1),{},true);
  if(p==='the-hose')ask(s,r,'the-hose-roll','回合结束：请掷水管范围骰，绊倒严格前方1～骰面格的全部选手',[{id:'roll',label:'掷水管范围骰'}],{},false);
  r.flags.magicPassTrip=false;r.flags.showOffResolved=false;
}
function secondWindRoll(s:GameState,r:Racer,t:Work){if(t.power==='mr-dice-guy')push(s,{kind:'rollBatch',racerId:r.id,count:6,purpose:'mr-dice-guy',faces:[]});}
function secondWindChoice(s:GameState,r:Racer,c:PendingChoice,id:string):boolean {
  const ctx=c.context as Record<string,any>,kind=c.kind;
  if(kind==='main-ability'){r.flags.mainSelection=id;push(s,{kind:'mainReady',racerId:r.id});return true;}
  if(kind==='mole'){if(id==='use')usePower(s,r,[{kind:'mainMove',racerId:r.id,base:6}],'mole');else push(s,{kind:'mainReady',racerId:r.id});return true;}
  if(kind==='understudy'){const target=racer(s,id)!;r.flags.power=target.characterId;r.flags.powerSourceCard=target.characterId;r.flags.powerVia=kind;r.flags.copiedFrom=target.id;log(s,'copy',`${name(r)}复制${name(target)}的印刷能力`,{source:r.id,targets:[target.id],selectedCardId:target.characterId,cause:kind,grantedPowerIds:[target.characterId],grantDuration:'race'});push(s,{kind:'beforeRace',racerId:r.id});return true;}
  if(kind==='soulmate'){r.flags.soulmateTarget=id;return true;}
  if(kind==='diva'){const target=racer(s,id)!;usePower(s,r,[{kind:'warp',plans:[{racerId:r.id,position:target.position},{racerId:target.id,position:r.position}],cause:kind}],kind);return true;}
  if(kind==='kingtripper'){if(id!=='skip')usePower(s,r,[{kind:'trip',racerId:id,source:r.id}],kind);return true;}
  if(kind==='kraken'){if(id==='use'){r.flags.krakenUsed=true;const others=active(s).filter(x=>x.id!==r.id);usePower(s,r,[{kind:'warp',plans:others.map(x=>({racerId:x.id,position:r.position})),cause:kind},...others.map(x=>({kind:'trip',racerId:x.id,source:r.id}))],kind);}return true;}
  if(kind==='tail'){if(id==='use')usePower(s,r,[{kind:'warp',racerId:r.id,position:ctx.position,cause:kind}],kind);return true;}
  if(kind==='critic'){const target=racer(s,ctx.target)!;if(id==='use')usePower(s,r,[{kind:'rollDie',racerId:target.id}],kind);else rerollWindow(s,target,ctx.face);return true;}
  if(kind==='nemesis'){if(id==='use')push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'nemesis',faces:[],context:ctx});return true;}
  if(kind==='the-hose-roll'){push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'the-hose',faces:[]});return true;}
  if(kind==='cheatah'){
    r.flags.cheatahSecret=Number(id);const seat=owner(s,r).seat;const right=[...s.players].sort((a,b)=>((seat-a.seat+s.players.length)%s.players.length)-((seat-b.seat+s.players.length)%s.players.length)).find(x=>x.id!==r.playerId);
    if(!right){const face=Number(id);delete r.flags.cheatahSecret;push(s,{kind:'mainMove',racerId:r.id,base:face});return true;}
    const guessRacer=active(s).find(x=>x.playerId===right.id)??r;ask(s,guessRacer,'cheatah-guess',`猜测${name(r)}的秘密点数`,Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),{cheatahId:r.id,secret:Number(id)});s.pending!.playerId=right.id;return true;
  }
  if(kind==='cheatah-guess'){const cheatah=racer(s,ctx.cheatahId)!;const face=Number(ctx.secret);delete cheatah.flags.cheatahSecret;log(s,'secret-reveal',`${name(cheatah)}设定${face}；猜测${id}${Number(id)===face?'，猜中！':'，未猜中'}`,{source:cheatah.id,faces:[face,Number(id)],cause:'cheatah'});if(Number(id)!==face)push(s,{kind:'mainMove',racerId:cheatah.id,base:face});return true;}
  if(kind==='mr-dice-roll'||kind==='mr-dice-reroll'){push(s,{kind:'swRoll',racerId:r.id,power:'mr-dice-guy'});return true;}
  if(kind==='mr-dice-pick'){push(s,{kind:'swFinal',racerId:r.id,face:Number(id)});return true;}
  if(kind==='show-off'){
    if(id==='stop'){r.flags.showOffResolved=true;r.flags.showOffDistance=Number(ctx.total);push(s,{kind:'finalRoll',racerId:r.id,face:Number(ctx.previous)});return true;}
    push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'show-off',faces:[],context:ctx});return true;
  }
  if(kind==='magical-last'){usePower(s,r,[{kind:'warp',racerId:id,position:r.position,cause:'magical-athlete'}],'magical-athlete');return true;}
  if(kind==='magical-warp'){const target=racer(s,id)!;usePower(s,r,[{kind:'warp',racerId:r.id,position:target.position,cause:'magical-athlete'},{kind:'trip',racerId:id,source:r.id}],'magical-athlete');return true;}
  if(kind==='magical-lead'){usePower(s,r,[{kind:'move',racerId:id,distance:-5,cause:'magical-athlete'}],'magical-athlete');return true;}
  if(kind==='switcharoo'){
    if(id==='skip')return true;const target=racer(s,id);if(!target||!live(r)||!live(target)||target.id===r.id||Math.abs(target.position-r.position)>1)throw Error('交换对象已不在邻近范围内');const former=r.playerId;r.playerId=target.playerId;target.playerId=former;
    // Card custody moves too; points and reconnection remain keyed by stable player IDs.
    if(former!==r.playerId)for(const p of s.players){if(p.id===former){const ix=p.used.indexOf(r.characterId);if(ix>=0)p.used[ix]=target.characterId;}else if(p.id===r.playerId){const ix=p.used.indexOf(target.characterId);if(ix>=0)p.used[ix]=r.characterId;}}
    log(s,'control',`${name(r)}与${name(target)}交换控制权`,{source:r.id,targets:[r.id,target.id],cause:kind,changes:[{racerId:r.id,playerId:r.playerId},{racerId:target.id,playerId:target.playerId}]});if(former!==r.playerId)push(s,{kind:'powerDone',racerId:r.id,power:kind});return true;
  }
  return false;
}
/** Each die and forced reroll is a JSON continuation. Party Pooper's movement,
 * including any target choices it triggers, finishes before the replacement die. */
function rollBatch(s:GameState,r:Racer,t:Work){
  const faces=(t.faces??[]) as number[];let face=Number(t.heldFace??rollFor(s,r,t.purpose==='main'?`${name(r)}主移动`:`${name(r)} ${t.purpose}`));
  if(t.heldFace===undefined&&!t.leafRawChecked){const observed=leafRules.rawDie(s,r,Number(r.flags.secretLeafLastRaw));if(observed.length){push(s,...observed,{...t,heldFace:face,leafRawChecked:true});return;}}
  if(hasPower(s,r,em('heads'))&&!t.headsChecked){ask(s,r,'em-heads',`硬币头：本骰${face}点，是否翻到底面${7-face}点？`,[{id:'keep',label:`保留${face}`},{id:'flip',label:`翻到${7-face}`}],{task:{...t,heldFace:face,headsChecked:true}});return;}
  if(!t.taxChecked){const kings=face>=5?powers(s,em('king-pete')).filter(x=>x.id!==r.id):[];if(kings.length){push(s,...kings.map(k=>({kind:'ability',racerId:k.id,power:em('king-pete'),effects:[...(t.purpose==='main'||t.purpose==='em-broken-clock'?[{kind:'fan',racerId:r.id,step:'tax'}]:[]),{kind:'move',racerId:k.id,distance:1,cause:em('king-pete')}]})),{...t,heldFace:face,headsChecked:true,taxChecked:true});return;}}
  if(!t.dieReactionsChecked){push(s,{...t,heldFace:face,headsChecked:true,taxChecked:true,dieReactionsChecked:true});return;}
  const poopers=face===6?powers(s,'party-pooper'):[];
  if(poopers.length){
    log(s,'reroll','扫兴鬼强制重掷6点',{source:r.id,cause:'party-pooper'});
    push(s,...poopers.map(p=>({kind:'ability',racerId:p.id,power:'party-pooper',effects:[{kind:'move',racerId:p.id,distance:1,cause:'party-pooper'}]})),{...t,faces:[...faces],heldFace:undefined,leafRawChecked:false,headsChecked:false,taxChecked:false,dieReactionsChecked:false,reactionChecked:[],reactionBlocked:[],reactionAsked:[]});return;
  }
  faces.push(face);
  if(faces.length<Number(t.count)){const next:Work={...t,faces};delete next.leafRawChecked;delete next.heldFace;delete next.headsChecked;delete next.taxChecked;delete next.dieReactionsChecked;delete next.reactionChecked;delete next.reactionBlocked;delete next.reactionAsked;push(s,next);return;}
  const ctx=(t.context??{}) as Record<string,any>;
  if(leafRules.rollResult(s,r,t,faces,ctx))return;
  if(String(t.purpose).startsWith('em-')){fanRollResult(s,r,t,faces,ctx);return;}
  if(t.purpose==='main'){r.flags.mainRolled=true;s.lastRoll={racerId:r.id,face,distance:face};log(s,'die',`${name(r)}掷出${face}`,{source:r.id,faces:[face],cause:'main',rollKind:'main'});rerollWindow(s,r,face);return;}
  if(t.purpose==='mr-dice-guy'){
    r.flags.mainRolled=true;
    const repeats=[...new Set(faces)].filter(n=>faces.filter(x=>x===n).length>1);
    log(s,'multi-dice',`${name(r)}掷出六骰：${faces.join('、')}`,{source:r.id,faces,cause:t.purpose});
    if(repeats.length)ask(s,r,'mr-dice-pick','选择出现两次以上的点数',repeats.map(n=>({id:String(n),label:`${n}（${faces.filter(x=>x===n).length}次）`})),{});
    else {log(s,'house-rule','项目房规：六颗主骰均不相同，等待当前控制者重新投整组六骰，主移动尚未执行。',{source:r.id,cause:'mr-dice-reroll'});ask(s,r,'mr-dice-reroll','项目房规：六骰均不同，请重掷整组六骰',[{id:'roll',label:'六骰均不同，重掷六骰'}],{});}
    return;
  }
  if(t.purpose==='nemesis'){const matches=face===ctx.face;log(s,'ability-dice',`${name(r)}跟掷${face}，对比已公开主骰${ctx.face}：${matches?`相同，发动${face}格额外移动`:'不同，本次不移动'}`,{source:r.id,faces:[face],cause:t.purpose});if(matches)usePower(s,r,[{kind:'move',racerId:r.id,distance:face,cause:t.purpose}],t.purpose);return;}
  if(t.purpose==='the-hose'){const targets=order(s,active(s).filter(x=>x.id!==r.id&&x.position>r.position&&x.position-r.position<=face));log(s,'ability-dice',`${name(r)}水管范围${face}：绊倒第${r.position+1}～${Math.min(TRACKS[s.track].finish,r.position+face)}格的${targets.length}名选手`,{source:r.id,targets:targets.map(x=>x.id),faces:[face],cause:t.purpose});usePower(s,r,targets.map(x=>({kind:'trip',racerId:x.id,source:r.id})),t.purpose);return;}
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

// Extra Mile fan-card rules. Each continuation is persisted as JSON task data.
const em=(id:string)=>`extra-mile-${id}`;
const emStep=(r:Racer,step:string,extra:Record<string,unknown>={}):Work=>({kind:'fan',racerId:r.id,step,...extra});
function fanTrackIncome(s:GameState,r:Racer,amount:number){leafRules.trackIncome(s,r,amount);if(amount>0){const income=(s.flags.fanIncome??={}) as Record<string,number>;income[r.id]=(income[r.id]??0)+amount;}}
function fanBeforeRace(s:GameState,r:Racer,p:string):boolean{
  if(!p.startsWith('extra-mile-'))return false;
  const prepared=(r.flags.fanPrepared??=[]) as string[];if(prepared.includes(p))return true;prepared.push(p);
  if(p===em('doc-paradox')){r.position=TRACKS[s.track].finish;log(s,'place',`${name(r)}从终点倒向起点比赛`,{source:r.id,cause:p,after:[r.position]});}
  if(p===em('gingy'))r.flags.gingyLives=4;
  if(p===em('snub'))r.flags.snubBonus=Number((s.flags.fanDraftOrder as Record<string,number>|undefined)?.[em('snub')]??0);
  if(p===em('toll-troll')||p===em('honey-pot')){
    if(p===em('honey-pot')){s.flags.honeyPot=Number(s.flags.honeyPot??0)+s.round;log(s,'resource',`本场蜜罐加入${s.round}积分，余额${s.flags.honeyPot}`,{source:r.id,cause:p});}
    ask(s,r,'em-mark',`${name(r)}：选择标记格`,Array.from({length:TRACKS[s.track].finish+1},(_,i)=>({id:String(i),label:`第${i}格`})),{power:p});
  }
  if(p===em('snake-eyes'))askTarget(s,r,'em-bet-target','蛇眼：选择本场冠军',active(s));
  if(p===em('thief'))askTarget(s,r,'em-thief','盗贼：秘密指定另一选手',active(s).filter(x=>x.id!==r.id));
  if(p===em('shuffler'))usePower(s,r,[emStep(r,'shuffle')],p);
  if(p===em('dom-and-gary')){
    const g:Racer={id:`${r.id}:gary`,identityPlayerId:r.identityPlayerId??r.playerId,playerId:r.playerId,characterId:r.characterId,position:4,tripped:false,finished:false,eliminated:false,flags:{gary:true,extraName:'加里',power:'gary',domId:r.id}};
    s.racers.push(g);const ids=baseOrder(s);ids.splice(ids.indexOf(r.id),0,g.id);s.baseTurnOrder=ids;r.flags.garyId=g.id;
    if(s.currentRacerId===r.id){s.currentRacerId=g.id;for(const t of s.queue)if(t.kind==='beginTurn'&&t.racerId===r.id)t.racerId=g.id;}
    log(s,'extra-racer','加里从第4格开始，在多姆之前行动；其前二名次积分退出游戏。',{source:r.id,targets:[g.id],cause:p});
  }
  return true;
}
function fanTurnStart(s:GameState,r:Racer,p:string):boolean{
  if(p===em('shuffler')&&active(s).every(x=>x.id===r.id||x.position>r.position)){ask(s,r,'em-reshuffle','洗牌师独自末位：重新分配本场印刷能力？',yesNo,{},true);return true;}
  return p.startsWith('extra-mile-');
}
function fanMainReady(s:GameState,r:Racer):boolean{
  const asked=(r.flags.emAsked??=[]) as string[];
  for(const p of effectivePowers(s,r)){
    if(asked.includes(p))continue;asked.push(p);
    if(p===em('cletus')){const targets=active(s).filter(x=>x.id!==r.id&&Math.abs(x.position-r.position)<=3);if(targets.length){askTarget(s,r,'em-cletus-target','克莱特斯：选择3格内对抗目标，或正常主移动',targets,{},true);return true;}}
    if(p===em('doctor-dice')){const targets=active(s).filter(x=>x.id!==r.id&&x.tripped);if(targets.length){askTarget(s,r,'em-doctor','骰子医生：传送并帮助一名倒地选手？',targets,{},true);return true;}}
    if(p===em('echo')&&s.flags.fanPreviousDistance!==undefined){ask(s,r,'em-echo',`回声：按上一选手实际主移动${s.flags.fanPreviousDistance}格移动？`,yesNo,{distance:s.flags.fanPreviousDistance},true);return true;}
    if(p===em('moneybags')&&owner(s,r).score>0){ask(s,r,'em-moneybags','钱袋先生：支付1积分选择1～8格代替主骰？',[...Array.from({length:8},(_,i)=>({id:String(i+1),label:`支付1分，移动${i+1}格`})),{id:'skip',label:'正常掷骰'}],{},true);return true;}
    if(p===em('marksman')){const targets=active(s).filter(x=>x.id!==r.id&&Math.abs(x.position-r.position)>3&&x.position>0);if(targets.length){askTarget(s,r,'em-marksman','神射手：选择3格之外的目标',targets,{},true);return true;}}
  }
  return false;
}
function fanFinalRoll(s:GameState,r:Racer,face:number,tasks:Work[]):boolean{
  // Scout warps before any main movement, then resumes this exact final face.
  if(hasPower(s,r,em('scout'))&&!r.flags.scoutFinal){r.flags.scoutFinal=true;ask(s,r,'em-scout','童子军：主骰确定，可先传送1格',[{id:'forward',label:'向前传送1格'},{id:'back',label:'向后传送1格'},{id:'skip',label:'不传送'}],{face},true);return true;}
  if(hasPower(s,r,em('lazy-bones'))){
    if(face===6){usePower(s,r,[emStep(r,'lazy-six')],em('lazy-bones'));return true;}
    if(!r.flags.lazyUnlocked){log(s,'skip',`${name(r)}尚未掷到6，留在起点`,{source:r.id,cause:em('lazy-bones')});return true;}
  }
  if(hasPower(s,r,em('school-bully'))&&face===3)tasks.push({kind:'ability',racerId:r.id,power:em('school-bully'),effects:active(s).filter(x=>x.id!==r.id).map(x=>({kind:'trip',racerId:x.id,source:r.id,bullySource:r.id}))});
  if(hasPower(s,r,em('terrible-toddler'))&&face<=2)tasks.push({kind:'ability',racerId:r.id,power:em('terrible-toddler'),effects:[emStep(r,'toddler-prompt')]});
  return false;
}
function fanDistance(s:GameState,r:Racer,distance:number,base:number,effects:Work[]):number{
  const done=(id:string)=>effects.push({kind:'powerDone',racerId:r.id,power:em(id)});
  if(hasPower(s,r,em('oddball'))&&r.flags.mainRolled){distance+=base%2?3:-2;done('oddball');}
  if(hasPower(s,r,em('silly-goose'))&&r.flags.mainRolled){distance+=[0,-3,0,2,5,7,10][base]!-base;done('silly-goose');}
  if(hasPower(s,r,em('gingy'))){const n=4-Number(r.flags.gingyLives??4);distance+=n;if(n)done('gingy');}
  if(hasPower(s,r,em('snub'))){const n=Number(r.flags.snubBonus??(s.flags.fanDraftOrder as Record<string,number>|undefined)?.[r.characterId]??0);distance+=n;if(n)done('snub');}
  if(hasPower(s,r,em('dom-and-gary'))&&r.flags.domCaught){distance+=2;done('dom-and-gary');}
  if(hasPower(s,r,em('doctor-dice'))&&r.flags.doctorBonus){distance+=Number(r.flags.doctorBonus);r.flags.doctorBonus=0;done('doctor-dice');}
  for(const glue of powers(s,em('gluebert')).filter(x=>x.id!==r.id&&x.position===r.position)){distance-=2;effects.push({kind:'powerDone',racerId:glue.id,power:em('gluebert')});}
  distance-=Number(r.flags.fanTax??0);r.flags.fanTax=0;
  if(hasPower(s,r,em('doc-paradox'))){distance=-(distance+Number(r.flags.paradoxBonus??0));done('doc-paradox');}
  return distance;
}
function fanChoice(s:GameState,r:Racer,c:PendingChoice,id:string):boolean{
  const ctx=c.context as Record<string,any>;
  if(c.kind==='em-fox'){
    const pending=ctx.task as Work,source=racer(s,String(ctx.sourceId));
    if(id==='block'&&live(r)&&hasPower(s,r,em('mr-fox'))&&Number(r.flags.foxUsed??0)<3&&source&&live(source)){
      r.flags.foxUsed=Number(r.flags.foxUsed??0)+1;pending.reactionBlocked=[...(pending.reactionBlocked??[]),ctx.key];
      log(s,'block',`${owner(s,r).name}的${name(r)}阻止${name(source)}本次「${character(ctx.power)?.nameZh??ctx.power}」（本场剩余${3-Number(r.flags.foxUsed)}次）`,{source:r.id,targets:[source.id],cause:em('mr-fox')});
      pending.reactionChecked=[...(pending.reactionChecked??[]),ctx.key];push(s,pending,{kind:'powerDone',racerId:r.id,power:em('mr-fox')});
    }else{pending.reactionAsked=[...(pending.reactionAsked??[]),`${ctx.key}:${r.id}`];push(s,pending);}return true;
  }
  if(c.kind==='em-heads'){const t=ctx.task as Work;t.heldFace=id==='flip'?7-Number(t.heldFace):t.heldFace;if(id==='flip')usePower(s,r,[t],em('heads'),[{...t,heldFace:7-Number(t.heldFace)}]);else push(s,t);return true;}
  if(c.kind==='em-cletus-target'){
    if(id==='skip'){push(s,{kind:'mainReady',racerId:r.id});return true;}const target=racer(s,id);if(!target||!live(target)||Math.abs(target.position-r.position)>3)throw Error('对抗对象已不在3格范围内');
    usePower(s,r,[emStep(r,'cletus-prompt',{targetId:id})],em('cletus'),[{kind:'mainReady',racerId:r.id}]);return true;
  }
  if(c.kind==='em-cletus-roll'){const source=racer(s,String(ctx.sourceId)),target=racer(s,String(ctx.targetId));if(!source||!target||!live(source)||!live(target)){log(s,'cancel','对抗目标已失效，取消本次对抗');return true;}push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:'em-cletus',faces:[],context:ctx});return true;}
  if(c.kind==='em-gift-roll'||c.kind==='em-honey-roll'||c.kind==='em-toddler-roll'||c.kind==='em-bully-recover'||c.kind==='em-marksman-roll'){push(s,{kind:'rollBatch',racerId:r.id,count:1,purpose:c.kind,faces:[],context:ctx});return true;}
  if(c.kind==='em-doctor'){
    if(id!=='skip'){const target=racer(s,id);if(!target||!live(target)||!target.tripped)throw Error('选手已不再倒地');usePower(s,r,[emStep(r,'doctor',{targetId:id}),{kind:'mainReady',racerId:r.id}],em('doctor-dice'),[{kind:'mainReady',racerId:r.id}]);}else push(s,{kind:'mainReady',racerId:r.id});return true;
  }
  if(c.kind==='em-echo'){if(id==='use')usePower(s,r,[{kind:'mainMove',racerId:r.id,base:Number(ctx.distance)}],em('echo'),[{kind:'mainReady',racerId:r.id}]);else push(s,{kind:'mainReady',racerId:r.id});return true;}
  if(c.kind==='em-moneybags'){if(id==='skip')push(s,{kind:'mainReady',racerId:r.id});else{if(owner(s,r).score<1)throw Error('积分不足');points(s,r,-1,'钱袋主移动费用');usePower(s,r,[{kind:'mainMove',racerId:r.id,base:Number(id)}],em('moneybags'),[{kind:'mainReady',racerId:r.id}]);}return true;}
  if(c.kind==='em-scout'){if(id==='skip')push(s,{kind:'finalRoll',racerId:r.id,face:ctx.face});else usePower(s,r,[{kind:'warp',racerId:r.id,position:r.position+(id==='forward'?1:-1),cause:em('scout')},{kind:'finalRoll',racerId:r.id,face:ctx.face}],em('scout'),[{kind:'finalRoll',racerId:r.id,face:ctx.face}]);return true;}
  if(c.kind==='em-witch-self'){
    const own=Number(id),remaining=Number(ctx.distance)-own;if(!remaining){r.flags.witchAllocated=true;usePower(s,r,[{kind:'move',racerId:r.id,distance:own,cause:'main'},...(ctx.effects??[])],em('witch-hazel'));}else askTarget(s,r,'em-witch-target',`女巫：选一名后退${remaining}格的选手`,active(s).filter(x=>x.id!==r.id),{own,remaining,effects:ctx.effects});return true;
  }
  if(c.kind==='em-witch-target'){const target=racer(s,id);if(!target||!live(target)||target.id===r.id)throw Error('女巫目标已失效');r.flags.witchAllocated=true;usePower(s,r,[{kind:'move',racerId:r.id,distance:Number(ctx.own),cause:'main'},{kind:'move',racerId:target.id,distance:-Number(ctx.remaining),cause:em('witch-hazel')},...(ctx.effects??[])],em('witch-hazel'));return true;}
  if(c.kind==='em-mark'){r.flags.fanMark=Number(id);log(s,'mark',`${name(r)}标记第${id}格`,{source:r.id,cause:ctx.power});return true;}
  if(c.kind==='em-bet-target'){ask(s,r,'em-bet-amount','蛇眼：选择下注积分',Array.from({length:owner(s,r).score+1},(_,i)=>({id:String(i),label:`下注${i}分`})),{targetId:id});return true;}
  if(c.kind==='em-bet-amount'){r.flags.fanBet={targetId:ctx.targetId,amount:Number(id)};log(s,'bet',`${name(r)}下注${id}分，预测${name(racer(s,ctx.targetId)!)}夺冠`,{source:r.id,targets:[ctx.targetId],cause:em('snake-eyes')});return true;}
  if(c.kind==='em-thief'){((s.flags.fanSecrets??={}) as Record<string,string>)[r.id]=id;log(s,'secret','盗贼已秘密指定目标',{source:r.id,cause:em('thief')});return true;}
  if(c.kind==='em-reshuffle'){if(id==='use')usePower(s,r,[emStep(r,'shuffle')],em('shuffler'));return true;}
  if(c.kind==='em-marksman'){if(id==='skip'){push(s,{kind:'mainReady',racerId:r.id});return true;}const target=racer(s,id);if(!target||!live(target)||Math.abs(target.position-r.position)<=3)throw Error('射击目标已不在3格之外');usePower(s,r,[emStep(r,'marksman-prompt',{targetId:target.id,space:target.position,total:0}),{kind:'mainReady',racerId:r.id}],em('marksman'),[{kind:'mainReady',racerId:r.id}]);return true;}
  if(c.kind==='em-whisper'){usePower(s,r,[{kind:'move',racerId:r.id,distance:Number(id)-r.position,cause:em('whisper')}],em('whisper'));return true;}
  return false;
}
function fanTask(s:GameState,r:Racer,t:Work){
  const target=racer(s,String(t.targetId??''));
  if(t.step==='extra-turn'){r.flags.extraTurn=true;}
  if(t.step==='recover'){r.tripped=false;delete r.flags.bullySource;log(s,'recover',`${name(r)}立即起身`,{source:r.id,cause:em('pooh')});}
  if(t.step==='tax')r.flags.fanTax=Number(r.flags.fanTax??0)+1;
  if(t.step==='cletus-prompt'&&target&&live(target))ask(s,r,'em-cletus-roll',`${name(r)}向${owner(s,target).name}的${name(target)}发起对抗：请先掷骰`,[{id:'roll',label:'掷对抗骰'}],{sourceId:r.id,targetId:target.id});
  if(t.step==='doctor'&&target&&live(target)&&target.tripped){target.tripped=false;delete target.flags.bullySource;if(target.position<r.position)r.flags.doctorBonus=2;log(s,'recover',`${name(r)}帮助${name(target)}起身`,{source:r.id,targets:[target.id],cause:em('doctor-dice')});push(s,{kind:'warp',racerId:r.id,position:target.position,cause:em('doctor-dice')});}
  if(t.step==='gift-prompt'&&target&&live(target))ask(s,target,'em-gift-roll',`${owner(s,target).name}的${name(target)}：请掷圣尼克送礼骰（1～3后退1，4～6前进2）`,[{id:'roll',label:'掷送礼骰'}],{sourceId:r.id,targetId:target.id});
  if(t.step==='honey-prompt'&&target&&live(target)&&Number(s.flags.honeyPot??0)>0)ask(s,target,'em-honey-roll',`${name(target)}停上蜜罐格，掷骰领取积分（余额${s.flags.honeyPot}）`,[{id:'roll',label:'掷蜜罐领取骰'}],{sourceId:r.id,targetId:target.id});
  if(t.step==='toddler-prompt')ask(s,r,'em-toddler-roll','可怕幼童：请掷技能范围骰，范围内所有选手（包含自己）倒地',[{id:'roll',label:'掷范围骰'}],{});
  if(t.step==='lazy-six'){r.flags.lazyUnlocked=true;r.flags.extraTurn=true;const leads=extremeTargets(s,true).filter(x=>x.id!==r.id);const pos=leads[0]?.position??r.position;push(s,{kind:'warp',racerId:r.id,position:pos,cause:em('lazy-bones')});}
  if(t.step==='gingy-hit'){r.flags.gingyLives=Number(r.flags.gingyLives??4)-1;log(s,'resource',`${name(r)}失去1生命，剩${r.flags.gingyLives}；主移动增加1`,{source:r.id,cause:em('gingy')});if(Number(r.flags.gingyLives)<=0)eliminate(s,r.id,String(t.sourceId));}
  if(t.step==='paradox-reset'){r.flags.paradoxBonus=Number(r.flags.paradoxBonus??0)+3;push(s,{kind:'warp',racerId:r.id,position:TRACKS[s.track].finish,cause:em('doc-paradox'),paradoxReset:true});}
  if(t.step==='dom-catch'&&target&&live(target)){r.flags.domCaught=true;eliminate(s,target.id,r.id);}
  if(t.step==='robin-transfer'&&target&&live(target)){
    const recipient=extremeTargets(s,false).find(x=>x.id!==target.id);if(recipient&&owner(s,target).score>0){points(s,target,-1,'罗宾汉转出');points(s,recipient,1,'罗宾汉资助');}push(s,{kind:'move',racerId:r.id,distance:2,cause:em('robin-hood')});
  }
  if(t.step==='whisper'){
    const occupied=new Set(active(s).filter(x=>x.id!==r.id).map(x=>x.position));let options:number[]=[];
    for(let n=1;n<=TRACKS[s.track].finish+1;n++){const candidates=t.forward?[r.position+n]:[r.position-n,r.position+n];options=candidates.filter(x=>x>=0&&x<=TRACKS[s.track].finish&&!occupied.has(x));if(options.length)break;}
    if(options.length===1)usePower(s,r,[{kind:'move',racerId:r.id,distance:options[0]!-r.position,cause:em('whisper')}],em('whisper'));else if(options.length)ask(s,r,'em-whisper','低语：选择等距最近空格',options.map(x=>({id:String(x),label:`第${x}格`})),{});
  }
  if(t.step==='marksman-prompt'&&target&&live(target))ask(s,r,'em-marksman-roll',`神射手：累计${t.total}，目标第${t.space}格，请继续掷骰`,[{id:'roll',label:'掷射击骰'}],{targetId:target.id,space:t.space,total:t.total});
  if(t.step==='shuffle'){
    const all=order(s).filter(x=>!x.flags.gary),cards=shuffle(s,all.map(x=>x.characterId));for(let i=0;i<all.length;i++){const model=cards[i]!;all[i]!.flags.power=model;all[i]!.flags.powerSourceCard=model;all[i]!.flags.powerVia=em('shuffler');delete all[i]!.flags.copiedFrom;}
    acquirePower(r,em('shuffler'),{sourceCardId:em('shuffler'),via:em('shuffler')});
    log(s,'shuffle',`洗牌师重新分配能力：${all.map((x,i)=>`${name(x)}获得${character(cards[i]!)?.nameZh??cards[i]}`).join('，')}`,{source:r.id,cause:em('shuffler')});push(s,{kind:'refreshCopies'});
  }
}
function fanRollResult(s:GameState,r:Racer,t:Work,faces:number[],ctx:Record<string,any>){
  const face=faces.at(-1)!,source=racer(s,String(ctx.sourceId??'')),target=racer(s,String(ctx.targetId??''));
  const rollLabels:Record<string,{label:string;power:string}>={
    'em-broken-clock':{label:'坏时钟主移动双骰',power:em('broken-clock')},'em-cletus':{label:'克莱特斯对抗骰',power:em('cletus')},'em-gift-roll':{label:'圣尼克送礼骰',power:em('saint-nick')},'em-honey-roll':{label:'蜜罐领取骰',power:em('honey-pot')},'em-toddler-roll':{label:'可怕幼童范围骰',power:em('terrible-toddler')},'em-bully-recover':{label:'校园恶霸恢复骰',power:em('school-bully')},'em-marksman-roll':{label:'神射手射击骰',power:em('marksman')},
  };const rollInfo=rollLabels[String(t.purpose)];
  // Contest dice stay private until both controllers have rolled, just as the
  // established Duelist window; public triggered side effects remain public.
  if(t.purpose!=='em-cletus'||ctx.firstFace!==undefined)log(s,'ability-dice',`${owner(s,r).name}的${name(r)}掷出${faces.join('、')}（${rollInfo?.label??t.purpose}）`,{source:r.id,faces,cause:rollInfo?.power??String(t.purpose),rollKind:t.purpose==='em-cletus'?'contest':t.purpose==='em-broken-clock'?'main':t.purpose==='em-bully-recover'?'recovery':'ability'});
  if(t.purpose==='em-broken-clock'){r.flags.mainRolled=true;const value=faces[0]===faces[1]?faces[0]!+faces[1]!:Math.min(...faces);r.flags.fanBase=value;push(s,{kind:'powerDone',racerId:r.id,power:em('broken-clock')});rerollWindow(s,r,Math.min(...faces));return;}
  if(t.purpose==='em-cletus'&&source&&target&&live(source)&&live(target)){
    if(ctx.firstFace===undefined){ask(s,target,'em-cletus-roll',`${owner(s,target).name}的${name(target)}：对手已投掷，结果暂存，请掷对抗骰后一起揭晓`,[{id:'roll',label:'掷对抗骰'}],{...ctx,firstFace:face});return;}
    const first=Number(ctx.firstFace);log(s,'contest',`克莱特斯对抗：${owner(s,source).name}的${name(source)} ${first} : ${face} ${owner(s,target).name}的${name(target)}；${first===face?'同点，目标淘汰':first>face?'克莱特斯胜，重新进行正常主移动':'目标胜，目标前进1格'}`,{source:source.id,targets:[target.id],faces:[first,face],cause:em('cletus'),rollKind:'contest'});
    if(first===face)eliminate(s,target.id,source.id);else if(first>face)push(s,{kind:'mainReady',racerId:source.id});else push(s,{kind:'move',racerId:target.id,distance:1,cause:em('cletus')});return;
  }
  if(t.purpose==='em-gift-roll'&&source&&target&&live(target)){push(s,{kind:'move',racerId:target.id,distance:face<=3?-1:2,cause:em('saint-nick')});return;}
  if(t.purpose==='em-honey-roll'&&source&&target&&live(target)){const value=Math.min(face,Number(s.flags.honeyPot??0));s.flags.honeyPot=Number(s.flags.honeyPot??0)-value;points(s,target,value,'蜜罐领取');push(s,{kind:'move',racerId:source.id,distance:value,cause:em('honey-pot')});return;}
  if(t.purpose==='em-toddler-roll'){push(s,...order(s,active(s).filter(x=>Math.abs(x.position-r.position)<=face)).map(x=>({kind:'trip',racerId:x.id,source:r.id})));return;}
  if(t.purpose==='em-bully-recover'){r.tripped=false;delete r.flags.bullySource;log(s,'recover',`${name(r)}恢复骰${face}：${face<=3?'起身并移动':'起身，跳过主移动'}`,{source:r.id,faces:[face],cause:em('school-bully')});if(face<=3){push(s,...(source&&live(source)?[{kind:'move',racerId:source.id,distance:2,cause:em('school-bully')}]:[]),{kind:'mainMove',racerId:r.id,base:face});}return;}
  if(t.purpose==='em-marksman-roll'&&target&&live(target)){const total=Number(ctx.total)+face;if(total<Number(ctx.space))push(s,emStep(r,'marksman-prompt',{...ctx,total}));else if(total===Number(ctx.space))eliminate(s,target.id,r.id);else push(s,{kind:'move',racerId:target.id,distance:1,cause:em('marksman')});return;}
}
function fanPassTasks(s:GameState,r:Racer,crossed:Racer[]):Work[]{
  const out:Work[]=[];
  if(hasPower(s,r,em('dom-and-gary'))){const g=crossed.find(x=>x.id===r.flags.garyId);if(g)out.push({kind:'ability',racerId:r.id,power:em('dom-and-gary'),effects:[emStep(r,'dom-catch',{targetId:g.id})]});}
  if(hasPower(s,r,em('robin-hood'))){const lead=extremeTargets(s,true).find(x=>crossed.some(c=>c.id===x.id));if(lead)out.push({kind:'ability',racerId:r.id,power:em('robin-hood'),effects:[emStep(r,'robin-transfer',{targetId:lead.id})]});}
  return out;
}
function fanStopTasks(s:GameState,arrivals:string[],before:Record<string,number>,motionTask:Work):Work[]{
  const out:Work[]=[];
  for(const source of order(s))for(const p of effectivePowers(s,source)){
    const shared=order(s,active(s).filter(x=>x.id!==source.id&&x.position===source.position));
    if(p===em('saint-nick')&&arrivals.includes(source.id)){const targets=shared.filter(x=>!arrivals.includes(x.id));if(targets.length)out.push({kind:'ability',racerId:source.id,power:p,effects:[{kind:'move',racerId:source.id,distance:targets.length,cause:p},...targets.map(x=>emStep(source,'gift-prompt',{targetId:x.id}))]});}
    if(p===em('gingy')&&!arrivals.includes(source.id))for(const target of shared.filter(x=>arrivals.includes(x.id)))out.push({kind:'ability',racerId:source.id,power:p,effects:[emStep(source,'gingy-hit',{sourceId:target.id})]});
    if(p===em('doc-paradox')&&shared.length&&!motionTask.paradoxReset&&(arrivals.includes(source.id)||shared.some(x=>arrivals.includes(x.id))))out.push({kind:'ability',racerId:source.id,power:p,effects:[emStep(source,'paradox-reset')]});
    if(p===em('dom-and-gary')&&shared.some(x=>x.id===source.flags.garyId))out.push({kind:'ability',racerId:source.id,power:p,effects:[emStep(source,'dom-catch',{targetId:source.flags.garyId})]});
    if(p===em('whisper')&&shared.length){if(arrivals.includes(source.id)&&shared.some(x=>!arrivals.includes(x.id)))out.push(emStep(source,'whisper',{forward:false}));else if(!arrivals.includes(source.id)&&shared.some(x=>arrivals.includes(x.id)))out.push(emStep(source,'whisper',{forward:true}));}
    if((p===em('toll-troll')||p===em('honey-pot'))&&typeof source.flags.fanMark==='number')for(const id of arrivals){const target=racer(s,id)!;if(target.position===source.flags.fanMark)out.push({kind:'ability',racerId:source.id,power:p,effects:p===em('toll-troll')?[{kind:'gain',racerId:source.id,amount:1}]:[emStep(source,'honey-prompt',{targetId:target.id})]});}
    if(p===em('totally-fair-ref')){const oldLead=Math.max(...Object.values(before)),newLead=Math.max(...active(s).map(x=>x.position));for(const target of active(s).filter(x=>x.id!==source.id&&x.position===newLead&&Number(before[x.id])<oldLead))out.push({kind:'ability',racerId:source.id,power:p,effects:[{kind:'trip',racerId:target.id,source:source.id}]});}
    if(p===em('robin-hood')&&shared.length&&(arrivals.includes(source.id)||shared.some(x=>arrivals.includes(x.id)))){const lead=extremeTargets(s,true).find(x=>x.id!==source.id&&x.position===source.position);if(lead)out.push({kind:'ability',racerId:source.id,power:p,effects:[emStep(source,'robin-transfer',{targetId:lead.id})]});}
  }
  return out;
}
function fanPowerDone(s:GameState,t:Work){
  if(t.power===em('pooh'))return;
  s.flags.fanTurnPowerCount=Number(s.flags.fanTurnPowerCount??0)+1;
  if(Number(s.flags.fanTurnPowerCount)>=2)for(const pooh of powers(s,em('pooh')).toReversed())push(s,{kind:'ability',racerId:pooh.id,power:em('pooh'),effects:[{kind:'move',racerId:pooh.id,distance:1,cause:em('pooh')}]});
}
function fanRaceEnd(s:GameState,draw:boolean){
  if(s.flags.fanEndRound===s.round)return;s.flags.fanEndRound=s.round;
  for(const r of s.racers){
    const bet=r.flags.fanBet as {targetId:string;amount:number}|undefined;if(bet&&hasPower(s,r,em('snake-eyes'))){const won=!draw&&currentPlacements(s).some(x=>x.racerId===bet.targetId&&x.rank===1);points(s,r,won?bet.amount*3:-bet.amount,`蛇眼下注${won?'猜中':'未猜中'}`);}
  }
  const secrets=s.flags.fanSecrets as Record<string,string>|undefined,income=s.flags.fanIncome as Record<string,number>|undefined;
  for(const thief of s.racers.filter(x=>hasPower(s,x,em('thief')))){
    const target=racer(s,secrets?.[thief.id]??'');if(!target)continue;const value=Math.min(owner(s,target).score,Number(income?.[target.id]??0));
    log(s,'secret-reveal',`${name(thief)}公开目标${name(target)}，偷取本场收入${value}积分`,{source:thief.id,targets:[target.id],cause:em('thief')});if(target.playerId!==thief.playerId){points(s,target,-value,'盗贼转出');points(s,thief,value,'盗贼窃取');}
  }
  delete s.flags.fanSecrets;
}
/** Only bookkeeping fields are omitted. Scores, owners, resources, powers and
 * the continuation remain in the signature, so progressing chains never stop. */
function resolutionSignature(s:GameState):string{
  const flags={...s.flags};for(const key of ['choiceSeq','motionSeq','loopSeen','forcedCycleTrace','resolutionSeen','resolutionSeenScores','resolutionSuppressed','continuation','resolutionDiagnostic'])delete flags[key];
  if(Number(flags.fanTurnPowerCount)>=2)flags.fanTurnPowerCount=2;
  return JSON.stringify({players:s.players.map(p=>({id:p.id,score:p.score,hand:p.hand,used:p.used,selection:p.selection})),racers:s.racers.map(r=>({...r,flags:semanticRacerFlags(s,r)})),phase:s.phase,round:s.round,turn:s.turn,current:s.currentRacerId,baseTurnOrder:s.baseTurnOrder,deck:s.deck,discard:s.discard,flags,next:s.queue[0],random:[s.rngState,s.randomStream]},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
}

/** Reaction windows belong to one persisted activation, not to a character name
 * or an action request. A second independent activation gets another window. */
function reactionActivations(s:GameState,t:Work):{racerId:string;power:string}[]{
  const r=racer(s,String(t.racerId??'')),result:{racerId:string;power:string}[]=[];
  const add=(source:Racer,power:string)=>{if(power!==em('mr-fox')&&!result.some(x=>x.racerId===source.id&&x.power===power))result.push({racerId:source.id,power});};
  if(!r)return result;
  if(t.kind==='activate'){add(r,String(t.power));return result;}
  const directWindows:Record<string,string[]>={
    beforeRacePower:['sisyphus','egg','twin','hog-knight','nepo-baby','soulmate','understudy',em('doc-paradox'),em('dom-and-gary'),em('honey-pot'),em('toll-troll'),em('snake-eyes'),em('thief'),'leaf-loan-shark','leaf-filmmaker'],
    turnStartOne:['speed-demon','spoilsport','mastermind'],
    swEndTurn:['hopfrog','switcharoo'],
    swRollEffect:['bite-mark','icarus','mush'],
  };
  if(directWindows[t.kind]?.includes(String(t.power))){
    // Probe only a clone to skip no-op dispatches. No probe result, die, hidden
    // choice or future state is published or committed before the response.
    const probe=structuredClone(s);const before=JSON.stringify({racers:probe.racers,players:probe.players,pending:probe.pending,logs:probe.logs});rawTask(probe,{...t});
    if(before!==JSON.stringify({racers:probe.racers,players:probe.players,pending:probe.pending,logs:probe.logs}))add(r,String(t.power));
    return result;
  }
  if(t.kind==='mainMove'){
    for(const source of order(s))for(const p of effectivePowers(s,source)){
      if(source.id===r.id){
        const always=['blimp','hare','gloth','icarus',em('doc-paradox'),'leaf-crash-dummy','leaf-lonely-wolf'];
        const enabled=always.includes(p)||p==='party-animal'&&active(s).some(x=>x.id!==r.id&&x.position===r.position)||p==='blunderdog'&&Boolean(r.flags.mainRolled)||p==='penguin'&&r.tripped&&Boolean(r.flags.mainRolled)||p==='overtaker'&&active(s).some(x=>x.position>r.position)||p==='speed-demon'&&owner(s,r).score>0||[em('oddball'),em('silly-goose')].includes(p)&&Boolean(r.flags.mainRolled)||p===em('gingy')&&Number(r.flags.gingyLives??4)<4||p===em('snub')&&Number(r.flags.snubBonus??0)>0||p===em('dom-and-gary')&&Boolean(r.flags.domCaught)||p===em('doctor-dice')&&Number(r.flags.doctorBonus??0)>0||p==='leaf-dark-horse'&&r.flags.leafDarkTurn===s.turnCount||p==='leaf-nepo-baby'&&s.results.some(result=>result.placements.some(place=>place.playerId===r.playerId))||p==='leaf-sole-survivor'&&Number(r.flags.leafRaceIncome??0)>0;
        if(enabled)add(source,p);
      }
      if(p==='coach'&&source.position===r.position||p==='gunk'&&source.id!==r.id&&!(s.players.length===2&&source.playerId===r.playerId)||p==='null'&&r.position>source.position||p==='stepdad'&&stepdadTarget(s,source)?.id===r.id||p===em('gluebert')&&source.id!==r.id&&source.position===r.position)add(source,p);
    }
  }
  if(t.kind==='mainReady'&&!r.tripped){for(const p of ['leaf-thespian'])if(hasPower(s,r,p)&&(r.flags.leafBorrowTurns as Record<string,number>|undefined)?.[p]!==s.turnCount&&(!r.flags.leafBorrowTurns?r.flags.leafBorrowTurn!==s.turnCount:true))add(r,p);}
  if(t.kind==='rollDie'){if(r.flags.leafPhilanthropistRoll&&hasPower(s,r,'leaf-philanthropist'))add(r,'leaf-philanthropist');else if(hasPower(s,r,em('broken-clock')))add(r,em('broken-clock'));}
  if(t.kind==='trip'){if(hasPower(s,r,'leaf-catfish'))add(r,'leaf-catfish');if(hasPower(s,r,em('doctor-dice')))add(r,em('doctor-dice'));}
  if(t.kind==='rollBatch'){
    if(t.heldFace===undefined)for(const source of stunnerSources(s,r))add(source,'stunner');
    if(t.heldFace===6&&t.dieReactionsChecked)for(const source of powers(s,'party-pooper'))add(source,'party-pooper');
  }
  if(t.kind==='move'||t.kind==='warp'){
    const plans=(t.plans??[{racerId:t.racerId,distance:t.distance,position:t.position}]) as {racerId:string;distance?:number;position?:number}[];
    for(const source of order(s))for(const p of effectivePowers(s,source)){
      if(p==='huge-baby'&&plans.some(plan=>{const target=racer(s,plan.racerId);return target&&target.id!==source.id&&(plan.position??target.position+Number(plan.distance??0))===source.position;}))add(source,p);
      if(p==='leaptoad'&&t.kind==='move'&&plans.some(plan=>plan.racerId===source.id&&active(s).some(x=>x.id!==source.id&&(x.position-source.position)*Math.sign(Number(plan.distance))>0&&Math.abs(x.position-source.position)<=Math.abs(Number(plan.distance)))))add(source,p);
      if(p==='stickler'&&t.kind==='move'&&plans.some(plan=>{const target=racer(s,plan.racerId);return target&&target.id!==source.id&&target.position+Number(plan.distance??0)>TRACKS[s.track].finish;}))add(source,p);
      if(p===em('gluebert')&&t.kind==='move'&&plans.some(plan=>{const target=racer(s,plan.racerId);return target&&target.id!==source.id&&(target.position-source.position)*(target.position+Number(plan.distance??0)-source.position)<0;}))add(source,p);
    }
  }
  return result;
}
function task(s:GameState,t:Work){
  const inherited=executionBlocks.get(s);executionBlocks.set(s,new Set([...(inherited??[]),...((t.reactionBlocked??[]) as string[])]));
  try{
  const foxes=powers(s,em('mr-fox')).filter(x=>Number(x.flags.foxUsed??0)<3);
  if(foxes.length){
    const candidates=reactionActivations(s,t);
    for(const candidate of candidates){const key=`${candidate.racerId}:${candidate.power}`;if((t.reactionChecked??[]).includes(key))continue;
      const fox=foxes.find(x=>!(t.reactionAsked??[]).includes(`${key}:${x.id}`));
      if(fox){const source=racer(s,candidate.racerId)!;ask(s,fox,'em-fox',`${owner(s,fox).name}的${name(fox)}：是否阻止${owner(s,source).name}的${name(source)}本次「${character(candidate.power)?.nameZh??candidate.power}」？剩${3-Number(fox.flags.foxUsed??0)}次`,[{id:'block',label:'消耗1次，阻止技能'},{id:'allow',label:'允许结算'}],{task:t,sourceId:source.id,power:candidate.power,key},true);return;}
      t.reactionChecked=[...(t.reactionChecked??[]),key];
    }
  }
  const blocked=new Set<string>((t.reactionBlocked??[]) as string[]);
  if(t.kind==='rollDie'&&blocked.has(`${t.racerId}:leaf-philanthropist`)){const source=racer(s,String(t.racerId));if(source)delete source.flags.leafPhilanthropistRoll;}
  if(t.kind==='mainReady'){const source=racer(s,String(t.racerId));if(source)for(const power of ['leaf-thespian','leaf-filmmaker'])if(blocked.has(`${t.racerId}:${power}`)){((source.flags.leafBorrowTurns??={}) as Record<string,number>)[power]=s.turnCount;source.flags.leafBorrowTurn=s.turnCount;}}
  if(t.kind==='activate'&&blocked.has(`${t.racerId}:${t.power}`)){log(s,'cancel',`${name(racer(s,String(t.racerId))!)}本次技能已被阻止，继续后续结算`,{source:String(t.racerId),cause:String(t.power)});push(s,...(t.fallback??[]));return;}
  const prior=executionBlocks.get(s);executionBlocks.set(s,new Set([...(prior??[]),...blocked]));
  try{
    rawTask(s,t);
    // Null/Fox only suppress execution; an actual loss of every owned
    // Mastermind layer cancels its prediction and never recreates a first turn.
    for(const source of s.racers)if(source.flags.prediction&&!ownedPowers(s,source).includes('mastermind'))delete source.flags.prediction;
  }finally{if(prior)executionBlocks.set(s,prior);else executionBlocks.delete(s);}
  }finally{if(inherited)executionBlocks.set(s,inherited);else executionBlocks.delete(s);}
}


const leafRules=installLeaf({name,live,racer,active,owner,order,hasPower,powers,effectivePowers,effectivePower,ask,askTarget,targetOptions,yesNo,usePower,push,log,points,shuffle,drawUnchosen,acquirePower,preparePowerGrant});

/** These absolute counters are read only by equality with the current turn.
 * Normalize their meaning, so new display/turn serials cannot hide a true loop. */
function semanticRacerFlags(s:GameState,r:Racer):Record<string,unknown>{
  const flags={...r.flags};for(const key of ['leafDarkTurn','leafWolfTurn','leafBorrowTurn','leafPhilanthropistTurn','leafToucanTurn','leafCarAskedTurn','leafCarBonusTurn'])if(typeof flags[key]==='number')flags[key]=flags[key]===s.turnCount?'this-turn':'another-turn';
  if(flags.leafBorrowTurns&&typeof flags.leafBorrowTurns==='object')flags.leafBorrowTurns=Object.fromEntries(Object.entries(flags.leafBorrowTurns).map(([source,turn])=>[source,turn===s.turnCount?'this-turn':'another-turn']));
  if(Array.isArray(flags.leafGiftDice))flags.leafGiftDice=flags.leafGiftDice.map(gift=>{const {id:_id,...rule}=gift as Record<string,unknown>;return rule;});
  return flags;
}
