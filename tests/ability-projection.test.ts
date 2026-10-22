import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../src/engine/index.js';
import { publicAbilityState, SECOND_WIND_V2_RULES_VERSION } from '../src/engine/runtime.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { Player, Room } from '../src/shared/types.js';

function fixture():Room{
  const players:Player[]=['甲','乙'].map((name,seat)=>({id:`p${seat}`,name,seat,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]}));
  const game=createGame(players,5,'multiplayer','mixed');
  game.phase='race';game.round=1;game.currentRacerId='film';
  game.config={version:'room-config-v1',characterPacks:{original:true,'second-wind':true,'extra-mile':true,'leaf-fan':true},optionalRules:[]};
  game.racers=[
    {id:'film',playerId:'p0',characterId:'leaf-filmmaker',position:5,tripped:false,finished:false,eliminated:false,flags:{
      secretLeafHand:['genius','legs'],acquiredPowers:['coach'],
      acquiredPowerSources:{coach:{sourceCardId:'coach',via:'mush',secretCandidate:'INTERNAL_SOURCE_ONLY'}},
      leafBorrowedPowers:[{power:'banana',source:'leaf-filmmaker'}],leafDisplayedCards:[{power:'banana',source:'leaf-filmmaker'}],
    }},
    {id:'null',playerId:'p1',characterId:'null',position:1,tripped:false,finished:false,eliminated:false,flags:{}},
  ];
  game.pending={id:'film-choice',playerId:'p0',racerId:'film',kind:'leaf-film-card',title:'选择影片',options:[{id:'genius',label:'天才'},{id:'legs',label:'大长腿'}],optional:false,context:{privateCards:['genius','legs']}};
  return{code:'ABC234',hostId:'p0',version:1,createdAt:1,updatedAt:1,maxPlayers:2,timeoutSeconds:0,deadline:null,game,spectators:[{id:'spectator',name:'观众',connected:true}]};
}

test('owned permanent and temporary abilities stay public under Null while undiscarded film cards remain private',()=>{
  const room=fixture();
  for(const viewer of ['p0','p1','spectator']){
    const view=projectRoom(room,viewer,{authorityId:'p0',authorityOnline:true}),flags=view.racers[0]!.flags,state=flags.publicAbilities!;
    assert.deepEqual(state.powers,[]);
    assert.deepEqual(new Set(state.ownedPowers),new Set(['leaf-filmmaker','coach','banana']));
    assert.deepEqual(state.disabledBy,['null']);
    assert(state.entries?.some(entry=>entry.id==='banana'&&entry.origin==='temporary'&&entry.duration==='next-turn'));
    assert(state.entries?.some(entry=>entry.id==='coach'&&entry.origin==='acquired'&&entry.duration==='race'));
    assert(!JSON.stringify(flags).includes('genius'));assert(!JSON.stringify(flags).includes('legs'));
    assert(!JSON.stringify(view).includes('INTERNAL_SOURCE_ONLY'));
    assert.equal(flags.acquiredPowerSources,undefined);
    if(viewer==='p0')assert.deepEqual(view.pending?.options.map(option=>option.id),['genius','legs']);
    else{assert.equal(view.pending,undefined);assert(!JSON.stringify(view).includes('genius'));assert(!JSON.stringify(view).includes('legs'));}
  }
  assert.equal((room.game.racers[0]!.flags.acquiredPowerSources as Record<string,{secretCandidate:string}>).coach!.secretCandidate,'INTERNAL_SOURCE_ONLY');
});

test('ability projection is independent and suppression or controller changes do not discard grants',()=>{
  const room=fixture(),first=projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true});
  first.racers[0]!.flags.publicAbilities!.ownedPowers!.length=0;
  first.racers[0]!.flags.publicAbilities!.entries![0]!.id='hare';
  room.game.racers[1]!.position=9;room.game.racers[0]!.playerId='p1';
  const next=projectRoom(room,'p1',{authorityId:'p0',authorityOnline:true}),state=next.racers[0]!.flags.publicAbilities!;
  assert.deepEqual(state.disabledBy,[]);assert.deepEqual(state.powers,state.ownedPowers);
  assert.deepEqual(new Set(state.powers),new Set(['leaf-filmmaker','coach','banana']));
  assert.equal(state.entries![0]!.id,'leaf-filmmaker');assert.equal(next.racers[0]!.playerId,'p1');
  assert.equal(next.pending,undefined,'a stale private prompt is not reassigned to another controller by the detail projection');
});

test('frozen v2 ability projections retain their old public semantics without manufacturing new grant history',()=>{
  const room=fixture();room.game.rulesVersion=SECOND_WIND_V2_RULES_VERSION;
  room.game.racers[0]!.characterId='mush';room.game.racers[0]!.flags={acquiredPowers:['coach'],copiedFrom:undefined};
  const disabled=publicAbilityState(room.game,room.game.racers[0]!);
  assert.deepEqual(disabled.powers,[]);assert.deepEqual(disabled.acquired,['coach']);
  assert.equal(disabled.ownedPowers,undefined);assert.equal(disabled.entries,undefined);
  room.game.racers[1]!.position=9;
  assert.deepEqual(publicAbilityState(room.game,room.game.racers[0]!).powers,['mush','coach']);
});
