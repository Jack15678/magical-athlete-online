import { TRACKS } from '../shared/tracks.js';
import type { GameAction, Racer, RoomView } from '../shared/types.js';

// Only a projected player view crosses this boundary: no deck, random state,
// future die, private task context, or other player's hidden hand is available.
const strength:Record<string,number>={legs:10,hare:8,blimp:8,'lovable-loser':7,alchemist:7,'rocket-scientist':7,magician:7,'party-animal':6,coach:6,'flip-flop':6,genius:5,hypnotist:5,'third-wheel':5,cheerleader:5,suckerfish:5,sisyphus:3};
const value=(id:string)=>strength[id]??4;
const active=(r:Racer)=>!r.finished&&!r.eliminated;
export function decideAI(view:RoomView):GameAction|undefined {
  const self=view.players.find(p=>p.id===view.selfId);if(!self)return;
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
      case 'legs':case 'alchemist':case 'cheerleader':case 'suckerfish': if(has('use'))pick='use';break;
      case 'rocket-scientist':if(has('use')&&(view.lastRoll?.face??0)>=3)pick='use';break;
      case 'genius':pick=has('4')?'4':pick;break;
      case 'reroll':if((view.lastRoll?.face??6)<=3&&has('reroll'))pick='reroll';break;
      case 'flip-flop':{const target=others.sort((a,b)=>b.position-a.position)[0];if(target&&r&&target.position>r.position+3)pick=target.id;break;}
      case 'hypnotist':{const target=others.sort((a,b)=>b.position-a.position)[0];if(target&&r&&target.position>r.position)pick=target.id;break;}
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
