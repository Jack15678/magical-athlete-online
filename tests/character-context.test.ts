import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CharacterOwnership, StepdadTarget, characterContext, currentController, copiedAbilitySource } from '../src/client/character-context.js';
import { createGame } from '../src/engine/index.js';
import { projectRoom } from '../src/shared/room-core.js';
import type { Racer, RoomView } from '../src/shared/types.js';

const racer=(id:string,playerId:string,characterId='switcharoo'):Racer=>({id,playerId,identityPlayerId:playerId,characterId,position:4,tripped:false,finished:false,eliminated:false,flags:{}});
function room():RoomView{
  const game=createGame(['甲','乙'].map((name,seat)=>({id:`p${seat}`,name,seat,color:'#000',ready:true,connected:true,score:0,hand:[],used:[],selection:[]})),1);
  game.phase='race';game.round=1;
  return projectRoom({code:'ABC234',hostId:'p0',createdAt:1,updatedAt:1,version:1,maxPlayers:2,timeoutSeconds:0,deadline:null,game},'p0',{authorityId:'p0',authorityOnline:true});
}
const html=(view:RoomView,id:string,selectedId?:string)=>renderToStaticMarkup(createElement(CharacterOwnership,{room:view,characterId:id,selectedId,onSelect:()=>{}}));

test('only a copied primary power names its public source; acquired powers are not mislabelled as copies',()=>{
  const view=room(),actor=racer('a','p0','understudy'),source=racer('b','p0','kraken');view.racers=[actor,source];
  actor.flags.publicAbilities={powers:['kraken','coach'],acquired:['coach'],copiedFrom:'b'};
  assert.match(copiedAbilitySource(view,actor,'kraken')!,/海怪.*甲.*你/);
  assert.equal(copiedAbilitySource(view,actor,'coach'),undefined);
});

test('Stepdad details identify the exact same-controller neighbor and explain that screen-left is irrelevant',()=>{
  const view=room(),step=racer('step','p0','stepdad'),target=racer('target','p0','alchemist');
  step.flags.publicAbilities={powers:['stepdad'],stepTargetId:'target'};view.racers=[step,target];
  const detail=renderToStaticMarkup(createElement(StepdadTarget,{room:view,racer:step}));
  assert.match(detail,/屏幕左右/);assert.match(detail,/自己控制的另一名选手/);assert.match(detail,/炼金术士/);assert.match(detail,/甲/);assert.match(detail,/主要移动加 2/);
});

test('avatar details follow the authoritative current controller after Switcharoo, including a stale animation racer',()=>{
  const view=room(),previous=racer('r1','p0');view.racers=[{...previous,playerId:'p1'}];
  assert.equal(currentController(view,previous)?.id,'p1');
  const output=html(view,'switcharoo','r1');assert.match(output,/2号 · 乙/);assert.match(output,/控制权已交换/);assert.doesNotMatch(output,/1号 · 甲/);
  view.players[1]!.name='新昵称';assert.match(html(view,'switcharoo'),/新昵称/);
});

test('separate instances of the same printed character retain distinct IDs and controllers',()=>{
  const view=room();view.racers=[racer('first','p0'),racer('second','p1')];
  assert.deepEqual(characterContext(view,'switcharoo').racers.map(r=>r.id),['first','second']);
  const output=html(view,'switcharoo','second');assert.match(output,/本场实例 1/);assert.match(output,/本场实例 2/);
  assert.match(output,/data-racer-id="second"[^>]*aria-pressed="true"/);assert.match(output,/1号 · 甲（你）/);assert.match(output,/2号 · 乙/);
});

test('details only reveal the viewer hand or publicly played cards, never opponents hidden hands or secret selections',()=>{
  const view=room();view.phase='selection';view.players[0]!.hand=['coach'];view.players[1]!.hand=['coach','gunk'];view.players[1]!.selection=['gunk'];
  view.racers=[racer('last-round','p1','gunk')];
  assert.deepEqual(characterContext(view,'coach').holdings.map(h=>h.player.id),['p0']);
  const hidden=characterContext(view,'gunk');assert.equal(hidden.racers.length,0);assert.equal(hidden.holdings.length,0);assert.doesNotMatch(html(view,'gunk'),/2号 · 乙/);
  view.players[1]!.used=['gunk'];assert.match(html(view,'gunk'),/2号 · 乙.*已公开使用/);
  view.selfId='viewer';view.role='spectator';assert.equal(characterContext(view,'coach').holdings.length,0);
});

test('public acquired or copied ability holders are shown separately from printed character ownership',()=>{
  const view=room(),copy=racer('copy','p1','understudy');copy.flags.publicAbilities={powers:['coach'],copiedFrom:'original'};view.racers=[racer('original','p0','coach'),copy];
  const context=characterContext(view,'coach');assert.deepEqual(context.racers.map(r=>r.id),['original']);assert.deepEqual(context.abilityHolders.map(r=>r.id),['copy']);
  const output=html(view,'coach');assert.match(output,/也掌握此能力的选手/);assert.match(output,/替补.*2号 · 乙/);assert.match(output,/复制或额外能力不会改变/);
});

test('draft market and catalog details do not invent a player owner',()=>{
  const view=room();view.phase='draft';view.draft={market:['coach'],order:['p0','p1'],cursor:0,batch:0};
  assert.match(html(view,'coach'),/公共选秀区 · 尚未确认分配/);assert.doesNotMatch(html(view,'coach'),/1号 · 甲/);
  assert.match(renderToStaticMarkup(createElement(CharacterOwnership,{characterId:'coach',onSelect:()=>{}})),/角色图鉴/);
});
