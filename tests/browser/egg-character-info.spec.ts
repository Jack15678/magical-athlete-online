import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import type { GameState, Room } from '../../src/shared/types.js';

let application: ReturnType<typeof createApplication>, url: string;
const output = 'docs/qa/duo-upgrade';
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
  await expect(dialog).toContainText(character(id).nameZh);
  await expect(dialog).toContainText(character(id).ability);
  if (effectiveId) {
    await expect(dialog.getByRole('heading', { name: '当前生效能力', exact: true })).toBeVisible();
    await expect(dialog).toContainText(character(effectiveId).nameZh);
    await expect(dialog).toContainText(character(effectiveId).ability);
  }
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
    await expect(cleared.getByRole('heading', { name: '当前生效能力', exact: true })).toHaveCount(0);
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
      await expect(dialog.getByRole('heading', { name: '当前生效能力', exact: true })).toBeVisible();
      await expect(dialog).toContainText(character('legs').nameZh); await expect(dialog).toContainText(character('legs').ability);
      await expect(dialog.getByRole('heading', { name: '本场抽到', exact: true })).toHaveCount(0);
      await closeDialog(page);
    }
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});
