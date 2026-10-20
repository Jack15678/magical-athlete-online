import { spawnSync } from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const run=(command,args,options={})=>{const p=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,...options});if(p.error||p.status!==0)throw Error(p.error?.message??`${command}失败。\n${p.stderr??''}`);return p.stdout??'';};
async function main(){
  const hostFile=join(root,'.local','host.json');
  if(existsSync(hostFile)){
    const host=JSON.parse(readFileSync(hostFile,'utf8'));const pid=host.pid??host.serverPid;
    if(pid){try{process.kill(pid,0);throw Error('游戏主机仍在运行。请先结束本局并运行“停止游戏”，再更新。');}catch(e){if(e.code!=='ESRCH')throw e;}}
  }
  const changed=run('git',['status','--porcelain']);
  if(changed.trim())throw Error('项目中有尚未提交的本地修改。请先提交或保留这些修改，再更新；程序不会覆盖它们。');
  const remote=run('git',['remote','get-url','origin']).trim();
  if(!/^https:\/\/github\.com\/qiuh23\/magical-athlete-online(?:-\d+)?\.git$/.test(remote))throw Error('Git远程地址不是本项目仓库，已停止更新。');
  console.log('正在从GitHub同步代码……');run('git',['pull','--ff-only'],{stdio:'inherit'});
  const candidates=[join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','pnpm','bin','pnpm.cjs'),join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','pnpm','bin','pnpm.mjs')];
  const pnpm=candidates.find(existsSync);
  if(pnpm)run(process.execPath,[pnpm,'install','--frozen-lockfile'],{stdio:'inherit'});
  else run(process.platform==='win32'?'pnpm.cmd':'pnpm',['install','--frozen-lockfile'],{stdio:'inherit',shell:process.platform==='win32'});
  console.log('正在检查规则与构建……');
  run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});
  run(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','tests/*.test.ts','tests/host.test.mjs'],{stdio:'inherit'});
  run(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit'});
  run(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'],{stdio:'inherit'});
  console.log('更新完成。双击“启动游戏”，固定网址就会提供新版本。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
