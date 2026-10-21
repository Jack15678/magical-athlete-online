import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState, Room } from '../../src/shared/types.js';

let application: ReturnType<typeof createApplication>;
let url: string;
const output = 'test-results/minimap';
test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture server address');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(output, { recursive: true }); mkdirSync('docs/qa', { recursive: true });
});
test.afterAll(async () => { await application.close(); });

async function pair(browser: Browser, mobile = false) {
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: mobile && !index ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    contexts.push(context);
    await context.addInitScript(() => { try {
      localStorage.setItem('magical-athlete:muted', 'true'); localStorage.setItem('magical-athlete:low-quality', 'true');
      localStorage.setItem('magical-athlete:animation-speed', '1'); localStorage.setItem('magical-athlete:reduced-motion', 'false');
    } catch { /* Storage is unavailable on the initial opaque document. */ } });
    const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.stack ?? error.message));
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto(url); await host.getByLabel('你的昵称').fill('地图视角');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible(); const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('连锁选手');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = await Promise.all(pages.map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, code)));
  return { contexts, host, guest, code, ids, errors };
}
type Pair = Awaited<ReturnType<typeof pair>>;

async function seed(room: Pair, characters: string[], positions: number[], current = 0, eightSeats = false) {
  const saved: Room = structuredClone(application.rooms.get(room.code));
  const players = eightSeats ? [...saved.game.players, ...Array.from({ length: 6 }, (_, index) => ({ id: `fixture-player-${index}`, name: `选手${index + 3}`, seat: index + 2, color: ['#ad72c4', '#57aa7b', '#df9f44', '#5d91c6', '#c67583', '#858a54'][index]!, ready: true, connected: true, score: 0, hand: [], used: [], selection: [] }))] : saved.game.players;
  const game: GameState = { phase: 'race', round: 1, track: 'mild', players, deck: [], discard: [], turn: current, turnCount: 0, currentRacerId: `r${current}`, queue: [], logs: [], results: [], rngState: 1234, randomLog: [], flags: { testDice: [6] }, racers: characters.map((characterId, index) => ({ id: `r${index}`, playerId: players[eightSeats ? index : index % 2]!.id, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })) };
  game.queue.push({ kind: 'beginTurn', racerId: `r${current}` }); resolveTasks(game);
  const previousEvent = saved.game.logs.at(-1)?.id ?? 0; for (const event of game.logs) event.id += previousEvent;
  saved.game = game; saved.version++; saved.deadline = null; saved.maxPlayers = eightSeats ? 8 : 2;
  application.rooms.rooms.set(saved.code, saved); application.store.save(saved);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === saved.code) socket.emit('snapshot', application.rooms.view(saved, socket.data.identity.playerId));
  for (const page of [room.host, room.guest]) {
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    await expect.poll(async () => Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
  }
}
async function assertLayout(page: Page, width: number) {
  const metrics = await page.evaluate(() => {
    const rect = (element: Element) => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }; };
    const minimap = document.querySelector('[data-testid="board-minimap"]')!, board = document.querySelector('[data-testid="board-3d"]')!;
    return { minimap: rect(minimap), board: rect(board), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, controls: [...document.querySelectorAll('.scene-camera-toolbar button,.scene-camera-toolbar summary,.race-status-pill')].map(rect) };
  });
  expect(metrics.minimap.width).toBe(width); expect(metrics.minimap.left).toBeGreaterThanOrEqual(0); expect(metrics.minimap.right).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1); expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1);
  expect(metrics.board.width).toBeGreaterThanOrEqual(metrics.width - 2); expect(metrics.board.height).toBeGreaterThanOrEqual(metrics.height - 2);
  for (const control of metrics.controls) {
    const overlapX = Math.min(control.right, metrics.minimap.right) - Math.max(control.left, metrics.minimap.left);
    const overlapY = Math.min(control.bottom, metrics.minimap.bottom) - Math.max(control.top, metrics.minimap.top);
    expect(overlapX <= 0 || overlapY <= 0, `minimap overlaps a control: ${JSON.stringify({ control, map: metrics.minimap })}`).toBe(true);
  }
}
async function capture(page: Page, name: string) { await page.screenshot({ path: `${output}/${name}.png` }); }

test('larger minimap separates my two racers, stays clear at 390/320px, and distinguishes an eight-racer crowd', async ({ browser }) => {
  const room = await pair(browser);
  try {
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 4, 6], 1);
    await assertLayout(room.host, 252);
    await expect(room.host.getByTestId('minimap-own-position')).toHaveCount(2);
    await expect(room.host.getByTestId('minimap-own-position').nth(0)).toContainText('你 · 第24格');
    await expect(room.host.getByTestId('minimap-own-position').nth(1)).toContainText('你 · 第4格');
    await expect(room.host.locator('.minimap-own-avatar>b')).toHaveText(['A', 'B']);
    await expect(room.host.locator('.minimap-own-marker')).toHaveText(['A', 'B']);
    await expect(room.host.locator('.minimap-positions')).toContainText('2号'); await expect(room.host.locator('.minimap-positions')).toContainText('2格');
    await capture(room.host, 'minimap-desktop'); await room.host.screenshot({ path: 'docs/qa/minimap-desktop.png' });
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 667 }]) {
      await room.host.setViewportSize(viewport); await assertLayout(room.host, 148);
      await room.host.locator('summary[aria-label="镜头设置"]').click();
      const option = room.host.getByLabel('自动观看他人行动', { exact: true }); await expect(option).toBeChecked();
      const popup = await option.locator('..').boundingBox(); expect(popup!.x).toBeGreaterThanOrEqual(0); expect(popup!.x + popup!.width).toBeLessThanOrEqual(viewport.width);
      await option.uncheck(); await expect(option).not.toBeChecked(); await option.check();
      await room.host.locator('summary[aria-label="镜头设置"]').click();
      await capture(room.host, `minimap-${viewport.width}`);
      if (viewport.width === 390) await room.host.screenshot({ path: 'docs/qa/minimap-mobile.png' });
    }
    await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(12), 0, true);
    await assertLayout(room.host, 148); await expect(room.host.getByTestId('minimap-own-position')).toHaveCount(1);
    await expect(room.host.getByTestId('minimap-own-position')).toContainText('你 · 第12格');
    const markers = room.host.locator('[data-map-racer-id]'); await expect(markers).toHaveCount(8);
    expect(await markers.last().getAttribute('data-map-racer-id')).toBe('r0');
    const layout = await markers.evaluateAll(elements => elements.map(element => { const own = element.classList.contains('minimap-self'), target = element.querySelector('g[transform]')!, text = target.querySelector('text')!, circle = target.querySelector('circle:last-of-type')!; return { own, transform: target.getAttribute('transform'), text: text.textContent, radius: Number(circle.getAttribute('r')) }; }));
    expect(new Set(layout.map(marker => marker.transform)).size).toBe(8);
    expect(layout.at(-1)?.text).toBe('你'); expect(layout.at(-1)?.radius).toBeGreaterThan(layout[0]!.radius);
    await capture(room.host, 'minimap-eight-crowd-320');
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

interface Sample { at: number; phase: string; events: string; state: string; banner: string; headline: string; positions: Record<string, number> }
test('minimap follows the actual motion and centaur effects show readable causes without breaking the camera chain', async ({ browser }) => {
  const room = await pair(browser, true);
  try {
    await seed(room, ['coach', 'centaur', 'alchemist', 'legs'], [24, 2, 4, 6], 1);
    await room.host.evaluate(() => {
      const board = document.querySelector('[data-testid="board-3d"]')!;
      const state = window as unknown as { __minimapSamples: Sample[] }; state.__minimapSamples = [];
      const sample = () => { const banner = board.querySelector('[data-testid="skill-banner"]'); const value = { at: performance.now(), phase: board.getAttribute('data-phase') ?? '', events: board.getAttribute('data-event-ids') ?? '', state: board.getAttribute('data-camera-state') ?? '', banner: banner?.textContent ?? '', headline: banner?.querySelector('strong')?.textContent ?? '', positions: Object.fromEntries([...board.querySelectorAll('[data-testid="board-minimap"] [data-racer-id]')].map(node => [node.getAttribute('data-racer-id')!, Number(node.getAttribute('data-position'))])) }; const previous = state.__minimapSamples.at(-1); if (!previous || JSON.stringify({ ...previous, at: 0 }) !== JSON.stringify({ ...value, at: 0 })) state.__minimapSamples.push(value); };
      new MutationObserver(sample).observe(board, { attributes: true, subtree: true, childList: true, attributeFilter: ['data-phase', 'data-event-ids', 'data-camera-state', 'data-position'] }); sample();
    });
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    const title = room.host.getByTestId('skill-banner').locator('strong');
    await expect(title).toHaveText('后蹄踢击 → 后退2格');
    await expect(room.host.getByTestId('skill-banner').locator('small')).toContainText('技能效果');
    await assertLayout(room.host, 148);
    const geometry = await room.host.evaluate(() => { const map = document.querySelector('[data-testid="board-minimap"]')!.getBoundingClientRect(), banner = document.querySelector('[data-testid="skill-banner"]')!.getBoundingClientRect(); return { map: { left: map.left, right: map.right, top: map.top, bottom: map.bottom }, banner: { left: banner.left, right: banner.right, top: banner.top, bottom: banner.bottom } }; });
    expect(Math.min(geometry.map.right, geometry.banner.right) <= Math.max(geometry.map.left, geometry.banner.left) || Math.min(geometry.map.bottom, geometry.banner.bottom) <= Math.max(geometry.map.top, geometry.banner.top), JSON.stringify(geometry)).toBe(true);
    await capture(room.host, 'skill-move-reason-mobile'); await room.host.screenshot({ path: 'docs/qa/skill-move-reason.png' });
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'self');
    const records = await room.host.evaluate(() => (window as unknown as { __minimapSamples: Sample[] }).__minimapSamples);
    writeFileSync(`${output}/centaur-motion-samples.json`, JSON.stringify(records, null, 2));
    expect(records.filter(sample => sample.phase !== 'idle').every(sample => sample.state === 'action')).toBe(true);
    expect(records.some(sample => sample.phase === 'move' && sample.positions.r1 > 2 && sample.positions.r1 < 8)).toBe(true);
    expect(records.some(sample => sample.phase === 'move' && sample.positions.r2 === 3)).toBe(true);
    const skillEvents = [...new Set(records.filter(sample => sample.phase === 'skill').map(sample => sample.events))]; expect(skillEvents.length).toBeGreaterThanOrEqual(2);
    for (const event of skillEvents) { const begin = records.findIndex(sample => sample.events === event), after = records.findIndex((sample, index) => index > begin && sample.events !== event); expect(after).toBeGreaterThan(begin); expect(records[after]!.at - records[begin]!.at).toBeGreaterThanOrEqual(900); }
    expect(records.filter(sample => sample.headline === '后蹄踢击 → 后退2格').every(sample => /→/.test(sample.banner))).toBe(true);
    expect(application.rooms.get(room.code).game.racers.map(racer => racer.position)).toEqual([24, 8, 2, 4]);
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});
