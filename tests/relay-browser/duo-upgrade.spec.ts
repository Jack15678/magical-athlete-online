import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { Room } from '../../src/shared/types.js';

const url=process.env.RELAY_URL??'http://127.0.0.1:8787';
const output='docs/qa/duo-upgrade';
test.setTimeout(60_000);
test.use({actionTimeout:15_000});
async function saved(page:Page,code:string):Promise<Room>{
  return JSON.parse(await page.evaluate(async code=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('magical-athlete-browser-authority-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{return await new Promise<string>((resolve,reject)=>{const r=db.transaction('rooms').objectStore('rooms').get(code);r.onsuccess=()=>resolve(JSON.stringify(r.result.room));r.onerror=()=>reject(r.error);});}finally{db.close();}
  },code));
}
async function fixture(browser:Browser){
  const contexts=await Promise.all([false,true].map(mobile=>browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1})));
  for(const context of contexts)await context.addInitScript(()=>{try{localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:muted','true');}catch{/* Initial document. */}});
  const [host,guest]=await Promise.all(contexts.map(context=>context.newPage())) as [Page,Page],errors:string[]=[];
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  await host.goto(url);await host.getByLabel('你的昵称').fill('双人计算房主');await host.getByLabel('房间人数上限').selectOption('2');await host.getByLabel('每次操作时限').selectOption('0');await host.getByRole('button',{name:'创建房间，召集朋友'}).click();
  await expect(host.locator('.connection.is-online')).toBeVisible();const code=host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`);await guest.getByLabel('你的昵称').fill('双人手机选手');await guest.getByRole('button',{name:'加入这场胡闹'}).click();await expect(guest.locator('.connection.is-online')).toBeVisible();
  await expect.poll(async()=>(await saved(host,code)).game.players.length).toBe(2);
  mkdirSync(output,{recursive:true});return{contexts,host,guest,code,errors};
}
async function seed(host:Page,code:string,change:(room:Room)=>Room){
  const room=change(await saved(host,code));room.version++;room.updatedAt=Date.now();room.deadline=null;
  await host.evaluate(async({code,room})=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('magical-athlete-browser-authority-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('rooms','readwrite'),store=tx.objectStore('rooms'),r=store.get(code);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);r.onsuccess=()=>store.put({...r.result,room});});}finally{db.close();}
  },{code,room});
  await host.reload();await expect(host.locator('.connection.is-online')).toBeVisible();return room;
}
async function sceneReady(page:Page){
  await expect(page.locator('.connection.is-online')).toBeVisible();await expect(page.getByTestId('board-3d').locator('.board-webgl canvas')).toBeVisible();
  await expect.poll(async()=>Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
}

test('relay authority locks reversed duo order, restores selection and automatically opens the first actor skill',async({browser})=>{
  const pair=await fixture(browser);
  try{
    await seed(pair.host,pair.code,room=>{room.game.phase='selection';room.game.round=2;room.game.flags.firstPlayer=room.hostId;room.game.players.forEach((p,i)=>{p.hand=i?['coach','alchemist']:['legs','genius'];p.selection=[];});return room;});
    await pair.host.getByRole('button',{name:'选择大长腿',exact:true}).click();await pair.host.getByRole('button',{name:'选择天才',exact:true}).click();
    await pair.host.getByRole('button',{name:'交换行动顺序',exact:true}).click();await expect(pair.host.locator('.selection-order li').first()).toContainText('天才');
    await pair.host.getByRole('button',{name:'锁定上场角色',exact:true}).click();await expect(pair.host.getByRole('button',{name:'交换行动顺序'})).toBeDisabled();
    await pair.host.reload();await expect(pair.host.locator('.selection-order li').first()).toContainText('天才');await expect(pair.host.getByRole('button',{name:'交换行动顺序'})).toBeDisabled();
    await pair.guest.getByRole('button',{name:'选择教练',exact:true}).click();await pair.guest.getByRole('button',{name:'选择炼金术士',exact:true}).click();await pair.guest.getByRole('button',{name:'锁定上场角色',exact:true}).click();
    await expect(pair.host.getByTestId('skill-choice')).toContainText('预测主移动骰面');const before=await saved(pair.host,pair.code);
    const own=before.game.baseTurnOrder!.map(id=>before.game.racers.find(r=>r.id===id)!).filter(r=>r.playerId===before.hostId);expect(own.map(r=>r.characterId)).toEqual(['genius','legs']);expect(before.game.randomLog.filter(r=>r.reason.endsWith('主移动'))).toHaveLength(0);
    await pair.host.reload();await sceneReady(pair.host);await expect(pair.host.getByTestId('skill-choice')).toContainText('预测主移动骰面');expect((await saved(pair.host,pair.code)).game.baseTurnOrder).toEqual(before.game.baseTurnOrder);
    await pair.host.screenshot({path:`${output}/relay-order-skill-desktop.png`});expect(pair.errors).toEqual([]);
  }finally{await Promise.all(pair.contexts.map(c=>c.close()));}
});

test('relay second athlete duel stays manual and restores the responding second athlete after both clients reload',async({browser})=>{
  const pair=await fixture(browser);
  try{
    await seed(pair.host,pair.code,room=>{
      const ids=room.game.players.map(p=>p.id),game=room.game;game.phase='race';game.round=1;game.currentRacerId='a1';game.turn=1;game.turnCount=1;game.baseTurnOrder=['a0','a1','b0','b1'];game.queue=[];game.logs=[];game.randomLog=[];game.flags={testDice:[6,2],choiceSeq:1};
      game.racers=['a0','a1','b0','b1'].map((id,i)=>({id,playerId:ids[Math.floor(i/2)]!,characterId:i===1?'duelist':['coach','duelist','alchemist','genius'][i]!,position:i===1||i===3?5:20+i,tripped:false,finished:false,eliminated:false,flags:{}}));
      game.pending={id:'c1',playerId:ids[0]!,racerId:'a1',kind:'duelist',title:'要向同格角色发起决斗吗？',optional:true,options:[{id:'b1',label:'天才'},{id:'skip',label:'不决斗'}],context:{}};return room;
    });
    await pair.host.getByTestId('skill-choice').getByRole('button',{name:'天才',exact:true}).click();await expect(pair.host.getByRole('button',{name:'掷决斗骰',exact:true})).toBeVisible();expect((await saved(pair.host,pair.code)).game.randomLog).toHaveLength(0);
    await pair.host.getByRole('button',{name:'掷决斗骰',exact:true}).click();await expect(pair.guest.getByRole('button',{name:'掷决斗骰',exact:true})).toBeVisible();
    const half=await saved(pair.host,pair.code);expect(half.game.pending?.racerId).toBe('b1');expect(half.game.randomLog).toHaveLength(1);expect(half.deadline).toBeNull();
    await pair.host.reload();await expect(pair.host.locator('.connection.is-online')).toBeVisible();await pair.guest.reload();await expect(pair.guest.getByRole('button',{name:'掷决斗骰',exact:true})).toBeVisible();expect((await saved(pair.host,pair.code)).game.randomLog).toHaveLength(1);
    await sceneReady(pair.guest);await pair.guest.screenshot({path:`${output}/relay-duel-second-mobile.png`});await pair.guest.getByRole('button',{name:'掷决斗骰',exact:true}).click();
    await expect.poll(async()=>(await saved(pair.host,pair.code)).game.logs.filter(e=>e.type==='duel-dice').length).toBe(1);expect((await saved(pair.host,pair.code)).game.randomLog).toHaveLength(2);expect(pair.errors).toEqual([]);
  }finally{await Promise.all(pair.contexts.map(c=>c.close()));}
});
