import { applyGameAction, createGame, startGame, systemAction } from '../src/engine/index.js';
import { decideAI } from '../src/engine/ai.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { CharacterPool, Player, Room } from '../src/shared/types.js';
const results={finished:0,paused:[] as unknown[],limits:[] as unknown[],failures:[] as unknown[],maxActions:0};
for(const pool of ['second-wind','mixed'] as CharacterPool[])for(const count of [2,3,8])for(let seed=1;seed<=30;seed++){
  const players:Player[]=Array.from({length:count},(_,seat)=>({id:`p${seat}`,name:`P${seat}`,seat,isAI:true,color:'#000',connected:true,ready:true,score:0,hand:[],used:[],selection:[]}));
  const game=createGame(players,seed,'multiplayer',pool);startGame(game);const room:Room={code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:count,timeoutSeconds:0,deadline:null,game};let i=0;
  try{
    for(;i<3000&&game.phase!=='finished'&&game.phase!=='paused';i++){
      const system=systemAction(game);
      const playerId=system?.playerId??game.pending?.playerId??(game.phase==='draft'?game.draft!.order[game.draft!.cursor]!:game.phase==='selection'?game.players.find(p=>!p.selection.length)!.id:game.phase==='results'?'p0':game.racers.find(r=>r.id===game.currentRacerId)!.playerId);
      const action=system?.action??decideAI(projectRoom(room,playerId,{authorityId:'p0',authorityOnline:true}));
      if(!action)throw Error('no legal public AI action');applyGameAction(game,playerId,action);room.version++;
    }
    if(game.phase==='finished'){results.finished++;results.maxActions=Math.max(results.maxActions,i);}
    else if(game.phase==='paused')results.paused.push({pool,count,seed,round:game.round,hold:game.flags.ruleHold});
    else results.limits.push({pool,count,seed,round:game.round,racers:game.racers.map(r=>({card:r.characterId,pos:r.position,eliminated:r.eliminated,finished:r.finished})),pending:game.pending?.kind});
  }catch(error){results.failures.push({pool,count,seed,error:String(error),phase:game.phase,round:game.round,pending:game.pending?.kind});}
}
console.log(JSON.stringify(results,null,2));
if(results.failures.length)process.exitCode=1;
