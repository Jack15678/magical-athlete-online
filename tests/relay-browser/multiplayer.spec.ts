import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { GameAction, Room } from '../../src/shared/types.js';
import { mkdirSync } from 'node:fs';

const url=process.env.RELAY_URL??'http://127.0.0.1:8787';
async function captureRace(page:Page,path:string){await page.getByTestId('board-3d').scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.getByTestId('board-3d').screenshot({path:path.replace(/\.png$/,'-board.png')});await page.screenshot({path,fullPage:true});}
async function saved(page:Page,code:string):Promise<Room>{
  // Transfer the game's documented JSON format rather than Playwright's deeply
  // nested evaluation-value encoding (which can reject large event histories).
  const json=await page.evaluate(async code=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('magical-athlete-browser-authority-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{return await new Promise<string>((resolve,reject)=>{const r=db.transaction('rooms').objectStore('rooms').get(code);r.onsuccess=()=>resolve(JSON.stringify(r.result.room));r.onerror=()=>reject(r.error);});}finally{db.close();}
  },code);
  return JSON.parse(json) as Room;
}

for(const n of [2,6,8])test(`browser authority ${n} independent players: four races, host recovery, privacy and rematch`,async({browser})=>{
  const contexts:BrowserContext[]=[],pages:Page[]=[],errors:string[]=[];
  const observe=(page:Page)=>{
    page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>{
      expect(ws.url()).not.toMatch(/token=|playerId=/);
      ws.on('framereceived',frame=>{
        try{const message=JSON.parse(String(frame.payload));if(message.type!=='snapshot')return;
          for(const p of message.room.players)if(p.id!==message.room.selfId){if(p.hand!==undefined||p.selection!==undefined)errors.push('Other player private hand or selection leaked.');}
        }catch{/* Protocol errors are separately surfaced by the actual UI. */}
      });
    });
  };
  try{
    mkdirSync('test-results/browser-authority',{recursive:true});
    for(let i=0;i<n;i++){
      const context=await browser.newContext({viewport:i===n-1?{width:390,height:844}:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});contexts.push(context);
      await context.addInitScript(()=>{localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:low-quality','true');});
      const page=await context.newPage();pages.push(page);observe(page);
    }
    const host=pages[0]!;
    await host.goto(url);await host.getByLabel('你的昵称').fill('浏览器计算房主');await host.getByLabel('房间人数上限').selectOption(String(n));await host.getByLabel('每次操作时限').selectOption('0');
    await host.getByRole('button',{name:'创建房间，召集朋友'}).click();await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);const code=host.url().split('/').at(-1)!;
    await expect(host.getByText('已连接',{exact:true})).toBeVisible();
    for(let i=1;i<n;i++){
      const p=pages[i]!;await p.goto(`${url}/room/${code}`);await p.getByLabel('你的昵称').fill(`网页同学${i}`);await p.getByRole('button',{name:'加入这场胡闹'}).click();await expect(p.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();
    }
    for(const p of pages){await p.getByRole('button',{name:'我准备好了',exact:true}).click();await expect(p.getByRole('button',{name:'取消准备',exact:true})).toBeVisible();}
    await host.getByRole('button',{name:'邀请朋友',exact:true}).click();expect(await host.evaluate(()=>navigator.clipboard.readText())).toBe(`${url}/room/${code}`);
    const ids=await Promise.all(pages.map(p=>p.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code)));expect(new Set(ids).size).toBe(n);
    for(const guest of pages.slice(1))expect(await guest.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='magical-athlete-browser-authority-v1'))).toBe(false);
    await host.getByRole('button',{name:'开始选秀',exact:true}).click();await expect.poll(async()=>(await saved(host,code)).game.phase).toBe('draft');
    while((await saved(host,code)).game.phase==='draft'){
      const d=(await saved(host,code)).game.draft!;const p=pages[ids.indexOf(d.order[d.cursor]!) ]!;
      await p.locator('.character-card .character-art').first().click();const confirm=p.getByRole('button',{name:/确认选择/});if(await confirm.count())await confirm.click();
      await expect.poll(async()=>(await saved(host,code)).game.draft?.cursor??-1).not.toBe(d.cursor);
    }
    let steps=0,hostRecovered=false,guestRecovered=false,raceShot=false;
    while((await saved(host,code)).game.phase!=='finished'){
      const room=await saved(host,code),g=room.game;if(++steps>5000)throw Error(`Execution budget exceeded in ${g.phase}; game queue was not truncated.`);if(g.phase==='paused')throw Error('Engine diagnostic pause.');
      if(g.phase==='selection'){
        const player=g.players.find(p=>!p.selection.length)!;const p=pages[ids.indexOf(player.id)]!;const count=n===2?2:1;
        for(let i=0;i<count;i++)await p.locator('.hand-selection .character-card').filter({has:p.getByRole('button',{name:/选择/})}).nth(i).getByRole('button',{name:/选择/}).click();
        await p.getByRole('button',{name:'锁定上场角色',exact:true}).click();await expect.poll(async()=>{const next=(await saved(host,code)).game;return next.phase==='selection'?next.players.find(x=>x.id===player.id)?.selection.length:count;}).toBe(count);continue;
      }
      if(!hostRecovered&&g.phase==='race'){
        const duplicate=await contexts[0]!.newPage();observe(duplicate);await duplicate.goto(`${url}/room/${code}`);await expect(duplicate.getByText('已连接',{exact:true})).toBeVisible();await duplicate.close();
        const before=(await saved(host,code)).game;
        await host.goto('about:blank');await expect(pages[1]!.getByText('计算房主网页离线，等待其返回。',{exact:false})).toBeVisible();
        await host.goto(`${url}/room/${code}`);await expect(host.getByText('已连接',{exact:true})).toBeVisible();
        const after=(await saved(host,code)).game;
        for(const key of ['rngState','randomLog','pending','queue','racers','round','results'] as const)expect(after[key]).toEqual(before[key]);
        hostRecovered=true;continue;
      }
      if(!guestRecovered&&g.phase==='race'){
        const p=pages.at(-1)!;await contexts.at(-1)!.setOffline(true);await p.reload().catch(()=>{});await contexts.at(-1)!.setOffline(false);await p.goto(`${url}/room/${code}`);await expect(p.getByText('已连接',{exact:true})).toBeVisible();
        expect(await p.evaluate(code=>JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId,code)).toBe(ids.at(-1));guestRecovered=true;continue;
      }
      if(!raceShot&&g.phase==='race'){for(const scene of [host,pages.at(-1)!]){await expect(scene.getByTestId('board-3d').locator('canvas')).toBeVisible();await expect(scene.getByTestId('scene-racer')).toHaveCount(n===2?4:n);}await captureRace(host,`test-results/browser-authority/race-${n}.png`);await captureRace(pages.at(-1)!,`test-results/browser-authority/race-mobile-${n}.png`);raceShot=true;}
      let playerId:string,action:GameAction;
      if(g.pending){playerId=g.pending.playerId;const option=g.pending.options.find(o=>['skip','pass','decline'].includes(o.id))??g.pending.options[0]!;action={type:'choose',choiceId:g.pending.id,optionId:option.id};}
      else if(g.phase==='results'){playerId=room.hostId;action={type:'next'};}
      else{playerId=g.racers.find(r=>r.id===g.currentRacerId)!.playerId;action={type:'roll'};}
      const p=pages[ids.indexOf(playerId)]!;
      if(action.type==='choose')await p.getByRole('region',{name:'待处理技能'}).getByRole('button',{name:g.pending!.options.find(o=>o.id===action.optionId)!.label,exact:true}).click();
      else if(action.type==='next')await p.getByRole('button',{name:'前往下一场',exact:true}).click();
      else await p.getByRole('button',{name:'掷骰子',exact:true}).click();
      await expect.poll(async()=>(await saved(host,code)).version).toBeGreaterThan(room.version);await p.waitForTimeout(180);
    }
    expect((await saved(host,code)).game.results).toHaveLength(4);expect(errors).toEqual([]);
    await host.screenshot({path:`test-results/browser-authority/final-${n}.png`,fullPage:true});
    const admin=pages[ids.indexOf((await saved(host,code)).hostId)]!;await admin.getByRole('button',{name:'原房间，再来一局',exact:true}).click();await expect(admin.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();
    expect((await saved(host,code)).game.players.every(p=>p.score===0&&p.hand.length===0)).toBe(true);
    for(const p of pages)expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
