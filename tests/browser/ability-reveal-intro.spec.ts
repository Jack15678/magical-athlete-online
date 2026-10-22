import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/runtime.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import type { GameState, Room } from '../../src/shared/types.js';

let application:ReturnType<typeof createApplication>,url:string;
const output='docs/qa/ability-detail-20261022';
test.beforeAll(async()=>{mkdirSync(output,{recursive:true});application=createApplication(':memory:');await new Promise<void>(resolve=>application.http.listen(0,'127.0.0.1',resolve));const address=application.http.address();if(!address||typeof address==='string')throw Error('No test address');url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>application.close());
const name=(id:string)=>CHARACTERS.find(card=>card.id===id)!.nameZh;
type ObservedReveal={eventId:string;text:string};
declare global {interface Window {__ABILITY_REVEAL_OBSERVATION__?:ObservedReveal[]}}

/** Capture each actual DOM appearance immediately. Reading pixels in another
 * browser must not consume this page's three-second announcement window. */
function installRevealObserver(){
  if(window.__ABILITY_REVEAL_OBSERVATION__)return;
  const records:ObservedReveal[]=[];window.__ABILITY_REVEAL_OBSERVATION__=records;
  let current:Element|null=null,currentId:string|undefined;
  const capture=()=>{
    const node=document.querySelector<HTMLElement>('[data-testid="ability-reveal"]'),eventId=node?.dataset.eventId;
    if(node&&eventId&&(node!==current||eventId!==currentId))records.push({eventId,text:node.textContent??''});
    current=node;currentId=eventId;
  };
  new MutationObserver(capture).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-event-id']});
  capture();
}
const observedReveals=(page:Page)=>page.evaluate(()=>window.__ABILITY_REVEAL_OBSERVATION__??[]);

test('entry tour precedes pre-race effects and choice, then grants reveal once without leaking private cards',async({browser})=>{
  const contexts=await Promise.all([false,true].map(mobile=>browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1})));
  const errors:string[]=[],stages:string[]=[],revealEvents:ObservedReveal[][]=[];
  for(const [index,context] of contexts.entries())await context.addInitScript(reduced=>{localStorage.setItem('magical-athlete:low-quality','true');localStorage.setItem('magical-athlete:animation-speed','4');localStorage.setItem('magical-athlete:reduced-motion',String(reduced));},index===1);
  const pages=await Promise.all(contexts.map(context=>context.newPage()));const [host,guest]=pages as [Page,Page];
  for(const page of pages)page.on('pageerror',error=>errors.push(error.message));
  try{
    await host.goto(url);await host.getByLabel('你的昵称').fill('能力获得者');await host.getByLabel('房间人数上限').selectOption('2');await host.getByLabel('每次操作时限').selectOption('0');await host.getByRole('button',{name:'创建房间，召集朋友'}).click();await expect(host.locator('.connection.is-online')).toBeVisible();const code=host.url().split('/').at(-1)!;
    await guest.goto(`${url}/room/${code}`);await guest.getByLabel('你的昵称').fill('手机朋友');await guest.getByRole('button',{name:'加入这场胡闹'}).click();await expect(guest.locator('.connection.is-online')).toBeVisible();
    const publish=(change:(room:Room)=>void)=>{const room=structuredClone(application.rooms.get(code));change(room);room.version++;room.deadline=null;application.rooms.rooms.set(code,room);application.store.save(room);for(const socket of application.io.sockets.sockets.values())if(socket.data.identity?.roomCode===code)socket.emit('snapshot',application.rooms.view(room,socket.data.identity.playerId));};
    publish(room=>{
      const previous=room.game.logs.at(-1)?.id??0;
      room.game.players.forEach((player,index)=>{player.hand=[];player.used=index?['coach','leaf-filmmaker']:['egg','hare'];player.selection=[...player.used];});
      const game:GameState={rulesVersion:CURRENT_RULES_VERSION,mode:'multiplayer',phase:'race',round:1,track:'mild',players:room.game.players,deck:['legs','copycat','banana','blimp','skipper','romantic','genius','gunk','sisyphus','alchemist'],discard:[],turn:2,turnCount:0,currentRacerId:'intro-coach',racers:['egg','hare','coach','leaf-filmmaker'].map((characterId,index)=>({id:`intro-${characterId}`,playerId:room.game.players[Math.floor(index/2)]!.id,characterId,position:index===2?2:0,tripped:false,finished:false,eliminated:false,flags:{}})),queue:[{kind:'beforeRace',racerId:'intro-egg'},{kind:'beforeRace',racerId:'intro-leaf-filmmaker'},{kind:'beginTurn',racerId:'intro-coach'}],logs:[{id:1,type:'reveal',text:'选手揭示'},{id:2,type:'power',source:'intro-coach',cause:'coach',text:'赛前技能已确认'},{id:3,type:'move',source:'intro-coach',targets:['intro-coach'],before:[0],after:[2],cause:'coach',text:'赛前0→2'}],results:[],flags:{},rngState:1234,randomLog:[]};
      resolveTasks(game);game.logs.forEach(event=>event.id+=previous);room.game=game;
    });
    await Promise.all([
      (async()=>{
        await expect(host.getByTestId('race-intro')).toBeVisible();
        await expect(host.getByTestId('board-3d')).toHaveAttribute('data-intro-ready','true');
        await expect(host.getByTestId('board-3d')).toHaveAttribute('data-ready-models','4');
        await expect(host.getByTestId('board-3d')).toHaveAttribute('data-failed-models','0');
        await expect(host.getByTestId('board-3d')).toHaveAttribute('data-pending-models','0');
        await expect(host.getByTestId('skill-banner')).toHaveCount(0);await expect(host.getByTestId('skill-choice')).toHaveCount(0);
        await expect(host.getByTestId('scene-racer').filter({hasText:name('coach')})).toHaveAttribute('data-position','0');
      })(),
      (async()=>{
        // Observe this client's shorter tour on its own clock; waiting for a
        // different browser's models first could miss the reduced-motion tour.
        await expect(guest.getByTestId('board-3d')).toHaveAttribute('data-intro-ready','true');
        await expect(guest.getByTestId('race-intro')).toContainText('全体选手就位');await expect(guest.getByTestId('skill-choice')).toHaveCount(0);
      })(),
    ]);
    stages.push('desktop-entry-and-mobile-reduced-entry-before-effects-or-choice');
    if(!process.env.CI)await host.screenshot({path:`${output}/ability-entry-desktop.png`});
    await host.getByRole('button',{name:'跳过选手介绍',exact:true}).click();
    await expect(host.getByTestId('race-intro')).toHaveCount(0);await expect(host.getByTestId('board-3d')).toHaveAttribute('data-phase','skill');await expect(host.getByTestId('skill-choice')).toHaveCount(0);
    await expect(host.getByTestId('skill-choice')).toBeVisible();await expect(guest.getByTestId('race-intro')).toHaveCount(0);
    stages.push('skip-entry-preserves-pre-race-effect-then-choice');
    await Promise.all(pages.map(async page=>{
      // Install for this document and its forthcoming reload before choosing.
      await page.addInitScript(installRevealObserver);await page.evaluate(installRevealObserver);
    }));
    await host.getByTestId('skill-choice').getByRole('button',{name:name('legs'),exact:true}).click();
    await Promise.all(pages.map(async page=>{
      await expect.poll(async()=>(await observedReveals(page)).some(record=>record.text.includes('抽到新能力'))).toBe(true);
      const grant=(await observedReveals(page)).find(record=>record.text.includes('抽到新能力'))!;
      expect(grant.text).toContain(name('legs'));expect(grant.text).toContain('能力获得者');expect(grant.text).toContain('持续至本场结束');
    }));
    if(!process.env.CI)await host.screenshot({path:`${output}/ability-grant-desktop.png`});
    stages.push('confirmed-egg-grant-public-on-both-clients');
    // The next public event is Filmmaker's count; its seven private identities
    // must never become part of this announcement on either browser.
    const confirmed=application.rooms.get(code).game.logs;
    const grantId=String(confirmed.find(event=>event.type==='copy'&&event.source==='intro-egg'&&event.cause==='egg')!.id);
    const filmId=String(confirmed.find(event=>event.type==='draw'&&event.source==='intro-leaf-filmmaker'&&event.cause==='leaf-filmmaker')!.id);
    await Promise.all(pages.map(async(page,index)=>{
      await expect.poll(async()=>(await observedReveals(page)).some(record=>record.eventId===filmId),{timeout:10_000}).toBe(true);
      const records=await observedReveals(page),film=records.find(record=>record.eventId===filmId)!;
      expect(film.text).toContain('抽到私人手牌');expect(film.text).toMatch(/抽到\s*7\s*张/);
      for(const id of ['blimp','skipper','romantic','genius','gunk'])expect(film.text).not.toContain(name(id));
      // Keep appearances rather than a deduplicating Map: replaying the same
      // event as a second DOM card must fail this assertion on either client.
      expect(records.map(record=>record.eventId)).toEqual([grantId,filmId]);
      await expect(page.getByTestId('ability-reveal')).toHaveCount(0,{timeout:10_000});
      revealEvents[index]=await observedReveals(page);expect(revealEvents[index]!.map(record=>record.eventId)).toEqual([grantId,filmId]);
    }));
    stages.push('filmmaker-public-count-only-then-reveal-dismissed');
    publish(()=>{});const duplicateVersion=String(application.rooms.get(code).version);
    await Promise.all(pages.map(async(page,index)=>{
      await expect(page.locator('.game-shell')).toHaveAttribute('data-room-version',duplicateVersion);
      await expect(page.getByTestId('ability-reveal')).toHaveCount(0);expect(await observedReveals(page)).toEqual(revealEvents[index]);
    }));
    await guest.reload();await expect(guest.locator('.connection.is-online')).toBeVisible();await expect(guest.getByTestId('board-3d')).toHaveAttribute('data-phase','idle');await expect(guest.getByTestId('ability-reveal')).toHaveCount(0);await expect(guest.getByTestId('race-intro')).toHaveCount(0);expect(await observedReveals(guest)).toEqual([]);
    stages.push('duplicate-and-refresh-do-not-replay');
    await host.locator('.floating-racers').getByRole('button',{name:/^蛋，/}).click();const dialog=host.getByRole('dialog',{name:'蛋',exact:true});await expect(dialog.getByRole('region',{name:'现在拥有的能力',exact:true})).toContainText(name('legs'));
    expect(errors).toEqual([]);
  }finally{writeFileSync(`${output}/ability-intro-stages.json`,JSON.stringify({stages,revealEvents,pageErrors:errors},null,2));await Promise.all(contexts.map(context=>context.close()));}
});
