import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import { CHARACTERS } from '../../src/shared/characters.js';
import type { GameState, Room } from '../../src/shared/types.js';
import { pawnWorldPoint } from '../../src/client/scene/camera.js';

let application: ReturnType<typeof createApplication>, url: string;
const output = 'docs/qa/duo-upgrade';
test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('No address');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(output, { recursive: true });
});
test.afterAll(async () => application.close());

async function setup(browser: Browser, mobile = false, reducedMotion = true, lowQuality = true) {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1 })));
  for (const context of contexts) await context.addInitScript(({ reduced, low }) => {
    try { localStorage.setItem('magical-athlete:low-quality', String(low)); localStorage.setItem('magical-athlete:reduced-motion', String(reduced)); localStorage.setItem('magical-athlete:animation-speed', reduced ? '4' : '1'); } catch { /* Initial document. */ }
  }, { reduced: reducedMotion, low: lowQuality });
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [host, guest] = pages as [Page, Page];
  await host.goto(url); await host.getByLabel('你的昵称').fill('房主选手');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible();
  const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('朋友选手');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click();
  await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = application.rooms.get(code).game.players.map(player => player.id);
  return { contexts, pages, host, guest, code, ids };
}
type Pair = Awaited<ReturnType<typeof setup>>;
function publish(pair: Pair, change: (room: Room) => void) {
  const room = structuredClone(application.rooms.get(pair.code)); change(room);
  room.version++; room.updatedAt = Date.now(); room.deadline = null;
  application.rooms.rooms.set(pair.code, room); application.store.save(room);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === pair.code) socket.emit('snapshot', application.rooms.view(room, socket.data.identity.playerId));
  return room;
}
const name = (id: string) => CHARACTERS.find(character => character.id === id)!.nameZh;
async function chooseCard(page: Page, id: string) { await page.getByRole('button', { name: `选择${name(id)}`, exact: true }).click(); }

test('duo UI locks either order, restores a locked choice, and allows a fresh order next race', async ({ browser }) => {
  const pair = await setup(browser);
  try {
    for (const reverse of [false, true]) {
      publish(pair, room => {
        room.game.phase = 'selection'; room.game.round = reverse ? 2 : 1; room.game.racers = []; room.game.queue = []; delete room.game.pending;
        room.game.players.forEach((player, index) => { player.hand = index ? ['coach', 'alchemist', 'romantic', 'hare'] : ['legs', 'genius', 'egg', 'banana']; player.selection = []; player.used = []; });
      });
      await chooseCard(pair.host, 'legs'); await chooseCard(pair.host, 'genius');
      if (reverse) await pair.host.getByRole('button', { name: '交换行动顺序', exact: true }).click();
      const expected = reverse ? ['genius', 'legs'] : ['legs', 'genius'];
      await expect(pair.host.locator('.selection-order li').first()).toContainText(name(expected[0]!));
      await pair.host.screenshot({ path: `${output}/order-${reverse ? 'reversed' : 'normal'}.png` });
      await pair.host.getByRole('button', { name: '锁定上场角色', exact: true }).click();
      await expect(pair.host.getByRole('button', { name: '交换行动顺序' })).toBeDisabled();
      await pair.host.reload(); await expect(pair.host.locator('.selection-order li').first()).toContainText(name(expected[0]!));
      await expect(pair.host.getByRole('button', { name: '交换行动顺序' })).toBeDisabled();
      await chooseCard(pair.guest, 'coach'); await chooseCard(pair.guest, 'alchemist');
      await pair.guest.getByRole('button', { name: '锁定上场角色', exact: true }).click();
      await expect(pair.host.getByTestId('board-3d')).toBeVisible();
      const game = application.rooms.get(pair.code).game;
      const own = game.baseTurnOrder!.map(id => game.racers.find(racer => racer.id === id)!).filter(racer => racer.playerId === pair.ids[0]);
      expect(own.map(racer => racer.characterId)).toEqual(expected);
    }
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});

test('all eight cross-player duel identities show both manual roll buttons and restore the responder', async ({ browser }) => {
  test.setTimeout(240_000);
  const pair = await setup(browser, true), evidence: unknown[] = [];
  try {
    for (const owner of [0, 1]) for (const ownSlot of [0, 1]) for (const rivalSlot of [0, 1]) {
      const initiator = owner * 2 + ownSlot, responder = (1 - owner) * 2 + rivalSlot;
      publish(pair, room => {
        const previousId = room.game.logs.at(-1)?.id ?? 0;
        const game: GameState = {
          phase: 'race', round: 1, track: 'mild', players: room.game.players, deck: [], discard: [], turn: initiator, turnCount: 0,
          currentRacerId: `athlete-${initiator}`, baseTurnOrder: [0, 1, 2, 3].map(index => `athlete-${index}`),
          racers: [0, 1, 2, 3].map(index => ({ id: `athlete-${index}`, playerId: pair.ids[Math.floor(index / 2)]!, characterId: index === initiator ? 'duelist' : ['coach', 'alchemist', 'legs', 'genius'][index]!, position: index === initiator || index === responder ? 5 : 20 + index, tripped: false, finished: false, eliminated: false, flags: {} })),
          queue: [{ kind: 'beginTurn', racerId: `athlete-${initiator}` }], flags: { testDice: [6, 2] }, rngState: 1234, randomLog: [], logs: [], results: [],
        };
        resolveTasks(game); game.logs.forEach(event => { event.id += previousId; }); room.game = game;
      });
      const first = pair.pages[owner]!, second = pair.pages[1 - owner]!;
      for (const page of pair.pages) { const skip = page.getByTestId('skip-animation'); if (await skip.count()) await skip.click(); }
      const target = application.rooms.get(pair.code).game.pending!.options.find(option => option.id === `athlete-${responder}`)!;
      await first.getByRole('region', { name: '待处理技能' }).getByRole('button', { name: target.label, exact: true }).click();
      const firstButton = first.getByRole('button', { name: '掷决斗骰', exact: true });
      await expect(firstButton).toBeVisible(); expect(application.rooms.get(pair.code).game.randomLog).toHaveLength(0);
      await firstButton.click();
      await expect(second.getByRole('button', { name: '掷决斗骰', exact: true })).toBeVisible();
      expect(application.rooms.get(pair.code).game.randomLog).toHaveLength(1);
      await second.reload(); await expect(second.getByRole('button', { name: '掷决斗骰', exact: true })).toBeVisible();
      expect(application.rooms.get(pair.code).game.randomLog).toHaveLength(1);
      if (owner === 0 && ownSlot === 1 && rivalSlot === 1) {
        await expect(second.getByTestId('board-3d')).toBeVisible();
        await expect.poll(async () => Number(await second.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
        await expect(second.getByTestId('board-3d')).toHaveAttribute('data-loaded-models', '4');
        await expect(second.getByTestId('board-3d')).toHaveAttribute('data-model-fallbacks', '0');
        await second.screenshot({ path: `${output}/duel-second-athlete-mobile.png` });
      }
      await second.getByRole('button', { name: '掷决斗骰', exact: true }).click();
      await expect.poll(() => application.rooms.get(pair.code).game.logs.filter(event => event.type === 'duel-dice').length).toBe(1);
      expect(application.rooms.get(pair.code).game.randomLog).toHaveLength(2);
      evidence.push({ owner, ownSlot, rivalSlot, initiator, responder, throws: 2, results: 1 });
    }
    writeFileSync(`${output}/duel-matrix.json`, JSON.stringify(evidence, null, 2));
  } finally { await Promise.all(pair.contexts.map(context => context.close())); }
});

test('practice offers the full pool, supports inspection/reselection, stays private, and dissolves from exit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(url); await page.getByRole('tab', { name: '自己练习', exact: true }).click();
    await page.getByRole('button', { name: '开始自己练习', exact: true }).click();
    await expect(page.locator('.practice-pool .character-card')).toHaveCount(CHARACTERS.length);
    const code = page.url().split('/').at(-1)!;
    expect(application.rooms.list().some(room => room.code === code)).toBe(false);
    await page.locator('.practice-pool .detail-button').first().click(); await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await chooseCard(page, 'banana'); await chooseCard(page, 'egg');
    await page.getByRole('button', { name: `取消选择${name('egg')}`, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '已选 1 / 4' })).toBeVisible();
    await page.getByRole('button', { name: '重新选择', exact: true }).click();
    for (const id of ['genius', 'legs', 'gunk', 'rocket-scientist']) await chooseCard(page, id);
    await page.screenshot({ path: `${output}/practice-pool-mobile.png`, fullPage: false });
    await page.getByRole('button', { name: '确认练习阵容', exact: true }).click();
    expect(application.rooms.get(code).game.players[0]!.hand).toEqual(['genius', 'legs', 'gunk', 'rocket-scientist']);
    await page.reload(); expect(application.rooms.list().some(room => room.code === code)).toBe(false);
    await chooseCard(page, 'legs'); await page.getByRole('button', { name: '锁定上场角色', exact: true }).click();
    await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle', { timeout: 20000 });
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-loaded-models', '1');
    await page.screenshot({ path: `${output}/practice-model-mobile.png` });
    await page.getByRole('button', { name: '退出房间', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('30 分钟');
    await page.getByRole('button', { name: '解散房间', exact: true }).click();
    await page.getByRole('button', { name: '确认结束', exact: true }).click();
    await expect(page.locator('[data-room-closed="true"]')).toBeVisible();
    expect(application.rooms.list().some(room => room.code === code)).toBe(false);
  } finally { await context.close(); }
});

test('loaded Blender figures and smooth corner movement render in desktop and mobile game cameras', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const mobile of [false, true]) {
    const pair = await setup(browser, mobile, false, mobile), page = pair.host;
    try {
      publish(pair, room => {
        const previous = room.game.logs.at(-1)?.id ?? 0;
        const game: GameState = {
          phase: 'race', round: 1, track: 'mild', players: room.game.players, deck: [], discard: [], turn: 0, turnCount: 0,
          currentRacerId: 'model-0', baseTurnOrder: [0, 1, 2, 3].map(index => `model-${index}`),
          racers: ['gunk', 'hare', 'coach', 'rocket-scientist'].map((characterId, index) => ({ id: `model-${index}`, playerId: pair.ids[Math.floor(index / 2)]!, characterId, position: [10, 22, 24, 20][index]!, tripped: false, finished: false, eliminated: false, flags: {} })),
          queue: [{ kind: 'beginTurn', racerId: 'model-0' }], logs: [], results: [], flags: { testDice: [6] }, rngState: 1234, randomLog: [],
        };
        resolveTasks(game); game.logs.forEach(event => { event.id += previous; }); room.game = game;
      });
      const board = page.getByTestId('board-3d'), device = mobile ? 'mobile' : 'desktop';
      await expect(board).toHaveAttribute('data-loaded-models', '4'); await expect(board).toHaveAttribute('data-model-fallbacks', '0');
      await expect(board).toHaveAttribute('data-camera-state', 'self');
      await page.screenshot({ path: `${output}/blender-game-${device}.png` });
      await page.evaluate(() => {
        const scope = window as unknown as { __motionQA: { at: number; x: number; z: number; zoom: number; phase: string; state: string }[]; __motionRunning: boolean };
        scope.__motionQA = []; scope.__motionRunning = true;
        const save = () => {
          const board = document.querySelector<HTMLElement>('[data-testid="board-3d"]')!;
          scope.__motionQA.push({ at: performance.now(), x: Number(board.dataset.cameraX), z: Number(board.dataset.cameraZ), zoom: Number(board.dataset.cameraZoom), phase: board.dataset.phase!, state: board.dataset.cameraState! });
          if (scope.__motionRunning) requestAnimationFrame(save);
        }; requestAnimationFrame(save);
      });
      await page.getByRole('button', { name: '掷骰子', exact: true }).click();
      await expect(board).toHaveAttribute('data-phase', 'move');
      await page.screenshot({ path: `${output}/corner-move-${device}.png` });
      await expect(board).toHaveAttribute('data-phase', 'idle', { timeout: 30000 });
      await expect(board).toHaveAttribute('data-camera-state', 'self');
      await expect(board).toHaveAttribute('data-camera-target-ids', 'model-1');
      const finalGame = application.rooms.get(pair.code).game;
      expect(finalGame.racers[0]!.position).toBe(16);
      const target = pawnWorldPoint(finalGame.racers[1]!, finalGame.racers, 22, mobile);
      await expect.poll(async () => Math.hypot(Number(await board.getAttribute('data-camera-x')) - target[0], Number(await board.getAttribute('data-camera-z')) - target[2])).toBeLessThan(.1);
      const samples = await page.evaluate(() => {
        const scope = window as unknown as { __motionQA: unknown[]; __motionRunning: boolean };
        scope.__motionRunning = false; return scope.__motionQA;
      });
      writeFileSync(`${output}/movement-${device}.json`, JSON.stringify({ viewport: page.viewportSize(), loadedModels: await board.getAttribute('data-loaded-models'), triangles: await board.getAttribute('data-triangles'), drawCalls: await board.getAttribute('data-draw-calls'), samples }, null, 2));
      await page.screenshot({ path: `${output}/follow-second-${device}.png` });
    } finally { await Promise.all(pair.contexts.map(context => context.close())); }
  }
});
