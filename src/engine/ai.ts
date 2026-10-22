import { TRACKS } from '../shared/tracks.js';
import type { GameAction, Racer, RoomView } from '../shared/types.js';

// Only a projected player view crosses this boundary: no deck, random state,
// future die, private task context, or other player's hidden hand is available.
const strength:Record<string,number>={legs:10,hare:8,blimp:8,'lovable-loser':7,alchemist:7,'rocket-scientist':7,magician:7,'party-animal':6,coach:6,'flip-flop':6,genius:5,hypnotist:5,'third-wheel':5,cheerleader:5,suckerfish:5,sisyphus:3};
const value=(id:string)=>strength[id]??4;
const active=(r:Racer)=>!r.finished&&!r.eliminated;
/** This projection already accounts for Null and public copied powers. Never
 * inspect authoritative state or a private deck to predict an AI hazard. */
function publicPowers(r:Racer):string[]{
  const state=r.flags.publicAbilities as {powers?:unknown}|undefined;
  if(Array.isArray(state?.powers))return state.powers.filter((power):power is string=>typeof power==='string');
  return [...new Set([String(r.flags.power??r.flags.copiedPower??r.characterId),...((r.flags.acquiredPowers??[]) as string[])])];
}

/** A reproducible public-only seed varies secret/guess decisions without reading
 * another player's choice, the private queue, or the authoritative RNG state. */
function publicChoice(view: RoomView, salt: string, count: number): number {
  let seed = 2166136261;
  for (const char of `${view.code}:${view.selfId}:${view.version}:${view.logs.at(-1)?.id ?? 0}:${salt}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return count ? seed % count : 0;
}
function repeatedFollow(view:RoomView,r:Racer):boolean {
  // A copied Fish can repeatedly carry a Scoocher onto the same backward arrow.
  // Recognize the repeated public journey, without inspecting the pending
  // motion, private continuation queue or the next die. A new turn/reveal
  // starts a fresh decision window so ordinary later journeys remain useful.
  const boundary=view.logs.findLastIndex(e=>['turn','reveal','phase'].includes(e.type));
  const companions=new Set(view.racers.filter(x=>x.id!==r.id&&active(x)&&x.position===r.position).map(x=>x.id));
  const journeys=view.logs.slice(boundary+1).filter(e=>e.type==='move'&&e.targets?.some(id=>id===r.id||companions.has(id)));
  const last=journeys.at(-1);if(!last)return false;
  return journeys.slice(0,-1).some(e=>e.source===last.source&&e.cause===last.cause&&JSON.stringify(e.targets)===JSON.stringify(last.targets)&&JSON.stringify(e.before)===JSON.stringify(last.before)&&JSON.stringify(e.after)===JSON.stringify(last.after));
}
function repeatedTrip(view:RoomView,r:Racer,target:Racer):boolean {
  // Reconstruct only public positions back to this racer's earlier trip. If
  // the same target was tripped on this exact board and nobody made progress,
  // let an AI decline the optional repeat. This never changes a human choice
  // or declares a rules draw; fresh movement and phase changes reset the hint.
  const now=new Map(view.racers.map(item=>[item.id,item.position])),positions=new Map(now);
  for(let i=view.logs.length-1;i>=0;i--){
    const event=view.logs[i]!;if(['phase','reveal','finish','eliminate','cycle-draw'].includes(event.type))break;
    if(event.type==='trip'&&event.source===r.id&&event.targets?.includes(target.id)&&view.logs[i-1]?.cause==='kingtripper'&&[...now].every(([id,position])=>positions.get(id)===position))return true;
    if(['move','warp','place'].includes(event.type)&&event.before&&event.targets)event.targets.forEach((id,index)=>{const before=event.before?.[index];if(before!==undefined)positions.set(id,before);});
  }
  return false;
}
export function decideAI(view:RoomView):GameAction|undefined {
  const self=view.players.find(p=>p.id===view.selfId);if(!self)return;
  if(view.mode==='practice'&&view.phase==='draft'&&view.draft){const cards=[...view.draft.market].sort((a,b)=>value(b)-value(a)||a.localeCompare(b));return{type:'practice-team',characterIds:cards.slice(0,4)};}
  if(view.phase==='draft'&&view.draft?.order[view.draft.cursor]===self.id){const best=[...view.draft.market].sort((a,b)=>value(b)-value(a)||a.localeCompare(b))[0];if(best)return{type:'draft',characterId:best};}
  if(view.phase==='selection'&&!self.selected){const n=view.players.length===2?2:1;const hand=[...(self.hand??[])].sort((a,b)=>value(b)-value(a)||a.localeCompare(b));if(hand.length>=n)return{type:'select',characterIds:hand.slice(0,n)};}
  if(view.phase==='results'&&view.hostId===self.id)return{type:'next'};
  if(view.phase!=='race')return;
  const c=view.pending,r=view.racers.find(r=>r.id===(c?.racerId??view.currentRacerId));
  if(c){
    if(c.playerId!==self.id)return;
    const available=c.options.map(o=>o.id),has=(id:string)=>available.includes(id);
    let pick=has('skip')?'skip':has('keep')?'keep':available[0];
    const targets=available.map(id=>view.racers.find(r=>r.id===id)).filter((r):r is Racer=>!!r&&active(r));
    const others=targets.filter(t=>t.playerId!==self.id);
    switch(c.kind){
      case 'wurstii-burt': pick=available[publicChoice(view,c.kind,available.length)];break;
      case 'wurstii-pitfall-harry':if(has('use'))pick='use';break;
      case 'wurstii-bart-simpson':case 'wurstii-lakitu':case 'wurstii-dr-wily':{const target=(others.length?others:targets).toSorted((a,b)=>b.position-a.position||value(b.characterId)-value(a.characterId))[0];if(target)pick=target.id;break;}
      case 'cheatah': case 'cheatah-guess': pick = available[publicChoice(view, c.kind, available.length)]; break;
      case 'mr-dice-pick': pick = available.toSorted((a,b) => Number(b)-Number(a))[0]; break;
      case 'show-off': if (has('stop')) pick = 'stop'; break;
      case 'mole': if (has('use')) pick = 'use'; break;
      case 'critic': if (has('use') && (view.lastRoll?.face ?? 0) >= 4) pick = 'use'; break;
      case 'nemesis': if (has('use')) pick = 'use'; break;
      case 'tail': if (has('use')) pick = 'use'; break;
      case 'diva': {const target = targets.filter(t => t.id !== r?.id).sort((a,b) => (r && r.position >= a.position ? a.position-b.position : b.position-a.position))[0]; if(target)pick=target.id; break;}
      case 'understudy': case 'soulmate': {const target = others.toSorted((a,b)=>value(b.characterId)-value(a.characterId))[0]; if(target)pick=target.id;break;}
      case 'kingtripper': {const target=others.toSorted((a,b)=>b.position-a.position)[0];if(target&&!(r&&has('skip')&&repeatedTrip(view,r,target)))pick=target.id;break;}
      case 'magical-last': {const target=targets.find(t=>t.playerId===self.id)??targets[0];if(target)pick=target.id;break;}
      case 'magical-lead': case 'magical-warp': {const target=others.toSorted((a,b)=>b.position-a.position)[0];if(target)pick=target.id;break;}
      case 'switcharoo': {const target=others.toSorted((a,b)=>value(b.characterId)-value(a.characterId))[0];if(target&&r&&value(target.characterId)>value(r.characterId))pick=target.id;break;}
      case 'legs':case 'alchemist':case 'cheerleader': if(has('use'))pick='use';break;
      case 'suckerfish':if(has('use')&&r&&!repeatedFollow(view,r))pick='use';break;
      case 'rocket-scientist':if(has('use')&&(view.lastRoll?.face??0)>=3)pick='use';break;
      case 'genius':pick=has('4')?'4':pick;break;
      case 'reroll':{
        const face=view.lastRoll?.face??6;
        const exact=r?.characterId==='wurstii-diddy-kong'&&r.position+face>TRACKS[view.track].finish;
        if((face<=3||exact)&&has('reroll'))pick='reroll';break;
      }
      case 'flip-flop':{const target=others.sort((a,b)=>b.position-a.position)[0];if(target&&r&&target.position>r.position+3)pick=target.id;break;}
      case 'hypnotist':{
        // Summoning an active Baba Yaga before my main move trips me, so an AI
        // can keep voluntarily resetting the opponent forever. Decline that
        // visible hazard; humans retain every legal target and the rules never
        // mistake repeated voluntary choices for a forced cycle.
        const immune=r&&publicPowers(r).some(power=>['leaf-catfish','extra-mile-doctor-dice'].includes(power));
        const safe=others.filter(target=>immune||!publicPowers(target).includes('baba-yaga'));
        const target=safe.sort((a,b)=>b.position-a.position)[0];if(target&&r&&target.position>r.position)pick=target.id;break;
      }
      case 'third-wheel':{const positions=available.filter(x=>x!=='skip').map(Number).filter(Number.isFinite);const pos=Math.max(...positions);if(r&&pos>r.position)pick=String(pos);break;}
      case 'duelist':{
        // A public backward arrow can return both duelists to the exact square.
        // Decline that voluntary zero-progress loop rather than dueling forever.
        const landing=r?TRACKS[view.track].specials[r.position+2]:undefined;
        if(others[0]&&!(landing?.kind==='arrow'&&landing.move===-2))pick=others[0].id;break;
      }
      case 'mastermind':{const best=targets.sort((a,b)=>(b.position+value(b.characterId))-(a.position+value(a.characterId)))[0];if(best)pick=best.id;break;}
      case 'copycat':{const best=targets.sort((a,b)=>value(b.characterId)-value(a.characterId))[0];if(best)pick=best.id;break;}
      case 'egg':case 'twin':pick=available.filter(id=>id!=='skip').sort((a,b)=>value(b)-value(a)||a.localeCompare(b))[0]??pick;break;
    }
    if(pick&&has(pick))return{type:'choose',choiceId:c.id,optionId:pick};return;
  }
  if(view.turnStage==='roll'&&r?.playerId===self.id)return{type:'roll'};
}
