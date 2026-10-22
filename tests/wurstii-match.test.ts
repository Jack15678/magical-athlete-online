import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameAction, createGame, startGame } from '../src/engine/index.js';
import { systemRoomAction } from '../src/engine/runtime.js';
import { decideAI } from '../src/engine/ai.js';
import { createBrowserRoom, projectRoom } from '../src/shared/room-core.js';
import { WURSTII_CHARACTERS } from '../src/shared/wurstii.js';
import { Rooms } from '../src/server/rooms.js';
import { Store } from '../src/server/store.js';
import type { CharacterPool, Player, Room } from '../src/shared/types.js';

const players=(count:number):Player[]=>Array.from({length:count},(_,i)=>({id:`p${i}`,name:`电脑${i}`,isAI:true,seat:i,color:'#123456',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
const roomFor=(count:number,pool:CharacterPool='wurstii'):Room=>({code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:count,timeoutSeconds:0,deadline:null,game:createGame(players(count),7093+count,'multiplayer',pool)});
const phase=(room:Room)=>room.game.phase;
function step(room:Room){
  const s=room.game,system=systemRoomAction(s);
  if(system){applyGameAction(s,system.playerId,system.action);room.version++;return;}
  const playerId=s.pending?.playerId??(s.phase==='draft'?s.draft!.order[s.draft!.cursor]!:s.phase==='selection'?s.players.find(p=>!p.selection.length)!.id:s.phase==='results'?'p0':s.racers.find(r=>r.id===s.currentRacerId)!.playerId);
  const action=decideAI(projectRoom(room,playerId,{authorityId:'p0',authorityOnline:true}));
  assert(action,`no legal action: ${s.phase}/${s.pending?.kind}`);applyGameAction(s,playerId,action);room.version++;
}
for(const pool of ['wurstii','all'] as const)for(const count of [2,4,8])test(`${pool} ${count} players complete four races, with choices restored from JSON`,()=>{
  const room=roomFor(count,pool);startGame(room.game);let steps=0,restores=0;
  while(room.game.phase!=='finished'){
    assert(++steps<10000,`stalled ${pool}/${count}/${room.game.phase}/${room.game.pending?.kind}`);
    step(room);
    if(room.game.pending&&restores++<5)room.game=JSON.parse(JSON.stringify(room.game));
  }
  assert.equal(room.game.results.length,4);assert(room.game.players.every(p=>p.score>=0));
  assert(room.game.results.every(r=>r.placements.length<=2));
  assert(room.game.players.flatMap(p=>p.used).some(id=>id.startsWith('wurstii-')));
});

for(const track of ['mild','wild'] as const)test(`all30 Wurstii roles can finish solo ${track} practice without a target`,()=>{
  for(const card of WURSTII_CHARACTERS){
    const room=roomFor(1);room.mode='practice';room.game.mode='practice';room.game.phase='selection';room.game.round=track==='mild'?1:2;
    room.game.players[0]!.hand=[card.id];applyGameAction(room.game,'p0',{type:'select',characterIds:[card.id]});
    let steps=0;
    while(phase(room)==='race'){
      assert(++steps<600,`practice stalled for ${card.id}/${track}`);step(room);
    }
    assert.equal(room.game.phase,'results',card.id);assert.equal(room.game.results[0]!.placements[0]?.rank,1,card.id);
  }
});

test('browser metadata and Node room creation accept both new pools and keep their deck configuration',()=>{
  for(const pool of ['wurstii','all'] as const){
    const browser=createBrowserRoom({characterPool:pool,mode:'ai',code:'ABC234',authorityId:'p0',adminHostId:'p0',maxPlayers:2,timeoutSeconds:0,phase:'lobby',createdAt:1,members:players(2).map((p,i)=>({...p,isAI:i>0}))},1,2);
    assert.equal(browser.game.characterPool,pool);assert.equal(browser.game.draft!.market.length,8);
    const store=new Store(':memory:');
    try{const rooms=new Rooms(store,0,()=>2);const made=rooms.create('测试',2,0,'ai',1,pool);assert.equal(made.room.characterPool,pool);assert.equal(rooms.get(made.identity.roomCode).game.deck.length+made.room.draft!.market.length,pool==='all'?102:66);}finally{store.close();}
  }
});
