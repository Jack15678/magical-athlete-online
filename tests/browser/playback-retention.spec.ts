import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState, Room } from '../../src/shared/types.js';

let application: ReturnType<typeof createApplication>;
let url: string;
const output = 'test-results/animation-sequence';
test.beforeAll(async () => {
  application = createApplication(':memory:');
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('Missing test server address');
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(output, { recursive: true });
});
test.afterAll(async () => { await application.close(); });

async function pair(browser: Browser, fast = false) {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })));
  const errors: string[] = [];
  for (const context of contexts) await context.addInitScript(({ fast }) => {
    localStorage.setItem('magical-athlete:muted', 'true');
    localStorage.setItem('magical-athlete:low-quality', 'true');
    localStorage.setItem('magical-athlete:animation-speed', fast ? '4' : '1');
    localStorage.setItem('magical-athlete:reduced-motion', String(fast));
  }, { fast });
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page];
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await host.goto(url); await host.getByLabel('你的昵称').fill('动画顺序验收');
  await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
  await host.getByRole('button', { name: '创建房间，召集朋友', exact: true }).click();
  await expect(host.locator('.connection.is-online')).toBeVisible(); const code = host.url().split('/').at(-1)!;
  await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('对手');
  await guest.getByRole('button', { name: '加入这场胡闹', exact: true }).click();
  await expect(guest.locator('.connection.is-online')).toBeVisible();
  const ids = await Promise.all([host, guest].map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, code)));
  return { contexts, host, guest, code, ids, errors };
}
type Pair = Awaited<ReturnType<typeof pair>>;
function publish(saved: Room) {
  application.rooms.rooms.set(saved.code, saved); application.store.save(saved);
  for (const socket of application.io.sockets.sockets.values()) if (socket.data.identity?.roomCode === saved.code) socket.emit('snapshot', application.rooms.view(saved, socket.data.identity.playerId));
}
async function seed(room: Pair, duelAI = false) {
  const saved: Room = structuredClone(application.rooms.get(room.code));
  const characters = duelAI ? ['duelist', 'alchemist', 'coach', 'banana'] : ['coach', 'centaur', 'flip-flop', 'legs'];
  const positions = duelAI ? [5, 5, 20, 24] : [24, 2, 4, 6];
  const current = duelAI ? 0 : 1;
  if (duelAI) { saved.mode = 'ai'; saved.game.players[1]!.isAI = true; }
  const game: GameState = {
    phase: 'race', round: 1, track: 'mild', players: saved.game.players, deck: [], discard: [], turn: current, turnCount: 0, currentRacerId: `r${current}`,
    queue: [], logs: [], results: [], rngState: 1234, randomLog: [], flags: { testDice: duelAI ? [5, 2] : [6] },
    racers: characters.map((characterId, index) => ({ id: `r${index}`, playerId: room.ids[index % 2]!, characterId, position: positions[index]!, tripped: false, finished: false, eliminated: false, flags: {} })),
  };
  if (duelAI) game.mode = 'ai';
  game.queue.push({ kind: 'beginTurn', racerId: `r${current}` }); resolveTasks(game);
  saved.game = game; saved.version++; saved.deadline = null; publish(saved);
  for (const page of [room.host, room.guest]) {
    await expect(page.getByTestId('board-3d')).toBeVisible();
    await expect.poll(async () => Number(await page.getByTestId('board-3d').getAttribute('data-triangles'))).toBeGreaterThan(100);
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
  }
}
interface Record { phase: string; events: string; choice: boolean; at: number }
async function record(page: Page) {
  await page.evaluate(() => {
    const scope = window as unknown as { __sequenceRecords: Record[]; __sequenceObserver?: MutationObserver };
    scope.__sequenceObserver?.disconnect(); scope.__sequenceRecords = [];
    const save = () => {
      const board = document.querySelector('[data-testid="board-3d"]');
      const next = { phase: board?.getAttribute('data-phase') ?? '', events: board?.getAttribute('data-event-ids') ?? '', choice: !!document.querySelector('.choice-panel'), at: performance.now() };
      const previous = scope.__sequenceRecords.at(-1);
      if (!previous || next.phase !== previous.phase || next.events !== previous.events || next.choice !== previous.choice) scope.__sequenceRecords.push(next);
    };
    scope.__sequenceObserver = new MutationObserver(save);
    scope.__sequenceObserver.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-phase', 'data-event-ids'] }); save();
  });
}
async function records(page: Page) { return page.evaluate(() => (window as unknown as { __sequenceRecords: Record[] }).__sequenceRecords); }
function assertSkillsReadable(observed: Record[], minimum = 1500) {
  const skills = observed.flatMap((value, index) => value.phase === 'skill' && observed[index - 1]?.events !== value.events ? [{ value, end: observed.slice(index + 1).find(next => next.events !== value.events || next.phase !== 'skill') }] : []);
  expect(skills.length).toBeGreaterThan(0);
  for (const { value, end } of skills) { expect(end).toBeDefined(); expect(end!.at - value.at).toBeGreaterThanOrEqual(minimum - 30); }
  return skills.map(({ value, end }) => ({ events: value.events, durationMs: end!.at - value.at }));
}

for (const fast of [false, true]) test(`pending and frequent snapshots retain every confirmed beat; skills stay readable at ${fast ? '4x reduced motion' : 'default speed'}`, async ({ browser }) => {
  const room = await pair(browser, fast);
  try {
    await seed(room); await record(room.host);
    await room.guest.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect.poll(() => application.rooms.get(room.code).game.pending?.kind).toBe('flip-flop');
    // The authority has already reached our next choice while the client is
    // still watching the preceding action. It must not erase that action.
    await expect.poll(async () => (await records(room.host)).some(value => value.phase === 'dice')).toBe(true);
    expect(await room.host.getByRole('region', { name: '待处理技能' }).count()).toBe(0);
    const confirmed = structuredClone(application.rooms.get(room.code));
    const required = confirmed.game.logs.filter(event => ['die', 'move', 'power'].includes(event.type));
    expect(required.filter(event => event.type === 'power').length).toBeGreaterThan(0);
    // A burst of real projected snapshots exercises duplicate-version delivery
    // while the original timer and its subsequent skill beats are running.
    for (let index = 0; index < 20; index++) {
      const next = structuredClone(application.rooms.get(room.code)); next.version++; publish(next);
      await room.host.waitForTimeout(25);
    }
    await expect(room.host.getByRole('region', { name: '待处理技能' })).toBeVisible({ timeout: 30_000 });
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle');
    const observed = await records(room.host);
    const shown = observed.filter((value, index) => value.events && value.phase !== 'idle' && observed[index - 1]?.events !== value.events);
    expect(shown.flatMap(value => value.events.split(',').map(Number))).toEqual(required.map(event => event.id));
    expect(observed.filter(value => value.phase !== 'idle').every(value => !value.choice)).toBe(true);
    expect(shown[0]?.phase).toBe('dice');
    const skillDurations = assertSkillsReadable(observed);
    expect(application.rooms.get(room.code).game).toEqual(confirmed.game);
    const prefix = fast ? 'fast-reduced' : 'default';
    await room.host.screenshot({ path: `${output}/${prefix}-pending-after-chain.png` });
    writeFileSync(`${output}/${prefix}-events.json`, JSON.stringify({ required, observed, skillDurations, errors: room.errors }, null, 2));
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('a human initiates a duel once and the AI rolls its own die before paired results and movement', async ({ browser }) => {
  const room = await pair(browser);
  try {
    await seed(room, true); await record(room.host);
    let pending = application.rooms.get(room.code).game.pending!;
    await room.host.getByRole('region', { name: '待处理技能' }).getByRole('button', { name: pending.options.find(option => option.id === 'r1')!.label, exact: true }).click();
    await expect.poll(() => application.rooms.get(room.code).game.pending?.kind).toBe('duel-roll');
    await room.host.getByRole('button', { name: '掷决斗骰', exact: true }).click();
    await expect.poll(() => application.rooms.get(room.code).game.randomLog.length).toBe(1);
    expect(application.rooms.get(room.code).game.logs.some(event => event.type === 'duel-dice')).toBe(false);
    expect(application.rooms.get(room.code).game.pending?.playerId).toBe(room.ids[1]);
    // No click is made in the guest context: authority scheduling handles AI.
    await expect.poll(() => application.rooms.get(room.code).game.logs.find(event => event.type === 'duel-dice')?.faces, { timeout: 5000 }).toEqual([5, 2]);
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'duel-dice');
    await expect(room.host.locator('.dice-spotlight')).toHaveAttribute('data-dice-mode', 'duel');
    await expect(room.host.locator('.dice-spotlight')).toHaveAttribute('data-up-faces', '5,2');
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase', 'idle', { timeout: 30_000 });
    await expect(room.host.locator('[data-testid="scene-racer"][data-racer-id="r0"]')).toHaveAttribute('data-position', '7');
    const observed = await records(room.host), phases = observed.filter((value, index) => value.phase !== 'idle' && value.events !== observed[index - 1]?.events);
    expect(phases.map(value => value.phase)).toEqual(['duel-dice', 'skill', 'skill', 'move']);
    assertSkillsReadable(observed);
    expect(application.rooms.get(room.code).game.randomLog).toHaveLength(2);
    await room.host.screenshot({ path: `${output}/duel-human-ai-complete.png` });
    writeFileSync(`${output}/duel-human-ai-events.json`, JSON.stringify({ observed, logs: application.rooms.get(room.code).game.logs, errors: room.errors }, null, 2));
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});
