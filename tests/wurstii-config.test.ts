import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameAction, resolveTasks } from '../src/engine/index.js';
import { roomRules, WURSTII_V1_RULES_VERSION } from '../src/engine/runtime.js';
import { createBrowserRoom, projectRoom, reduceRoomAction } from '../src/shared/room-core.js';
import { enabledCharacterIds, legacyRoomConfig, validateRoomConfig, validateRoomConfigForPlayers } from '../src/shared/room-config.js';
import { Rooms } from '../src/server/rooms.js';
import { Store } from '../src/server/store.js';
import type { RoomConfig } from '../src/shared/room-config.js';

function wurstiiOnly(): RoomConfig {
  const config=legacyRoomConfig();config.characterPacks.original=false;config.characterPacks.wurstii=true;return config;
}
function practice(config?:RoomConfig){
  return createBrowserRoom({code:'ABC234',createdAt:1,phase:'lobby',mode:'practice',authorityId:'p0',adminHostId:'p0',maxPlayers:1,timeoutSeconds:0,config,members:[{id:'p0',name:'玩家',seat:0,connected:true}]},1,2);
}

test('old four-pack configs keep Wurstii disabled; independent pack totals and capacity are enforced',()=>{
  const old=legacyRoomConfig();delete old.characterPacks.wurstii;
  const restored=validateRoomConfig(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.characterPacks.wurstii,false);assert.equal(enabledCharacterIds(restored).length,36);
  assert.equal(enabledCharacterIds(wurstiiOnly()).length,30);
  assert(validateRoomConfigForPlayers(wurstiiOnly(),7));assert.throws(()=>validateRoomConfigForPlayers(wurstiiOnly(),8),/30名.*32名/);
  const combined=legacyRoomConfig();combined.characterPacks.wurstii=true;assert.equal(enabledCharacterIds(combined).length,66);
  combined.characterPacks['second-wind']=true;assert.equal(enabledCharacterIds(combined).length,102);
  combined.characterPacks['extra-mile']=true;combined.characterPacks['leaf-fan']=true;assert.equal(enabledCharacterIds(combined).length,151);
});

test('Node and browser authority draft exactly the enabled Wurstii pack and reject disabled practice cards',()=>{
  const config=wurstiiOnly(),browser=practice(config),store=new Store(':memory:');
  try{
    const rooms=new Rooms(store,0,()=>2),node=rooms.create('玩家',1,0,'practice',0,'original',config);
    for(const game of [browser.game,rooms.get(node.identity.roomCode).game]){
      assert.equal(game.draft!.market.length,30);assert(game.draft!.market.every(id=>id.startsWith('wurstii-')));
      assert.throws(()=>applyGameAction(game,game.players[0]!.id,{type:'practice-team',characterIds:['coach','legs','blimp','egg']}),/4张不同/);
      const selected=game.draft!.market.slice(0,4);applyGameAction(game,game.players[0]!.id,{type:'practice-team',characterIds:selected});
      assert.deepEqual(game.players[0]!.hand,selected);
    }
    const resumed=JSON.parse(JSON.stringify(browser));assert.deepEqual(projectRoom(resumed,'p0',{authorityId:'p0',authorityOnline:true}).config,config);
    assert.throws(()=>reduceRoomAction(resumed,'p0',{type:'configure',config:legacyRoomConfig()},{now:3,rematchSeed:2}),/锁定|开始|开局/);
    resumed.game.phase='finished';const rematch=reduceRoomAction(resumed,'p0',{type:'rematch'},{now:4,rematchSeed:2});
    assert.deepEqual(rematch.game.config,config);assert.equal(rematch.game.draft!.market.length,30);
  }finally{store.close();}
});

test('frozen Wurstii practice projects its original 102 cards despite newer room config defaults',()=>{
  const room=practice();room.game.phase='lobby';room.game.rulesVersion=WURSTII_V1_RULES_VERSION;
  roomRules(room.game).startGame(room.game);
  const view=projectRoom(JSON.parse(JSON.stringify(room)),'p0',{authorityId:'p0',authorityOnline:true});
  assert.equal(view.draft!.market.length,102);assert.equal(enabledCharacterIds(view.config).length,102);
  assert.equal(view.config!.characterPacks['extra-mile'],false);assert.equal(view.config!.characterPacks.wurstii,true);
});

test('Egg draws from the enabled Wurstii card zones and cannot reintroduce disabled fan cards',()=>{
  const room=practice(wurstiiOnly()),s=room.game;
  s.phase='race';s.round=1;s.draft=undefined;s.currentRacerId='r0';s.players[0]!.hand=['egg'];
  s.racers=[{id:'r0',playerId:'p0',characterId:'egg',position:0,finished:false,eliminated:false,tripped:false,flags:{}}];
  s.deck=['extra-mile-echo','leaf-gambler','wurstii-mario','wurstii-tails','wurstii-hoagie'];s.discard=[];
  s.queue=[{kind:'beforeRace',racerId:'r0'}];resolveTasks(s);
  assert.equal(s.pending?.kind,'egg');assert.deepEqual(s.pending!.options.map(o=>o.id),['wurstii-mario','wurstii-tails','wurstii-hoagie']);
});
