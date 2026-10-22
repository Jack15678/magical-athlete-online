import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/store.js';
import { Rooms } from '../src/server/rooms.js';
import { enabledCharacterIds, legacyRoomConfig, validateRoomConfig, validateRoomConfigForPlayers, requiredCharacterCount } from '../src/shared/room-config.js';
import { CURRENT_RULES_VERSION, SECOND_WIND_V2_RULES_VERSION } from '../src/engine/runtime.js';
import { PRACTICE_OWNER_AWAY_MS, ROOM_OWNER_AWAY_MS, roomExpiry } from '../src/shared/room-lifecycle.js';

test('room config preserves legacy pools, rejects unsupported options and never enables unfinished fan cards',()=>{
  assert.equal(enabledCharacterIds(undefined,'original').length,36);
  assert.equal(enabledCharacterIds(undefined,'second-wind').length,36);
  assert.equal(enabledCharacterIds(undefined,'original',true).length,72);
  assert.throws(()=>validateRoomConfig({...legacyRoomConfig(),optionalRules:['invented']}),/玩法/);
  assert.throws(()=>validateRoomConfig({...legacyRoomConfig(),characterPacks:{original:false,'second-wind':false,'extra-mile':false,'leaf-fan':false}}),/至少/);
  assert.throws(()=>validateRoomConfig({...legacyRoomConfig(),characterPacks:{...legacyRoomConfig().characterPacks,unknown:true}}),/开关/);
});
test('independent fan pools enforce complete-game card counts for the configured room size',()=>{
  const leaf=legacyRoomConfig();leaf.characterPacks.original=false;leaf.characterPacks['leaf-fan']=true;
  assert.equal(requiredCharacterCount(2),16);assert.equal(requiredCharacterCount(8),32);assert.equal(requiredCharacterCount(1,true),4);
  assert.equal(validateRoomConfigForPlayers(leaf,4).characterPacks['leaf-fan'],true);assert.throws(()=>validateRoomConfigForPlayers(leaf,5),/18名.*20名/);
  const extra=legacyRoomConfig();extra.characterPacks.original=false;extra.characterPacks['extra-mile']=true;
  assert(validateRoomConfigForPlayers(extra,7));assert.throws(()=>validateRoomConfigForPlayers(extra,8),/31名.*32名/);
});
test('only an explicit legacy-lobby config edit upgrades executable rules and preserves secret entropy',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);try{
    const host=rooms.create('旧房主',2),code=host.identity.roomCode,room=rooms.get(code);room.game.rulesVersion=SECOND_WIND_V2_RULES_VERSION;
    const entropy=structuredClone(room.game.randomStream),rng=room.game.rngState;
    assert.equal(rooms.view(room,host.identity.playerId).rulesVersion,SECOND_WIND_V2_RULES_VERSION);
    const config=legacyRoomConfig();config.characterPacks['leaf-fan']=true;
    const result=rooms.act(code,host.identity.playerId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'configure',config}});assert(result.ok);
    assert.equal(rooms.get(code).game.rulesVersion,CURRENT_RULES_VERSION);assert.deepEqual(rooms.get(code).game.randomStream,entropy);assert.equal(rooms.get(code).game.rngState,rng);assert.deepEqual(rooms.get(code).game.config,config);
  }finally{store.close();}
});

test('host configuration resets readiness, freezes at draft and is editable for the next complete game',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);try{
    const host=rooms.create('房主',2),guest=rooms.join(host.identity.roomCode,'朋友'),code=host.identity.roomCode;
    rooms.presence(code,host.identity.playerId,true);rooms.presence(code,guest.identity.playerId,true);
    const act=(id:string,action:any)=>rooms.act(code,id,{actionId:crypto.randomUUID(),expectedVersion:rooms.get(code).version,action});
    assert(act(host.identity.playerId,{type:'ready',ready:true}).ok);assert(act(guest.identity.playerId,{type:'ready',ready:true}).ok);
    const config=legacyRoomConfig('second-wind');assert.equal(act(guest.identity.playerId,{type:'configure',config}).ok,false);
    assert(act(host.identity.playerId,{type:'configure',config}).ok);assert(rooms.get(code).game.players.every(p=>!p.ready));
    assert.deepEqual(rooms.view(rooms.get(code),guest.identity.playerId).config,config);
    act(host.identity.playerId,{type:'ready',ready:true});act(guest.identity.playerId,{type:'ready',ready:true});
    assert(act(host.identity.playerId,{type:'start'}).ok);assert.equal(rooms.get(code).configFrozen,true);
    assert.equal(act(host.identity.playerId,{type:'configure',config:legacyRoomConfig()}).ok,false);
    rooms.get(code).game.phase='finished';assert(act(host.identity.playerId,{type:'configure',config:legacyRoomConfig()}).ok);
    assert(act(host.identity.playerId,{type:'rematch'}).ok);assert.equal(rooms.get(code).configFrozen,false);
    assert.deepEqual(rooms.get(code).game.config,legacyRoomConfig());
  }finally{store.close();}
});

test('Node admission is shared by stale server instances, idempotent, excludes solo modes and recovers failed creation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'athlete-capacity-')),path=join(dir,'rooms.sqlite'),first=new Store(path),second=new Store(path);
  try{
    const a=new Rooms(first,0),b=new Rooms(second,0),created=[];
    for(let i=0;i<29;i++)created.push(a.create(`玩家${i}`,2));
    const requestId=crypto.randomUUID(),last=b.create('最后名额',2,0,'multiplayer',3,'original',undefined,requestId);
    assert.equal(a.capacity().used,30);assert.equal(b.capacity().used,30);
    assert.equal(JSON.stringify(b.create('最后名额',2,0,'multiplayer',3,'original',undefined,requestId)),JSON.stringify(last));
    assert.equal(a.capacity().used,30);assert.throws(()=>a.create('超过上限',2),/实时对战房间已满/);
    assert.throws(()=>b.create('不同设置',2,0,'multiplayer',3,'original',undefined,requestId),/同一建房请求/);
    const practice=a.create('练习',2,0,'practice'),ai=a.create('人机',2,0,'ai',1);assert.equal(a.capacity().used,30);
    assert(a.rooms.has(practice.identity.roomCode)&&a.rooms.has(ai.identity.roomCode));
    const closing=created[0]!,room=a.get(closing.identity.roomCode),envelope={actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'close' as const}};
    assert(a.act(room.code,closing.identity.playerId,envelope).ok);assert(a.act(room.code,closing.identity.playerId,envelope).duplicate);assert.equal(b.capacity().used,29);
    const save=second.save.bind(second);second.save=()=>{throw Error('写入失败');};
    assert.throws(()=>b.create('失败建房',2),/写入失败/);assert.equal(a.capacity().used,29);second.save=save;
    b.create('回收后成功',2);assert.equal(a.capacity().used,30);
  }finally{first.close();second.close();rmSync(dir,{recursive:true,force:true});}
});

test('practice exact ten-minute expiry survives restart, rejects late operations and ignores an old timer after reconnect',()=>{
  let now=1_000;const store=new Store(':memory:'),rooms=new Rooms(store,0,()=>now);try{
    const created=rooms.create('练习',1,0,'practice'),{roomCode,playerId}=created.identity;
    rooms.presence(roomCode,playerId,true);rooms.presence(roomCode,playerId,false);const oldExpiry=roomExpiry(rooms.get(roomCode));
    assert.equal(oldExpiry-now,PRACTICE_OWNER_AWAY_MS);now=oldExpiry-1;rooms.presence(roomCode,playerId,true);
    assert.equal(rooms.expire(roomCode,oldExpiry),false);rooms.presence(roomCode,playerId,false);
    assert.equal(rooms.expire(roomCode,oldExpiry),false);const nextExpiry=roomExpiry(rooms.get(roomCode));
    now=nextExpiry-1;const restored=new Rooms(store,0,()=>now);assert.equal(roomExpiry(restored.get(roomCode)),nextExpiry);
    now++;assert.throws(()=>restored.authenticate(created.identity),/关闭/);assert.equal(restored.closed(roomCode)?.closedAt,nextExpiry);
    const ai=rooms.create('AI',2,0,'ai',1);assert.equal(roomExpiry(rooms.get(ai.identity.roomCode))-now,ROOM_OWNER_AWAY_MS);
  }finally{store.close();}
});
