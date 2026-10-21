import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAI } from '../src/engine/ai.js';
import type { RoomView } from '../src/shared/types.js';
function fixture(kind:string): RoomView {
  return {code:'ABC234',version:1,hostId:'p0',selfId:'p0',maxPlayers:3,timeoutSeconds:0,deadline:null,phase:'race',round:1,track:'mild',players:[{id:'p0',seat:0,name:'电脑',color:'#000',ready:true,connected:true,score:0,handCount:0,used:[],selected:true}],racers:[{id:'r0',characterId:'cheatah',playerId:'p0',position:2,tripped:false,finished:false,eliminated:false,flags:{}}],currentRacerId:'r0',logs:[],results:[],rulesStatus:'test',pending:{id:'c1',playerId:'p0',racerId:'r0',kind,title:'选择',options:Array.from({length:6},(_,i)=>({id:String(i+1),label:String(i+1)})),optional:false}};
}
test('Cheatah AI uses legal reproducible public choices and does not always set/guess1',()=>{
  for (const kind of ['cheatah','cheatah-guess']) {
    const picks=new Set<string>();const view=fixture(kind);
    for(let version=1;version<=36;version++){view.version=version;const action=decideAI(view);assert(action?.type==='choose');assert(view.pending!.options.some(option=>option.id===action.optionId));assert.deepEqual(decideAI(structuredClone(view)),action);picks.add(action.optionId);}
    assert(picks.size>=4);
  }
});
test('Mr Dice Guy AI chooses the highest offered repeated value and Show Off can stop',()=>{
  const dice=fixture('mr-dice-pick');dice.pending!.options=[{id:'2',label:'2（2次）'},{id:'5',label:'5（3次）'}];assert.deepEqual(decideAI(dice),{type:'choose',choiceId:'c1',optionId:'5'});
  const show=fixture('show-off');show.pending!.options=[{id:'roll',label:'继续'},{id:'stop',label:'停止'}];assert.deepEqual(decideAI(show),{type:'choose',choiceId:'c1',optionId:'stop'});
});
