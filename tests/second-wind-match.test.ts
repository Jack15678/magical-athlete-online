import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, startGame, applyGameAction, systemAction } from '../src/engine/index.js';
import { decideAI } from '../src/engine/ai.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { CharacterPool, Player, Room } from '../src/shared/types.js';
for(const pool of ['second-wind','mixed'] as CharacterPool[])for(const count of [2,4,8])test(`${pool} ${count} players complete four authority-resolved races through public views`,()=>{
 const players:Player[]=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`电脑${i}`,isAI:true,seat:i,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
 const game=createGame(players,7093+count,'multiplayer',pool);startGame(game);const room:Room={code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:count,timeoutSeconds:0,deadline:null,game};let steps=0,restores=0;
 while(room.game.phase!=='finished'){
  assert(++steps<15000,`stalled ${pool} ${count} ${room.game.phase}/${room.game.pending?.kind} ${room.game.racers.map(r=>r.characterId+':'+r.position).join(',')}`);
  const s=room.game,system=systemAction(s);
  if(system){applyGameAction(s,system.playerId,system.action);continue;}
  const playerId=s.pending?.playerId??(s.phase==='draft'?s.draft!.order[s.draft!.cursor]!:s.phase==='selection'?s.players.find(p=>!p.selection.length)!.id:s.phase==='results'?'p0':s.racers.find(r=>r.id===s.currentRacerId)!.playerId);
  const view=projectRoom(room,playerId,{authorityId:'p0',authorityOnline:true});const action=decideAI(view);assert(action,`no action ${pool}/${count}/${s.phase}/${s.pending?.kind}`);applyGameAction(s,playerId,action);
  if(s.pending&&restores<4){room.game=JSON.parse(JSON.stringify(s));restores++;}
 }
 assert.equal(room.game.results.length,4);assert(room.game.rulesVersion);assert.equal(room.game.characterPool,pool);assert(!room.game.pending);assert(room.game.results.every(r=>r.placements.length<=2));
});
