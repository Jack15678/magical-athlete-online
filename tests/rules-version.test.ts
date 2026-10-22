import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/index.js';
import { automaticRoomAction, timeoutRoomAction, SECOND_WIND_V2_RULES_VERSION, CURRENT_RULES_VERSION, LEGACY_RULES_VERSION, SECOND_WIND_V1_RULES_VERSION, roomRules } from '../src/engine/runtime.js';
import { projectRoom, reduceRoomAction } from '../src/shared/room-core.js';
import { enabledCharacterIds } from '../src/shared/room-config.js';
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

test('旧原版练习的公开配置与冻结引擎的36张可选牌保持一致',()=>{
  for(const version of [undefined,LEGACY_RULES_VERSION,SECOND_WIND_V1_RULES_VERSION,SECOND_WIND_V2_RULES_VERSION]){
    const old=room();old.mode='practice';old.game.mode='practice';old.game.players=old.game.players.slice(0,1);old.maxPlayers=1;
    old.game.rulesVersion=version;old.game.characterPool='mixed';delete old.game.config;
    roomRules(old.game).startGame(old.game);
    const view=projectRoom(old,'p0',{authorityId:'p0',authorityOnline:true});
    const allowed=enabledCharacterIds(view.config,view.characterPool,true);
    assert.equal(allowed.length,version===undefined||version===LEGACY_RULES_VERSION?36:72);
    assert.deepEqual(new Set(allowed),new Set(old.game.draft!.market));
  }
});

test('SQLite恢复会持久锁定旧规则且不会悄悄更新到新规则',()=>{
  const store=new Store(':memory:');
  try{
    const saved=room();delete saved.game.rulesVersion;store.save(saved);
    const rooms=new Rooms(store,0,()=>2);assert.equal(rooms.get(saved.code).game.rulesVersion,LEGACY_RULES_VERSION);
    assert.equal(store.load()[0]!.game.rulesVersion,LEGACY_RULES_VERSION);
  }finally{store.close();}
});

test('新旧规则的每批选秀最后一张自动分配，关闭超时和恢复存档也无需玩家确认',()=>{
  for(const version of [CURRENT_RULES_VERSION,LEGACY_RULES_VERSION])for(const count of [2,3,4,5,6,7,8]){
    let current=room();
    current.maxPlayers=count;
    current.game.players=Array.from({length:count},(_,seat)=>({...structuredClone(players[0]!),id:`p${seat}`,seat}));
    current.game.rulesVersion=version;
    current=reduceRoomAction(current,'p0',{type:'start'},{now:2,rematchSeed:0});
    for(const batch of [0,1]){
      assert.equal(current.game.draft!.batch,batch);
      while(current.game.draft!.market.length>1){
        assert.equal(immediateRoomAction(current,current.updatedAt),undefined);
        const pick=automaticRoomAction(current.game)!;
        current=reduceRoomAction(current,pick.playerId,pick.action,{now:current.updatedAt+1,rematchSeed:0});
      }
      current=JSON.parse(JSON.stringify(current)) as Room;
      const draft=current.game.draft!,recipient=draft.order[draft.cursor]!,card=draft.market[0]!;
      const previousHand=[...current.game.players.find(p=>p.id===recipient)!.hand];
      assert.equal(current.deadline,null);
      const automatic=immediateRoomAction(current,current.updatedAt);
      assert.deepEqual(automatic,{playerId:recipient,action:{type:'draft',characterId:card},reason:'system'});
      current=reduceRoomAction(current,automatic!.playerId,automatic!.action,{now:current.updatedAt+1,rematchSeed:0});
      assert.deepEqual(current.game.players.find(p=>p.id===recipient)!.hand,[...previousHand,card]);
      assert.equal(current.game.phase,batch===0?'draft':'selection');
      assert.equal(immediateRoomAction(current,current.updatedAt),undefined);
    }
    const hands=current.game.players.flatMap(p=>p.hand);
    assert(current.game.players.every(p=>p.hand.length===(count===2?8:4)));
    assert.equal(new Set(hands).size,hands.length);
    assert.equal(current.game.logs.some(event=>event.type==='timeout'),false);
  }
});

test('timeout defaults are v3-only and cannot rewrite frozen v2 human-choice timing',()=>{
 const modern=room().game;modern.phase='race';modern.pending={id:'target',playerId:'p0',racerId:'r0',kind:'hypnotist',title:'选目标',optional:true,context:{},options:[{id:'skip',label:'不使用'}]};
 assert.deepEqual(timeoutRoomAction(modern),{playerId:'p0',action:{type:'choose',choiceId:'target',optionId:'skip'}});
 const old=structuredClone(modern);old.rulesVersion=SECOND_WIND_V2_RULES_VERSION;assert.equal(timeoutRoomAction(old),undefined);
 for(const kind of ['duel-roll','em-cletus-roll']){modern.pending.kind=kind;modern.pending.options=[{id:'roll',label:'投掷'}];assert.equal(timeoutRoomAction(modern),undefined);}
});
