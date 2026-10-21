import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Identity, RoomView } from '../../src/shared/types.js';

const evidence='docs/qa/ai-exit';
async function identity(page:Page,code:string):Promise<Identity>{
  return page.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}:player`)??localStorage.getItem(`magical-athlete:identity:${code}`)!),code);
}

/** The game is created, drafted and selected only through the visible UI. */
export async function aiExitScenario(browser:Browser,url:string,backend:'node'|'relay',mobile:boolean,testInfo:TestInfo){
  mkdirSync(evidence,{recursive:true});
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>{try{localStorage.setItem('magical-athlete:muted','true');localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:animation-speed','4');}catch{}});
  const page=await context.newPage(),errors:string[]=[],views:RoomView[]=[];let closeRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{
    socket.on('framereceived',frame=>{try{const raw=String(frame.payload),message=JSON.parse(raw.replace(/^42\d*(?=\[)/,''));if(Array.isArray(message)&&message[0]==='snapshot')views.push(message[1]);else if(message.type==='snapshot')views.push(message.room);}catch{}});
    socket.on('framesent',frame=>{try{const raw=String(frame.payload),message=JSON.parse(raw.replace(/^42\d*(?=\[)/,'')),action=Array.isArray(message)?message[1]?.action:message.envelope?.action;if(action?.type==='close')closeRequests++;}catch{}});
  });
  const suffix=`${backend}-${mobile?'mobile':'desktop'}`,prefix=backend==='relay'?'/api/browser':'/api';
  try{
    await page.goto(url);await page.getByLabel('你的昵称').fill('AI退出验收');await page.getByRole('tab',{name:'人机对战',exact:true}).click();
    await page.getByLabel('AI 人数',{exact:true}).selectOption('1');await page.getByRole('button',{name:'开始人机对战',exact:true}).click();
    await expect(page.locator('.connection.is-online')).toBeVisible();const code=page.url().split('/').at(-1)!,original=await identity(page,code);
    await expect(page.locator('.phase-draft')).toBeVisible();
    await page.locator('.room-actions').getByRole('button',{name:'退出房间',exact:true}).click();
    const leave=page.getByRole('dialog',{name:'离开这个房间？',exact:true});await expect(leave.getByRole('button',{name:'解散房间',exact:true})).toBeEnabled();
    await expect(leave.getByRole('heading',{name:'退出，保留房间',exact:true})).toBeVisible();await expect(leave.getByRole('heading',{name:'解散，立即关闭',exact:true})).toBeVisible();
    await expect(leave).toContainText('30 分钟');await expect(leave).toContainText('不再保留房间');await page.screenshot({path:`${evidence}/ai-exit-draft-${suffix}.png`,fullPage:true});
    await leave.getByRole('button',{name:/^(确认退出房间|保留房间，退出)$/}).click();await expect(page).toHaveURL(`${url}/`);
    expect(await identity(page,code)).toEqual(original);
    let absent:{ownerId?:string;hostLeftAt?:number;expiresAt?:number}={};
    await expect.poll(async()=>{const status=await page.request.post(`${url}${prefix}/rooms/${code}/resume-status`,{data:original});expect(status.status()).toBe(200);absent=await status.json();return typeof absent.hostLeftAt;}).toBe('number');
    expect(absent.ownerId).toBe(original.playerId);expect(absent.expiresAt!-absent.hostLeftAt!).toBe(30*60*1000);
    const retainedDirectory=await (await page.request.get(`${url}${prefix}/rooms`)).json();expect(retainedDirectory.rooms.some((entry:{code:string;mode:string})=>entry.code===code&&entry.mode==='ai')).toBe(true);
    await page.goto(`${url}/room/${code}`);await expect(page.locator('.connection.is-online')).toBeVisible();await page.reload();await expect(page.locator('.connection.is-online')).toBeVisible();
    expect(await identity(page,code)).toEqual(original);await expect.poll(()=>views.at(-1)?.ownerId).toBe(original.playerId);expect(views.at(-1)?.hostId).toBe(original.playerId);
    const resumed=await (await page.request.post(`${url}${prefix}/rooms/${code}/resume-status`,{data:original})).json();expect(resumed.hostLeftAt).toBeUndefined();expect(resumed.ownerId).toBe(original.playerId);
    // Draft exactly the four human cards, allowing the real AI to make its picks.
    for(let guard=0;await page.locator('.phase-draft').count();guard++){
      expect(guard).toBeLessThan(16);
      const previous=views.at(-1);await expect.poll(()=>views.at(-1)?.phase).not.toBeUndefined();const view=views.at(-1)!;
      if(view.phase!=='draft')break;
      if(view.draft?.order[view.draft.cursor]===original.playerId){
        await expect.poll(async()=>Number(await page.locator('.game-shell').getAttribute('data-room-version'))).toBeGreaterThanOrEqual(view.version);
        const choice=page.locator('.character-grid .character-art').first();await expect(choice).toBeEnabled();await choice.click();
        await page.getByRole('button',{name:/^确认选择/}).click();
      }
      await expect.poll(()=>{const next=views.at(-1);return !!next&&(next.phase!=='draft'||next.version!==previous?.version);}).toBe(true);
    }
    await expect(page.locator('.phase-selection')).toBeVisible();
    await page.locator('.hand-selection .character-art').nth(0).click();await page.locator('.hand-selection .character-art').nth(1).click();await page.getByRole('button',{name:'锁定上场角色',exact:true}).click();
    await expect(page.getByTestId('immersive-race')).toBeVisible();await expect(page.getByTestId('board-3d')).toBeVisible();
    // Reach the leave choices from the persistent HUD, without opening settings.
    const topLeave=page.locator('.race-hud-top').getByRole('button',{name:'退出房间',exact:true});await expect(topLeave).toBeInViewport();await topLeave.click();
    await expect(leave.getByRole('button',{name:'解散房间',exact:true})).toBeEnabled();await expect(page.getByRole('dialog',{name:'比赛菜单',exact:true})).toHaveCount(0);
    await page.screenshot({path:`${evidence}/ai-exit-race-${suffix}.png`,fullPage:true});
    await leave.getByRole('button',{name:'解散房间',exact:true}).click();
    const confirm=page.getByRole('dialog',{name:'结束此房间？',exact:true});await expect(confirm).toBeVisible();expect(closeRequests).toBe(0);
    await confirm.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByTestId('immersive-race')).toBeVisible();expect(closeRequests).toBe(0);
    await topLeave.click();await leave.getByRole('button',{name:'解散房间',exact:true}).click();await confirm.getByRole('button',{name:'确认结束',exact:true}).click();
    await expect(page.getByRole('heading',{name:'房间已解散',exact:true})).toBeVisible();expect(closeRequests).toBe(1);
    await page.reload();await expect(page.getByRole('heading',{name:'房间已解散',exact:true})).toBeVisible();
    const closedStatus=await page.request.post(`${url}${prefix}/rooms/${code}/resume-status`,{data:original});expect(closedStatus.status()).toBe(410);
    const closedDirectory=await (await page.request.get(`${url}${prefix}/rooms`)).json();expect(closedDirectory.rooms.some((entry:{code:string})=>entry.code===code)).toBe(false);
    const late=await page.request.post(`${url}${prefix}/rooms/${code}/join`,{data:{name:'旧链接返回'}});expect([400,410]).toContain(late.status());
    await page.screenshot({path:`${evidence}/ai-exit-closed-${suffix}.png`,fullPage:true});expect(errors).toEqual([]);
    writeFileSync(`${evidence}/ai-exit-${suffix}.json`,JSON.stringify({backend,viewport:mobile?'390x844 Edge layout emulation':'1280x900 Edge',topExitReachesDissolve:true,twoClearOptions:true,retainedRoomCode:code,retainWindowMs:absent.expiresAt!-absent.hostLeftAt!,sameIdentityAfterRefresh:true,ownerUnchanged:true,absentRoomListed:true,closedRoomListed:false,closeRequests,closedStatus:closedStatus.status(),pageErrors:errors},null,2));
    await testInfo.attach(`ai-exit-${suffix}`,{path:`${evidence}/ai-exit-${suffix}.json`,contentType:'application/json'});
  }finally{await context.close();}
}
