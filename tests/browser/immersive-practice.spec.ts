import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import { boardPoint } from '../../src/client/scene/math.js';
import type { GameState, Room } from '../../src/shared/types.js';

// Only the isolated test server receives fixtures. Throws and choices below go
// through the real buttons, transport and authoritative rules engine.
let application: ReturnType<typeof createApplication>;
let url: string;
const output = 'test-results/immersive';
test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('Missing isolated server address.');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(output, { recursive: true });
});
test.afterAll(async () => { await application.close(); });

interface CameraSample { phase: string; events: string; state: string; targets: string; mode: string; x: number; z: number; zoom: number; polar: number; at: number }
async function observeCamera(page: Page) {
  await page.evaluate(() => {
    const board = document.querySelector('[data-testid="board-3d"]')!;
    const scope = window as unknown as { __immersiveSamples: CameraSample[]; __immersiveObserver?: MutationObserver };
    scope.__immersiveObserver?.disconnect(); scope.__immersiveSamples = [];
    const save = () => {
      const sample = { phase: board.getAttribute('data-phase') ?? '', events: board.getAttribute('data-event-ids') ?? '', state: board.getAttribute('data-camera-state') ?? '', targets: board.getAttribute('data-camera-target-ids') ?? '', mode: board.getAttribute('data-camera-mode') ?? '', x: Number(board.getAttribute('data-camera-x')), z: Number(board.getAttribute('data-camera-z')), zoom: Number(board.getAttribute('data-camera-zoom')), polar: Number(board.getAttribute('data-camera-polar')), at: performance.now() };
      const last = scope.__immersiveSamples.at(-1);
      if (!last || ['phase', 'events', 'state', 'targets', 'mode', 'x', 'z', 'zoom', 'polar'].some(key => sample[key as keyof CameraSample] !== last[key as keyof CameraSample])) scope.__immersiveSamples.push(sample);
    };
    scope.__immersiveObserver = new MutationObserver(save);
    scope.__immersiveObserver.observe(board, { attributes: true, attributeFilter: ['data-phase', 'data-event-ids', 'data-camera-state', 'data-camera-target-ids', 'data-camera-mode', 'data-camera-target', 'data-camera-zoom', 'data-camera-polar'] });
    save();
  });
}
async function samples(page: Page) { return page.evaluate(() => (window as unknown as { __immersiveSamples: CameraSample[] }).__immersiveSamples); }
async function viewportFilled(page: Page) {
  const metrics = await page.getByTestId('board-3d').evaluate(board => {
    const bounds = board.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, scrollY };
  });
  expect(metrics.x).toBeGreaterThanOrEqual(-1); expect(metrics.y).toBeGreaterThanOrEqual(-1);
  expect(metrics.width).toBeGreaterThanOrEqual(metrics.viewportWidth - 2);
  expect(metrics.height).toBeGreaterThanOrEqual(metrics.viewportHeight - 2);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.scrollY).toBe(0);
}
async function pair(browser: Browser, mobile = false, recordVideo = false) {
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  for (let index = 0; index < 2; index++) {
    const viewport = mobile && index === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(recordVideo && index === 0 ? { recordVideo: { dir: `${output}/video`, size: viewport } } : {}) });
    contexts.push(context);
    await context.addInitScript(() => { try {
      localStorage.setItem('magical-athlete:muted', 'true');
      localStorage.setItem('magical-athlete:low-quality', 'true');
      localStorage.setItem('magical-athlete:animation-speed', '1');
      localStorage.setItem('magical-athlete:reduced-motion', 'false');
    } catch { /* The initial opaque document has no storage. */ } });
    const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.stack ?? error.message));
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto(url); await host.getByLabel('你的昵称').fill('我的视角');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible(); const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('连锁行动者');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = await Promise.all(pages.map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, code)));
  return { contexts, host, guest, code, ids, errors };
}
type Pair = Awaited<ReturnType<typeof pair>>;
async function seed(room: Pair, characters: string[], positions: number[], current = 0, dice = [6], track: GameState['track'] = 'mild') {
  const saved: Room = structuredClone(application.rooms.get(room.code));
  const game: GameState = {
    phase: 'race', round: 1, track, players: saved.game.players, deck: [], discard: [], turn: current, turnCount: 0, currentRacerId: `r${current}`,
    queue: [], logs: [], results: [], rngState: 1234, randomLog: [], flags: { testDice: dice },
    racers: characters.map((characterId, index) => ({ id: `r${index}`, playerId: room.ids[index % 2]!, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })),
  };
  game.queue.push({ kind: 'beginTurn', racerId: `r${current}` }); resolveTasks(game);
  // Preserve monotonically increasing public event IDs across isolated
  // fixtures, so camera return/dismiss state cannot accidentally mask a test.
  const previousEvent = saved.game.logs.at(-1)?.id ?? 0;
  for (const event of game.logs) event.id += previousEvent;
  saved.game = game; saved.version++; saved.deadline = null;
  application.rooms.rooms.set(saved.code, saved); application.store.save(saved);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === saved.code) socket.emit('snapshot', application.rooms.view(saved, socket.data.identity.playerId));
  for (const page of [room.host, room.guest]) {
    await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect.poll(async () => Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
  }
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png` });
  writeFileSync(`${output}/${name}-camera.json`, JSON.stringify(await samples(page), null, 2));
}

test('immersive desktop follows a complete remote skill chain once and returns; overview and manual camera stay put', async ({ browser }) => {
  const room = await pair(browser, false, true);
  const video = room.host.video();
  try {
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 4, 6], 1);
    const board = room.host.getByTestId('board-3d');
    await expect(board).toHaveAttribute('data-camera-mode', 'self');
    await expect(board).toHaveAttribute('data-camera-state', 'self');
    await expect(board).toHaveAttribute('data-camera-target', /-?\d/);
    const originalCamera = { x: Number(await board.getAttribute('data-camera-x')), z: Number(await board.getAttribute('data-camera-z')) };
    await viewportFilled(room.host); await expect(room.host.getByTestId('board-minimap')).toBeVisible();
    await room.host.locator('summary[aria-label="镜头设置"]').click();
    await expect(room.host.getByLabel('自动观看他人行动', { exact: true })).toBeChecked();
    await room.host.locator('summary[aria-label="镜头设置"]').click();
    await observeCamera(room.host); await capture(room.host, 'desktop-self');
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(async () => (await samples(room.host)).some(sample => sample.state === 'action')).toBe(true);
    await expect.poll(() => application.rooms.get(room.code).game.racers.find(racer => racer.id === 'r1')?.position).toBe(8);
    await expect(board).toHaveAttribute('data-phase', 'skill');
    await room.host.screenshot({ path: `${output}/desktop-skill-chain.png` });
    await expect(board).toHaveAttribute('data-phase', 'idle'); await expect(board).toHaveAttribute('data-camera-state', 'self');
    const currentOwn = application.rooms.get(room.code).game.racers.find(racer => racer.id === application.rooms.get(room.code).game.currentRacerId)!;
    expect(currentOwn.playerId).toBe(room.ids[0]);
    const ownPoint = boardPoint(currentOwn.position, false);
    await expect(board).toHaveAttribute('data-camera-target-ids', currentOwn.id);
    await expect.poll(async () => Math.hypot(Number(await board.getAttribute('data-camera-x')) - ownPoint[0], Number(await board.getAttribute('data-camera-z')) - ownPoint[2])).toBeLessThan(.15);
    const observed = await samples(room.host), active = observed.filter(sample => sample.phase !== 'idle');
    expect(active.some(sample => sample.phase === 'move')).toBe(true);
    expect(active.some(sample => sample.phase === 'skill')).toBe(true);
    expect(active.filter(sample => sample.state === 'self')).toEqual([]);
    expect(observed.at(-1)?.state).toBe('self');
    expect(observed.some(sample => Math.hypot(sample.x - originalCamera.x, sample.z - originalCamera.z) > 2)).toBe(true);
    const polarAngles = observed.filter(sample => sample.polar > 0).map(sample => sample.polar);
    expect(Math.max(...polarAngles) - Math.min(...polarAngles)).toBeLessThan(.005);
    const engineMoves = application.rooms.get(room.code).game.logs.filter(event => event.type === 'move');
    expect(engineMoves.some(event => event.before?.[0] === 4 && event.after?.[0] === 2)).toBe(true);
    await capture(room.host, 'desktop-chain-return');

    await room.host.getByRole('button', { name: '总览', exact: true }).click();
    await expect(board).toHaveAttribute('data-camera-mode', 'overview');
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 4, 6], 1);
    await observeCamera(room.host); await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(async () => (await samples(room.host)).some(sample => sample.phase !== 'idle')).toBe(true);
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect((await samples(room.host)).every(sample => sample.state === 'overview')).toBe(true);
    await room.host.getByRole('button', { name: '自己', exact: true }).click();
    const canvas = board.locator('.board-webgl canvas'); const box = (await canvas.boundingBox())!;
    await room.host.mouse.move(box.x + box.width * .55, box.y + box.height * .65);
    await room.host.mouse.down(); await room.host.mouse.move(box.x + box.width * .65, box.y + box.height * .72, { steps: 12 }); await room.host.mouse.up();
    await expect(board).toHaveAttribute('data-camera-state', 'manual');
    const beforeWheel = Number(await board.getAttribute('data-camera-zoom'));
    await room.host.mouse.wheel(0, 180);
    await expect.poll(async () => Math.abs(Number(await board.getAttribute('data-camera-zoom')) - beforeWheel)).toBeGreaterThan(.1);
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 4, 6], 1);
    await observeCamera(room.host); await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(async () => (await samples(room.host)).some(sample => sample.phase !== 'idle')).toBe(true);
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect((await samples(room.host)).every(sample => sample.state === 'manual')).toBe(true);
    await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
    await expect(board).toHaveAttribute('data-camera-state', 'self'); await capture(room.host, 'desktop-manual-return');

    await room.host.locator('summary[aria-label="镜头设置"]').click();
    await room.host.getByLabel('自动观看他人行动', { exact: true }).uncheck();
    await room.host.locator('summary[aria-label="镜头设置"]').click();
    // Both affected racers belong to the guest, so opting out must keep the
    // human's camera at their own pawn throughout this remote action.
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 25, 4], 1);
    await observeCamera(room.host); await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(async () => (await samples(room.host)).some(sample => sample.phase !== 'idle')).toBe(true);
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect((await samples(room.host)).every(sample => sample.state === 'self')).toBe(true);
    expect(room.errors).toEqual([]);
  } finally {
    await Promise.all(room.contexts.map(context => context.close()));
    if (video) await video.saveAs(`${output}/immersive-camera-demo.webm`);
  }
});

test('immersive mobile fills the viewport; next-turn skill appears automatically and choices take camera priority', async ({ browser }) => {
  const room = await pair(browser, true);
  try {
    await seed(room, ['alchemist', 'coach', 'flip-flop', 'legs'], [24, 9, 2, 15], 1, [1], 'wild');
    await viewportFilled(room.host); await expect(room.host.getByTestId('board-minimap')).toBeVisible();
    await observeCamera(room.host); await capture(room.host, 'mobile-self');
    const before = application.rooms.get(room.code).version;
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(() => application.rooms.get(room.code).version).toBeGreaterThan(before);
    // Human never presses roll: the preceding authoritative action must already
    // expose its start-of-turn exchange/normal-roll decision. The unrelated
    // guest's queued 2.5-second dice movie must yield to this new own decision.
    await expect.poll(() => application.rooms.get(room.code).game.pending?.kind).toBe('flip-flop');
    const pending = application.rooms.get(room.code).game.pending!;
    expect(pending.playerId).toBe(room.ids[0]);
    await expect(room.host.getByRole('region', { name: '待处理技能' })).toBeVisible({ timeout: 1500 });
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'choice');
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    expect(await room.host.getByTestId('roll-button').count()).toBe(0);
    await capture(room.host, 'mobile-skill-priority');
    const skip = pending.options.find(option => option.id === 'skip')!;
    await room.host.getByRole('region', { name: '待处理技能' }).getByRole('button', { name: skip.label, exact: true }).click();
    await expect.poll(() => application.rooms.get(room.code).game.pending?.kind ?? '').toBe('');
    await expect(room.host.getByRole('button', { name: '掷骰子', exact: true })).toBeEnabled();
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    await viewportFilled(room.host); await capture(room.host, 'mobile-automatic-start');
    const roll = (await room.host.getByTestId('roll-button').boundingBox())!;
    expect(roll.height).toBeGreaterThanOrEqual(44); expect(roll.y + roll.height).toBeLessThanOrEqual(844);
    // Keep a full wild-track visual reference as well as the mobile close-up.
    await room.host.setViewportSize({ width: 1440, height: 1000 });
    await room.host.getByRole('button', { name: '总览', exact: true }).click();
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'overview');
    await expect.poll(async () => Math.hypot(Number(await room.host.getByTestId('board-3d').getAttribute('data-camera-x')), Number(await room.host.getByTestId('board-3d').getAttribute('data-camera-z')))).toBeLessThan(.05);
    await room.host.screenshot({ path: `${output}/special-tiles-desktop.png` });
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});
