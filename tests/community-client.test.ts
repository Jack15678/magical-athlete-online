import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityFeed } from '../src/client/community.js';
import type { ChatMessage } from '../src/shared/types.js';
const message = (id: number): ChatMessage => ({id, senderId:'p0', senderName:`发送时昵称${id}`, text:`message ${id}`, sentAt:1000 + id, kind:'player'});
test('chat backfill merges out-of-order duplicates and preserves independent latest sequence with a bounded history', () => {
  const feed = new CommunityFeed(); let current: Parameters<Parameters<typeof feed.subscribe>[0]>[0] | undefined;
  const unsubscribe = feed.subscribe(state => {current = state;});
  feed.update({messages:[message(2),message(3)],latestId:3,connected:true});
  feed.update({messages:[message(1),message(2)],latestId:2});
  assert.deepEqual(current?.messages.map(message => message.id),[1,2,3]); assert.equal(current?.latestId,3);
  feed.update({messages:Array.from({length:120},(_,i)=>message(i+1)),latestId:120});
  assert.equal(current?.messages.length,100); assert.equal(current?.messages[0]?.id,21);
  feed.update({name:'新昵称',renameRemaining:0}); assert.equal(current?.messages[0]?.senderName,'发送时昵称21');
  feed.update({connected:false}); assert.equal(current?.messages.length,100); assert.equal(current?.latestId,120);
  unsubscribe();
});
