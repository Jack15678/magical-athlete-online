import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState, Room } from '../../src/shared/types.js';

// Fixtures live only inside this isolated test server. Every tested action is
// submitted by the actual UI and confirmed by the unchanged rules engine.
let application: ReturnType<typeof createApplication>;
let url: string;
test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('No test server address.');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync('test-results/three-scene', { recursive: true });
});
test.afterAll(async () => { await application.close(); });

async function pair(browser: Browser, mobile = false) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const errors: string[] = [];
  for (let seat = 0; seat < 2; seat++) {
    const context = await browser.newContext({ viewport: mobile && seat === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.addInitScript(() => {
      localStorage.setItem('magical-athlete:muted', 'true');
      localStorage.setItem('magical-athlete:low-quality', 'true');
      localStorage.setItem('magical-athlete:animation-speed', '1');
      localStorage.setItem('magical-athlete:reduced-motion', 'false');
    });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto(url);
  await host.getByLabel('你的昵称').fill('立体房主');
  await host.getByLabel('房间人数上限').selectOption('2');
  await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible();
  const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`);
  await guest.getByLabel('你的昵称').fill('立体访客');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click();
  await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = await Promise.all(pages.map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, code)));
  return { contexts, host, guest, code, ids, errors };
}
type Pair = Awaited<ReturnType<typeof pair>>;

async function seed(room: Pair, characterIds: string[], positions: number[], dice: number[] = []) {
  const saved: Room = structuredClone(application.rooms.get(room.code));
  const game: GameState = {
    phase: 'race', round: 1, track: 'mild', players: saved.game.players,
    deck: [], discard: [], turn: 0, turnCount: 0, currentRacerId: 'r0',
    queue: [], logs: [], results: [], rngState: 1234, randomLog: [], flags: { testDice: dice },
    racers: characterIds.map((characterId, index) => ({ id: `r${index}`, playerId: room.ids[index % 2]!, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })),
  };
  game.queue.push({ kind: 'beginTurn', racerId: 'r0' });
  resolveTasks(game);
  saved.game = game; saved.version++; saved.deadline = null;
  application.rooms.rooms.set(saved.code, saved); application.store.save(saved);
  for (const socket of application.io.sockets.sockets.values()) {
    if (socket.data.identity?.roomCode === saved.code) socket.emit('snapshot', application.rooms.view(saved, socket.data.identity.playerId));
  }
  for (const page of [room.host, room.guest]) {
    await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect(page.getByTestId('board-3d').locator('.board-webgl canvas')).toBeVisible();
    await expect.poll(async () => {
      const boardBox = (await page.getByTestId('board-3d').boundingBox())!;
      const canvasBox = (await page.getByTestId('board-3d').locator('.board-webgl canvas').boundingBox())!;
      return Math.abs(canvasBox.x - boardBox.x) <= 3 && Math.abs(canvasBox.y - boardBox.y) <= 3 && canvasBox.width > boardBox.width * .95 && canvasBox.height > boardBox.height * .95;
    }).toBe(true);
    await expect.poll(async () => Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
    // HTML labels on an orthographic camera must remain screen-sized. An
    // incorrect distanceFactor can turn a badge into a board-covering disk.
    await expect.poll(async () => {
      const width = (await page.locator('.pawn-seat').first().boundingBox())?.width ?? 0;
      return width >= 15 && width <= 30;
    }).toBe(true);
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
  }
}

// Locating by the attribute avoids relying on translated character names.
function token(page: Page, id: string) { return page.locator(`[data-testid="scene-racer"][data-racer-id="${id}"]`); }
async function choose(room: Pair, optionId: string) {
  const choice = application.rooms.get(room.code).game.pending!;
  const option = choice.options.find(option => option.id === optionId)!;
  const page = choice.playerId === room.ids[0] ? room.host : room.guest;
  await page.getByRole('region', { name: '待处理技能' }).getByRole('button', { name: option.label, exact: true }).click();
}
async function recordBeats(page: Page) {
  await page.evaluate(() => {
    const board = document.querySelector('[data-testid="board-3d"]')!;
    const records: { phase: string; events: string; motions: string }[] = [];
    (window as unknown as { __sceneBeats: typeof records }).__sceneBeats = records;
    const save = () => {
      const next = { phase: board.getAttribute('data-phase') ?? '', events: board.getAttribute('data-event-ids') ?? '', motions: board.getAttribute('data-motion-count') ?? '' };
      if (JSON.stringify(next) !== JSON.stringify(records.at(-1))) records.push(next);
    };
    new MutationObserver(save).observe(board, { attributes: true }); save();
  });
}
async function beats(page: Page) {
  return page.evaluate(() => (window as unknown as { __sceneBeats: { phase: string; events: string; motions: string }[] }).__sceneBeats);
}
async function captureBoard(page: Page, name: string) {
  const board = page.getByTestId('board-3d');
  await board.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await board.screenshot({ path: `test-results/three-scene/${name}-board.png` });
  await page.screenshot({ path: `test-results/three-scene/${name}.png`, fullPage: true });
}
async function canvasDiagnostics(page: Page) {
  const board = page.getByTestId('board-3d'); await board.scrollIntoViewIfNeeded();
  const data = await board.evaluate(node => {
    const style = (element: Element) => { const css = getComputedStyle(element); const box = element.getBoundingClientRect(); return { tag: element.tagName, class: element.getAttribute('class'), box: { x: box.x, y: box.y, width: box.width, height: box.height }, display: css.display, position: css.position, visibility: css.visibility, opacity: css.opacity, zIndex: css.zIndex, background: css.backgroundColor, pointer: css.pointerEvents }; };
    const bounds = node.getBoundingClientRect();
    return { html: node.innerHTML.slice(0, 3000), children: Array.from(node.children).map(style), canvases: Array.from(node.querySelectorAll('canvas')).map(style), center: document.elementsFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).map(style) };
  });
  await test.info().attach('canvas-dom-layout', { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
  writeFileSync('test-results/three-scene/canvas-dom.json', JSON.stringify(data, null, 2));
}

test('3D dice settles on the authoritative face before movement; reconnect does not replay history', async ({ browser }) => {
  const room = await pair(browser);
  try {
    await seed(room, ['alchemist', 'legs', 'baba-yaga', 'banana'], [5, 14, 18, 22], [1]);
    await room.host.getByTestId('presentation-settings').click();
    await room.host.getByLabel('低画质', { exact: true }).uncheck();
    await room.host.getByTestId('presentation-settings').click();
    await canvasDiagnostics(room.host);
    const board = room.host.getByTestId('board-3d');
    await expect(board.locator('canvas')).toHaveCount(2);
    const diceCanvas = await room.host.locator('.dice-spotlight canvas').elementHandle();
    expect(diceCanvas).not.toBeNull();
    await expect(room.host.locator('.dice-spotlight')).toBeHidden();
    await recordBeats(room.host);
    const started = Date.now();
    await room.host.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect(board).toHaveAttribute('data-phase', 'dice');
    expect(await room.host.evaluate(original => document.querySelector('.dice-spotlight canvas') === original, diceCanvas)).toBe(true);
    await expect(room.host.getByRole('button', { name: '正在演出…', exact: true })).toBeDisabled();
    await expect(room.host.getByRole('region', { name: '待处理技能' })).toHaveCount(0);
    expect(application.rooms.get(room.code).game.lastRoll?.face).toBe(1);
    await expect(token(room.host, 'r0')).toHaveAttribute('data-position', '5');
    // The final-face pause is intentionally brief (~400 ms); sample it at a
    // steady interval instead of the assertion runner's expanding backoff.
    await expect.poll(() => room.host.locator('.dice-spotlight').getAttribute('data-up-face'), { intervals: [25] }).toBe('1');
    await expect(room.host.getByTestId('dice-value')).toHaveText(/1/);
    await captureBoard(room.host, 'dice-settled-desktop');
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect(await room.host.evaluate(original => document.querySelector('.dice-spotlight canvas') === original, diceCanvas)).toBe(true);
    await expect(board.locator('canvas')).toHaveCount(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2300);
    expect((await beats(room.host)).filter(beat => beat.phase === 'dice')).toHaveLength(1);

    await choose(room, 'use');
    await expect(board).toHaveAttribute('data-phase', 'move');
    await expect(token(room.host, 'r0')).toHaveAttribute('data-position', '5');
    await expect(token(room.host, 'r0')).toHaveAttribute('data-target-position', '9');
    expect(application.rooms.get(room.code).game.racers[0]!.position).toBe(9);
    // The guest reconnects while the host is displaying the accepted move.
    await room.contexts[1]!.setOffline(true);
    await room.contexts[1]!.setOffline(false);
    await room.guest.reload();
    await expect(room.guest.locator('.connection.is-online')).toBeVisible();
    await expect(room.guest.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    await expect(token(room.guest, 'r0')).toHaveAttribute('data-position', '9');
    await expect(board).toHaveAttribute('data-phase', 'idle');
    await expect(token(room.host, 'r0')).toHaveAttribute('data-position', '9');
    expect(application.rooms.get(room.code).game.lastRoll?.face).toBe(1);
    await room.host.evaluate(() => dispatchEvent(new Event('focus')));
    await room.host.waitForTimeout(200);
    expect((await beats(room.host)).filter(beat => beat.phase === 'dice')).toHaveLength(1);
    await captureBoard(room.host, 'dice-desktop');
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('3D swap moves both targets together, then displays the resulting trip in engine order', async ({ browser }) => {
  const room = await pair(browser);
  try {
    await seed(room, ['flip-flop', 'alchemist', 'baba-yaga', 'legs'], [2, 9, 9, 15]);
    await recordBeats(room.host);
    const board = room.host.getByTestId('board-3d');
    await choose(room, 'r1');
    await expect(board).toHaveAttribute('data-phase', 'swap');
    await expect(board).toHaveAttribute('data-motion-count', '2');
    await expect(token(room.host, 'r0')).toHaveAttribute('data-position', '2');
    await expect(token(room.host, 'r0')).toHaveAttribute('data-target-position', '9');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-position', '9');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-target-position', '2');
    await expect(board).toHaveAttribute('data-phase', 'trip');
    await expect(board).toHaveAttribute('data-phase', 'idle');
    const events = application.rooms.get(room.code).game.logs;
    const warpId = events.find(event => event.type === 'warp')!.id;
    const tripId = events.find(event => event.type === 'trip' && event.targets?.includes('r0'))!.id;
    const observed = await beats(room.host);
    expect(observed.findIndex(beat => beat.events.split(',').includes(String(warpId)))).toBeLessThan(observed.findIndex(beat => beat.events.split(',').includes(String(tripId))));
    expect(application.rooms.get(room.code).game.racers[0]!.tripped).toBe(true);
    await expect(token(room.host, 'r0')).toHaveAttribute('data-position', '9');
    await captureBoard(room.host, 'swap-trip-desktop');
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('3D teleport uses its own beat and a backward skill follows the passed track path', async ({ browser }) => {
  const room = await pair(browser);
  try {
    await seed(room, ['hypnotist', 'alchemist', 'legs', 'banana'], [5, 9, 14, 22]);
    const board = room.host.getByTestId('board-3d');
    await choose(room, 'r1');
    await expect(board).toHaveAttribute('data-phase', 'warp');
    await expect(board).toHaveAttribute('data-motion-count', '1');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-position', '9');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-target-position', '5');
    await expect(board).toHaveAttribute('data-phase', 'idle');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-position', '5');
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
  const backward = await pair(browser);
  try {
    await seed(backward, ['centaur', 'alchemist', 'legs', 'banana'], [2, 4, 6, 22], [6]);
    await recordBeats(backward.host);
    const board = backward.host.getByTestId('board-3d');
    await backward.host.getByRole('button', { name: '掷骰子', exact: true }).click();
    const back = application.rooms.get(backward.code).game.logs.find(event => event.type === 'move' && event.before?.[0] === 4 && event.after?.[0] === 2)!;
    expect(back).toBeDefined();
    await expect(board).toHaveAttribute('data-event-ids', String(back.id));
    await expect(board).toHaveAttribute('data-phase', 'move');
    await expect(token(backward.host, 'r1')).toHaveAttribute('data-position', '4');
    await expect(token(backward.host, 'r1')).toHaveAttribute('data-target-position', '2');
    await expect(board).toHaveAttribute('data-phase', 'idle');
    await expect(token(backward.host, 'r1')).toHaveAttribute('data-position', '2');
    await expect(token(backward.host, 'r2')).toHaveAttribute('data-position', '4');
    expect(backward.errors).toEqual([]);
  } finally { await Promise.all(backward.contexts.map(context => context.close())); }
});

test('3D simultaneous movement stays grouped on mobile; settings and skip preserve the accepted position', async ({ browser }) => {
  const room = await pair(browser, true);
  try {
    await seed(room, ['cheerleader', 'alchemist', 'legs', 'banana'], [5, 1, 1, 14]);
    await recordBeats(room.host);
    const board = room.host.getByTestId('board-3d');
    await choose(room, 'use');
    await expect(board).toHaveAttribute('data-phase', 'move');
    await expect(board).toHaveAttribute('data-motion-count', '2');
    await expect(token(room.host, 'r1')).toHaveAttribute('data-target-position', '3');
    await expect(token(room.host, 'r2')).toHaveAttribute('data-target-position', '3');
    const authoritative = structuredClone(application.rooms.get(room.code).game);
    await room.host.getByTestId('skip-animation').click();
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect(application.rooms.get(room.code).game).toEqual(authoritative);
    for (const racer of authoritative.racers) await expect(token(room.host, racer.id)).toHaveAttribute('data-position', String(racer.position));
    await room.host.getByTestId('presentation-settings').click();
    await expect(room.host.getByLabel('减少动效')).toBeVisible();
    await room.host.getByLabel('减少动效').check();
    await room.host.getByLabel('动画速度').selectOption('4');
    await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
    expect(await room.host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await captureBoard(room.host, 'simultaneous-mobile');
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});
