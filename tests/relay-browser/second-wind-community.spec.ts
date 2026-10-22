import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decideAI } from '../../src/engine/ai.js';
import type { ActionReply, GameAction, RoomView } from '../../src/shared/types.js';

const url = process.env.RELAY_URL ?? 'http://127.0.0.1:8787';
test.setTimeout(240_000);
test.use({actionTimeout: 15_000});
async function online(page: Page) { await expect(page.locator('.connection.is-online')).toBeVisible(); }
async function chat(page: Page) { if (!await page.getByTestId('room-chat').count()) await page.getByRole('button', {name:/^房间聊天/}).click(); }
async function send(page: Page, text: string) { await chat(page); await page.getByLabel('聊天消息', {exact:true}).fill(text); await page.getByRole('button', {name:'发送',exact:true}).click(); await expect(page.getByLabel('聊天消息',{exact:true})).toHaveValue(''); }
async function probe(page: Page, code: string) {
  await page.evaluate(async code => {
    const identity = JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!);
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/browser/ws/${code}`);
    const waits = new Map<string, (reply: unknown) => void>();
    const state: any = (window as any).__swProbe = {view:null,send: async (action: unknown) => {
      const requestId = crypto.randomUUID();
      return new Promise((resolve,reject) => { const timer = setTimeout(() => {waits.delete(requestId);reject(Error('test action acknowledgement timeout'));},10000);waits.set(requestId,value=>{clearTimeout(timer);resolve(value);}); socket.send(JSON.stringify({type:'action',requestId,envelope:{actionId:crypto.randomUUID(),expectedVersion:state.view.version,action}})); });
    }};
    await new Promise<void>((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('test socket snapshot timeout')),10000);
      socket.addEventListener('open',() => socket.send(JSON.stringify({type:'auth',identity})));
      socket.addEventListener('message',event => {
        if (event.data === 'pong') return;
        const message = JSON.parse(event.data);
        if (message.type === 'auth-ok') socket.send(JSON.stringify({type:'sync',requestId:crypto.randomUUID()}));
        if (message.type === 'snapshot') { if (!state.view || state.view.version <= message.room.version) state.view = message.room; clearTimeout(timer); resolve(); }
        if (message.type === 'ack') { waits.get(message.requestId)?.(message.result); waits.delete(message.requestId); }
      });
    });
  },code);
}
async function view(page: Page): Promise<RoomView> { return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__swProbe.view))); }
async function action(page: Page, action: GameAction): Promise<ActionReply> { return page.evaluate(action => (window as any).__swProbe.send(action), action); }

for (const pool of ['second-wind','mixed','fans'] as const) test(`${pool}: four races through authenticated relay; mobile chat, rename, privacy and reload`, async ({browser},testInfo) => {
  const evidenceRoot=pool==='fans'?'docs/qa/fan-iteration':'docs/qa/second-wind';
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  let latestPublic: unknown; const summaries: unknown[] = [];mkdirSync(evidenceRoot,{recursive:true});
  try {
    for (let seat=0;seat<4;seat++) {
      const context=await browser.newContext({viewport:seat===2?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1}); contexts.push(context);
      await context.addInitScript(() => { try { localStorage.setItem('magical-athlete:muted','true');localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:animation-speed','4'); }catch{} });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));pages.push(page);
      page.on('websocket',socket=>socket.on('framereceived',frame=>{try {const message=JSON.parse(String(frame.payload));if(message.type==='snapshot'){latestPublic={phase:message.room.phase,round:message.room.round,version:message.room.version,currentRacerId:message.room.currentRacerId,waitingFor:message.room.waitingFor,pending:message.room.pending?{kind:message.room.pending.kind,title:message.room.pending.title}:undefined,racers:message.room.racers.map((r:any)=>({characterId:r.characterId,position:r.position,tripped:r.tripped,eliminated:r.eliminated}))};for(const p of message.room.players)if(p.id!==message.room.selfId&&(p.hand!==undefined||p.selection!==undefined))errors.push('private hand leaked');if(message.room.racers.some((r:any)=>r.flags.cheatahSecret!==undefined))errors.push('Cheatah secret leaked');}}catch{}}));
    }
    const [host,guest,mobile,viewer]=pages as [Page,Page,Page,Page];
    await host.goto(url);await host.getByLabel('你的昵称').fill('同名');await host.getByLabel('房间人数上限').selectOption('3');await host.getByLabel('每次操作时限').selectOption('0');await host.getByRole('checkbox',{name:'基础角色包',exact:true}).setChecked(pool!=='second-wind');await host.getByRole('checkbox',{name:'Second Wind',exact:true}).check();if(pool==='fans'){await host.getByRole('checkbox',{name:'Extra Mile',exact:true}).check();await host.getByRole('checkbox',{name:'Leaf’s Fan Expansion',exact:true}).check();}await host.getByRole('button',{name:'创建房间，召集朋友',exact:true}).click();await online(host);
    const code=host.url().split('/').at(-1)!;
    for (const page of [guest,mobile,viewer]) {await page.goto(`${url}/room/${code}`);await page.getByLabel('你的昵称').fill('同名');if(page===viewer)await page.getByRole('radio',{name:/作为观战者/}).check();await page.getByRole('button',{name:page===viewer?'进入房间观战':'加入这场胡闹',exact:true}).click();await online(page);}
    await expect(host.locator('.lobby-seats')).toContainText('同名1');await expect(host.locator('.lobby-seats')).toContainText('同名2');
    await send(host,'大厅聊天保留 <b>纯文本</b>');await chat(mobile);await expect(mobile.getByRole('log')).toContainText('大厅聊天保留 <b>纯文本</b>');expect(await mobile.getByRole('log').locator('b').count()).toBe(0);
    await send(viewer,'观战者也可以聊天');await expect(mobile.getByRole('log')).toContainText('观战者也可以聊天');
    await mobile.getByRole('button',{name:'收起聊天'}).click();await send(host,'未读消息');await expect(mobile.locator('.chat-unread')).toBeVisible();await expect(mobile.getByTestId('room-chat')).toHaveCount(0);
    await host.getByRole('button',{name:'收起聊天'}).click();
    for (const page of [host,guest,mobile]) {await page.getByRole('button',{name:'我准备好了',exact:true}).click();await expect(page.getByRole('button',{name:'取消准备',exact:true})).toBeVisible();}
    await host.getByRole('button',{name:'开始选秀',exact:true}).click();await expect(host.locator('.draft-order')).toBeVisible();
    await chat(mobile);await mobile.getByRole('button',{name:/修改昵称/}).click();await mobile.getByLabel('新昵称',{exact:true}).fill('同名');await mobile.getByRole('button',{name:'确认修改昵称',exact:true}).click();
    // An unchanged allocated nickname is rejected without consuming its chance.
    await expect(mobile.getByRole('alert')).toContainText(/相同|一致|变化|无需/);await mobile.getByLabel('新昵称',{exact:true}).fill('手机新名');await mobile.getByRole('button',{name:'确认修改昵称',exact:true}).click();await expect(mobile.locator('.chat-personal')).toContainText('手机新名');
    await send(mobile,'改名后的消息');await chat(host);await expect(host.getByRole('log')).toContainText('手机新名');
    await mobile.reload();await online(mobile);await chat(mobile);await expect(mobile.getByRole('log')).toContainText('大厅聊天保留');await expect(mobile.locator('.chat-personal')).toContainText('0 次');
    await mobile.getByRole('button',{name:/修改昵称/}).click();await expect(mobile.getByRole('dialog')).toContainText('本局已修改过昵称');await mobile.getByRole('button',{name:'关闭',exact:true}).click();
    await mobile.getByRole('log').evaluate(element=>{element.scrollTop=0;element.dispatchEvent(new Event('scroll',{bubbles:true}));});await send(host,'阅读旧消息时不会跳到底部');await expect(mobile.getByRole('button',{name:'查看新消息 ↓',exact:true})).toBeVisible();expect(await mobile.getByRole('log').evaluate(element=>element.scrollTop)).toBeLessThan(2);await mobile.getByRole('button',{name:'查看新消息 ↓',exact:true}).click();await mobile.screenshot({path:`${evidenceRoot}/${pool}-chat-mobile.png`});await mobile.getByRole('button',{name:'收起聊天'}).click();
    for (const page of [host,guest,mobile]) await probe(page,code);
    let roundsCaptured=0,steps=0,reloaded=false;const sentAt=new Map<number,number>();
    while (++steps<3000) {
      const views=await Promise.all([host,guest,mobile].map(view));
      const latest=views.reduce((a,b)=>a.version>b.version?a:b);if(steps%100===0)console.log(`[${pool}] step ${steps}: ${latest.phase}/${latest.round} ${latest.pending?.kind??latest.turnStage}`);
      if(latest.phase==='finished') {expect(latest.results).toHaveLength(4);summaries.push({phase:latest.phase,results:latest.results,steps});break;}
      if(latest.phase==='paused')throw Error(`engine paused: ${latest.rulesStatus}`);
      if(latest.phase==='race'&&latest.round>roundsCaptured){roundsCaptured=latest.round;summaries.push({round:latest.round,characters:latest.racers.map(r=>r.characterId),rulesVersion:latest.rulesVersion});
        if(!reloaded){await mobile.reload();await online(mobile);await probe(mobile,code);await host.reload();await online(host);await probe(host,code);reloaded=true;}
        if(roundsCaptured===1){await send(mobile,'比赛技能等待时也可聊天');await expect(mobile.getByRole('log')).toContainText('比赛技能等待时也可聊天');const bounds=await mobile.evaluate(()=>{const button=document.querySelector('[data-testid=skill-choice] button')??document.querySelector('[data-testid=roll-button]');if(!button)return true;const b=button.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button||button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});expect(bounds,'expanded chat must leave game actions uncovered').toBe(true);await mobile.getByRole('button',{name:'收起聊天'}).click();for(const p of [host,mobile]){const skip=p.getByRole('button',{name:/跳过演出|跳过动画|跳过积压/});if(await skip.count())await skip.first().click();}await expect(host.getByTestId('board-3d')).toBeVisible();await expect.poll(async()=>Number(await host.getByTestId('board-3d').getAttribute('data-loaded-models'))).toBeGreaterThanOrEqual(latest.racers.length);await expect(host.getByTestId('board-3d')).toHaveAttribute('data-model-fallbacks','0');await expect(mobile.getByTestId('board-3d')).toHaveAttribute('data-model-fallbacks','0');await host.screenshot({path:`${evidenceRoot}/${pool}-game-desktop.png`});await mobile.screenshot({path:`${evidenceRoot}/${pool}-game-mobile.png`});}
      }
      let sent=false;
      for(let seat=0;seat<3;seat++) {const v=views[seat]!;if(v.version!==latest.version)continue;const intent=decideAI(v);if(intent){const wait=200-(Date.now()-(sentAt.get(seat)??0));if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));sentAt.set(seat,Date.now());const result=await action(pages[seat]!,intent);if(!result.ok&&!/画面已更新|已有更新/.test(result.error??''))throw Error(`${intent.type}: ${result.error}`);sent=true;break;}}
      if(!sent)await new Promise(resolve=>setTimeout(resolve,80));
    }
    expect(steps).toBeLessThan(3000);expect(roundsCaptured).toBe(4);expect(reloaded).toBe(true);
    await chat(mobile);await expect(mobile.getByRole('log')).toContainText('大厅聊天保留');await expect(mobile.locator('.chat-personal')).toContainText('0 次');
    const final=await view(host);await action(host,{type:'rematch'});await expect.poll(async()=>(await view(host)).phase).toBe('lobby');await expect(mobile.locator('.chat-personal')).toContainText('1 次');await expect(mobile.getByRole('log')).toContainText('改名后的消息');
    for(const p of pages)expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);mkdirSync(evidenceRoot,{recursive:true});writeFileSync(`${evidenceRoot}/${pool}-four-races.json`,JSON.stringify({pool,results:final.results,summaries,errors,limitations:'Browser mobile viewport, not physical device GPU. Public-view legal intents sent through actual server-authoritative Durable Object WebSockets.'},null,2));
  } catch(error){writeFileSync(testInfo.outputPath('public-diagnostics.json'),JSON.stringify({pool,latestPublic,summaries,error:error instanceof Error?error.message:String(error)},null,2));throw error;} finally {await Promise.all(contexts.map(context=>context.close()));}
});

test('practice has 102 searchable cards and edition filters preserve four selected cards',async({page})=>{
  await page.goto(url);await page.getByRole('tab',{name:'自己练习',exact:true}).click();await page.getByRole('button',{name:'开始自己练习',exact:true}).click();await online(page);await expect(page.locator('.practice-pool .character-card')).toHaveCount(102);
  await page.getByLabel('角色版本筛选').selectOption('second-wind');await expect(page.locator('.practice-pool .character-card')).toHaveCount(36);await page.getByLabel('搜索角色').fill('Mr. Dice Guy');await expect(page.locator('.practice-pool .character-card')).toHaveCount(1);await page.locator('.practice-pool .character-art').click();
  await page.getByLabel('搜索角色').fill('');await page.getByLabel('角色版本筛选').selectOption('original');await expect(page.locator('.practice-pool .character-card')).toHaveCount(36);await page.locator('.practice-pool .character-art').nth(0).click();await page.locator('.practice-pool .character-art').nth(1).click();await page.locator('.practice-pool .character-art').nth(2).click();await expect(page.getByRole('status')).toContainText('已选 4 / 4 张');await page.getByRole('button',{name:'确认练习阵容',exact:true}).click();await expect(page.locator('.hand-selection .character-card')).toHaveCount(4);
});

test('mobile visual fixture shows were form and transferred mount with actionable skill and expanded chat',async({page})=>{
  await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:muted','true');});
  await page.goto(url);await page.getByRole('tab',{name:'自己练习',exact:true}).click();await page.getByRole('button',{name:'开始自己练习',exact:true}).click();await online(page);
  const code=page.url().split('/').at(-1)!;
  await page.evaluate(async code=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('magical-athlete-browser-authority-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('rooms','readwrite');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);const store=tx.objectStore('rooms'),request=store.get(code);request.onsuccess=()=>{
      const record=request.result,room=record.room,g=room.game,p=g.players[0];room.version++;room.deadline=null;g.phase='race';g.round=1;g.track='mild';g.turn=0;g.turnCount=1;g.currentRacerId='visual-bite';g.queue=[];g.logs=[];g.results=[];g.flags={awaitRoll:false};
      g.racers=['bite-mark','hog-knight','coach','null'].map((characterId,i)=>({id:['visual-bite','visual-hog','visual-coach','visual-null'][i],identityPlayerId:p.id,playerId:p.id,characterId,position:[10,13,16,20][i],tripped:false,finished:false,eliminated:false,flags:i===0?{form:'were-mouth'}:i===2?{hogOwnerId:'visual-hog'}:{}}));g.baseTurnOrder=g.racers.map((r:any)=>r.id);
      g.pending={id:'visual-choice',playerId:p.id,racerId:'visual-bite',kind:'kingtripper',title:'画面验收：选择目标',optional:true,options:[{id:'visual-hog',label:'猪骑士'},{id:'skip',label:'放弃'}],context:{}};store.put(record);
    };});db.close();
  },code);
  await page.reload();await online(page);await expect(page.getByTestId('skill-choice')).toBeVisible();await expect.poll(async()=>Number(await page.getByTestId('board-3d').getAttribute('data-loaded-models'))).toBeGreaterThanOrEqual(5);await expect(page.getByTestId('board-3d')).toHaveAttribute('data-model-fallbacks','0');
  for(const selector of ['.floating-avatar .sw-avatar','.minimap-own-avatar .sw-avatar']){const avatars=page.locator(selector);expect(await avatars.count()).toBeGreaterThan(0);for(const avatar of await avatars.all()){await expect(avatar).toHaveCSS('border-radius','50%');await expect(avatar).toHaveCSS('clip-path','circle(50% at 50% 50%)');expect(await avatar.evaluate(element=>{const b=element.getBoundingClientRect(),p=element.parentElement!.getBoundingClientRect();return b.x>=p.x&&b.y>=p.y&&b.right<=p.right+.5&&b.bottom<=p.bottom+.5;})).toBe(true);}}
  await page.getByRole('button',{name:'总览',exact:true}).click();await send(page,'选择技能时也能聊天');await expect(page.getByRole('log')).toContainText('选择技能时也能聊天');await expect(page.getByTestId('skill-choice').getByRole('button',{name:'猪骑士',exact:true})).toBeEnabled();
  expect(await page.getByTestId('skill-choice').getByRole('button',{name:'猪骑士',exact:true}).evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);
  await page.getByLabel('聊天消息',{exact:true}).fill('空格不会掷骰');await page.getByLabel('聊天消息',{exact:true}).press('Space');await expect(page.getByTestId('skill-choice')).toContainText('画面验收：选择目标');
  await page.screenshot({path:'docs/qa/second-wind/were-mount-chat-mobile.png'});await page.getByRole('button',{name:'收起聊天'}).click();expect(await page.getByTestId('skill-choice').getByRole('button',{name:'猪骑士',exact:true}).evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);await page.screenshot({path:'docs/qa/second-wind/were-mount-mobile.png'});expect(errors).toEqual([]);
});
