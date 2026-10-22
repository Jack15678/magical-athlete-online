/** Reproducible authority-only fan-pack smoke. Diagnostic states are preserved
 * locally rather than erased or converted to winners. */
import fs from 'node:fs';
import { createGame,startGame,automaticAction,applyGameAction } from '../src/engine/index.js';
import type {Player} from '../src/shared/types.js';
const summaries:unknown[]=[];fs.mkdirSync('.local/fan-replays',{recursive:true});
for(const count of [2,4,8])for(const seed of [42,20512026,20261022]){
 const players:Player[]=Array.from({length:count},(_,seat)=>({id:`p${seat}`,name:`回放${seat}`,seat,color:'#123456',ready:true,connected:true,isAI:true,score:0,hand:[],used:[],selection:[]}));
 const game=createGame(players,seed,'ai');game.config={version:'room-config-v1',characterPacks:{original:true,'second-wind':true,'extra-mile':true,'leaf-fan':true},optionalRules:[]};startGame(game);
 let steps=0;try{while(game.phase!=='finished'&&game.phase!=='paused'){if(++steps>10000)throw Error('Smoke scheduling budget exhausted');const next=automaticAction(game);if(!next)throw Error(`No legal automatic action: ${game.phase}/${game.pending?.kind}`);applyGameAction(game,next.playerId,next.action);}}catch(error){fs.writeFileSync(`.local/fan-replays/failure-${count}-${seed}.json`,JSON.stringify(game));throw error;}
 if(game.phase==='paused')fs.writeFileSync(`.local/fan-replays/diagnostic-${count}-${seed}.json`,JSON.stringify(game));
 summaries.push({players:count,seed,phase:game.phase,steps,rounds:game.results.length,rolls:game.randomLog.length,events:game.logs.length,diagnostic:game.flags.ruleHold??null});
}
fs.writeFileSync('.local/fan-replays/report.json',JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries,null,2));
