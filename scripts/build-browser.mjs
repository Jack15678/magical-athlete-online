import { spawnSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const r=spawnSync(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build','--outDir','dist/browser'],{cwd:root,env:{...process.env,VITE_HOST_MODE:'browser'},stdio:'inherit',windowsHide:true});
if(r.error)throw r.error;if(r.status!==0)process.exitCode=r.status??1;
