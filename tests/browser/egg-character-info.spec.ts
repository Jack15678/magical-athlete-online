import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/runtime.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import type { GameState, Room } from '../../src/shared/types.js';

let application: ReturnType<typeof createApplication>, url: string;
const output = 'docs/qa/ability-detail-20261022';
const eggId = 'egg-character-info-owner';
const character = (id: string) => CHARACTERS.find(value => value.id === id)!;

test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('No address');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(output, { recursive: true });
});
test.afterAll(async () => application.close());

async function setup(browser: Browser) {
  const contexts = await Promise.all([0, 1, 2].map(index => browser.newContext({ viewport: index === 2 ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1 })));
  for (const context of contexts) await context.addInitScript(() => {
    try {
      localStorage.setItem('magical-athlete:low-quality', 'true');
      localStorage.setItem('magical-athlete:reduced-motion', 'true');
      localStorage.setItem('magical-athlete:animation-speed', '4');
    } catch { /* Initial document. */ }
  });
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [host, guest, spectator] = pages as [Page, Page, Page];
  await host.goto(url); await host.getByLabel('你的昵称').fill('蛋的玩家');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible();
  const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('朋友选手');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click();
  await expect(guest.locator('.connection.is-online')).toBeVisible();
  await spectator.goto(`${url}/room/${code}`); await spectator.getByLabel('你的昵称').fill('看台观众');
  await spectator.getByRole('radio', { name: /作为观战者/ }).check();
  await spectator.getByRole('button', { name: '进入房间观战' }).click();
  await expect(spectator.locator('.connection.is-online')).toBeVisible();
  const ids = application.rooms.get(code).game.players.map(player => player.id);
  return { contexts, pages, host, guest, spectator, code, ids };
}
type Pair = Awaited<ReturnType<typeof setup>>;

function publish(pair: Pair, change: (room: Room) => void) {
  const room = structuredClone(application.rooms.get(pair.code)); change(room);
  room.version++; room.updatedAt = Date.now(); room.deadline = null;
  application.rooms.rooms.set(pair.code, room); application.store.save(room);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === pair.code) socket.emit('snapshot', application.rooms.view(room, socket.data.identity.playerId));
  return room;
}

function offerEgg(pair: Pair, cards = ['legs', 'copycat', 'banana']) {
  publish(pair, room => {
    const previous = room.game.logs.at(-1)?.id ?? 0;
    room.game.players.forEach((player, index) => {
      player.hand = index ? ['romantic', 'blimp'] : ['genius', 'gunk'];
      player.used = index ? ['coach', 'alchemist'] : ['egg', 'hare'];
      player.selection = [...player.used];
    });
    const game: GameState = {
      rulesVersion: CURRENT_RULES_VERSION,
      mode: 'multiplayer', phase: 'race', round: 1, track: 'mild', players: room.game.players,
      deck: [...cards], discard: [], turn: 2, turnCount: 0, currentRacerId: 'egg-character-info-coach',
      baseTurnOrder: [eggId, 'egg-character-info-hare', 'egg-character-info-coach', 'egg-character-info-alchemist'],
      racers: ['egg', 'hare', 'coach', 'alchemist'].map((characterId, index) => ({
        id: [eggId, 'egg-character-info-hare', 'egg-character-info-coach', 'egg-character-info-alchemist'][index]!,
        playerId: pair.ids[Math.floor(index / 2)]!, characterId, position: [3, 8, 20, 12][index]!,
        tripped: false, finished: false, eliminated: false, flags: {},
      })),
      queue: [{ kind: 'beforeRace', racerId: eggId }, { kind: 'refreshCopies' }, { kind: 'beginTurn', racerId: 'egg-character-info-coach' }],
      logs: [], results: [], flags: {}, rngState: 1234, randomLog: [],
    };
    resolveTasks(game); game.logs.forEach(event => { event.id += previous; }); room.game = game;
  });
}

async function openEgg(page: Page) {
  await page.locator('.floating-racers').getByRole('button', { name: /^蛋，/ }).click();
  const dialog = page.getByRole('dialog', { name: '蛋', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function closeDialog(page: Page) { await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click(); }
async function assertCard(dialog: Locator, id: string, effectiveId?: string) {
  await expect(dialog.getByRole('heading', { name: '本场抽到', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: '蛋本场获得的能力来源', exact: true })).toContainText(character(id).nameZh);
  const active = dialog.getByRole('region', { name: '现在拥有的能力', exact: true });
  await expect(active.getByRole('heading', { name: '现在拥有的能力', exact: true })).toBeVisible();
  await expect(active).toContainText(character(effectiveId ?? id).ability);
  await expect(active.locator(`[data-power-id="${effectiveId ?? id}"]`)).toHaveCount(1);
  const bounds = await active.boundingBox();
  const panelBounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  // Desktop dialogs are vertically centered: measure content priority from
  // the panel, rather than imposing a viewport coordinate on a short dialog.
  expect(bounds!.y - panelBounds!.y).toBeLessThan(260);
  await expect(dialog.locator('.printed-ability')).not.toHaveAttribute('open');
}
async function chooseEgg(pair: Pair, id: string) {
  await pair.host.getByTestId('skill-choice').getByRole('button', { name: character(id).nameZh, exact: true }).click();
  await expect.poll(() => application.rooms.get(pair.code).game.racers.find(racer => racer.id === eggId)?.flags.power).toBe(id);
  for (const page of pair.pages) await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle', { timeout: 20_000 });
}

test('Egg selected card and ability are public, survive refresh and all team entries, then clear next race', async ({ browser }) => {
  test.setTimeout(150_000);
  const pair = await setup(browser);
  try {
    offerEgg(pair);
    const before = await openEgg(pair.host);
    await expect(before).toContainText(character('egg').ability);
    await expect(before.getByRole('heading', { name: '本场抽到', exact: true })).toHaveCount(0);
    await closeDialog(pair.host);
    await chooseEgg(pair, 'legs');
    for (const [index, page] of pair.pages.entries()) {
      const dialog = await openEgg(page);
      // Capture the actual pre-fix dialog too, so the first failed assertion
      // documents the old base-card-only behavior in a running game.
      await page.screenshot({ path: `${output}/egg-info-${['owner', 'opponent', 'spectator-mobile'][index]}.png` });
      await assertCard(dialog, 'legs'); await closeDialog(page);
      await page.reload(); await expect(page.locator('.connection.is-online')).toBeVisible();
      await assertCard(await openEgg(page), 'legs'); await closeDialog(page);
    }
    for (const section of ['运动员与位置', '我的队伍']) {
      await pair.host.getByTestId('presentation-settings').click();
      const details = pair.host.locator('details').filter({ has: pair.host.locator('summary').getByText(section, { exact: true }) });
      await details.locator('summary').click();
      await details.getByRole('button').filter({ has: pair.host.getByText('蛋', { exact: true }) }).click();
      await assertCard(pair.host.getByRole('dialog', { name: '蛋', exact: true }), 'legs'); await closeDialog(pair.host);
    }
    publish(pair, room => {
      room.game.phase = 'results'; room.game.queue = []; room.game.flags = {}; delete room.game.pending;
      room.game.results = [{ round: 1, placements: room.game.racers.map((racer, index) => ({ racerId: racer.id, characterId: racer.characterId, playerId: racer.playerId, rank: index + 1, points: 4 - index })) }];
    });
    await pair.host.getByRole('button', { name: '前往下一场', exact: true }).click();
    await expect.poll(() => application.rooms.get(pair.code).game.round).toBe(2);
    const team = pair.host.locator('.my-team');
    await team.getByRole('button').filter({ has: pair.host.getByText('蛋', { exact: true }) }).click();
    const cleared = pair.host.getByRole('dialog', { name: '蛋', exact: true });
    await expect(cleared).toContainText(character('egg').ability);
    await expect(cleared.getByRole('heading', { name: '本场抽到', exact: true })).toHaveCount(0);
    await expect(cleared.getByRole('heading', { name: '现在拥有的能力', exact: true })).toHaveCount(0);
    await expect(cleared).not.toContainText(character('legs').ability);
    await pair.host.screenshot({ path: `${output}/egg-info-next-race-cleared.png` });
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});

test('Egg keeps its chosen Copycat card while publicly showing the changing leader ability', async ({ browser }) => {
  test.setTimeout(120_000);
  const pair = await setup(browser);
  try {
    offerEgg(pair); await chooseEgg(pair, 'copycat');
    for (const page of pair.pages) { await assertCard(await openEgg(page), 'copycat', 'coach'); await closeDialog(page); }
    publish(pair, room => {
      room.game.racers.find(racer => racer.characterId === 'hare')!.position = 23;
      room.game.queue = [{ kind: 'refreshCopies' }]; resolveTasks(room.game);
    });
    for (const [index, page] of pair.pages.entries()) {
      const dialog = await openEgg(page); await assertCard(dialog, 'copycat', 'hare');
      if (index === 2) await page.screenshot({ path: `${output}/egg-copycat-current-ability-mobile.png` });
      await closeDialog(page); await page.reload();
      await assertCard(await openEgg(page), 'copycat', 'hare'); await closeDialog(page);
    }
    expect(application.rooms.get(pair.code).game.racers.find(racer => racer.id === eggId)!.flags.eggCardId).toBe('copycat');
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});

test('legacy Egg saves expose their known inherited ability without inventing an original drawn card', async ({ browser }) => {
  const pair = await setup(browser);
  try {
    offerEgg(pair);
    publish(pair, room => {
      const egg = room.game.racers.find(racer => racer.id === eggId)!;
      egg.flags.power = 'legs'; delete egg.flags.eggCardId;
      delete room.game.pending; room.game.queue = []; room.game.flags.awaitRoll = true;
    });
    for (const page of pair.pages) {
      const dialog = await openEgg(page);
      const active=dialog.getByRole('region', { name:'现在拥有的能力',exact:true });
      await expect(active.getByRole('heading', { name: '现在拥有的能力', exact: true })).toBeVisible();
      await expect(active).toContainText(character('legs').nameZh); await expect(active).toContainText(character('legs').ability);
      await expect(dialog.getByRole('heading', { name: '本场抽到', exact: true })).toHaveCount(0);
      await closeDialog(page);
    }
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});

test('current ability layout keeps Null, temporary grants and separate same-card instances clear on desktop and mobile', async ({ browser }) => {
  test.setTimeout(120_000);
  const pair = await setup(browser), errors:string[]=[];
  for(const page of pair.pages)page.on('pageerror',error=>errors.push(error.message));
  try {
    offerEgg(pair);
    publish(pair,room=>{
      delete room.game.pending;room.game.queue=[];room.game.flags={awaitRoll:true};
      const [first,second,nullRacer]=room.game.racers;
      Object.assign(first!,{playerId:pair.ids[1],identityPlayerId:pair.ids[0],flags:{
        power:'coach',eggCardId:'coach',acquiredPowers:['kraken'],acquiredPowerSources:{kraken:{sourceCardId:'mush'}},
        leafBorrowedPowers:[{power:'kraken',source:'leaf-filmmaker'}],secretLeafHand:['romantic'],krakenUsed:true,
      }});
      Object.assign(second!,{characterId:'egg',flags:{power:'legs',eggCardId:'legs'}});
      Object.assign(nullRacer!,{characterId:'null',position:0,flags:{}});
    });
    for(const [index,page]of pair.pages.entries()){
      await page.locator('.floating-racers').getByRole('button',{name:/^蛋，2号/}).click();
      const dialog=page.getByRole('dialog',{name:'蛋',exact:true}),active=dialog.getByRole('region',{name:'现在拥有的能力',exact:true});
      await expect(active).toContainText('暂时禁用');await expect(active).toContainText('能力被 Null 禁用');
      await expect(active.locator('[data-power-id="kraken"]')).toHaveCount(1);
      await expect(active.locator('[data-power-id="kraken"]')).toContainText('持续至本场结束');
      await expect(active.locator('[data-power-id="kraken"]')).toContainText('临时借用');
      await expect(active.locator('[data-power-id="kraken"]')).toContainText('下次自身回合开始失效');
      await expect(active.locator('[data-power-id="kraken"]')).toContainText('本场剩余次数：0');
      await expect(dialog).toContainText('控制权已交换，以当前玩家为准');
      await expect(dialog.getByRole('button',{name:'查看本场实例1的玩家与能力'})).toHaveAttribute('aria-pressed','true');
      const layout=await dialog.evaluate(element=>({width:element.scrollWidth,client:element.clientWidth}));
      expect(layout.width).toBeLessThanOrEqual(layout.client);
      expect((await active.boundingBox())!.y).toBeLessThan(390);
      await expect(dialog).not.toContainText(character('romantic').nameZh);
      await page.screenshot({path:`${output}/ability-priority-${index===2?'mobile':'desktop-'+index}-null.png`});
      await dialog.getByRole('button',{name:'查看本场实例2的玩家与能力'}).click();
      await expect(active).toContainText(character('legs').ability);await expect(active.locator('[data-power-id="kraken"]')).toHaveCount(0);
      await closeDialog(page);
    }
    publish(pair,room=>{room.game.racers.find(racer=>racer.characterId==='null')!.position=25;});
    for(const [index,page]of pair.pages.entries()){
      await page.locator('.floating-racers').getByRole('button',{name:/^蛋，2号/}).click();
      const dialog=page.getByRole('dialog',{name:'蛋',exact:true}),active=dialog.getByRole('region',{name:'现在拥有的能力',exact:true});
      await expect(active.getByText('当前生效',{exact:true})).toBeVisible();await expect(active).not.toContainText('能力被 Null 禁用');
      await expect(active.locator('[data-power-id="kraken"]')).toHaveCount(1);
      if(index!==1)await page.screenshot({path:`${output}/ability-priority-${index===2?'mobile':'desktop'}-active.png`});
      await closeDialog(page);
    }
    expect(errors).toEqual([]);
  }finally{await Promise.all(pair.contexts.map(context=>context.close()));}
});
