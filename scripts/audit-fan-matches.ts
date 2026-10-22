/** Reproducible complete-game audit through projected views and legal actions. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBrowserRoom, projectRoom, reduceRoomAction } from '../src/shared/room-core.js';
import { legacyRoomConfig } from '../src/shared/room-config.js';
import { systemRoomAction } from '../src/engine/runtime.js';
import { decideAI } from '../src/engine/ai.js';
import type { GameAction, Room } from '../src/shared/types.js';
import type { RelayMetadata } from '../src/shared/relay.js';

const seeds=(process.env.AUDIT_SEEDS??'1,2,7,17,42,73').split(',').map(Number),sizes=(process.env.AUDIT_PLAYERS??'2,3,6,8').split(',').map(Number);
const maxActions=Number(process.env.AUDIT_MAX_ACTIONS??20000),folder=resolve(process.env.AUDIT_OUTPUT_DIR??'docs/qa/fan-iteration'),results:unknown[]=[];
mkdirSync(folder,{recursive:true});
const config=legacyRoomConfig('mixed');config.characterPacks['extra-mile']=true;config.characterPacks['leaf-fan']=true;
let failures=0;const raced=new Set<string>();
for(const players of sizes)for(const seed of seeds){
  const started=performance.now();let now=1000,room:Room|undefined,steps=0,lastIntent:unknown,status='complete',reason:string|undefined;
  try{
    const members=Array.from({length:players},(_,index)=>({id:`p${index}`,name:`模拟玩家${index}`,seat:index,connected:true}));
    const meta:RelayMetadata={code:'AUD234',createdAt:now,phase:'lobby',authorityId:'p0',adminHostId:'p0',ownerId:'p0',mode:'multiplayer',maxPlayers:players,timeoutSeconds:0,config,members};
    room=createBrowserRoom(meta,seed,now);
    const act=(playerId:string,action:GameAction)=>{lastIntent={playerId,action,version:room!.version};room=reduceRoomAction(room!,playerId,action,{now:++now,rematchSeed:seed});steps++;for(const racer of room.game.racers)raced.add(racer.characterId);};
    for(const member of members)act(member.id,{type:'ready',ready:true});act('p0',{type:'start'});
    while(room.game.phase!=='finished'&&steps<maxActions){
      if(room.game.phase==='paused'){status='paused';reason=String((room.game.flags.ruleHold as {message?:string}|undefined)?.message??'paused');break;}
      const system=systemRoomAction(room.game);if(system){act(system.playerId,system.action);continue;}
      let intent:{playerId:string;action:GameAction}|undefined;
      for(const member of members){const view=projectRoom(room,member.id,{authorityId:'p0',authorityOnline:true}),action=decideAI(view);if(action){intent={playerId:member.id,action};break;}}
      if(!intent)throw Error(`No legal projected-view action in ${room.game.phase}, pending=${room.game.pending?.kind??'none'}`);
      act(intent.playerId,intent.action);
    }
    if(steps>=maxActions&&room.game.phase!=='finished'){status='budget';reason='Audit action budget reached; no game outcome was fabricated.';}
    if(status==='complete'&&(room.game.results.length!==4||room.game.phase!=='finished'))throw Error('Game did not finish four races');
  }catch(error){status='failed';reason=error instanceof Error?error.message:String(error);}
  const result={players,seed,status,steps,races:room?.game.results.length,phase:room?.game.phase,elapsedMs:Math.round(performance.now()-started),reason};results.push(result);console.log(JSON.stringify(result));
  if(status!=='complete'){
    failures++;const diagnostic=resolve(folder,`audit-failure-${players}p-seed${seed}.json`);
    writeFileSync(diagnostic,JSON.stringify({result,lastIntent,room},null,2));
  }
  writeFileSync(resolve(folder,'seeded-four-pack-audit.json'),JSON.stringify({date:new Date().toISOString(),source:'server reducer + public projection + decideAI, numeric reproducible RNG seeds',config,maxActions,failures,results,racedCharacterIds:[...raced].sort()},null,2));
}
console.log(JSON.stringify({games:results.length,failures,racedCharacters:raced.size,report:resolve(folder,'seeded-four-pack-audit.json')}));
if(failures)process.exitCode=1;
