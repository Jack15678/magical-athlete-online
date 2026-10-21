import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/server/index.js';
import { ROOM_OWNER_AWAY_MS } from '../src/shared/room-lifecycle.js';
import type { ChatReply, Identity, RenameReply, RoomView } from '../src/shared/types.js';

function once<T>(socket:Socket,event:string):Promise<T>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`${event} timeout`)),4000);socket.once(event,(value:T)=>{clearTimeout(timer);resolve(value);});});}
function request<T>(socket:Socket,event:string,value:unknown):Promise<T>{return new Promise((resolve,reject)=>socket.timeout(4000).emit(event,value,(error:Error|null,result:T)=>error?reject(error):resolve(result)));}

test('Node实时聊天在技能等待期间同步到玩家和观众、按房间隔离，改名及时更新且重连恢复',async()=>{
  const app=createApplication(':memory:');await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));
  const address=app.http.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`,sockets:Socket[]=[];
  const post=async(path:string,data:unknown)=>{const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(response.status,201);return await response.json() as {identity:Identity;room:RoomView};};
  const connect=async(identity:Identity)=>{const socket=io(origin,{auth:identity,transports:['websocket'],reconnection:false,forceNew:true});sockets.push(socket);const snapshot=await once<RoomView>(socket,'snapshot');return{socket,snapshot};};
  try{
    const created=await post('/api/rooms',{name:'同名',maxPlayers:2,timeoutSeconds:0}),code=created.identity.roomCode;
    const guest=await post(`/api/rooms/${code}/join`,{name:'同名'}),viewer=await post(`/api/rooms/${code}/join`,{name:'同名',role:'spectator'});
    assert.equal(guest.room.players[1]!.name,'同名1');assert.equal(viewer.room.spectators![0]!.name,'同名2');
    const host=await connect(created.identity),peer=await connect(guest.identity),spectator=await connect(viewer.identity),other=await connect((await post('/api/rooms',{name:'另一房间'})).identity);
    let outsideMessages=0;other.socket.on('chat',()=>outsideMessages++);
    const room=app.rooms.get(code);room.game.phase='race';room.game.pending={id:'pending-human',kind:'test',playerId:guest.identity.playerId,title:'等待技能',options:[{id:'yes',label:'确认'}],optional:false,context:{secret:'只保存在规则内'}};
    const version=room.version,pending=structuredClone(room.game.pending),received=once<{messages:{text:string}[]}>(spectator.socket,'chat');
    const result=await request<ChatReply>(host.socket,'chat-send',{clientMessageId:'chat1',text:'<script>纯文本</script>'});assert.equal(result.ok,true);assert.equal((await received).messages[0]!.text,'<script>纯文本</script>');assert.equal(outsideMessages,0);
    assert.equal(app.rooms.get(code).version,version);assert.deepEqual(app.rooms.get(code).game.pending,pending);
    const names=await Promise.all([request<RenameReply>(host.socket,'rename',{requestId:'host-rename',name:'新名'}),request<RenameReply>(peer.socket,'rename',{requestId:'peer-rename',name:'新名'})]);
    assert(names.every(reply=>reply.ok));assert.deepEqual(new Set(names.map(reply=>reply.name)),new Set(['新名','新名1']));
    assert.equal((await request<RenameReply>(host.socket,'rename',{requestId:'host-again',name:'第二个'})).ok,false);
    assert.deepEqual(app.rooms.get(code).game.pending,pending);
    host.socket.disconnect();const reconnected=await connect(created.identity);assert.equal(reconnected.snapshot.renameRemaining,0);assert.equal(reconnected.snapshot.chat![0]!.senderName,'同名');assert.equal(reconnected.snapshot.chat!.filter(message=>message.kind==='system').length,2);
    const history=await request<{ok:boolean;messages:{text:string}[];latestId:number}>(reconnected.socket,'chat-sync',{afterId:0});assert.equal(history.ok,true);assert.equal(history.messages.length,3);
    assert.equal((await request<ChatReply>(reconnected.socket,'chat-send',{clientMessageId:'chat1',text:'<script>纯文本</script>'})).duplicate,true);
  }finally{for(const socket of sockets)socket.disconnect();await app.close();}
});

for(const operation of ['chat-send','rename'] as const)test(`Node ${operation}提交与广播之间恰好过期会正常关闭，不抛异常或发布已关闭房间聊天`,async()=>{
  const app=createApplication(':memory:');let now=1_000;
  (app.rooms as {now:()=>number}).now=()=>now;
  await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));
  const address=app.http.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  const created=app.rooms.create('离线房主',2,0),code=created.identity.roomCode,guest=app.rooms.join(code,'在线成员');
  const socket=io(origin,{auth:guest.identity,transports:['websocket'],reconnection:false,forceNew:true});
  try{
    await once<RoomView>(socket,'snapshot');
    const expiresAt=app.rooms.get(code).hostLeftAt!+ROOM_OWNER_AWAY_MS;app.rooms.get(code).game.phase='race';
    // Advance only after the mutation is durably accepted. chat-send expires
    // in publishChat; rename first expires in its snapshot broadcast, so the
    // following publishChat encounters a room already removed from the map.
    if(operation==='chat-send'){
      const send=app.rooms.chat.bind(app.rooms);
      app.rooms.chat=(...args)=>{const reply=send(...args);if(reply.ok)now=expiresAt;return reply;};
    }else{
      const rename=app.rooms.rename.bind(app.rooms);
      app.rooms.rename=(...args)=>{const reply=rename(...args);if(reply.ok)now=expiresAt;return reply;};
    }
    let broadcasts=0;socket.on('chat',()=>broadcasts++);
    const closed=once<{code:string;reason:string}>(socket,'room-closed'),disconnected=once(socket,'disconnect');
    const reply=operation==='chat-send'
      ?await request<ChatReply>(socket,'chat-send',{clientMessageId:'expiry-race',text:'刚好截止前发送'})
      :await request<RenameReply>(socket,'rename',{requestId:'expiry-race',name:'截止前改名'});
    assert.equal(reply.ok,true);assert.deepEqual(await closed,{code,closedAt:expiresAt,reason:'host-away'});await disconnected;
    assert.equal(broadcasts,0);assert.equal(app.rooms.rooms.has(code),false);assert.equal(app.store.load().some(room=>room.code===code),false);
    assert.equal(app.store.memberReceipt(code,guest.identity.playerId,operation==='chat-send'?'chat':'rename','expiry-race'),undefined);
    assert.equal((await fetch(`${origin}/api/health`)).status,200);
  }finally{socket.disconnect();await app.close();}
});
