import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createApplication } from '../../src/server/index.js';
import { enabledCharacterIds } from '../../src/shared/room-config.js';
import { CHARACTERS } from '../../src/shared/characters.js';

let app:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{app=createApplication(':memory:');await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));const address=app.http.address();if(!address||typeof address==='string')throw Error('Missing address');url=`http://127.0.0.1:${address.port}`;mkdirSync('docs/qa/fan-iteration',{recursive:true});});
test.afterAll(async()=>{await app.close();});
test('independent character packs persist, synchronize to peers, reset readiness and freeze at drafting',async({browser})=>{
  const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844}})]),pages=await Promise.all(contexts.map(context=>context.newPage()));
  const [host,guest]=pages;try{
    await host!.goto(url);await expect(host!.getByRole('checkbox',{name:'基础角色包',exact:true})).toBeChecked();
    for(const name of ['Second Wind','Extra Mile','Leaf’s Fan Expansion'])await expect(host!.getByRole('checkbox',{name,exact:true})).not.toBeChecked();
    await host!.getByLabel('你的昵称').fill('配置房主');await host!.getByLabel('房间人数上限').selectOption('2');await host!.getByLabel('每次操作时限').selectOption('0');await host!.getByRole('checkbox',{name:'Extra Mile',exact:true}).check();
    await host!.getByRole('button',{name:'创建房间，召集朋友',exact:true}).click();await expect(host!.locator('.connection.is-online')).toBeVisible();const code=host!.url().split('/').at(-1)!;
    await guest!.goto(`${url}/room/${code}`);await guest!.getByLabel('你的昵称').fill('手机客人');await guest!.getByRole('button',{name:'加入这场胡闹',exact:true}).click();await expect(guest!.locator('.connection.is-online')).toBeVisible();
    for(const page of pages)await expect(page.locator('.room-config-panel>summary')).toContainText('Extra Mile');
    await host!.getByRole('button',{name:'我准备好了',exact:true}).click();await guest!.getByRole('button',{name:'我准备好了',exact:true}).click();
    await host!.locator('.room-config-panel>summary').click();await host!.getByRole('checkbox',{name:'Second Wind',exact:true}).check();await host!.getByRole('button',{name:'保存本房间设置',exact:true}).click();
    for(const page of pages){await expect(page.getByRole('button',{name:'我准备好了',exact:true})).toBeVisible();await expect(page.locator('.room-config-panel>summary')).toContainText('Second Wind');}
    await host!.reload();await expect(host!.locator('.connection.is-online')).toBeVisible();await expect(host!.locator('.room-config-panel>summary')).toContainText('Extra Mile');
    await guest!.screenshot({path:'docs/qa/fan-iteration/settings-lobby-mobile.png'});
    for(const page of pages)await page.getByRole('button',{name:'我准备好了',exact:true}).click();
    await host!.getByRole('button',{name:'开始选秀',exact:true}).click();await expect(host!.getByRole('heading',{name:'组建你的队伍'})).toBeVisible();
    const room=app.rooms.get(code);expect(room.configFrozen).toBe(true);expect(room.game.draft!.market.every(id=>enabledCharacterIds(room.game.config).includes(id))).toBe(true);expect(room.game.draft!.market.some(id=>id.startsWith('leaf-'))).toBe(false);
    await host!.screenshot({path:'docs/qa/fan-iteration/settings-draft-desktop.png'});
  }finally{await Promise.all(contexts.map(context=>context.close()));}
});
test('practice can choose four completed racers across enabled packs and complete public logs remain reviewable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto(url);await page.getByRole('tab',{name:'自己练习',exact:true}).click();
  for(const name of ['Extra Mile','Leaf’s Fan Expansion'])await page.getByRole('checkbox',{name,exact:true}).check();
  await page.getByRole('button',{name:'开始自己练习',exact:true}).click();await expect(page.locator('.connection.is-online')).toBeVisible();
  await expect(page.locator('.practice-pool .character-card')).toHaveCount(CHARACTERS.length);
  const selected=[CHARACTERS.find(card=>!card.edition||card.edition==='original')!,CHARACTERS.find(card=>card.edition==='second-wind')!,CHARACTERS.find(card=>card.edition==='extra-mile')!,CHARACTERS.find(card=>card.edition==='leaf')!];
  for(const card of selected){await page.getByLabel('搜索角色',{exact:true}).fill(card.nameEn);await page.getByRole('button',{name:`选择${card.nameZh}`,exact:true}).click();}
  await page.getByLabel('搜索角色',{exact:true}).fill('');await page.getByRole('button',{name:'确认练习阵容',exact:true}).click();await expect(page.locator('.hand-selection .character-card')).toHaveCount(4);
  const code=page.url().split('/').at(-1)!,room=app.rooms.get(code);room.game.logs=Array.from({length:250},(_,i)=>({id:i+1,type:'power',text:`公开连锁验收 ${i+1}`,cause:'source-checked'}));app.store.save(room);
  await page.reload();await expect(page.getByRole('button',{name:'读取本局完整公开记录',exact:true})).toBeVisible();await page.getByRole('button',{name:'读取本局完整公开记录',exact:true}).click();await expect(page.locator('.event-log li')).toHaveCount(60);
  await page.getByRole('button',{name:/显示更早记录/}).click();await expect(page.locator('.event-log li')).toHaveCount(120);
  for(let index=0;index<3;index++)if(await page.getByRole('button',{name:/显示更早记录/}).count())await page.getByRole('button',{name:/显示更早记录/}).click();
  await expect(page.locator('.event-log li')).toHaveCount(250);await expect(page.locator('.event-log li').last()).toContainText('公开连锁验收 1');await page.screenshot({path:'docs/qa/fan-iteration/cross-pack-practice-mobile.png'});
  // Stay mounted: after another long chain, snapshots alone omit 251..380.
  const continued=app.rooms.get(code);continued.game.logs.push(...Array.from({length:250},(_,i)=>({id:i+251,type:'power',text:`后续连锁验收 ${i+251}`})));continued.version++;app.store.save(continued);
  for(const socket of app.io.sockets.sockets.values())if(socket.data.identity?.roomCode===code)socket.emit('snapshot',app.rooms.view(continued,socket.data.identity.playerId));
  await expect(page.getByRole('button',{name:'补齐本局公开记录',exact:true})).toBeVisible();await page.getByRole('button',{name:'补齐本局公开记录',exact:true}).click();
  await expect(page.getByRole('button',{name:'补齐本局公开记录',exact:true})).toHaveCount(0);
  while(await page.getByRole('button',{name:/显示更早记录/}).count())await page.getByRole('button',{name:/显示更早记录/}).click();
  await expect(page.locator('.event-log li')).toHaveCount(500);await expect(page.locator('.event-log li').filter({hasText:'后续连锁验收 251'})).toHaveCount(1);await expect(page.locator('.event-log li').last()).toContainText('公开连锁验收 1');
});
