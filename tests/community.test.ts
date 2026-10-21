import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store.js';
import { Rooms } from '../src/server/rooms.js';
import { deduplicateStoredNicknames, uniqueNickname, validateChatSend } from '../src/shared/chat.js';

test('昵称统一宽度和大小写，后缀选择最小空位并保持20字上限',()=>{
  assert.equal(uniqueNickname(' 小明 ',['小明','小明1','小明3']),'小明2');
  assert.equal(uniqueNickname('Ａlice',['alice']),'Alice1');
  const base='名'.repeat(20);assert.equal(uniqueNickname(base,[base,'名'.repeat(19)+'1']),'名'.repeat(19)+'2');
  assert.throws(()=>uniqueNickname('bad\u200bname',[]),/控制字符/);
  assert.throws(()=>validateChatSend({clientMessageId:'a',text:'\u0000'}),/控制字符/);
  assert.deepEqual(deduplicateStoredNicknames([{name:'小明'},{name:'小明'},{name:'小明1'}]).map(p=>p.name),['小明','小明2','小明1']);
});

test('玩家、人机和观众统一分配唯一昵称，退出不重排其他昵称',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);
  try{
    const host=rooms.create(' 同名 ',8),code=host.identity.roomCode;
    const one=rooms.join(code,'同名'),viewer=rooms.join(code,'同名','spectator'),two=rooms.join(code,'同名');
    assert.deepEqual(rooms.get(code).game.players.map(p=>p.name),['同名','同名1','同名3']);
    assert.equal(rooms.get(code).spectators![0]!.name,'同名2');
    rooms.leave(one.identity);assert.equal(rooms.get(code).game.players.at(-1)!.name,'同名3');
    assert.equal(rooms.join(code,'同名').room.players.at(-1)!.name,'同名3');
    assert.equal(rooms.get(code).game.players.find(p=>p.id===two.identity.playerId)!.name,'同名3');
    assert.equal(viewer.room.spectators![0]!.name,'同名2');
    const ai=rooms.create('电脑1',8,0,'ai',2);assert.deepEqual(ai.room.players.map(p=>p.name),['电脑1','电脑11','电脑2']);
  }finally{store.close();}
});

test('聊天独立于局面版本、持久幂等、频率校验、房间隔离和最近100条',()=>{
  const store=new Store(':memory:');let now=1_000;const rooms=new Rooms(store,0,()=>now);
  try{
    const host=rooms.create('甲',8),code=host.identity.roomCode,id=host.identity.playerId;
    const other=rooms.create('乙',8),viewer=rooms.join(code,'观众','spectator');
    const version=rooms.get(code).version;
    const first=rooms.chat(code,id,{clientMessageId:'message1',text:'<script>alert(1)</script>'});assert.equal(first.ok,true);
    assert.equal(rooms.get(code).version,version);assert.equal(first.message!.senderName,'甲');
    assert.equal(rooms.chat(code,id,{clientMessageId:'message1',text:'<script>alert(1)</script>'}).duplicate,true);
    assert.equal(rooms.chat(code,id,{clientMessageId:'message1',text:'被篡改'}).ok,false);
    assert.equal(rooms.chat(other.identity.roomCode,id,{clientMessageId:'x',text:'越权'}).ok,false);
    assert.equal(rooms.chat(code,viewer.identity.playerId,{clientMessageId:'viewer',text:'观众可发言'}).ok,true);
    for(let i=0;i<5;i++)assert.equal(rooms.chat(code,id,{clientMessageId:`limit${i}`,text:'文字'}).ok,true);
    assert.equal(rooms.chat(code,id,{clientMessageId:'too-fast',text:'文字'}).ok,false);
    assert.equal(rooms.chat(code,id,{clientMessageId:'long',text:'字'.repeat(501)}).ok,false);
    for(let i=0;i<105;i++){now+=10_001;assert.equal(rooms.chat(code,id,{clientMessageId:`many${i}`,text:`消息${i}`}).ok,true);}
    assert.equal(rooms.chatHistory(code,id).messages.length,100);assert.equal(rooms.chatHistory(code,id).messages.at(-1)!.text,'消息104');
    assert.equal(rooms.chatHistory(other.identity.roomCode,other.identity.playerId).messages.length,0);
    assert.throws(()=>rooms.chatHistory(code,other.identity.playerId),/房间成员/);
    const resumed=new Rooms(store,0,()=>now);assert.deepEqual(resumed.chatHistory(code,id),rooms.chatHistory(code,id));
    assert.equal(resumed.chat(code,id,{clientMessageId:'message1',text:'<script>alert(1)</script>'}).duplicate,true);
  }finally{store.close();}
});

test('每局改名只扣成功一次、保留历史名字、重连不恢复、新一局恢复且聊天不清空',()=>{
  const store=new Store(':memory:');const rooms=new Rooms(store,0);
  try{
    const host=rooms.create('甲',8),code=host.identity.roomCode,id=host.identity.playerId;
    rooms.join(code,'乙');rooms.join(code,'乙','spectator');
    assert.equal(rooms.rename(code,id,'lobby','新').ok,false);
    const game=rooms.get(code).game;game.phase='race';
    rooms.chat(code,id,{clientMessageId:'old-name',text:'原昵称发言'});
    assert.equal(rooms.rename(code,id,'invalid','  ').ok,false);assert.equal(rooms.view(rooms.get(code),id).renameRemaining,1);
    assert.equal(rooms.rename(code,id,'same','甲').ok,false);
    const changed=rooms.rename(code,id,'success','乙');assert.equal(changed.ok,true);assert.equal(changed.name,'乙2');
    assert.equal(rooms.rename(code,id,'success','乙').duplicate,true);
    assert.equal(rooms.rename(code,id,'another','新').ok,false);assert.equal(rooms.view(rooms.get(code),id).renameRemaining,0);
    rooms.chat(code,id,{clientMessageId:'new-name',text:'新昵称发言'});
    const messages=rooms.chatHistory(code,id).messages;assert.equal(messages[0]!.senderName,'甲');assert.equal(messages.at(-1)!.senderName,'乙2');assert.match(messages[1]!.text,/甲 已改名为 乙2/);
    const resumed=new Rooms(store,0);assert.equal(resumed.view(resumed.get(code),id).renameRemaining,0);assert.equal(resumed.rename(code,id,'reload','新').ok,false);
    resumed.get(code).game.phase='finished';const room=resumed.get(code);const reply=resumed.act(code,id,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'rematch'}});assert.equal(reply.ok,true);
    assert.equal(resumed.view(resumed.get(code),id).renameRemaining,1);assert.deepEqual(resumed.chatHistory(code,id).messages,messages);
  }finally{store.close();}
});

test('聊天和改名的存储失败不能泄漏成功或扣次数',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);
  try{
    const host=rooms.create('甲',2),code=host.identity.roomCode,id=host.identity.playerId;rooms.get(code).game.phase='race';
    const before=structuredClone(rooms.get(code)),commit=store.commitMember.bind(store);store.commitMember=()=>{throw Error('磁盘写入失败');};
    assert.equal(rooms.chat(code,id,{clientMessageId:'write-fail',text:'测试'}).ok,false);assert.equal(rooms.rename(code,id,'write-fail','乙').ok,false);assert.deepEqual(rooms.get(code),before);
    store.commitMember=commit;assert.equal(rooms.rename(code,id,'write-fail','乙').ok,true);
  }finally{store.close();}
});

test('旧存档重名自动修复且不改身份、积分或改名次数',()=>{
  const store=new Store(':memory:');
  try{
    const rooms=new Rooms(store,0),host=rooms.create('甲',4),code=host.identity.roomCode;
    rooms.join(code,'乙');rooms.join(code,'甲1','spectator');const old=rooms.get(code);old.game.players[1]!.name='甲';old.game.players[1]!.score=7;store.save(old);
    const restored=new Rooms(store,0),game=restored.get(code).game;assert.deepEqual(game.players.map(p=>p.name),['甲','甲2']);assert.equal(game.players[1]!.score,7);assert.equal(game.players[1]!.id,old.game.players[1]!.id);assert.equal(restored.view(restored.get(code),game.players[1]!.id).renameRemaining,1);
  }finally{store.close();}
});

test('待核实规则暂停会明确展示原因，同时保留聊天室',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);
  try{
    const host=rooms.create('甲',2),code=host.identity.roomCode,id=host.identity.playerId,room=rooms.get(code);
    room.game.phase='paused';room.game.flags.ruleHold={code:'mr-dice-no-repeat',message:'六骰无重复，等待官方裁定'};
    assert.equal(rooms.view(room,id).rulesStatus,'六骰无重复，等待官方裁定');assert.equal(rooms.chat(code,id,{clientMessageId:'paused',text:'暂停时仍能商量'}).ok,true);
    assert.equal(rooms.chatHistory(code,id).messages.at(-1)!.text,'暂停时仍能商量');assert.equal(room.game.phase,'paused');
  }finally{store.close();}
});

test('正式关闭会清除SQLite聊天和消息回执，重建服务不能恢复，其他房间不受影响',()=>{
  const store=new Store(':memory:'),rooms=new Rooms(store,0);
  try{
    const host=rooms.create('甲',2),code=host.identity.roomCode,id=host.identity.playerId;
    const other=rooms.create('另一房间',2),otherCode=other.identity.roomCode,otherId=other.identity.playerId;
    assert.equal(rooms.chat(code,id,{clientMessageId:'close-chat',text:'关闭后应删除'}).ok,true);
    assert.equal(rooms.chat(otherCode,otherId,{clientMessageId:'retained-chat',text:'另一个房间应保留'}).ok,true);
    assert(store.memberReceipt(code,id,'chat','close-chat'));assert.equal(store.load().find(room=>room.code===code)!.chat!.messages.length,1);
    const room=rooms.get(code);assert.equal(rooms.act(code,id,{actionId:crypto.randomUUID(),expectedVersion:room.version,action:{type:'close'}}).ok,true);
    assert.equal(store.load().some(saved=>saved.code===code),false);assert.equal(store.memberReceipt(code,id,'chat','close-chat'),undefined);
    for(const table of ['rooms','identities','receipts','member_receipts']){
      const column=table==='rooms'?'code':'room_code';
      const row=store.db.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${column}=?`).get(code) as {count:number};assert.equal(row.count,0,table);
    }
    const restored=new Rooms(store,0);assert.throws(()=>restored.chatHistory(code,id),/房间已关闭/);assert.equal(restored.chat(code,id,{clientMessageId:'close-chat',text:'关闭后应删除'}).ok,false);
    assert.equal(restored.chatHistory(otherCode,otherId).messages[0]!.text,'另一个房间应保留');assert.equal(store.closed(code)!.reason,'dismissed');
  }finally{store.close();}
});
