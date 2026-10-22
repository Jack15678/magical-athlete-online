import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityFeed } from '../src/client/community.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAT_NOTICE_MS, ChatNoticeBubble, nextChatNotice } from '../src/client/chat-notices.js';
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

test('only genuinely new live messages produce notice revisions; initial history and duplicate delivery stay silent',()=>{
  const feed=new CommunityFeed();let current!:Parameters<Parameters<typeof feed.subscribe>[0]>[0];feed.subscribe(state=>current=state);
  feed.update({connected:true});feed.update({messages:[message(1),message(2)],latestId:2},'history');
  assert.equal(current.liveRevision,undefined);feed.update({messages:[message(1),message(2),message(3)],latestId:3},'live');
  assert.equal(current.liveRevision,1);assert.deepEqual(current.liveMessages?.map(m=>m.id),[3]);
  feed.update({messages:[message(3)],latestId:3},'live');assert.equal(current.liveRevision,1);
  feed.update({messages:[message(1),message(2)],latestId:2},'history');assert.equal(current.liveRevision,1);
});

test('reconnection restores unseen backlog without notices, then resumes live notices',()=>{
  const feed=new CommunityFeed();let current!:Parameters<Parameters<typeof feed.subscribe>[0]>[0];feed.subscribe(state=>current=state);
  feed.update({connected:true});feed.update({messages:[message(1)]},'history');feed.update({messages:[message(2)]},'live');assert.equal(current.liveRevision,1);
  feed.update({connected:false});assert.equal(current.liveMessages?.length,0);feed.update({connected:true});
  feed.update({messages:[message(3)]},'live');assert.equal(current.liveRevision,1,'no live notice before fresh hydration');
  feed.update({messages:[message(1),message(2),message(3),message(4)]},'history');assert.equal(current.liveRevision,1);
  feed.update({messages:[message(5)]},'live');assert.equal(current.liveRevision,2);assert.deepEqual(current.liveMessages?.map(m=>m.id),[5]);
});

test('live bursts retain every fresh message when React batches several transport updates into one render',()=>{
  const feed=new CommunityFeed();let current!:Parameters<Parameters<typeof feed.subscribe>[0]>[0];feed.subscribe(state=>current=state);
  feed.update({connected:true});feed.update({messages:[]},'history');
  for(let id=1;id<=3;id++)feed.update({messages:[message(id)]},'live');
  assert.equal(current.liveRevision,3);assert.deepEqual(current.liveMessages?.map(m=>m.id),[1,2,3]);
  assert.equal(nextChatNotice(null,current.liveMessages!,'self',1_000)?.count,3);
});

test('late history replies and rename metadata never replay a previous notice; each room has its own notice sequence',()=>{
  const feed=new CommunityFeed();let current!:Parameters<Parameters<typeof feed.subscribe>[0]>[0];feed.subscribe(state=>current=state);
  feed.update({connected:true});feed.update({messages:[]},'history');feed.update({messages:[message(1)]},'live');
  feed.update({messages:[message(1)]},'history');feed.update({name:'新昵称'});assert.equal(current.liveRevision,1);
  const another=new CommunityFeed();let separate!:typeof current;another.subscribe(state=>separate=state);another.update({connected:true});another.update({messages:[message(1)]},'history');assert.equal(separate.liveRevision,undefined);assert.equal(separate.name,undefined);
});

test('successive incoming messages extend a six second notice and summarize the burst while expiry keeps history intact',()=>{
  const first=nextChatNotice(null,[message(1)],'self',1_000)!;assert.equal(first.expiresAt,1_000+CHAT_NOTICE_MS);assert.equal(first.count,1);
  const extended=nextChatNotice(first,[message(2),message(3)],'self',6_500)!;assert.equal(extended.expiresAt,6_500+CHAT_NOTICE_MS);assert.equal(extended.count,3);assert.equal(extended.message.id,3);
  const afterExpiry=nextChatNotice(extended,[message(4)],'self',13_000)!;assert.equal(afterExpiry.count,1);assert.equal(afterExpiry.message.id,4);
  assert.equal(first.message.id,1,'notice updates do not mutate retained message snapshots');
});

test('own messages do not cause a bubble or extend an existing bubble, and system messages remain eligible',()=>{
  assert.equal(nextChatNotice(null,[message(1)],'p0',1_000),null);
  const notice=nextChatNotice(null,[message(2)],'self',1_000)!;assert.equal(nextChatNotice(notice,[message(3)],'p0',3_000),notice);
  const system={...message(4),senderId:undefined,kind:'system' as const};assert.equal(nextChatNotice(null,[system],'p0',1_000)?.message.id,4);
});

test('collapsed notice renders nickname and body as escaped plain text, truncates long messages and summarizes multiple messages',()=>{
  const raw={...message(1),senderName:'<img src=x onerror=alert(1)>',text:'<script>secret()</script>'+'长'.repeat(150)};
  const notice=nextChatNotice(null,[message(0),raw],'self',1_000)!;
  const output=renderToStaticMarkup(createElement(ChatNoticeBubble,{notice,onOpen:()=>{}}));
  assert(!output.includes('<script>'));assert(!output.includes('<img'));assert(output.includes('&lt;script&gt;'));assert(output.includes('共 2 条新消息'));assert(output.includes('…'));assert(!output.includes('长'.repeat(110)));
});
