import { test,expect,type BrowserContext,type Page } from '@playwright/test';
import { createApplication } from '../../src/server/index.js';
import type { GameAction } from '../../src/shared/types.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
let app:ReturnType<typeof createApplication>,url:string;
async function captureRace(page:Page,path:string){await page.getByTestId('board-3d').scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.getByTestId('board-3d').screenshot({path:path.replace(/\.png$/,'-board.png')});await page.screenshot({path,fullPage:true});}
async function synced(page:Page,version:number){await expect.poll(async()=>Number(await page.locator('.game-shell').getAttribute('data-room-version'))).toBeGreaterThanOrEqual(version);}
test.beforeAll(async()=>{app=createApplication(':memory:');await new Promise<void>(r=>app.http.listen(0,'127.0.0.1',r));const addr=app.http.address();if(!addr||typeof addr==='string')throw Error('no server');url=`http://127.0.0.1:${addr.port}`;mkdirSync('test-results/screenshots',{recursive:true});});
test.afterAll(async()=>{await app.close();});
for(const n of [2,6,8])test(`${n}独立BrowserContext完整四场、刷新断线恢复与原房间再来`,async({browser})=>{
  // CI reached race four with 1,066 normal events at the old three-minute
  // limit. Give eight isolated UIs time to finish; retain the action budget.
  if(n===8)test.setTimeout(300_000);
  const contexts:BrowserContext[]=[],pages:Page[]=[];const failures:string[]=[];
  try{
    for(let i=0;i<n;i++){const c=await browser.newContext({viewport:i===n-1?{width:390,height:844}:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});contexts.push(c);await c.addInitScript(()=>{localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:low-quality','true');});const p=await c.newPage();pages.push(p);p.on('pageerror',e=>failures.push(e.stack??e.message));}
    const host=pages[0]!;await host.goto(url);await host.getByLabel('你的昵称').fill('房主同学');await host.getByLabel('房间人数上限').selectOption(String(n));await host.getByLabel('每次操作时限').selectOption('0');await host.getByRole('button',{name:'创建房间，召集朋友'}).click();await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);const code=host.url().split('/').at(-1)!;
    for(let i=1;i<n;i++){await pages[i]!.goto(`${url}/room/${code}`);await pages[i]!.getByLabel('你的昵称').fill(`同学${i}`);await pages[i]!.getByRole('button',{name:'加入这场胡闹'}).click();await expect(pages[i]!.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();}
    for(const p of pages){await synced(p,app.rooms.get(code).version);await p.getByRole('button',{name:'我准备好了',exact:true}).click();await expect(p.getByRole('button',{name:'取消准备',exact:true})).toBeVisible();}
    await host.getByRole('button',{name:'邀请朋友',exact:true}).click();const invite=await host.evaluate(()=>navigator.clipboard.readText());expect(invite).toBe(`${url}/room/${code}`);expect(invite).not.toMatch(/token|playerId/);
    await host.screenshot({path:`test-results/screenshots/lobby-${n}.png`,fullPage:true});
    await synced(host,app.rooms.get(code).version);await host.getByRole('button',{name:'开始选秀',exact:true}).click();await expect.poll(()=>app.rooms.get(code).game.phase).toBe('draft');
    const ids=await Promise.all(pages.map(p=>p.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code)));expect(new Set(ids).size).toBe(n);
    // Draft through the actual private browser UI, using state only to locate whose turn it is.
    while(app.rooms.get(code).game.phase==='draft'){
      const d=app.rooms.get(code).game.draft!;const p=pages[ids.indexOf(d.order[d.cursor]!) ]!;await synced(p,app.rooms.get(code).version);
      await p.locator('.character-card .character-art').first().click();
      // UI picks a card, then confirms the draft pick.
      const confirm=p.getByRole('button',{name:/确认选择/});if(await confirm.count())await confirm.click();
      await expect.poll(()=>app.rooms.get(code).game.draft?.cursor??-1).not.toBe(d.cursor);
    }
    await pages.at(-1)!.screenshot({path:`test-results/screenshots/selection-mobile-${n}.png`,fullPage:true});
    let actions=0,refreshed=false,offline=false,raceShot=false;
    while(app.rooms.get(code).game.phase!=='finished') {
      const room=app.rooms.get(code),g=room.game;if(++actions>5000)throw Error(`Test execution budget exceeded in ${g.phase}; no game state was truncated.`);
      if(g.phase==='paused')throw Error('Engine paused; diagnostic must be resolved.');
      if(g.phase==='selection'){
        const player=g.players.find(p=>!p.selection.length)!;const p=pages[ids.indexOf(player.id)]!;const count=n===2?2:1;await synced(p,room.version);
        for(let i=0;i<count;i++)await p.locator('.hand-selection .character-card').filter({has:p.getByRole('button',{name:/选择/})}).nth(i).getByRole('button',{name:/选择/}).click();
        await p.getByRole('button',{name:'锁定上场角色',exact:true}).click();await expect.poll(()=>app.rooms.get(code).game.phase==='selection'?app.rooms.get(code).game.players.find(x=>x.id===player.id)?.selection.length:count).toBe(count);continue;
      }
      if(!refreshed&&g.phase==='race'){const saved=ids.at(-1)!;await pages.at(-1)!.reload();await expect(pages.at(-1)!.getByText('已连接',{exact:true})).toBeVisible();expect(await pages.at(-1)!.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code)).toBe(saved);refreshed=true;continue;}
      if(refreshed&&!offline&&g.phase==='race'){await contexts.at(-1)!.setOffline(true);await expect(pages.at(-1)!.getByText('连接暂时中断，恢复后会自动同步。',{exact:false})).toBeVisible({timeout:45000});await contexts.at(-1)!.setOffline(false);await expect(pages.at(-1)!.getByText('已连接',{exact:true})).toBeVisible();offline=true;continue;}
      if(!raceShot&&g.phase==='race'){for(const scene of [host,pages.at(-1)!]){await expect(scene.getByTestId('board-3d').locator('canvas')).toBeVisible();await expect(scene.getByTestId('scene-racer')).toHaveCount(n===2?4:n);}await captureRace(host,`test-results/screenshots/race-${n}.png`);await captureRace(pages.at(-1)!,`test-results/screenshots/race-mobile-${n}.png`);raceShot=true;}
      let playerId:string,action:GameAction;
      if(g.pending){playerId=g.pending.playerId;const option=g.pending.options.find(o=>['skip','pass','decline'].includes(o.id))??g.pending.options[0]!;action={type:'choose',choiceId:g.pending.id,optionId:option.id};}
      else if(g.phase==='results'){playerId=room.hostId;action={type:'next'};}
      else {playerId=g.racers.find(r=>r.id===g.currentRacerId)!.playerId;action={type:'roll'};}
      const p=pages[ids.indexOf(playerId)]!;await synced(p,room.version);
      if(action.type==='choose'){const title=g.pending!.options.find(o=>o.id===action.optionId)!.label;await p.getByRole('region',{name:'待处理技能'}).getByRole('button',{name:title,exact:true}).click();}
      else if(action.type==='next')await p.getByRole('button',{name:'前往下一场',exact:true}).click();
      else await p.getByRole('button',{name:'掷骰子',exact:true}).click();
      // Keep automated clicks below the published production per-player rate limit.
      const rateError=p.getByRole('alert').filter({hasText:'操作太快'});
      if(await rateError.isVisible()){await p.waitForTimeout(10000);await p.getByRole('button',{name:'关闭错误提示'}).click();continue;}
      await expect.poll(()=>app.rooms.get(code).version).toBeGreaterThan(room.version);
      await p.waitForTimeout(260);
    }
    expect(app.rooms.get(code).game.results).toHaveLength(4);expect(failures).toEqual([]);
    await host.screenshot({path:`test-results/screenshots/final-${n}.png`,fullPage:true});
    const currentHost=pages[ids.indexOf(app.rooms.get(code).hostId)]!;await synced(currentHost,app.rooms.get(code).version);await currentHost.getByRole('button',{name:'原房间，再来一局',exact:true}).click();await expect(currentHost.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();expect(app.rooms.get(code).game.players.every(p=>p.score===0&&p.hand.length===0)).toBe(true);
    for(const p of pages)expect(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
