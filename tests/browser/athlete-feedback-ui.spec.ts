import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createApplication } from '../../src/server/index.js';
import { createGame, resolveTasks } from '../../src/engine/index.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import type { Racer, Room } from '../../src/shared/types.js';

const output='docs/qa/fan-iteration';
let application:ReturnType<typeof createApplication>,url:string;
test.beforeAll(async()=>{
  application=createApplication(':memory:');
  await new Promise<void>(resolve=>application.http.listen(0,'127.0.0.1',resolve));
  const address=application.http.address();if(!address||typeof address==='string')throw Error('Missing test address');
  url=`http://127.0.0.1:${address.port}`;mkdirSync(output,{recursive:true});
});
test.afterAll(async()=>{await application.close();});

async function pair(browser:Browser){
  const created=application.rooms.create('头像房主',2,0,'multiplayer',undefined,'mixed');
  const joined=application.rooms.join(created.identity.roomCode,'聊天访客');
  const identities=[created.identity,joined.identity],errors:string[]=[];
  const contexts=await Promise.all(identities.map(()=>browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1})));
  const pages:Page[]=[];
  for(let index=0;index<2;index++){
    const context=contexts[index]!;
    await context.addInitScript(identity=>{
      localStorage.setItem(`magical-athlete:identity:${identity.roomCode}`,JSON.stringify(identity));
      localStorage.setItem('magical-athlete:muted','true');localStorage.setItem('magical-athlete:low-quality','true');
      localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion','true');
    },identities[index]!);
    const page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push(error.stack??error.message));
    await page.goto(`${url}/room/${created.identity.roomCode}`);await online(page);
  }
  return {contexts,host:pages[0]!,guest:pages[1]!,code:created.identity.roomCode,ids:identities.map(identity=>identity.playerId),errors};
}
type Pair=Awaited<ReturnType<typeof pair>>;
async function online(page:Page){await expect(page.locator('.connection.is-online')).toBeVisible();}
async function openChat(page:Page){if(!await page.getByTestId('room-chat').count())await page.getByRole('button',{name:/^房间聊天/}).click();}
async function send(page:Page,text:string){
  await openChat(page);await page.getByLabel('聊天消息',{exact:true}).fill(text);
  await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByLabel('聊天消息',{exact:true})).toHaveValue('');
}
async function placement(page:Page){
  return page.getByTestId('room-community').evaluate(element=>{
    const rect=element.getBoundingClientRect(),css=getComputedStyle(element);
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:innerHeight-rect.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,position:css.position,transform:css.transform,parent:element.parentElement?.tagName};
  });
}
async function lowerLeft(page:Page,open:boolean){
  const rect=await placement(page);expect(rect.position).toBe('fixed');expect(rect.transform).toBe('none');expect(rect.parent).toBe('BODY');
  expect(rect.x).toBeGreaterThanOrEqual(7);expect(rect.x).toBeLessThanOrEqual(20);expect(rect.y).toBeGreaterThan(100);
  expect(rect.bottom).toBeGreaterThanOrEqual(7);expect(rect.bottom).toBeLessThanOrEqual(22);expect(rect.x+rect.width).toBeLessThanOrEqual(rect.viewportWidth-7);
  if(open)expect(rect.height).toBeGreaterThan(200);
  return rect;
}

test('independent eight second bubbles stack upward with desktop/mobile caps and silent reconnect history',async({browser})=>{
  const session=await pair(browser);const evidence:Record<string,unknown>={};
  try{
    await lowerLeft(session.host,false);
    await send(session.guest,'实时消息 <b>只按纯文本显示</b>');
    const bubbles=session.host.getByTestId('chat-notice');await expect(bubbles).toHaveCount(1);await expect(bubbles.first()).toContainText('聊天访客');
    await expect(bubbles.first()).toContainText('<b>只按纯文本显示</b>');expect(await bubbles.locator('b').count()).toBe(0);
    const firstBox=await bubbles.first().boundingBox();await session.host.waitForTimeout(3_500);
    await send(session.guest,'第二条消息有独立的八秒期限');await expect(bubbles).toHaveCount(2);
    await expect(bubbles.last()).toContainText('第二条消息');expect((await bubbles.first().boundingBox())!.y).toBeLessThan(firstBox!.y);
    await session.host.screenshot({path:`${output}/chat-independent-desktop.png`});
    await expect(bubbles).toHaveCount(1,{timeout:6_000});await expect(bubbles.first()).toContainText('第二条消息');
    await expect(bubbles).toHaveCount(0,{timeout:5_000});await expect(session.host.locator('.chat-unread')).toHaveText('2');
    await session.host.waitForTimeout(2_500); // Leave the independent six-per-ten-second server send window.
    for(let n=1;n<=6;n++)await send(session.guest,`连续气泡 ${n}`);
    await expect(bubbles).toHaveCount(5);await expect(bubbles.first()).toContainText('连续气泡 2');await expect(bubbles.last()).toContainText('连续气泡 6');
    const ids=await bubbles.evaluateAll(elements=>elements.map(element=>Number((element as HTMLElement).dataset.messageId)));
    expect(ids).toEqual([...ids].sort((a,b)=>a-b));
    const stored=application.rooms.get(session.code).chat!,duplicate=stored.messages.at(-1)!;
    application.io.to(session.code).emit('chat',{messages:[duplicate],latestId:stored.latestId});await expect(bubbles).toHaveCount(5);
    await session.host.screenshot({path:`${output}/chat-five-desktop.png`});
    await session.host.setViewportSize({width:390,height:844});await expect(bubbles).toHaveCount(3);await expect(bubbles.first()).toContainText('连续气泡 4');
    await session.host.screenshot({path:`${output}/chat-three-mobile.png`});
    await openChat(session.host);await expect(session.host.getByRole('log')).toContainText('连续气泡 1');await expect(session.host.getByRole('log')).toContainText('连续气泡 6');await expect(bubbles).toHaveCount(0);
    await lowerLeft(session.host,true);
    await session.host.addStyleTag({content:'#root{transform:translate(350px,80px) scale(.8);contain:paint;position:relative;width:240px;overflow:hidden}'});await lowerLeft(session.host,true);
    await session.host.getByRole('button',{name:'收起聊天'}).click();await session.host.reload();await online(session.host);await expect(bubbles).toHaveCount(0);
    await session.host.waitForTimeout(10_100);await session.contexts[0]!.setOffline(true);await expect(session.host.locator('.connection.is-online')).toHaveCount(0);
    await send(session.guest,'离线期间补齐的历史不应冒泡');await session.contexts[0]!.setOffline(false);await online(session.host);
    await expect(bubbles).toHaveCount(0);await openChat(session.host);await expect(session.host.getByRole('log')).toContainText('离线期间补齐的历史不应冒泡');
    expect(session.errors).toEqual([]);Object.assign(evidence,{desktopLimit:5,mobileLimit:3,orderedIds:ids,independentLifetimes:true,duplicateSilent:true,historyRetained:true,reconnectSilent:true,errors:session.errors});
    writeFileSync(`${output}/chat-stack-browser.json`,JSON.stringify(evidence,null,2));
  }finally{await Promise.all(session.contexts.map(context=>context.close()));}
});

function publish(room:Room){application.rooms.rooms.set(room.code,room);application.store.save(room);for(const socket of application.io.sockets.sockets.values())if(socket.data.identity?.roomCode===room.code)socket.emit('snapshot',application.rooms.view(room,socket.data.identity.playerId));}
const characterName=(id:string)=>CHARACTERS.find(character=>character.id===id)!.nameZh;
const racer=(id:string,playerId:string,characterId:string,position:number,flags:Racer['flags']={}):Racer=>({id,playerId,identityPlayerId:playerId,characterId,position,tripped:false,finished:false,eliminated:false,flags});

test('avatar details use the live Switcharoo controller and distinguish duplicate instances, copied abilities and disabled powers',async({browser})=>{
  const session=await pair(browser);
  try{
    const saved=structuredClone(application.rooms.get(session.code)),game=createGame(saved.game.players,91,'multiplayer','mixed');
    game.phase='race';game.round=1;game.currentRacerId='switch';game.racers=[racer('switch',session.ids[0]!,'switcharoo',4),racer('coach-visitor',session.ids[1]!,'coach',5),racer('coach-host',session.ids[1]!,'coach',16),racer('copy',session.ids[1]!,'understudy',2,{power:'kraken',copiedFrom:'kraken-original',acquiredPowers:['coach'],krakenUsed:true}),racer('kraken-original',session.ids[0]!,'kraken',22,{krakenUsed:true})];
    game.baseTurnOrder=game.racers.map(racer=>racer.id);game.players[0]!.used=['switcharoo','coach'];game.players[1]!.used=['coach','understudy'];
    game.queue=[{kind:'endTurn',racerId:'switch'}];resolveTasks(game);expect(game.pending?.kind).toBe('switcharoo');saved.game=game;saved.version++;saved.updatedAt=Date.now()+60_000;publish(saved);
    for(const page of [session.host,session.guest])await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect(session.host.getByTestId('skill-choice')).toBeVisible();
    // Accessible button text is stable even when the SVG avatar implementation changes.
    await session.host.locator('.floating-racer').filter({hasText:'1号'}).first().click();
    await expect(session.host.getByRole('dialog')).toContainText(characterName('switcharoo'));await expect(session.host.locator('.character-ownership')).toContainText('1号 · 头像房主');await session.host.getByRole('button',{name:'关闭',exact:true}).click();
    await session.guest.locator('.floating-racer').first().click();await expect(session.guest.locator('.character-ownership')).toContainText('1号 · 头像房主');
    const choice=application.rooms.get(session.code).game.pending!,target=choice.options.find(option=>option.id==='coach-visitor')!;
    await session.host.getByTestId('skill-choice').getByRole('button',{name:target.label,exact:true}).click();
    await expect.poll(()=>application.rooms.get(session.code).game.racers.find(racer=>racer.id==='switch')?.playerId).toBe(session.ids[1]);
    await expect(session.guest.locator('.character-ownership')).toContainText('2号 · 聊天访客（你）');await expect(session.guest.locator('.character-ownership')).toContainText('控制权已交换');await session.guest.getByRole('button',{name:'关闭',exact:true}).click();
    await session.host.locator('.floating-racer').first().click();await expect(session.host.locator('.character-ownership')).toContainText('2号 · 聊天访客');await expect(session.host.locator('.character-ownership')).toContainText('控制权已交换');
    await session.host.screenshot({path:`${output}/avatar-current-controller.png`});await session.host.getByRole('button',{name:'关闭',exact:true}).click();
    await session.host.getByTestId('board-minimap').getByRole('button',{name:`查看${characterName('coach')}技能与当前玩家`,exact:true}).click();
    await expect(session.host.locator('.character-instances>button')).toHaveCount(2);await session.host.locator('[data-racer-id="coach-host"][aria-pressed]').click();await expect(session.host.locator('[data-racer-id="coach-host"][aria-pressed]')).toHaveAttribute('aria-pressed','true');
    await expect(session.host.locator('.character-ownership')).toContainText('本场实例 2');await expect(session.host.locator('.character-ownership')).toContainText('1号 · 头像房主');await expect(session.host.locator('.character-ownership')).toContainText('2号 · 聊天访客');await session.host.screenshot({path:`${output}/avatar-multiple-instances.png`});await session.host.getByRole('button',{name:'关闭',exact:true}).click();
    await session.host.locator('.floating-racer').nth(3).click();await expect(session.host.locator('.effective-powers')).toContainText(characterName('kraken'));await expect(session.host.locator('.effective-powers')).toContainText('本场获得的额外能力');await expect(session.host.locator('.effective-powers')).toContainText('剩余次数：0');
    await session.host.locator('.effective-powers').scrollIntoViewIfNeeded();await session.host.screenshot({path:`${output}/avatar-effective-abilities.png`});
    const disabled=structuredClone(application.rooms.get(session.code));disabled.game.racers.push(racer('null',session.ids[0]!,'null',1));disabled.version++;publish(disabled);
    await expect(session.host.locator('.effective-powers')).toContainText('能力被 Null 禁用');await session.host.locator('.effective-powers').scrollIntoViewIfNeeded();await session.host.screenshot({path:`${output}/avatar-disabled-abilities.png`});await session.host.getByRole('button',{name:'关闭',exact:true}).click();
    // A pending mandatory choice remains usable while the phone chat drawer is expanded.
    const choosing=structuredClone(application.rooms.get(session.code));choosing.game.pending={id:'ui-choice',playerId:session.ids[0]!,racerId:'coach-host',kind:'coach',title:'界面验收：选择技能',optional:false,options:[{id:'wait',label:'等待验收'}],context:{}};choosing.version++;publish(choosing);
    await session.host.setViewportSize({width:390,height:844});await expect(session.host.getByTestId('skill-choice')).toBeVisible();await openChat(session.host);
    expect(await session.host.getByTestId('skill-choice').getByRole('button',{name:'等待验收'}).evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);
    await session.host.screenshot({path:`${output}/chat-mobile-choice-accessible.png`});expect(session.errors).toEqual([]);
    writeFileSync(`${output}/avatar-browser-results.json`,JSON.stringify({switcharooController:'聊天访客',duplicateInstances:2,extraAbility:true,krakenRemaining:0,nullDisabled:true,phoneSkillButtonUncovered:true,errors:session.errors},null,2));
  }finally{await Promise.all(session.contexts.map(context=>context.close()));}
});
