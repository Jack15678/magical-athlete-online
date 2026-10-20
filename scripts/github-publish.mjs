import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// GCM resolves the existing Windows credential. Its output stays in process memory.
// Never print tokens or place them in a remote URL, argv, or a repository file.
async function main() {
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GCM_INTERACTIVE:'Never',GIT_TERMINAL_PROMPT:'0'}});
if(credential.status!==0) throw Error('GitHub credential unavailable; sign in using Git Credential Manager.');
const values=Object.fromEntries(credential.stdout.trim().split(/\r?\n/).map(line=>{const n=line.indexOf('=');return [line.slice(0,n),line.slice(n+1)];}));
const headers={'Accept':'application/vnd.github+json','Authorization':`Bearer ${values.password}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
async function api(path,method='GET',body){const r=await fetch(`https://api.github.com${path}`,{method,headers,body:body?JSON.stringify(body):undefined});const json=await r.json();if(!r.ok)throw Error(`GitHub ${method} ${path}: ${r.status} ${json.message??''}`);return json;}
const user=await api('/user');if(user.login!=='qiuh23')throw Error('Authenticated account differs from the connected account.');
if(process.argv.includes('--check')) {console.log(JSON.stringify({login:user.login,plan:user.plan?.name??'unknown',credentialAvailable:true}));return;}
const record='docs/github.json';let repo;
if(process.argv.includes('--checks')){
  const known=JSON.parse(readFileSync(record,'utf8'));const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});if(head.status!==0)throw Error('Cannot resolve local HEAD.');const sha=head.stdout.trim();
  const checks=await api(`/repos/${known.fullName}/commits/${sha}/check-runs`);
  console.log(JSON.stringify(checks.check_runs.map(c=>({name:c.name,app:c.app?.slug,status:c.status,conclusion:c.conclusion,url:c.details_url,title:c.output?.title,summary:c.output?.summary?.slice(0,3000),text:c.output?.text?.slice(-5000),annotations:c.output?.annotations_count})),null,2));
  const statuses=await api(`/repos/${known.fullName}/commits/${sha}/status`);console.log(JSON.stringify(statuses.statuses.map(s=>({context:s.context,state:s.state,description:s.description,url:s.target_url})),null,2));return;
}
const cancelArg=process.argv.find(x=>/^--cancel=\d+$/.test(x));
if(cancelArg){const known=JSON.parse(readFileSync(record,'utf8'));const id=cancelArg.split('=')[1];const r=await fetch(`https://api.github.com/repos/${known.fullName}/actions/runs/${id}/cancel`,{method:'POST',headers});console.log(JSON.stringify({cancelRequested:r.ok,status:r.status,runId:id}));return;}
if(process.argv.includes('--status')){
  const known=JSON.parse(readFileSync(record,'utf8'));const runs=await api(`/repos/${known.fullName}/actions/runs?per_page=3`);
  console.log(JSON.stringify(runs.workflow_runs.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url,sha:r.head_sha})),null,2));
  for(const r of runs.workflow_runs.filter(r=>r.conclusion==='failure').slice(0,1)){const jobs=await api(`/repos/${known.fullName}/actions/runs/${r.id}/jobs`);console.log(JSON.stringify(jobs.jobs.map(j=>({name:j.name,conclusion:j.conclusion,steps:j.steps.map(s=>({name:s.name,conclusion:s.conclusion}))})),null,2));}
  for(const r of runs.workflow_runs.filter(r=>r.status==='in_progress').slice(0,1)){const jobs=await api(`/repos/${known.fullName}/actions/runs/${r.id}/jobs`);console.log(JSON.stringify(jobs.jobs.map(j=>({name:j.name,startedAt:j.started_at,status:j.status,steps:j.steps.filter(s=>s.status!=='queued').map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))})),null,2));}
  return;
}
if(existsSync(record)) {const known=JSON.parse(readFileSync(record,'utf8'));repo=await api(`/repos/${known.fullName}`);}
else {
  let name='magical-athlete-online';let suffix=1;
  while((await fetch(`https://api.github.com/repos/${user.login}/${name}`,{headers})).status!==404){name=`magical-athlete-online-${++suffix}`;if(suffix>50)throw Error('Unable to choose an unused repository name.');}
  repo=await api('/user/repos','POST',{name,private:true,description:'Unofficial Magical Athlete friend-room browser game. Chinese UI, authoritative server, durable state.'});
  writeFileSync(record,JSON.stringify({fullName:repo.full_name,url:repo.html_url,private:repo.private},null,2)+'\n');
}
const git=(args)=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true,env:{...process.env,GCM_INTERACTIVE:'Never',GIT_TERMINAL_PROMPT:'0'}});if(r.status!==0)throw Error(`git ${args[0]} failed: ${r.stderr}`);return r.stdout.trim();};
if(!existsSync('.git')){git(['init','-b','main']);git(['config','user.name','qiuh23']);git(['config','user.email',`${user.id}+${user.login}@users.noreply.github.com`]);git(['remote','add','origin',repo.clone_url]);}
const remote=git(['remote','get-url','origin']);if(remote!==repo.clone_url)throw Error('Local origin is different; refusing to change an existing remote.');
git(['add','.']);if(git(['status','--porcelain']))git(['commit','-m','Implement multiplayer Magical Athlete with verified rules and durable rooms']);
git(['push','-u','origin','main']);console.log(JSON.stringify({repository:repo.html_url,private:repo.private,commit:git(['rev-parse','HEAD'])}));
}
await main();
