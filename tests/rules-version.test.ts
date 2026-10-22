import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/index.js';
import { automaticRoomAction, CURRENT_RULES_VERSION, LEGACY_RULES_VERSION, SECOND_WIND_V1_RULES_VERSION, roomRules } from '../src/engine/runtime.js';
import { reduceRoomAction } from '../src/shared/room-core.js';
import { Rooms } from '../src/server/rooms.js';
import { immediateRoomAction } from '../src/shared/automation.js';
import { Store } from '../src/server/store.js';
import type { Player, Room } from '../src/shared/types.js';

const players:Player[]=Array.from({length:2},(_,seat)=>({id:`p${seat}`,name:`玩家${seat}`,seat,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
function room():Room { return {code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:2,timeoutSeconds:0,deadline:null,game:createGame(players,71)}; }

test('Second Wind v1 rooms retain their original RNG and rules until a complete rematch',()=>{
  const original=room();original.game.rulesVersion=SECOND_WIND_V1_RULES_VERSION;
  assert.notEqual(roomRules(original.game),roomRules(room().game));
  const started=reduceRoomAction(original,'p0',{type:'start'},{now:2,rematchSeed:0});
  assert.equal(started.game.rulesVersion,SECOND_WIND_V1_RULES_VERSION);assert.equal(started.game.randomStream,undefined);
  started.game.phase='finished';const newer=reduceRoomAction(started,'p0',{type:'rematch'},{now:3,rematchSeed:Array.from({length:11},(_,index)=>index)});
  assert.equal(newer.game.rulesVersion,CURRENT_RULES_VERSION);assert.equal(newer.game.randomStream!.algorithm,'chacha20-v1');
});

test('旧存档固定使用原36角色规则，更新后续局才切换到当前规则',()=>{
  const old=room();delete old.game.rulesVersion;old.game.characterPool='mixed';
  const started=reduceRoomAction(old,'p0',{type:'start'},{now:2,rematchSeed:0});
  assert.equal(started.game.rulesVersion,LEGACY_RULES_VERSION);
  assert.equal(started.game.deck.length+started.game.draft!.market.length,36);
  const expansion=room();expansion.game.characterPool='mixed';
  const modern=reduceRoomAction(expansion,'p0',{type:'start'},{now:2,rematchSeed:0});assert.equal(modern.game.deck.length+modern.game.draft!.market.length,72);
  started.game.phase='finished';
  const rematch=reduceRoomAction(started,'p0',{type:'rematch'},{now:3,rematchSeed:5});assert.equal(rematch.game.rulesVersion,CURRENT_RULES_VERSION);
});

test('未知规则版本不会进入当前规则结算，仍可读取和解散',()=>{
  const unsupported=room();unsupported.game.rulesVersion='future-rules';
  assert.throws(()=>roomRules(unsupported.game),/暂不支持的规则版本/);
  assert.equal(automaticRoomAction(unsupported.game),undefined);
  assert.equal(immediateRoomAction(unsupported,10_000),undefined);
  assert.throws(()=>reduceRoomAction(unsupported,'p0',{type:'start'},{now:2,rematchSeed:0}),/暂不支持的规则版本/);
  assert.equal(reduceRoomAction(unsupported,'p0',{type:'close'},{now:2,rematchSeed:0}).closedAt,2);
});

test('SQLite恢复会持久锁定旧规则且不会悄悄更新到新规则',()=>{
  const store=new Store(':memory:');
  try{
    const saved=room();delete saved.game.rulesVersion;store.save(saved);
    const rooms=new Rooms(store,0,()=>2);assert.equal(rooms.get(saved.code).game.rulesVersion,LEGACY_RULES_VERSION);
    assert.equal(store.load()[0]!.game.rulesVersion,LEGACY_RULES_VERSION);
  }finally{store.close();}
});
