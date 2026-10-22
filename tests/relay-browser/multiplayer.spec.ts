import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { GameAction, Room, RoomView } from '../../src/shared/types.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const url=process.env.RELAY_URL??'http://127.0.0.1:8787';
const smoke=process.env.RELAY_SMOKE==='1';
async function captureRace(page:Page,path:string){await page.getByTestId('board-3d').scrollIntoViewIfNeeded();await boundedRead(page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))),'capture-frame read');await page.getByTestId('board-3d').screenshot({path:path.replace(/\.png$/,'-board.png')});await page.screenshot({path,fullPage:true});}
async function synced(page:Page,version:number){await expect.poll(async()=>Number(await page.locator('.game-shell').getAttribute('data-room-version'))).toBeGreaterThanOrEqual(version);}
async function boundedRead<T>(operation:Promise<T>,label:string,timeoutMs=20_000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(`${label} exceeded ${timeoutMs}ms`)),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
/** Keep failure diagnostics in the Node test process. A stalled renderer must
 * not be queried again while recording the original failure. */
function publicRoom(room:Room){
  const game=room.game,pending=game.pending;
  return{code:room.code,version:room.version,mode:room.mode,phase:game.phase,round:game.round,currentRacerId:game.currentRacerId,
    turnStage:pending?'choice':game.flags.needsBegin?'starting':game.flags.awaitRoll?'roll':'resolving',
    continuation:!!game.flags.continuation,needsBegin:!!game.flags.needsBegin,baseTurnOrder:game.baseTurnOrder,
    players:game.players.map(player=>({id:player.id,seat:player.seat,name:player.name,connected:player.connected,isAI:player.isAI,selected:player.selection.length>0,handCount:player.hand.length})),
    racers:game.racers.map(({id,playerId,characterId,position,tripped,finished,eliminated,rank})=>({id,playerId,characterId,position,tripped,finished,eliminated,rank})),
    pending:pending?{id:pending.id,kind:pending.kind,playerId:pending.playerId,racerId:pending.racerId,title:pending.title,optionCount:pending.options.length}:undefined,
    logs:game.logs.slice(-12).map(({id,type,text,source,targets,cause})=>({id,type,text,source,targets,cause})),results:game.results};
}
// Read only the actual authenticated snapshots received by each player. The
// server's deck, random state and private pending context never enter this test.
const snapshots=new Map<string,Map<string,RoomView>>();
function completeViews(known:Map<string,RoomView>|undefined):{latest:RoomView;views:RoomView[]}|undefined{
  if(!known?.size)return;
  const views=[...known.values()],latest=views.reduce((a,b)=>a.version>b.version?a:b);
  // Frames for one broadcast arrive on independent browser sockets. Select one
  // immutable version only after all private views for that version have arrived.
  if(!latest.players.every(player=>known.get(player.id)?.version===latest.version))return;
  if(latest.waitingFor){const acting=known.get(latest.waitingFor);if(!acting?.pending||acting.pending.playerId!==latest.waitingFor)return;}
  if(latest.turnStage==='choice'&&!latest.waitingFor)return;
  return{latest,views};
}
async function saved(_page:Page,code:string):Promise<Room>{
  let coherent:ReturnType<typeof completeViews>;
  await expect.poll(()=>{coherent=completeViews(snapshots.get(code));return!!coherent;},{message:'all required private snapshots must describe one complete room version'}).toBe(true);
  const {latest,views}=coherent!;
  const pending=latest.waitingFor?views.find(view=>view.selfId===latest.waitingFor)!.pending:undefined;
  const players=latest.players.map(player=>{const own=views.find(view=>view.selfId===player.id)?.players.find(p=>p.id===player.id);return {...player,hand:player.handCount===0?[]:own?.hand??[],selection:player.selected?(own?.selection?.length?own.selection:Array.from({length:latest.players.length===2?2:1},()=> 'locked')):[]};});
  return {code,hostId:latest.hostId,ownerId:latest.ownerId,version:latest.version,mode:latest.mode,createdAt:latest.createdAt??0,updatedAt:0,maxPlayers:latest.maxPlayers,timeoutSeconds:latest.timeoutSeconds,deadline:latest.deadline,game:{mode:latest.mode,phase:latest.phase,round:latest.round,players,deck:[],discard:[],draft:latest.draft,racers:latest.racers,baseTurnOrder:latest.baseTurnOrder,turn:0,turnCount:0,currentRacerId:latest.currentRacerId,pending,queue:[],logs:latest.logs,results:latest.results,rngState:0,randomLog:[],lastRoll:latest.lastRoll,track:latest.track,flags:{needsBegin:latest.turnStage==='starting',continuation:latest.turnStage==='resolving',awaitRoll:latest.turnStage==='roll'}}} as Room;
}

test('snapshot aggregation waits for the new private actor instead of combining independent versions',()=>{
  const players=[{id:'a'},{id:'b'}] as RoomView['players'];
  const view=(selfId:string,version:number,actor:string):RoomView=>({selfId,version,players,turnStage:'choice',waitingFor:actor,...(selfId===actor?{pending:{id:'choice-'+version,playerId:actor,kind:'alchemist',options:[]}}:{})}) as RoomView;
  const known=new Map([['a',view('a',1,'a')],['b',view('b',1,'a')]]);expect(completeViews(known)?.latest.version).toBe(1);
  known.set('a',view('a',2,'b'));expect(completeViews(known)).toBeUndefined();
  known.set('b',view('b',2,'b'));expect(completeViews(known)?.views.find(v=>v.selfId==='b')?.pending?.id).toBe('choice-2');
  known.set('b',view('b',3,'a'));expect(completeViews(known)).toBeUndefined();
  known.set('a',view('a',3,'a'));expect(completeViews(known)?.views.find(v=>v.selfId==='a')?.pending?.id).toBe('choice-3');
});

for(const n of [2,6,8])test(`server authority ${n} independent players: ${smoke?'one race, host/guest recovery, privacy and layout':'four races, host recovery, privacy and rematch'}`,async({browser})=>{
  // CI smoke completes one full race on eight isolated software WebGL clients.
  // The default manual mode retains the complete four-race game and rematch.
  if(process.env.CI&&n===8)test.setTimeout(900_000);
  const contexts:BrowserContext[]=[],pages:Page[]=[],errors:string[]=[];
  let latestPublicRoom:ReturnType<typeof publicRoom>|undefined;
  const uiSnapshots:unknown[]=[];
  type UIAction={sequence:number;requestId:string;type:GameAction['type'];expectedVersion:number;result?:{ok:boolean;version?:number;error?:string}};
  const uiActions=new Map<Page,UIAction[]>();
  const startedAt=Date.now();let bodyFailed=false,lastPrintedRound=-1;
  let checkpoint={stage:'setup',phase:'lobby',round:0,step:0,action:'open-contexts',version:0,logId:0,elapsedMs:0};
  const mark=(stage:string,action:string,room?:Room,step=checkpoint.step)=>{checkpoint={stage,action,phase:room?.game.phase??checkpoint.phase,round:room?.game.round??checkpoint.round,step,version:room?.version??checkpoint.version,logId:room?.game.logs.at(-1)?.id??checkpoint.logId,elapsedMs:Date.now()-startedAt};};
  const progress=()=>console.log(`[relay-${n}] checkpoint ${JSON.stringify(checkpoint)}`);
  const cacheActingUI=async(page:Page,seat:number,action:string)=>{
    let ui:unknown;
    try{ui=await boundedRead(page.evaluate(()=>{
      const board=document.querySelector<HTMLElement>('[data-testid="board-3d"]'),shell=document.querySelector<HTMLElement>('.game-shell');
      const roll=document.querySelector<HTMLButtonElement>('[data-testid="roll-button"]'),choice=document.querySelector<HTMLElement>('[data-testid="skill-choice"]');
      const bounds=roll?.getBoundingClientRect();
      return{roomVersion:shell?.dataset.roomVersion,visibility:document.visibilityState,focused:document.hasFocus(),
        connection:document.querySelector('.race-match-label .connection,.room-label .connection')?.textContent?.trim(),connectionBanner:document.querySelector('.connection-banner')?.textContent?.trim(),
        phase:board?.dataset.phase,cameraState:board?.dataset.cameraState,cameraTarget:board?.dataset.cameraTarget,
        loadedModels:board?.dataset.loadedModels,modelFallbacks:board?.dataset.modelFallbacks,drawCalls:board?.dataset.drawCalls,triangles:board?.dataset.triangles,quality:board?.dataset.quality,
        status:document.querySelector('[data-testid="animation-phase"]')?.textContent?.trim(),
        rollButton:roll?{text:roll.textContent?.trim(),disabled:roll.disabled,bounds:bounds?{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}:undefined}:null,
        skillChoice:choice?{title:choice.querySelector('h2')?.textContent,buttonCount:choice.querySelectorAll('button').length,enabledButtons:choice.querySelectorAll('button:not(:disabled)').length}:null};
    }),'acting-page public UI read',2_000);}catch(error){ui={readError:error instanceof Error?error.message:String(error)};}
    uiSnapshots.push({elapsedMs:Date.now()-startedAt,step:checkpoint.step,seat,action,ui});if(uiSnapshots.length>20)uiSnapshots.shift();
  };
  const observe=(page:Page)=>{
    const actions:UIAction[]=[];uiActions.set(page,actions);let sequence=0;
    page.on('pageerror',e=>errors.push(e.stack??e.message));
    page.on('websocket',ws=>{
      expect(ws.url()).not.toMatch(/token=|playerId=/);
      ws.on('framesent',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.type==='action'&&message.requestId&&message.envelope){actions.push({sequence:++sequence,requestId:message.requestId,type:message.envelope.action.type,expectedVersion:message.envelope.expectedVersion});if(actions.length>40)actions.shift();}}catch{/* Raw heartbeat frames are not actions. */}});
      ws.on('framereceived',frame=>{
        try{const message=JSON.parse(String(frame.payload));if(message.type==='ack'){const action=actions.find(action=>action.requestId===message.requestId);if(action)action.result={ok:!!message.result.ok,version:message.result.version,error:message.result.error};return;}if(message.type!=='snapshot')return;const view=message.room as RoomView;const known=snapshots.get(view.code)??new Map<string,RoomView>();if((known.get(view.selfId)?.version??0)<=view.version)known.set(view.selfId,view);snapshots.set(view.code,known);
          for(const p of message.room.players)if(p.id!==message.room.selfId){if(p.hand!==undefined||p.selection!==undefined)errors.push('Other player private hand or selection leaked.');}
        }catch{/* Protocol errors are separately surfaced by the actual UI. */}
      });
    });
  };
  try{
    mkdirSync('test-results/browser-authority',{recursive:true});
    for(let i=0;i<n;i++){
      const context=await browser.newContext({viewport:i===n-1?{width:390,height:844}:process.env.CI?i===0?{width:1280,height:900}:{width:768,height:650}:{width:1440,height:1000},deviceScaleFactor:1,permissions:['clipboard-read','clipboard-write']});contexts.push(context);
      await context.addInitScript(()=>{try{localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:low-quality','true');}catch{/* Opaque about:blank recovery pages have no storage. */}});
      const page=await context.newPage();pages.push(page);observe(page);
    }
    const host=pages[0]!;
    mark('setup','create-room');
    await host.goto(url);await host.getByLabel('你的昵称').fill('浏览器计算房主');await host.getByLabel('房间人数上限').selectOption(String(n));await host.getByLabel('每次操作时限').selectOption('0');
    await host.getByRole('button',{name:'创建房间，召集朋友'}).click();await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);const code=host.url().split('/').at(-1)!;
    await expect(host.getByText('已连接',{exact:true})).toBeVisible();
    for(let i=1;i<n;i++){
      mark('setup',`join-${i}`);
      const p=pages[i]!;await p.goto(`${url}/room/${code}`);await p.getByLabel('你的昵称').fill(`网页同学${i}`);await p.getByRole('button',{name:'加入这场胡闹'}).click();await expect(p.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();
    }
    for(const p of pages){await synced(p,(await saved(host,code)).version);await p.getByRole('button',{name:'我准备好了',exact:true}).click();await expect(p.getByRole('button',{name:'取消准备',exact:true})).toBeVisible();}
    await host.getByRole('button',{name:'邀请朋友',exact:true}).click();expect(await boundedRead(host.evaluate(()=>navigator.clipboard.readText()),'clipboard read')).toBe(`${url}/room/${code}`);
    const ids=await Promise.all(pages.map(p=>boundedRead(p.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code),'player identity read')));expect(new Set(ids).size).toBe(n);
    for(const guest of pages.slice(1))expect(await boundedRead(guest.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='magical-athlete-browser-authority-v1')),'archive-presence read')).toBe(false);
    await synced(host,(await saved(host,code)).version);await host.getByRole('button',{name:'开始选秀',exact:true}).click();await expect.poll(async()=>(await saved(host,code)).game.phase).toBe('draft');
    while((await saved(host,code)).game.phase==='draft'){
      const draftRoom=await saved(host,code),d=draftRoom.game.draft!;latestPublicRoom=publicRoom(draftRoom);mark('draft',`pick-${d.cursor}`,draftRoom);const p=pages[ids.indexOf(d.order[d.cursor]!) ]!;await synced(p,(await saved(host,code)).version);
      await p.locator('.character-card .character-art').first().click();const confirm=p.getByRole('button',{name:/确认选择/});if(await confirm.count())await confirm.click();
      await expect.poll(async()=>(await saved(host,code)).game.draft?.cursor??-1).not.toBe(d.cursor);
    }
    let steps=0,hostRecovered=false,guestRecovered=false,raceShot=false;
    while(true){
      const room=await saved(host,code),g=room.game;latestPublicRoom=publicRoom(room);
      if(g.phase==='finished'||(smoke&&g.phase==='results'&&g.results.length>=1))break;
      // Turn setup now belongs to the authority and may expose a skill instead
      // of a die button. Wait for that committed transition before choosing UI.
      if(g.phase==='race'&&!g.pending&&(g.flags.needsBegin||g.flags.continuation)){await expect.poll(async()=>(await saved(host,code)).version).toBeGreaterThan(room.version);continue;}
      mark('play',g.pending?`choose-${g.pending.kind}`:g.phase==='selection'?'select':g.phase==='results'?'next':'roll',room,++steps);
      if(g.round!==lastPrintedRound||steps%50===0||(process.env.CI&&n===8&&steps%10===0)){lastPrintedRound=g.round;progress();}
      if(steps>5000)throw Error(`Execution budget exceeded in ${g.phase}; game queue was not truncated.`);if(g.phase==='paused')throw Error('Engine diagnostic pause.');
      if(g.phase==='selection'){
        mark('selection','lock-racer',room,steps);
        const player=g.players.find(p=>!p.selection.length)!;const p=pages[ids.indexOf(player.id)]!;const count=n===2?2:1;await synced(p,room.version);
        for(let i=0;i<count;i++)await p.locator('.hand-selection .character-card').filter({has:p.getByRole('button',{name:/选择/})}).nth(i).getByRole('button',{name:/选择/}).click();
        await p.getByRole('button',{name:'锁定上场角色',exact:true}).click();await expect.poll(async()=>{const next=(await saved(host,code)).game;return next.phase==='selection'?next.players.find(x=>x.id===player.id)?.selection.length:count;}).toBe(count);continue;
      }
      if(!hostRecovered&&g.phase==='race'){
        mark('host-recovery','duplicate-tab',room,steps);
        const duplicate=await contexts[0]!.newPage();observe(duplicate);await duplicate.goto(`${url}/room/${code}`);await expect(duplicate.getByText('已连接',{exact:true})).toBeVisible();await duplicate.close();
        const before=(await saved(host,code)).game;
        mark('host-recovery','host-offline',room,steps);
        await host.goto('about:blank');await expect(pages[1]!.getByText('已连接',{exact:true})).toBeVisible();
        mark('host-recovery','host-return',room,steps);
        await host.goto(`${url}/room/${code}`);await expect(host.getByText('已连接',{exact:true})).toBeVisible();
        const after=(await saved(host,code)).game;
        for(const key of ['rngState','randomLog','pending','queue','racers','round','results'] as const)expect(after[key]).toEqual(before[key]);
        hostRecovered=true;continue;
      }
      if(!guestRecovered&&g.phase==='race'){
        mark('guest-recovery','offline-reload',room,steps);
        const p=pages.at(-1)!;await contexts.at(-1)!.setOffline(true);await p.reload().catch(()=>{});await contexts.at(-1)!.setOffline(false);await p.goto(`${url}/room/${code}`);await expect(p.getByText('已连接',{exact:true})).toBeVisible();
        expect(await boundedRead(p.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code),'recovered identity read')).toBe(ids.at(-1));guestRecovered=true;continue;
      }
      if(!raceShot&&g.phase==='race')mark('scene','capture-desktop-mobile',room,steps);
      if(!raceShot&&g.phase==='race'){for(const scene of [host,pages.at(-1)!]){await expect(scene.getByTestId('board-3d').locator('.board-webgl canvas')).toBeVisible();await expect(scene.getByTestId('scene-racer')).toHaveCount(n===2?4:n);}await captureRace(host,`test-results/browser-authority/race-${n}.png`);await captureRace(pages.at(-1)!,`test-results/browser-authority/race-mobile-${n}.png`);raceShot=true;}
      let playerId:string,action:GameAction;
      if(g.pending){playerId=g.pending.playerId;const option=g.pending.options.find(o=>['skip','pass','decline'].includes(o.id))??g.pending.options[0]!;action={type:'choose',choiceId:g.pending.id,optionId:option.id};}
      else if(g.phase==='results'){playerId=room.hostId;action={type:'next'};}
      else{playerId=g.racers.find(r=>r.id===g.currentRacerId)!.playerId;action={type:'roll'};}
      const actionLabel=action.type==='choose'?`choose-${g.pending!.kind}-${action.optionId}`:action.type;
      mark('submit',actionLabel,room,steps);
      const p=pages[ids.indexOf(playerId)]!;await synced(p,room.version);
      if(n===8)await cacheActingUI(p,ids.indexOf(playerId)+1,actionLabel);
      const beforeAction=uiActions.get(p)!.at(-1)?.sequence??0;
      if(action.type==='choose')await p.getByRole('region',{name:'待处理技能'}).getByRole('button',{name:g.pending!.options.find(o=>o.id===action.optionId)!.label,exact:true}).click({timeout:15_000});
      else if(action.type==='next')await p.getByRole('button',{name:'前往下一场',exact:true}).click({timeout:15_000});
      else await p.getByRole('button',{name:'掷骰子',exact:true}).click({timeout:15_000});
      mark('confirm',actionLabel,room,steps);
      // A system turn-start can already advance past room.version while click
      // waits for animation. Confirm this real UI action's own acknowledgement.
      let confirmed:UIAction|undefined;
      await expect.poll(()=>{confirmed=uiActions.get(p)!.find(sent=>sent.sequence>beforeAction&&sent.type===action.type&&sent.result);return!!confirmed;},{message:`${actionLabel} must receive its own UI action acknowledgement`}).toBe(true);
      expect(confirmed!.result!.ok,confirmed!.result!.error??actionLabel).toBe(true);
      expect(confirmed!.result!.version).toBeDefined();
      await expect.poll(async()=>(await saved(host,code)).version).toBeGreaterThanOrEqual(confirmed!.result!.version!);
    }
    const finalRoom=await saved(host,code);mark(smoke?'round-complete':'finished',smoke?'assert-one-result':'assert-four-results',finalRoom,steps);progress();
    expect(finalRoom.game.results).toHaveLength(smoke?1:4);expect(hostRecovered).toBe(true);expect(guestRecovered).toBe(true);expect(raceShot).toBe(true);expect(errors).toEqual([]);
    await host.screenshot({path:`test-results/browser-authority/${smoke?'round-1':'final'}-${n}.png`,fullPage:true});
    if(!smoke){
      mark('rematch','request-rematch',finalRoom,steps);
      const admin=pages[ids.indexOf((await saved(host,code)).hostId)]!;await synced(admin,(await saved(host,code)).version);await admin.getByRole('button',{name:'原房间，再来一局',exact:true}).click();await expect(admin.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();
      expect((await saved(host,code)).game.players.every(p=>p.score===0&&p.hand.length===0)).toBe(true);
    }
    mark('layout','check-overflow',await saved(host,code),steps);
    for(const p of pages)expect(await boundedRead(p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'layout-width read')).toBe(true);
  }catch(error){
    bodyFailed=true;
    if(n===8)writeFileSync('test-results/browser-authority/diagnostics8.json',JSON.stringify({
      capturedAt:new Date().toISOString(),checkpoint:{...checkpoint,elapsedMs:Date.now()-startedAt},
      failure:{name:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message.split('\n')[0]:String(error).split('\n')[0]},
      pageErrorCount:errors.length,latestPublicRoom,uiSnapshots,uiActions:pages.map((page,seat)=>({seat:seat+1,actions:uiActions.get(page)?.slice(-6)})),
      limitations:'UI snapshots are cached before actions with a 2s read limit; failure capture does not query potentially frozen browser pages. No tokens, deck, RNG or private hands are included.',
    },null,2));
    console.error(`[relay-${n}] original-error ${error instanceof Error?error.stack??error.message:String(error)}\n[relay-${n}] last-checkpoint ${JSON.stringify({...checkpoint,elapsedMs:Date.now()-startedAt})}`);
    throw error;
  }finally{
    let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
    const cleanup=await Promise.race([Promise.allSettled(contexts.map(context=>context.close())),new Promise<null>(resolve=>{cleanupTimer=setTimeout(()=>resolve(null),10_000);})]);
    if(cleanupTimer)clearTimeout(cleanupTimer);
    if(cleanup===null){
      console.error(`[relay-${n}] context cleanup exceeded 10s; last-checkpoint ${JSON.stringify(checkpoint)}`);
      if(!bodyFailed)throw Error('Browser context cleanup exceeded 10s after the test body completed.');
    }else{
      const rejected=cleanup.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
      if(rejected.length){console.error(`[relay-${n}] context cleanup errors: ${rejected.map(result=>String(result.reason)).join(' | ')}`);if(!bodyFailed)throw new AggregateError(rejected.map(result=>result.reason),'Browser context cleanup failed after the test body completed.');}
    }
  }
});
