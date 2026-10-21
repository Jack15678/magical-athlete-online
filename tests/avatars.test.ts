import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar, AVATAR_IDS } from '../src/client/avatars.js';
import { CHARACTERS } from '../src/shared/characters.js';
import { SECOND_WIND_CHARACTERS } from '../src/shared/second-wind.js';

test('all72 portraits use the original flat vector vocabulary with exactly36 new unique drawings',()=>{
  assert.equal(AVATAR_IDS.length,72);assert.deepEqual([...AVATAR_IDS].sort(),CHARACTERS.map(character=>character.id).sort());
  const drawings = new Set<string>();
  for(const character of SECOND_WIND_CHARACTERS){
    const svg=renderToStaticMarkup(createElement(Avatar,{id:character.id}));
    assert.match(svg,/^<svg /);assert.match(svg,/viewBox="0 0 120 120"/);assert.match(svg,/stroke="#191919"/);assert.match(svg,/stroke-width="3.2"/);
    assert(!/<(?:img|image)\b/.test(svg),'a portrait is drawn, never a model-render image');
    assert((svg.match(/<(?:path|circle|ellipse|rect|polygon)\b/g)??[]).length>=6,character.id);
    drawings.add(svg.replace(/data-character-id="[^"]*"/g,''));
  }
  assert.equal(drawings.size,36,'every new character has its own silhouette and accessories');
});

test('published SVG portraits match live drawings and the model registry points to the same assets',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/models/second-wind/manifest.json',import.meta.url),'utf8'));
  for(const character of SECOND_WIND_CHARACTERS){
    const svg=await readFile(new URL(`../public/avatars/second-wind/${character.id}.svg`,import.meta.url),'utf8');
    assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert(!/<(?:img|image)\b/.test(svg));
    const live=renderToStaticMarkup(createElement(Avatar,{id:character.id}));
    assert.equal(svg.trim().replace(' xmlns="http://www.w3.org/2000/svg" width="120" height="120"',''),live);
    const model=manifest.models.find((value:{id:string})=>value.id===character.id);assert.equal(model.avatar,`/avatars/second-wind/${character.id}.svg`);
  }
});
