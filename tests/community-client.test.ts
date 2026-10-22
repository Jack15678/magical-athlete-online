import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityFeed } from '../src/client/community.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAT_NOTICE_CONFIG, CHAT_NOTICE_MS, ChatNoticeBubble, appendChatNotices, advanceChatNotices } from '../src/client/chat-notices.js';
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
  assert.equal(appendChatNotices([],current.liveMessages!,'self',1_000,5).length,3);
});

test('late history replies and rename metadata never replay a previous notice; each room has its own notice sequence',()=>{
  const feed=new CommunityFeed();let current!:Parameters<Parameters<typeof feed.subscribe>[0]>[0];feed.subscribe(state=>current=state);
  feed.update({connected:true});feed.update({messages:[]},'history');feed.update({messages:[message(1)]},'live');
  feed.update({messages:[message(1)]},'history');feed.update({name:'新昵称'});assert.equal(current.liveRevision,1);
  const another=new CommunityFeed();let separate!:typeof current;another.subscribe(state=>separate=state);another.update({connected:true});another.update({messages:[message(1)]},'history');assert.equal(separate.liveRevision,undefined);assert.equal(separate.name,undefined);
});

test('each bubble keeps an independent eight second lifetime and fades without deleting history',()=>{
  const first=appendChatNotices([],[message(1)],'self',1_000,5);assert.equal(first[0]!.expiresAt,1_000+CHAT_NOTICE_MS);
  const burst=appendChatNotices(first,[message(2),message(3)],'self',6_500,5);assert.deepEqual(burst.map(n=>n.message.id),[1,2,3]);
  assert.equal(burst[0]!.expiresAt,9_000,'new messages never extend old messages');
  const fading=advanceChatNotices(burst,9_000,5);assert.equal(fading[0]!.leaving,true);assert.equal(fading[1]!.leaving,false);
  assert.deepEqual(advanceChatNotices(fading,9_000+CHAT_NOTICE_CONFIG.exitMs,5).map(n=>n.message.id),[2,3]);
  assert.equal(first[0]!.message.id,1,'history message snapshots remain unchanged');
});

test('own messages do not cause a bubble or extend an existing bubble, and system messages remain eligible',()=>{
  assert.deepEqual(appendChatNotices([],[message(1)],'p0',1_000,5),[]);
  const notices=appendChatNotices([],[message(2)],'self',1_000,5);assert.deepEqual(appendChatNotices(notices,[message(3)],'p0',3_000,5),notices);
  const system={...message(4),senderId:undefined,kind:'system' as const};assert.equal(appendChatNotices([],[system],'p0',1_000,5)[0]!.message.id,4);
});

test('bounded desktop/mobile stacks deduplicate stable IDs and keep oldest above newest',()=>{
  const burst=Array.from({length:10},(_,i)=>message(i+1));
  const desktop=appendChatNotices([],burst,'self',1_000,CHAT_NOTICE_CONFIG.desktopLimit);assert.deepEqual(desktop.map(n=>n.message.id),[6,7,8,9,10]);
  assert.deepEqual(appendChatNotices(desktop,[message(8),message(10)],'self',2_000,5),desktop);
  assert.deepEqual(advanceChatNotices(desktop,2_000,CHAT_NOTICE_CONFIG.mobileLimit).map(n=>n.message.id),[8,9,10]);
});

test('collapsed notices render nickname and body as escaped plain text and truncate only the preview',()=>{
  const raw={...message(1),senderName:'<img src=x onerror=alert(1)>',text:'<script>secret()</script>'+'长'.repeat(200)};
  const notice=appendChatNotices([],[raw],'self',1_000,5)[0]!;
  const output=renderToStaticMarkup(createElement(ChatNoticeBubble,{notice,onOpen:()=>{}}));
  assert(!output.includes('<script>'));assert(!output.includes('<img'));assert(output.includes('&lt;script&gt;'));assert(output.includes('…'));assert(!output.includes('长'.repeat(170)));assert.equal(raw.text.length,225);
});
