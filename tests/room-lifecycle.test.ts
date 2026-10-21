import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../src/server/rooms.js';
import { Store } from '../src/server/store.js';
import { PERSONAL_ROOM_AWAY_MS, roomExpiry } from '../src/shared/room-lifecycle.js';
import type { ActionEnvelope, GameMode } from '../src/shared/types.js';

function fixture(mode:GameMode='ai'){
  const clock={now:Date.now()},store=new Store(':memory:'),rooms=new Rooms(store,0,()=>clock.now);
  const created=rooms.create('房主',2,0,mode,1),identity=created.identity;
  return{clock,store,rooms,identity,created};
}
test('all room modes retain an idle connected owner beyond three hours and never list practice rooms',()=>{
  for(const mode of ['multiplayer','ai','practice'] as const){const env=fixture(mode);try{
    env.rooms.presence(env.identity.roomCode,env.identity.playerId,true);
    env.clock.now+=4*60*60*1000;env.rooms.tick();
    const room=env.rooms.get(env.identity.roomCode);assert.equal(room.hostLeftAt,undefined);
    assert.equal(env.rooms.view(room,env.identity.playerId).expiresAt,undefined);
    assert.equal(env.rooms.list().some(entry=>entry.code===room.code),mode!=='practice');
  }finally{env.store.close();}}
});
test('personal rooms close exactly thirty minutes after owner departure regardless of AI or spectator presence',()=>{
  const env=fixture();try{
    const {rooms,identity,clock,store}=env;rooms.presence(identity.roomCode,identity.playerId,true);
    const spectator=rooms.join(identity.roomCode,'观众','spectator');rooms.presence(identity.roomCode,spectator.identity.playerId,true);
    rooms.presence(identity.roomCode,identity.playerId,false);const leftAt=clock.now,notices:unknown[]=[];
    rooms.onExpired=(...notice)=>notices.push(notice);
    clock.now+=PERSONAL_ROOM_AWAY_MS-1;rooms.tick();assert.equal(rooms.get(identity.roomCode).hostLeftAt,leftAt);
    assert(rooms.get(identity.roomCode).game.players.some(player=>player.isAI&&player.connected));
    clock.now++;rooms.tick();assert.equal(rooms.rooms.has(identity.roomCode),false);assert.deepEqual(store.load(),[]);
    assert.equal(store.identity(identity.roomCode,identity.playerId),undefined);assert.equal(store.identity(identity.roomCode,spectator.identity.playerId),undefined);
    assert.deepEqual(notices,[[identity.roomCode,clock.now,'host-away']]);assert.equal(rooms.expire(identity.roomCode),false);rooms.tick();assert.equal(notices.length,1);
    assert.throws(()=>rooms.get(identity.roomCode),/房间已关闭/);assert.equal(rooms.closed(identity.roomCode)?.reason,'host-away');
  }finally{env.store.close();}
});
test('returning before the deadline cancels closure and the next departure starts a new thirty minutes',()=>{
  const env=fixture('practice');try{
    const {rooms,identity,clock}=env;rooms.presence(identity.roomCode,identity.playerId,true);rooms.presence(identity.roomCode,identity.playerId,false);
    clock.now+=PERSONAL_ROOM_AWAY_MS-1;rooms.presence(identity.roomCode,identity.playerId,true);
    clock.now+=PERSONAL_ROOM_AWAY_MS;rooms.tick();assert.equal(rooms.get(identity.roomCode).hostLeftAt,undefined);
    rooms.presence(identity.roomCode,identity.playerId,false);const next=clock.now;assert.equal(roomExpiry(rooms.get(identity.roomCode)),next+PERSONAL_ROOM_AWAY_MS);
    clock.now+=PERSONAL_ROOM_AWAY_MS;rooms.tick();assert.equal(rooms.closed(identity.roomCode)?.closedAt,clock.now);
  }finally{env.store.close();}
});
test('restart preserves absence and counts downtime from the separately persisted owner heartbeat',()=>{
  for(const disconnected of [true,false]){const env=fixture();try{
    const {rooms,identity,clock,store}=env;rooms.presence(identity.roomCode,identity.playerId,true);rooms.tick();
    if(disconnected)rooms.presence(identity.roomCode,identity.playerId,false);
    clock.now+=PERSONAL_ROOM_AWAY_MS-1;const restored=new Rooms(store,0,()=>clock.now);
    assert.equal(restored.get(identity.roomCode).hostLeftAt,clock.now-(PERSONAL_ROOM_AWAY_MS-1));
    clock.now++;restored.tick();assert.equal(restored.rooms.has(identity.roomCode),false);assert.equal(restored.closed(identity.roomCode)?.reason,'host-away');
    const again=new Rooms(store,0,()=>clock.now);assert.throws(()=>again.authenticate(identity),/房间已关闭/);
  }finally{env.store.close();}}
});
for(const mode of ['multiplayer','ai','practice'] as const)test(`${mode} owner dismissal atomically clears room, credentials and tasks, retains only a tombstone and is idempotent`,()=>{
  const env=fixture(mode);try{
    const {rooms,identity,store}=env;rooms.presence(identity.roomCode,identity.playerId,true);
    const spectator=rooms.join(identity.roomCode,'观众','spectator'),room=rooms.get(identity.roomCode);
    const envelope:ActionEnvelope={actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'close'}};
    assert.equal(rooms.act(room.code,spectator.identity.playerId,envelope).ok,false);
    const remove=store.delete.bind(store);store.delete=()=>{throw Error('模拟事务中断');};
    assert.equal(rooms.act(room.code,identity.playerId,envelope).ok,false);assert.equal(store.closed(room.code),undefined);assert(rooms.rooms.has(room.code));
    store.delete=remove;const accepted=rooms.act(room.code,identity.playerId,envelope);assert.equal(accepted.ok,true);
    assert.equal(rooms.rooms.has(room.code),false);assert.deepEqual(rooms.list(),[]);assert.deepEqual(rooms.tick(),[]);assert.deepEqual(store.load(),[]);
    assert.equal(store.identity(room.code,identity.playerId),undefined);assert.equal(rooms.closed(room.code)?.reason,'dismissed');
    assert.deepEqual(rooms.act(room.code,identity.playerId,envelope),{...accepted,duplicate:true});
    assert.equal(rooms.act(room.code,spectator.identity.playerId,envelope).ok,false);
    assert.equal(rooms.act(room.code,identity.playerId,{...envelope,action:{type:'roll'}}).ok,false);
  }finally{env.store.close();}
});

test('restart migrates a legacy closed personal room to its lightweight tombstone',()=>{
  const env=fixture('practice');try{
    const room=env.rooms.get(env.identity.roomCode);room.closedAt=env.clock.now;env.store.save(room);
    const restored=new Rooms(env.store,0,()=>env.clock.now);assert.equal(restored.rooms.has(room.code),false);
    assert.deepEqual(env.store.load(),[]);assert.equal(restored.closed(room.code)?.closedAt,room.closedAt);
  }finally{env.store.close();}
});

test('multiplayer guests taking management or acting never renew the fixed owner absence',()=>{
  const env=fixture('multiplayer');try{
    const {rooms,identity,clock}=env;rooms.presence(identity.roomCode,identity.playerId,true);
    const guest=rooms.join(identity.roomCode,'在线朋友').identity;rooms.presence(identity.roomCode,guest.playerId,true);
    rooms.presence(identity.roomCode,identity.playerId,false);const departed=clock.now,room=rooms.get(identity.roomCode);
    assert.equal(room.ownerId,identity.playerId);assert.equal(room.hostId,guest.playerId);
    clock.now+=PERSONAL_ROOM_AWAY_MS-1;assert.equal(rooms.act(room.code,guest.playerId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'ready',ready:true}}).ok,true);
    assert.equal(rooms.get(room.code).hostLeftAt,departed);clock.now++;rooms.tick();assert.equal(rooms.closed(room.code)?.reason,'host-away');
  }finally{env.store.close();}
});
test('explicit multiplayer transfer changes the lifecycle owner and survives Node restart',()=>{
  const env=fixture('multiplayer');try{
    const {rooms,identity,clock,store}=env;rooms.presence(identity.roomCode,identity.playerId,true);
    const guest=rooms.join(identity.roomCode,'新房主').identity;rooms.presence(identity.roomCode,guest.playerId,true);
    const room=rooms.get(identity.roomCode);assert.equal(rooms.act(room.code,identity.playerId,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'transfer',playerId:guest.playerId}}).ok,true);
    rooms.presence(room.code,identity.playerId,false);assert.equal(rooms.get(room.code).ownerId,guest.playerId);assert.equal(rooms.get(room.code).hostLeftAt,undefined);
    clock.now+=15_000;rooms.tick();const restored=new Rooms(store,0,()=>clock.now);assert.equal(restored.get(room.code).ownerId,guest.playerId);
    restored.presence(room.code,guest.playerId,true);clock.now+=4*60*60*1000;restored.tick();assert.equal(restored.get(room.code).hostLeftAt,undefined);
    restored.presence(room.code,guest.playerId,false);clock.now+=PERSONAL_ROOM_AWAY_MS;restored.tick();assert.equal(restored.closed(room.code)?.reason,'host-away');
  }finally{env.store.close();}
});
