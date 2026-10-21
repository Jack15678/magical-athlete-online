import { test, expect, type Browser, type Page } from '@playwright/test';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState } from '../../src/shared/types.js';

let application:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{
  application=createApplication(':memory:');await new Promise<void>(resolve=>application.http.listen(0,'127.0.0.1',resolve));
  const address=application.http.address();if(!address||typeof address==='string')throw Error('Missing model-recovery fixture address.');
  url=`http://127.0.0.1:${address.port}`;
});
test.afterAll(async()=>{await application.close();});

async function fixture(browser:Browser,lowQuality:boolean){
  const created=application.rooms.create('模型恢复检查',2,0),guest=application.rooms.join(created.identity.roomCode,'对手');
  const room=application.rooms.get(created.identity.roomCode),ids=[created.identity.playerId,guest.identity.playerId];
  const game:GameState={phase:'race',round:1,track:'mild',players:room.game.players.map(player=>({...player,ready:true,connected:true})),
    deck:[],discard:[],turn:0,turnCount:0,currentRacerId:'quality-0',baseTurnOrder:['quality-0','quality-1'],
    racers:['coach','banana'].map((characterId,index)=>({id:`quality-${index}`,playerId:ids[index]!,characterId,position:[2,8][index]!,tripped:false,finished:false,eliminated:false,flags:{}})),
    queue:[{kind:'beginTurn',racerId:'quality-0'}],logs:[],results:[],flags:{},rngState:1234,randomLog:[]};
  resolveTasks(game);room.game=game;room.version++;application.store.save(room);
  const context=await browser.newContext({viewport:{width:1000,height:780},deviceScaleFactor:1});
  await context.addInitScript(({identity,low})=>{
    localStorage.setItem(`magical-athlete:identity:${identity.roomCode}`,JSON.stringify(identity));
    localStorage.setItem('magical-athlete:low-quality',String(low));localStorage.setItem('magical-athlete:muted','true');
    localStorage.setItem('magical-athlete:reduced-motion','true');localStorage.setItem('magical-athlete:animation-speed','4');
  },{identity:created.identity,low:lowQuality});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  return{context,page,errors,code:room.code,open:()=>page.goto(`${url}/room/${room.code}`)};
}
async function loaded(page:Page){
  const board=page.getByTestId('board-3d');await expect(board).toHaveAttribute('data-loaded-models','2');
  await expect(board).toHaveAttribute('data-model-fallbacks','0');await expect(page.getByText('3D 场景暂时无法显示',{exact:true})).toHaveCount(0);
}
async function quality(page:Page,low:boolean){
  await page.getByTestId('presentation-settings').click();await page.getByLabel('低画质',{exact:true}).setChecked(low);
  await page.getByRole('dialog',{name:'比赛菜单',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByTestId('board-3d')).toHaveAttribute('data-quality',low?'economy':'studio');
}

test('economy model fetch failure keeps the game usable and automatically retries its own asset',async({browser})=>{
  test.setTimeout(45_000);
  const env=await fixture(browser,true);let requests=0,release!:()=>void;
  const retryGate=new Promise<void>(resolve=>{release=resolve;});
  try{
    await env.page.route('**/models/toy-racers-economy.glb*',async route=>{
      requests++;if(requests===1){await route.abort('failed');return;}await retryGate;await route.continue();
    });
    await env.open();const board=env.page.getByTestId('board-3d');
    await expect(board.locator('.board-webgl canvas')).toBeVisible();await expect(board).toHaveAttribute('data-model-fallbacks','2');
    await expect(env.page.getByRole('button',{name:'掷骰子',exact:true})).toBeEnabled();
    await env.page.getByRole('button',{name:'总览',exact:true}).click();await expect(board).toHaveAttribute('data-camera-state','overview');
    const before=structuredClone(application.rooms.get(env.code).game);release();await loaded(env.page);
    expect(requests).toBeGreaterThanOrEqual(2);expect(application.rooms.get(env.code).game).toEqual(before);expect(env.errors).toEqual([]);
  }finally{release();await env.context.close();}
});

test('a failed detailed asset does not poison economy quality and can recover when returning to detailed quality',async({browser})=>{
  test.setTimeout(60_000);
  const env=await fixture(browser,false);let highRequests=0,economyRequests=0,allowHigh=false;
  try{
    await env.page.route('**/models/toy-racers.glb*',async route=>{highRequests++;if(!allowHigh){await route.abort('failed');return;}await route.continue();});
    await env.page.route('**/models/toy-racers-economy.glb*',async route=>{economyRequests++;await route.continue();});
    await env.open();const board=env.page.getByTestId('board-3d');await expect(board).toHaveAttribute('data-model-fallbacks','2');
    await expect.poll(()=>highRequests).toBeGreaterThanOrEqual(1);
    await quality(env.page,true);await loaded(env.page);expect(economyRequests).toBeGreaterThanOrEqual(1);
    // Returning to the failed URL must mount its own fallback, independent of
    // the successfully loaded economy URL. A restored network resets its bounded budget.
    await quality(env.page,false);await expect(board).toHaveAttribute('data-model-fallbacks','2');
    const before=structuredClone(application.rooms.get(env.code).game),attempts=highRequests;allowHigh=true;
    await env.page.evaluate(()=>window.dispatchEvent(new Event('online')));await loaded(env.page);
    expect(highRequests).toBeGreaterThan(attempts);expect(application.rooms.get(env.code).game).toEqual(before);expect(env.errors).toEqual([]);
  }finally{await env.context.close();}
});
