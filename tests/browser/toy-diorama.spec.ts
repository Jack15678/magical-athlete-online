import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState, Room } from '../../src/shared/types.js';

type Pose = { position: number[]; target: number[]; zoom: number; up: number[] };
type SceneApi = { getCamera(): Pose; setCamera(pose: Pose): void; render(): void; stats(): Record<string, unknown> };
declare global { interface Window { __ART_QA_SCENE__?: SceneApi } }
const stage = process.env.ART_QA_STAGE ?? 'after';
const output = 'docs/qa';
test.use({ trace: 'off' });
test.skip(!process.env.ART_QA_STAGE, 'Dedicated visual review: run node scripts/art-qa-build.mjs and set ART_QA_STAGE.');
let application: ReturnType<typeof createApplication>, url: string;
test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('No fixture server address.');
  url = `http://127.0.0.1:${address.port}`;
  console.log(`Art QA fixture server: ${url} (${stage})`);
});
test.afterAll(async () => { await application.close(); });

async function pair(browser: Browser, mobile = false, reducedMotion = false) {
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  for (let seat = 0; seat < 2; seat++) {
    const context = await browser.newContext({ viewport: mobile && seat === 0 ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    contexts.push(context);
    await context.addInitScript(reduced => { try {
      localStorage.setItem('magical-athlete:muted', 'true');
      localStorage.setItem('magical-athlete:low-quality', 'false');
      localStorage.setItem('magical-athlete:animation-speed', '1');
      localStorage.setItem('magical-athlete:reduced-motion', String(reduced));
    } catch { /* about:blank */ } }, reducedMotion);
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
  }
  const [host, guest] = pages as [Page, Page];
  await host.goto(url); await host.getByLabel('你的昵称').fill('美术检查');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友' }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible();
  const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('赛场伙伴');
  await guest.getByRole('button', { name: '加入这场胡闹' }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = await Promise.all(pages.map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, code)));
  return { contexts, host, guest, code, ids, errors };
}
type Pair = Awaited<ReturnType<typeof pair>>;
async function seed(room: Pair, characters: string[], positions: number[], current = 0, crowd = false, track: GameState['track'] = 'mild', dice = [3]) {
  const saved: Room = structuredClone(application.rooms.get(room.code));
  const humans = saved.game.players.filter(player => room.ids.includes(player.id));
  const players = crowd ? [...humans, ...Array.from({ length: 6 }, (_, index) => ({ id: `fixture-player-${index}`, name: `选手${index + 3}`, seat: index + 2, color: ['#ad72c4', '#57aa7b', '#df9f44', '#5d91c6', '#c67583', '#858a54'][index]!, ready: true, connected: true, score: 0, hand: [], used: [], selection: [] }))] : humans;
  const game: GameState = { phase: 'race', round: 1, track, players, deck: [], discard: [], turn: current, turnCount: 0, currentRacerId: `r${current}`, queue: [], logs: [], results: [], rngState: 1234, randomLog: [], flags: { testDice: dice }, racers: characters.map((characterId, index) => ({ id: `r${index}`, playerId: players[crowd ? index : index % 2]!.id, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })) };
  game.queue.push({ kind: 'beginTurn', racerId: `r${current}` }); resolveTasks(game);
  const previous = saved.game.logs.at(-1)?.id ?? 0; for (const event of game.logs) event.id += previous;
  saved.game = game; saved.version++; saved.deadline = null; saved.maxPlayers = crowd ? 8 : 2;
  application.rooms.rooms.set(saved.code, saved); application.store.save(saved);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === saved.code) socket.emit('snapshot', application.rooms.view(saved, socket.data.identity.playerId));
  for (const page of [room.host, room.guest]) {
    await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    await expect.poll(() => page.evaluate(() => !!window.__ART_QA_SCENE__)).toBe(true);
    await expect.poll(() => page.evaluate(() => Number(window.__ART_QA_SCENE__?.stats().triangles))).toBeGreaterThan(100);
  }
  await settle(room.host);
}
async function settle(page: Page) {
  await page.waitForTimeout(1400);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function capture(page: Page, name: string, savePose = true) {
  await settle(page);
  await page.screenshot({ path: `${output}/toy-${stage}-${name}.png` });
  if (savePose) {
    const pose = await page.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
    writeFileSync(`${output}/toy-${stage}-${name}-camera.json`, JSON.stringify(pose, null, 2));
  }
}
async function layout(page: Page) {
  const dimensions = await page.evaluate(() => { const board = document.querySelector('[data-testid="board-3d"]')!.getBoundingClientRect(); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, board: { width: board.width, height: board.height } }; });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height + 1);
  expect(dimensions.board.width).toBeGreaterThanOrEqual(dimensions.width - 1); expect(dimensions.board.height).toBeGreaterThanOrEqual(dimensions.height - 1);
}
async function sameCamera(page: Page, name: string) {
  const path = `${output}/toy-before-${name}-camera.json`;
  if (stage === 'before' || !existsSync(path)) return;
  const current = await page.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
  // The review-only bundle freezes the saved pose without changing the UI.
  const pose = JSON.parse(readFileSync(path, 'utf8')) as Pose;
  await page.evaluate(pose => window.__ART_QA_SCENE__!.setCamera(pose), pose);
  await capture(page, `${name}-same-camera`, false);
  const actual = await page.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
  for (let index = 0; index < 3; index++) {
    expect(Math.abs(actual.position[index]! - pose.position[index]!)).toBeLessThan(.001);
    expect(Math.abs(actual.target[index]! - pose.target[index]!)).toBeLessThan(.001);
  }
  expect(Math.abs(actual.zoom - pose.zoom)).toBeLessThan(.001);
  await page.evaluate(pose => window.__ART_QA_SCENE__!.setCamera(pose), current);
}
async function samplePerformance(page: Page, name: string) {
  const sample = await page.evaluate(async () => {
    const api = window.__ART_QA_SCENE__!, deltas: number[] = [], count = 90;
    let previous = performance.now();
    for (let index = 0; index < count; index++) {
      api.render(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const now = performance.now(); deltas.push(now - previous); previous = now;
    }
    const sorted = [...deltas.slice(10)].sort((a, b) => a - b);
    return { ...api.stats(), samples: sorted.length, medianFrameMs: sorted[Math.floor(sorted.length * .5)], p95FrameMs: sorted[Math.floor(sorted.length * .95)], maxFrameMs: sorted.at(-1), userAgent: navigator.userAgent };
  });
  writeFileSync(`${output}/toy-${stage}-${name}-performance.json`, JSON.stringify({ ...sample, caveat: 'Measured in local headless Edge at the stated viewport; mobile is a viewport/layout check, not a physical phone performance measurement. Forced invalidate samples actual WebGL scene frames without claiming idle demand rendering is continuous.' }, null, 2));
}

test('toy diorama deterministic before/after: desktop and mobile, self/overview, eight-racer crowd', async ({ browser }) => {
  for (const mobile of process.env.ART_QA_DEVICE === 'desktop' ? [false] : [false, true]) {
    const room = await pair(browser, mobile), device = mobile ? 'mobile' : 'desktop';
    try {
      await seed(room, ['coach', 'banana'], [0, 2]);
      await layout(room.host); await capture(room.host, `${device}-self`); await samplePerformance(room.host, device);
      await sameCamera(room.host, `${device}-self`);
      await room.host.getByRole('button', { name: '总览', exact: true }).click();
      await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'overview');
      await capture(room.host, `${device}-overview`);
      if (stage === 'after' && !mobile) {
        const pose = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
        const azimuth = Math.atan2(pose.position[0]! - pose.target[0]!, pose.position[2]! - pose.target[2]!);
        expect(azimuth).toBeCloseTo(Math.atan2(6, 20), 2);
      }
      await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
      await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'self');
      await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(2), 0, true);
      await expect(room.host.locator('.pawn-seat')).toHaveCount(8);
      await capture(room.host, `${device}-crowd`); await layout(room.host);
      const badges = await room.host.locator('.pawn-seat').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { seat: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height }; }));
      expect(new Set(badges.map(badge => `${Math.round(badge.x)},${Math.round(badge.y)}`)).size).toBe(8);
      for (const badge of badges) {
        const viewport = room.host.viewportSize()!;
        expect(badge.x).toBeGreaterThanOrEqual(0); expect(badge.y).toBeGreaterThanOrEqual(0);
        expect(badge.x + badge.width).toBeLessThanOrEqual(viewport.width); expect(badge.y + badge.height).toBeLessThanOrEqual(viewport.height);
      }
      for (let left = 0; left < badges.length; left++) for (let right = left + 1; right < badges.length; right++) {
        const a = badges[left]!, b = badges[right]!;
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapX * overlapY, `seat badges ${a.seat}/${b.seat} overlap`).toBeLessThan(a.width * a.height * .08);
      }
      if (stage === 'after') {
        expect(await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats().environment)).toBe(true);
        await samplePerformance(room.host, `${device}-crowd-high`);
        await room.host.getByTestId('presentation-settings').click();
        await room.host.getByLabel('低画质', { exact: true }).check();
        await room.host.getByRole('dialog', { name: '比赛菜单', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
        await settle(room.host);
        expect(await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats().shadows)).toBe(false);
        expect(await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats().environment)).toBe(false);
        await samplePerformance(room.host, `${device}-crowd-low`);
      }
      expect(room.errors).toEqual([]);
    } finally { await Promise.all(room.contexts.map(context => context.close())); }
  }
});

test('camera follows another player, returns to self, and manual view stays paused until reset', async ({ browser }) => {
  test.skip(stage === 'before', 'Baseline capture precedes interaction coverage.');
  const room = await pair(browser);
  try {
    await seed(room, ['coach', 'banana'], [0, 14], 1);
    const board = room.host.getByTestId('board-3d');
    await expect(board).toHaveAttribute('data-camera-state', 'self');
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect(board).toHaveAttribute('data-camera-state', 'action');
    await expect(board).toHaveAttribute('data-phase', 'move');
    await room.host.screenshot({ path: `${output}/toy-${stage}-follow-other-player.png` });
    await expect(board).toHaveAttribute('data-phase', 'idle'); await expect(board).toHaveAttribute('data-camera-state', 'self');
    await settle(room.host); const returned = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
    await room.host.mouse.move(650, 620); await room.host.mouse.down(); await room.host.mouse.move(780, 680, { steps: 8 }); await room.host.mouse.up();
    await expect(board).toHaveAttribute('data-camera-state', 'manual'); await settle(room.host);
    const dragged = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera()); expect(dragged.target).not.toEqual(returned.target);
    await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
    await expect(board).toHaveAttribute('data-camera-state', 'self'); await settle(room.host);
    const reset = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
    expect(Math.abs(reset.target[0]! - returned.target[0]!)).toBeLessThan(.05); expect(Math.abs(reset.target[2]! - returned.target[2]!)).toBeLessThan(.05);
    await capture(room.host, 'follow-returned-self', false); expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('eight racers use the extended start and receive a skippable one-time introduction', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final feature coverage after the start/introduction integration.');
  const room = await pair(browser);
  try {
    await room.host.evaluate(() => {
      const records: { at: number; state: string; targets: string }[] = [];
      (window as unknown as { __artIntro: typeof records }).__artIntro = records;
      const save = () => {
        const board = document.querySelector<HTMLElement>('[data-testid="board-3d"]'); if (!board) return;
        const next = { at: performance.now(), state: board.dataset.cameraState ?? '', targets: board.dataset.cameraTargetIds ?? '' };
        const previous = records.at(-1);
        if (!previous || previous.state !== next.state || previous.targets !== next.targets) records.push(next);
      };
      new MutationObserver(save).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-camera-state', 'data-camera-target-ids'] });
    });
    await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(0), 0, true);
    const board = room.host.getByTestId('board-3d');
    await expect(board).toHaveAttribute('data-camera-state', 'intro');
    await expect(room.host.getByRole('button', { name: '跳过选手介绍', exact: true })).toBeVisible();
    await room.host.screenshot({ path: `${output}/toy-${stage}-start-intro.png` });
    await expect(board).toHaveAttribute('data-camera-state', 'self', { timeout: 20000 });
    const records = await room.host.evaluate(() => (window as unknown as { __artIntro: { at: number; state: string; targets: string }[] }).__artIntro);
    const targets = [...new Set(records.filter(record => record.state === 'intro' && /^r\d$/.test(record.targets)).map(record => record.targets))];
    expect(targets).toEqual(Array.from({ length: 8 }, (_, index) => `r${index}`));
    writeFileSync(`${output}/toy-${stage}-start-intro-sequence.json`, JSON.stringify(records, null, 2));
    await capture(room.host, 'desktop-eight-start'); await layout(room.host);
    await room.host.getByRole('button', { name: '总览', exact: true }).click();
    await capture(room.host, 'desktop-eight-start-overview');
    await room.host.reload(); await expect(room.host.locator('.connection.is-online')).toBeVisible();
    await expect(board).toHaveAttribute('data-camera-state', 'self');
    await expect(room.host.getByRole('button', { name: '跳过选手介绍', exact: true })).toHaveCount(0);
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('finish arch leaves a controlled eight-racer crowd readable', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final stress screenshot at Finish.');
  const room = await pair(browser);
  try {
    // This visual stress state intentionally puts eight racers on Finish at
    // once; no game rule is changed to create the arrangement.
    await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(30), 0, true);
    await capture(room.host, 'desktop-eight-finish'); expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('mobile extended start keeps eight full-size racers visible and the real skip control returns home', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final feature coverage after the start/introduction integration.');
  const room = await pair(browser, true);
  try {
    await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(0), 0, true);
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'intro');
    await room.host.screenshot({ path: `${output}/toy-${stage}-mobile-start-intro.png` });
    const introduced = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
    expect(Math.atan2(introduced.position[0]! - introduced.target[0]!, introduced.position[2]! - introduced.target[2]!)).toBeCloseTo(-Math.PI / 4, 1);
    await room.host.getByRole('button', { name: '跳过选手介绍', exact: true }).click();
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'self');
    await capture(room.host, 'mobile-eight-start'); await layout(room.host);
    const returned = await room.host.evaluate(() => window.__ART_QA_SCENE__!.getCamera());
    expect(Math.atan2(returned.position[0]! - returned.target[0]!, returned.position[2]! - returned.target[2]!)).toBeCloseTo(0, 2);
    await room.host.getByRole('button', { name: '总览', exact: true }).click();
    await capture(room.host, 'mobile-eight-start-overview'); expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('wild spaces and confirmed score, trip, forward and backward effects remain clear in the running game', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final art review includes real UI triggers on the wild track.');
  const room = await pair(browser);
  try {
    await seed(room, ['coach', 'banana'], [6, 0], 1, false, 'wild', [1]);
    const board = room.host.getByTestId('board-3d');
    await room.host.getByRole('button', { name: '总览', exact: true }).click(); await capture(room.host, 'wild-specials-overview');
    await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect(board).toHaveAttribute('data-phase', 'score');
    await room.host.waitForTimeout(250);
    await room.host.screenshot({ path: `${output}/toy-${stage}-effect-score.png` });
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect(application.rooms.get(room.code).game.racers[1]!.position).toBe(1);
    expect(application.rooms.get(room.code).game.players[1]!.score).toBe(1);

    await seed(room, ['coach', 'banana'], [3, 9], 0, false, 'wild', [1]);
    await room.host.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect(board).toHaveAttribute('data-phase', 'trip');
    await room.host.waitForTimeout(250);
    await room.host.screenshot({ path: `${output}/toy-${stage}-effect-trip.png` });
    await expect(board).toHaveAttribute('data-phase', 'idle');
    expect(application.rooms.get(room.code).game.racers[0]!.position).toBe(5);
    expect(application.rooms.get(room.code).game.racers[0]!.tripped).toBe(true);

    for (const [position, destination, direction] of [[4, 10, 'forward'], [13, 12, 'backward']] as const) {
      await seed(room, ['coach', 'banana'], [0, position], 1, false, 'wild', [3]);
      await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
      await expect(room.host.getByTestId('skill-banner').locator('strong')).toHaveText(direction === 'forward' ? '箭头格 → 前进3格' : '箭头格 → 后退4格');
      await room.host.waitForTimeout(180);
      await room.host.screenshot({ path: `${output}/toy-${stage}-effect-${direction}.png` });
      await expect(board).toHaveAttribute('data-phase', 'idle');
      expect(application.rooms.get(room.code).game.racers[1]!.position).toBe(destination);
    }
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('reduced-motion intro holds the whole group once and immediately yields to play', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final introduction accessibility check.');
  const room = await pair(browser, true, true);
  try {
    await room.host.evaluate(() => {
      const samples: { at: number; state: string; targets: string }[] = [];
      (window as unknown as { __artReducedIntro: typeof samples }).__artReducedIntro = samples;
      new MutationObserver(() => {
        const board = document.querySelector<HTMLElement>('[data-testid="board-3d"]'); if (!board) return;
        const next = { at: performance.now(), state: board.dataset.cameraState ?? '', targets: board.dataset.cameraTargetIds ?? '' }, previous = samples.at(-1);
        if (!previous || previous.state !== next.state || previous.targets !== next.targets) samples.push(next);
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-camera-state', 'data-camera-target-ids'] });
    });
    await seed(room, ['coach', 'alchemist', 'legs', 'blimp', 'romantic', 'sisyphus', 'banana', 'skipper'], Array(8).fill(0), 0, true);
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-camera-state', 'self');
    const samples = await room.host.evaluate(() => (window as unknown as { __artReducedIntro: { at: number; state: string; targets: string }[] }).__artReducedIntro);
    const intro = samples.filter(sample => sample.state === 'intro');
    expect(intro.length).toBeGreaterThan(0); expect(intro.every(sample => sample.targets.split(',').length === 8)).toBe(true);
    writeFileSync(`${output}/toy-${stage}-reduced-intro-sequence.json`, JSON.stringify(samples, null, 2));
    await expect(room.host.getByRole('button', { name: '掷骰子', exact: true })).toBeEnabled(); expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('a failed GLB fetch preserves the running scene and retries into the real character models', async ({ browser }) => {
  test.skip(stage !== 'after', 'Final art asset recovery check.');
  const room = await pair(browser);
  let releaseRetry: (() => void) | undefined;
  const retryGate = new Promise<void>(resolve => { releaseRetry = resolve; });
  let requests = 0;
  try {
    await room.host.route('**/models/toy-racers.glb*', async route => {
      requests++;
      if (requests === 1) { await route.abort('failed'); return; }
      // Hold the subsequent successful request only until the real fallback
      // is captured. Both rendering states come from the shipped asset path.
      await retryGate;
      await route.continue();
    });
    await seed(room, ['coach', 'banana'], [0, 2]);
    await expect.poll(() => requests).toBeGreaterThanOrEqual(1);
    const board = room.host.getByTestId('board-3d');
    await expect(board.locator('.board-webgl canvas')).toBeVisible();
    await expect(room.host.getByText('3D 场景暂时无法显示', { exact: true })).toHaveCount(0);
    expect(await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats().loadedModels)).toBe(0);
    await room.host.getByRole('button', { name: '总览', exact: true }).click();
    await expect(board).toHaveAttribute('data-camera-state', 'overview');
    await room.host.getByRole('button', { name: '恢复默认视角', exact: true }).click();
    await settle(room.host);
    // Fit both sculptures in the same controlled camera before/after loading.
    await room.host.evaluate(() => {
      const api = window.__ART_QA_SCENE__!, pose = api.getCamera();
      pose.position[0]! += 2; pose.target[0]! += 2; pose.zoom = Math.min(pose.zoom, 85); api.setCamera(pose);
    });
    await capture(room.host, 'model-fetch-fallback');
    const fallback = await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats());
    const gameBefore = structuredClone(application.rooms.get(room.code).game);
    releaseRetry!();
    await expect.poll(() => room.host.evaluate(() => window.__ART_QA_SCENE__!.stats().loadedModels), { timeout: 15000 }).toBe(2);
    const recovered = await room.host.evaluate(() => window.__ART_QA_SCENE__!.stats());
    expect([...(recovered.loadedModelNames as string[])].sort()).toEqual(['toy_banana', 'toy_coach']);
    await capture(room.host, 'model-fetch-recovered');
    expect(application.rooms.get(room.code).game).toEqual(gameBefore);
    expect(requests).toBeGreaterThanOrEqual(2); expect(room.errors).toEqual([]);
    writeFileSync(`${output}/toy-${stage}-model-fetch-recovery.json`, JSON.stringify({ requests, fallback, recovered, pageErrors: room.errors }, null, 2));
  } finally { releaseRetry?.(); await Promise.all(room.contexts.map(context => context.close())); }
});
