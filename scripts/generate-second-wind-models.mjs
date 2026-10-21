/** One clean Blender process per editable source; see docs/second-wind-models.md. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const blender = process.env.BLENDER_EXE || 'C:\\blender-5.2.3-candidate+v52.fab76e95306d-windows.amd64-release\\blender.exe';
const ids = ['bite-mark','blunderdog','cheatah','critic','diva','doppelgangster','gloth','hog-knight','hopfrog','hotel','icarus','kingtripper','kraken','le-saboteur','magical-athlete','mole','mr-dice-guy','mush','nemesis','nepo-baby','null','overtaker','party-pooper','penguin','re-runner','show-off','soulmate','speed-demon','spoilsport','stepdad','streaker','stunner','switcharoo','tail','the-hose','understudy','bite-mark-were','hog-knight-hog'];
mkdirSync('tmp', { recursive: true });
const selected = process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',') ?? ids;
for (const id of selected) {
  if (!ids.includes(id)) throw new Error(`Unknown character ${id}`);
  const log = execFileSync(blender, ['--background','--threads','1','--python','scripts/generate-second-wind-models.py','--',`--only=${id}`,'--no-render'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(resolve(`tmp/second-wind-${id}.log`), log);
  console.log(id, 'Blender source and GLB exported');
}
const fragments = ids.map(id => JSON.parse(readFileSync(`assets/blender/second-wind/${id}.json`, 'utf8')));
const models = fragments.flatMap(m => m.models); const variants = fragments.flatMap(m => m.variants);
const manifest = {...fragments[0], source:'assets/blender/second-wind.blend', models, variants, totalBytes:[...models,...variants].reduce((n,m)=>n+m.bytes,0), totalTriangles:[...models,...variants].reduce((n,m)=>n+m.triangles,0)};
writeFileSync('public/models/second-wind/manifest.json', JSON.stringify(manifest,null,2)+'\n');
execFileSync(blender, ['--background','--threads','1','--python','scripts/assemble-second-wind-preview.py'], { stdio: 'inherit' });
