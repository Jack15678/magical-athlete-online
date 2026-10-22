import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame,startGame,applyGameAction,automaticAction } from '../src/engine/index.js';
import type { GameState,Player } from '../src/shared/types.js';
// These complete-game simulations intentionally automate every participant.
// Human duel clicks are never supplied by the production timeout policy.
function players(n:number):Player[]{return Array.from({length:n},(_,seat)=>({id:`p${seat}`,name:`同学${seat}`,seat,isAI:true,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));}
function run(n:number,seed:number){const s=createGame(players(n),seed);startGame(s);let steps=0;while(s.phase!=='finished'&&s.phase!=='paused'){if(++steps>10000)throw Error(`Test execution budget exhausted ${n}/${seed}: ${s.phase} ${s.pending?.kind}`);const a=automaticAction(s);assert(a,`No legal continuation: ${s.phase}`);applyGameAction(s,a.playerId,a.action);}return s;}
for(const n of [2,3,4,5,6,7,8])test(`${n}人从两批选秀到四场终局，初始选牌唯一`,()=>{
  const s=createGame(players(n),2051+n);startGame(s);while(s.phase==='draft'){const a=automaticAction(s)!;applyGameAction(s,a.playerId,a.action);}
  const cards=s.players.flatMap(p=>p.hand);assert.equal(cards.length,n===2?16:n*4);assert.equal(new Set(cards).size,cards.length);assert(s.players.every(p=>p.hand.length===(n===2?8:4)));
  let steps=0;while((s as GameState).phase!=='finished'){if(++steps>10000)throw Error(`Test budget exhausted ${n}: ${s.phase}`);const a=automaticAction(s);assert(a,`No continuation: ${s.phase}`);applyGameAction(s,a.playerId,a.action);}
  assert.equal(s.results.length,4);assert(s.results.every((r,i)=>r.round===i+1&&r.placements.some(p=>p.rank===1)));assert(s.players.every(p=>p.hand.length===0));assert(s.players.every(p=>p.used.length===(n===2?8:4)));
});
test('同一测试种子与操作策略可重放完全相同的骰子、结算及独立诊断暂停',()=>{const a=run(8,82026),b=run(8,82026);assert.deepEqual(a.randomLog,b.randomLog);assert.deepEqual(a.results,b.results);assert.deepEqual(a.players.map(p=>p.score),b.players.map(p=>p.score));});
test('待处理技能选择序列化后恢复与原状态相同',()=>{const s=createGame(players(6),19);startGame(s);let guard=0;while(!s.pending){assert(++guard<1000);const a=automaticAction(s)!;applyGameAction(s,a.playerId,a.action);}const clone=JSON.parse(JSON.stringify(s)) as GameState;const a=automaticAction(s)!;applyGameAction(s,a.playerId,a.action);applyGameAction(clone,a.playerId,a.action);assert.deepEqual(JSON.parse(JSON.stringify(s)),JSON.parse(JSON.stringify(clone)));});
