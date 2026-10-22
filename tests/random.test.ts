import test from 'node:test';
import assert from 'node:assert/strict';
import { chacha20Block,createRandomStream,nextRandomWord,secureRandomSeed,uniformInteger } from '../src/shared/random.js';
import { Rooms } from '../src/server/rooms.js';
import { Store } from '../src/server/store.js';
import { publicEventBatch } from '../src/shared/public-events.js';
import { createCipheriv } from 'node:crypto';

const seed=Array.from({length:11},(_,index)=>index);
test('multiple ChaCha20 blocks independently match the platform OpenSSL implementation',()=>{
  for(let sample=0;sample<20;sample++){
    const words=Array.from({length:11},(_,index)=>(Math.imul(sample+1,0x9e3779b9)^Math.imul(index+1,0x85ebca6b))>>>0);
    const key=Buffer.alloc(32),iv=Buffer.alloc(16);words.slice(0,8).forEach((word,index)=>key.writeUInt32LE(word,index*4));iv.writeUInt32LE(sample,0);words.slice(8).forEach((word,index)=>iv.writeUInt32LE(word,4+index*4));
    const cipher=createCipheriv('chacha20',key,iv),expected=cipher.update(Buffer.alloc(64*3));
    const actual=Buffer.alloc(64*3);for(let block=0;block<3;block++)chacha20Block(words.slice(0,8),words.slice(8),sample+block).forEach((word,index)=>actual.writeUInt32LE(word,block*64+index*4));
    assert.deepEqual(actual,expected);
  }
});
test('ChaCha20 block matches the independent RFC 8439 section 2.3.2 vector',()=>{
  const key=[0x03020100,0x07060504,0x0b0a0908,0x0f0e0d0c,0x13121110,0x17161514,0x1b1a1918,0x1f1e1d1c];
  assert.deepEqual(chacha20Block(key,[0x09000000,0x4a000000,0],1),[0xe4e7f110,0x15593bd1,0x1fdd0f50,0xc47120a3,0xc7f4d1c7,0x0368c033,0x9aaa2204,0x4e6cd4c3,0x466482d2,0x09aa9f07,0x05d7c214,0xa2028bd9,0xd19c12b5,0xb94e16de,0xe883d0cb,0x4e3c50a2]);
});
test('uniform bounded draws reject the high incomplete range instead of biasing dice or shuffles',()=>{
  for(const bound of [6,36,72]){
    const rejected=[0xffffffff,0xfffffffe,0xfffffffd,0];let cursor=0;
    assert.equal(uniformInteger(bound,()=>rejected[cursor++]!),1);assert.equal(cursor,4);
    assert.equal(uniformInteger(bound,()=>bound-1),bound);
  }
  assert.equal(uniformInteger(0x100000000,()=>0xffffffff),0x100000000);
  for(const bound of [0,-1,1.5,Infinity,0x100000001])assert.throws(()=>uniformInteger(bound,()=>0),/范围/);
});
test('JSON storage resumes the exact stream across cached block boundaries without reusing words',()=>{
  const stream=createRandomStream(seed);for(let index=0;index<15;index++)nextRandomWord(stream);
  const saved=JSON.parse(JSON.stringify(stream));
  const read=(value:typeof stream)=>Array.from({length:67},()=>nextRandomWord(value));
  const sequence=read(stream);assert.deepEqual(read(saved),sequence);assert.equal(stream.counter,6);assert.equal(stream.offset,2);
  assert.notDeepEqual(read(createRandomStream(seed)),sequence);
  const exhausted=createRandomStream(seed);exhausted.counter=0x100000000;assert.throws(()=>nextRandomWord(exhausted),/耗尽/);
});
test('production rooms use crypto seeds and never expose the key, cached words or nonce in public views',()=>{
  const fresh=secureRandomSeed();assert.equal(fresh.length,11);assert(fresh.every(value=>Number.isInteger(value)&&value>=0&&value<0x100000000));
  const store=new Store(':memory:');try{
    const rooms=new Rooms(store,0),first=rooms.create('房主',2,0),second=rooms.create('另一房主',2,0);
    const room=rooms.get(first.identity.roomCode),stream=room.game.randomStream!;
    assert.equal(stream.algorithm,'chacha20-v1');assert.notDeepEqual(stream.key,rooms.get(second.identity.roomCode).game.randomStream!.key);
    const json=JSON.stringify({view:first.room,batch:publicEventBatch(room,first.identity.playerId,0)});
    assert(!/randomStream|rngState|"key"|"nonce"|"words"/.test(json));
    assert.deepEqual(store.load().find(value=>value.code===room.code)!.game.randomStream,stream);
  }finally{store.close();}
});
