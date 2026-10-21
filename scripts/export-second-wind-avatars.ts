import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar } from '../src/client/avatars.js';
import { SECOND_WIND_CHARACTERS } from '../src/shared/second-wind.js';

/** Published SVG files and live portraits share the same authored drawing. */
const directory = new URL('../public/avatars/second-wind/', import.meta.url);
await mkdir(directory, {recursive:true});
for (const character of SECOND_WIND_CHARACTERS) {
  const svg = renderToStaticMarkup(createElement(Avatar, {id:character.id})).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" ');
  await writeFile(new URL(`${character.id}.svg`, directory), svg + '\n');
}
const modelManifest = new URL('../public/models/second-wind/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(modelManifest,'utf8'));
for (const model of manifest.models) {
  model.modelPreview = `/models/second-wind/avatars/${model.id}.png`;
  model.avatar = `/avatars/second-wind/${model.id}.svg`;
  model.avatarStyle = 'flat-cartoon-svg';
}
await writeFile(modelManifest, JSON.stringify(manifest,null,2)+'\n');
console.log(`Exported ${SECOND_WIND_CHARACTERS.length} cartoon SVG portraits.`);
