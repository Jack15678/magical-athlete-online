import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationEventClient, PresentationEventStream } from '../src/client/presentation-events.js';
import { PUBLIC_EVENT_BATCH_BYTES, publicEventBatch, validatePublicEventBatch } from '../src/shared/public-events.js';
import { createGame } from '../src/engine/index.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { GameEvent, Room, RoomView } from '../src/shared/types.js';

function room(count:number,version=2):Room{
  const game=createGame([{id:'self',name:'自己',seat:0,color:'#000',ready:true,connected:true,score:0,hand:['private-hand'],selection:['private-selection'],used:[]}],1,'practice');
  game.phase='race';game.round=1;game.pending={id:'private-choice',playerId:'self',title:'选择',kind:'test',options:[],optional:false,context:{secret:'private-context'}};
  game.logs=Array.from({length:count},(_,i):GameEvent=>({id:i+1,type:'power',source:'r1',text:`第${i+1}个公开效果：`+'因果说明'.repeat(100)}));
  return{code:'ABC234',hostId:'self',mode:'practice',createdAt:1,updatedAt:1,version,maxPlayers:1,timeoutSeconds:0,deadline:null,game};
}
const view=(r:Room)=>projectRoom(r,'self',{authorityId:'self',authorityOnline:true});

test('public animation pages are byte bounded and never serialize hands, choices, RNG or deck',()=>{
  const state=room(500),batch=publicEventBatch(state,'self',0);
  assert(validatePublicEventBatch(batch));assert(batch.events.length>0&&batch.events.length<500);
  assert(new TextEncoder().encode(JSON.stringify(batch)).byteLength<=PUBLIC_EVENT_BATCH_BYTES);
  assert.deepEqual(batch.events.map(event=>event.id),Array.from({length:batch.events.length},(_,i)=>i+1));
  assert(!JSON.stringify(batch).match(/private-hand|private-selection|private-context|rngState|deck/));
  assert.throws(()=>publicEventBatch(state,'outsider',0),/参赛席位/);
  for(const cursor of [-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>publicEventBatch(state,'self',cursor),/游标/);
});

test('a live action exceeding the 120-row UI log is repaired completely before any snapshot reaches playback',()=>{
  const stream=new PresentationEventStream();stream.receive(view(room(0,1)));
  const state=room(500);let update=stream.receive(view(state));assert.equal(update.room,undefined);assert.equal(update.afterId,0);
  let pages=0;
  while(update.afterId!==undefined){assert(++pages<20);update=stream.accept(publicEventBatch(state,'self',update.afterId),stream.generation);}
  assert(pages>1);assert(update.room);assert.equal(update.room.logs.length,120);
  assert.deepEqual(update.room.presentationEvents?.map(event=>event.id),Array.from({length:500},(_,i)=>i+1));
});

test('newer snapshots arriving during an older event request preserve cross-version continuity',()=>{
  const stream=new PresentationEventStream();stream.receive(view(room(0,1)));
  const previous=room(400,2);let update=stream.receive(view(previous));const oldBatch=publicEventBatch(previous,'self',update.afterId!);
  const newer=room(550,3);update=stream.receive(view(newer));assert.equal(update.room,undefined);
  update=stream.accept(oldBatch,stream.generation);
  let guard=0;while(update.afterId!==undefined){assert(++guard<20);update=stream.accept(publicEventBatch(newer,'self',update.afterId),stream.generation);}
  assert.equal(update.room?.version,3);assert.deepEqual(update.room?.presentationEvents?.map(event=>event.id),Array.from({length:550},(_,i)=>i+1));
});

test('unacknowledged events survive coalesced UI snapshots and acknowledgements only release already queued events',()=>{
  const stream=new PresentationEventStream();stream.receive(view(room(0,1)));
  stream.receive(view(room(50,2)));const coalesced=stream.receive(view(room(100,3))).room!;
  assert.deepEqual(coalesced.presentationEvents?.map(event=>event.id),Array.from({length:100},(_,i)=>i+1));
  stream.acknowledge(100);const next=stream.receive(view(room(150,4))).room!;
  assert.equal(next.presentationEvents?.at(-1)?.id,150);
  assert.deepEqual(next.presentationEvents?.filter(event=>event.id>100).map(event=>event.id),Array.from({length:50},(_,i)=>i+101));
  const repeated=stream.receive(view(room(150,5))).room!;assert.equal(repeated.presentationEvents?.at(-1)?.id,150,'ordinary roster snapshots keep the high-water mark');
});

test('first connect and true reconnect establish a current baseline while old in-flight pages are ignored',()=>{
  const stream=new PresentationEventStream(),first=stream.receive(view(room(400))).room!;
  assert.equal(first.presentationEvents?.at(-1)?.id,400);assert.equal(first.presentationEvents?.length,120);
  const generation=stream.generation;stream.reset();const reconnect=stream.receive(view(room(500,3))).room!;
  assert.equal(reconnect.presentationEvents?.at(-1)?.id,500);
  assert.deepEqual(stream.accept(publicEventBatch(room(400),'self',0),generation),{});
});

test('the async transport adapter withholds a gapped live snapshot until all pages are ready',async()=>{
  const state=room(400),published:RoomView[]=[],failures:unknown[]=[];let release:(()=>void)|undefined;let requests=0;
  const client=new PresentationEventClient(async after=>{requests++;await new Promise<void>(resolve=>release=resolve);return publicEventBatch(state,'self',after);},snapshot=>published.push(snapshot),error=>failures.push(error));
  client.receive(view(room(0,1)));client.receive(view(state));assert.equal(published.length,1);
  for(let i=0;i<20&&published.length===1;i++){release?.();await new Promise(resolve=>setImmediate(resolve));}
  assert(requests>1);assert.equal(published.length,2);assert.equal(published[1]?.presentationEvents?.length,400);assert.deepEqual(failures,[]);
});
