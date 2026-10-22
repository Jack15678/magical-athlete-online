import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingPrompt, pendingActionLabel } from '../src/client/pending-prompt.js';
import type { RoomView } from '../src/shared/types.js';
test('out-of-turn public prompt uses stable controller ID and specific racer, with no need for private choice data',()=>{
  const room={selfId:'p1',role:'player',players:[{id:'p0',name:'同名',seat:0},{id:'p1',name:'同名1',seat:1}],racers:[{id:'own-second',playerId:'p1',characterId:'banana'}],waitingPrompt:{playerId:'p1',racerId:'own-second',kind:'duel-roll'}} as RoomView;
  assert.equal(pendingPrompt(room),'请你操作 · 2号 · 香蕉 · 掷对抗骰');
  assert.equal(pendingPrompt({...room,selfId:'p0'}),'等待 同名1 · 2号 · 香蕉 · 掷对抗骰');
  assert.equal(pendingPrompt({...room,role:'spectator'}),'等待 同名1 · 2号 · 香蕉 · 掷对抗骰');
  assert.match(pendingActionLabel('em-witch-allocation'),/分配/);assert.match(pendingActionLabel('em-fox'),/阻止/);assert.match(pendingActionLabel('em-gift-roll'),/送礼/);assert.match(pendingActionLabel('em-cletus-roll'),/Cletus.*对抗骰/);
});
