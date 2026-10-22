import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EffectiveAbilities, EggAbility, abilityEntryLabel, publicAbilityDetail } from '../src/client/CharacterAbilities.js';
import { CHARACTERS } from '../src/shared/characters.js';
import type { Racer, RoomView } from '../src/shared/types.js';

const actor = (flags: Racer['flags'] = {}): Racer => ({id:'copy', playerId:'p0', characterId:'egg', position:5, tripped:false, finished:false, eliminated:false, flags});
const html = (racer: Racer) => renderToStaticMarkup(createElement(EffectiveAbilities, {racer, onDetail:()=>{}}));
const count = (text: string, value: string) => text.split(value).length - 1;

test('current ability cards show one full rule for duplicate permanent and temporary grants, with both durations', () => {
  const racer = actor({publicAbilities:{powers:['coach','coach'], ownedPowers:['coach','coach'], entries:[
    {id:'coach', origin:'acquired', sourceCardId:'mush', duration:'race'},
    {id:'coach', origin:'temporary', sourceCardId:'leaf-filmmaker', duration:'next-turn'},
  ]}});
  const output = html(racer);
  assert.match(output, /现在拥有的能力/); assert.equal(count(output, 'data-power-id="coach"'), 1);
  assert.equal(count(output, CHARACTERS.find(card=>card.id==='coach')!.ability), 1);
  assert.match(output, /额外获得/); assert.match(output, /持续至本场结束/);
  assert.match(output, /临时借用/); assert.match(output, /下次自身回合开始失效/);
  assert.match(output, /嵌套复制不会延长期限/); assert.doesNotMatch(output, /归还/);
});

test('Null retains visible owned abilities while clearly showing they are not active', () => {
  const racer = actor({publicAbilities:{powers:[], ownedPowers:['kraken'], disabledBy:['null-id'], krakenRemaining:0, entries:[{id:'kraken', origin:'draw', duration:'race'}]}});
  const output = html(racer);
  assert.match(output, /暂时禁用/); assert.match(output, /能力被 Null 禁用/); assert.match(output, /当前未生效/);
  assert.match(output, /data-power-id="kraken"/); assert.match(output, /本场剩余次数：<strong>0/);
  assert.deepEqual(publicAbilityDetail(racer).active, []);
});

test('an explicitly empty public power set does not invent a printed ability or a hidden draw', () => {
  const racer = actor({power:'romantic', publicAbilities:{powers:[], ownedPowers:[]}}), output = html(racer);
  assert.match(output, /暂无生效能力/); assert.doesNotMatch(output, /data-power-id/);
  assert.doesNotMatch(output, /浪漫主义者/);
});

test('legacy copy projections retain known abilities without inventing a new source or duration', () => {
  const old = actor({copiedPower:'copycat', copyPower:'legs'});
  assert.deepEqual(publicAbilityDetail(old).owned, ['legs']);
  assert.match(html(old), /data-power-id="legs"/); assert.doesNotMatch(html(old), /下次自身回合开始失效/);
  old.flags.publicAbilities={powers:['coach'], acquired:['coach'], entries:[]};
  assert.match(html(old), /本场获得的额外能力/);
  assert.doesNotMatch(html(old), /嵌套复制不会延长期限/);
});

test('public provenance uses the source racer current controller and keeps the source card identity', () => {
  const room={selfId:'p0', racers:[{...actor(),id:'source',playerId:'p1',characterId:'coach'}],players:[{id:'p1',name:'当前玩家'}]} as RoomView;
  const label=abilityEntryLabel({id:'coach',origin:'copy',sourceCardId:'coach',sourceRacerId:'source',duration:'source-change'},room);
  assert.match(label.source,/教练.*当前玩家/); assert.equal(label.duration,'随复制目标变化');
});

test('temporary and permanent Copycat grants keep their expiry while explaining that the resolved ability follows the leader', () => {
  const racer=actor({publicAbilities:{powers:['coach'],ownedPowers:['coach'],entries:[
    {id:'coach',origin:'acquired',sourceCardId:'copycat',via:'mush',duration:'race'},
    {id:'coach',origin:'temporary',sourceCardId:'copycat',via:'leaf-thespian',duration:'next-turn'},
  ]}}),output=html(racer);
  assert.equal(count(output,'data-power-id="coach"'),1);assert.equal(count(output,'能力随领先者变化'),2);
  assert.match(output,/持续至本场结束 · 能力随领先者变化/);assert.match(output,/下次自身回合开始失效 · 能力随领先者变化/);
});

test('Egg chosen and inherited cards are compact public source links without repeated rules', () => {
  const racer = actor({eggCardId:'copycat', twinCardId:'coach', power:'legs'});
  const output=renderToStaticMarkup(createElement(EggAbility,{racer,onDetail:()=>{}}));
  assert.match(output,/本场抽到/);assert.match(output,/继承的冠军/);assert.match(output,/查看模仿猫的技能与当前玩家/);assert.match(output,/查看教练的技能与当前玩家/);
  assert(!output.includes(CHARACTERS.find(card=>card.id==='copycat')!.ability));
  assert.equal(renderToStaticMarkup(createElement(EggAbility,{racer:actor({power:'legs'}),onDetail:()=>{}})),'');
});

test('live form and mount remain readable after the ability list', () => {
  const output=html(actor({publicAbilities:{powers:['coach'],form:'were-mouth',mount:'hog-id'}}));
  assert.match(output,/当前形态：W.E.R.E.M.O.U.T.H./);assert.match(output,/当前坐骑：野猪 · 主移动 \+2/);
});
