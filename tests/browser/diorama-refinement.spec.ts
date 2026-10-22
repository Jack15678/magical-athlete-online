import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { createApplication } from '../../src/server/index.js';
import { resolveTasks } from '../../src/engine/index.js';
import type { GameState, Room } from '../../src/shared/types.js';

type Pose = { position: number[]; target: number[]; zoom: number; up: number[] };
type SceneApi = { getCamera(): Pose; setCamera(pose: Pose): void; render(): void; stats(): Record<string, unknown> };
declare global { interface Window { __ART_QA_SCENE__?: SceneApi } }
const stage = process.env.REFINEMENT_QA_STAGE ?? 'after';
const output = 'docs/qa/refinement-20261022';
test.use({ trace: 'off' });
test.skip(!process.env.REFINEMENT_QA_STAGE, 'Dedicated visual review: run node scripts/art-qa-build.mjs and set REFINEMENT_QA_STAGE.');
let application: ReturnType<typeof createApplication>, url: string;
test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  application = createApplication(':memory:');
  if(process.env.REFINEMENT_STATIC_DIR) {
    // Test-only static override keeps parallel production builds independent.
    const directory=resolve(process.env.REFINEMENT_STATIC_DIR);
    const stack=application.app.router.stack,offset=stack.length;
    application.app.use(express.static(directory,{index:false,maxAge:0,dotfiles:'allow'}));
    application.app.get('/{*path}',(request,response,next)=>request.path.startsWith('/api/')?next():response.sendFile(resolve(directory,'index.html'),{dotfiles:'allow'}));
    stack.unshift(...stack.splice(offset));
  }
  await new Promise<void>(resolve => application.http.listen(0, '127.0.0.1', resolve));
  const address = application.http.address();
  if (!address || typeof address === 'string') throw Error('No fixture server address.');
  url = `http://127.0.0.1:${address.port}`;
  console.log(`Art QA fixture server: ${url} (${stage})`);
});
test.afterAll(async () => { await application.close(); });

async function pair(browser: Browser, mobile = false, reducedMotion = false, record = false) {
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  for (let seat = 0; seat < 2; seat++) {
    const context = await browser.newContext({ viewport: mobile && seat === 0 ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, ...(record && seat === 0 ? {recordVideo:{dir:'.local/refinement-videos',size:{width:1440,height:900}}} : {}) });
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
    if(!process.env.REFINEMENT_PRODUCTION) {
      await expect.poll(() => page.evaluate(() => !!window.__ART_QA_SCENE__)).toBe(true);
      await expect.poll(() => page.evaluate(() => Number(window.__ART_QA_SCENE__?.stats().triangles))).toBeGreaterThan(100);
    }
  }
  await settle(room.host);
}
async function settle(page: Page) {
  await page.waitForTimeout(1400);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function capture(page: Page, name: string, savePose = true) {
  await settle(page);
  // Framing transitions ease over several demand-rendered frames. Capture
  // the final fitted panorama, not an intermediate zoom that still crops it.
  if(await page.getByTestId('board-3d').getAttribute('data-camera-state') === 'overview') {
    await page.evaluate(async()=>{
      let last=window.__ART_QA_SCENE__!.getCamera().zoom,stable=0;
      for(let i=0;i<80&&stable<3;i++) {
        await new Promise(resolve=>setTimeout(resolve,100));
        const next=window.__ART_QA_SCENE__!.getCamera().zoom;
        stable=Math.abs(next-last)<.006?stable+1:0;last=next;
      }
    });
  }
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
  test.skip(!!process.env.REFINEMENT_REFERENCE);
  test.skip(!!process.env.REFINEMENT_PRODUCTION);
  for (const mobile of process.env.REFINEMENT_QA_DEVICE === 'desktop' ? [false] : [false, true]) {
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
      if (stage === 'after') {
        await seed(room, ['banana','coach'], [1,4]);
        await capture(room.host, `${device}-banana-quality-sample`);
      }
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
        await capture(room.host, `${device}-crowd-low`);
        await samplePerformance(room.host, `${device}-crowd-low`);
      }
      expect(room.errors).toEqual([]);
    } finally { await Promise.all(room.contexts.map(context => context.close())); }
  }
});

test('refined skeletal toys load all new silhouettes and record actual move, skill and fall playback', async ({browser})=>{
  test.skip(!!process.env.REFINEMENT_REFERENCE);
  test.skip(!!process.env.REFINEMENT_PRODUCTION);
  test.skip(stage !== 'after');
  const room=await pair(browser,false,false,true);
  try {
    const groups=[
      ['extra-mile-cletus','extra-mile-witch-hazel','extra-mile-whisper','extra-mile-silly-goose','extra-mile-honey-pot','extra-mile-oddball','extra-mile-lazy-bones','extra-mile-snub'],
      ['leaf-catfish','leaf-dark-horse','leaf-kangaroo','leaf-race-car','leaf-triangle-man','leaf-spiteful-spirit','leaf-toucan','leaf-filmmaker'],
      ['leaf-philanthropist','lackey','extra-mile-thief','extra-mile-toll-troll','extra-mile-totally-fair-ref','blunderdog','overtaker','leaf-thespian'],
    ];
    for(let i=0;i<groups.length;i++) {
      await seed(room,groups[i]!,[2,3,4,5,6,7,8,9],0,true);
      await expect.poll(()=>room.host.evaluate(()=>window.__ART_QA_SCENE__!.stats().loadedModels)).toBe(8);
      await room.host.getByRole('button',{name:'总览',exact:true}).click();
      await capture(room.host,`new-pack-${i}-overview`); await samplePerformance(room.host,`new-pack-${i}`);
      await room.host.getByRole('button',{name:'恢复默认视角',exact:true}).click();
      await capture(room.host,`new-pack-${i}-self`);
    }
    // Actual UI roll on wild tile 4 -> 5 -> banana trip; logs and visual clips
    // share the real presentation queue rather than invoking a fake animation.
    await seed(room,['coach','banana'],[3,9],0,false,'wild',[1]);
    await room.host.getByRole('button',{name:'掷骰子',exact:true}).click();
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase','trip');
    await room.host.screenshot({path:`${output}/toy-after-actual-fall.png`});
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase','idle');
    await seed(room,['coach','banana'],[0,4],1,false,'wild',[3]);
    await room.guest.getByRole('button',{name:'掷骰子',exact:true}).click();
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase','move');
    await room.host.screenshot({path:`${output}/toy-after-actual-move.png`});
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-phase','idle');
    expect(room.errors).toEqual([]);
  } finally {
    const video=room.host.video(); await Promise.all(room.contexts.map(c=>c.close()));
    if(video) await video.saveAs(`${output}/actual-model-movement-skills-fall.webm`);
  }
});

test('production page shows the upright Triangle Man and completed model avatars',async({browser})=>{
  test.skip(!process.env.REFINEMENT_PRODUCTION);
  const room=await pair(browser);
  try {
    await seed(room,['leaf-triangle-man','leaf-race-car','extra-mile-heads','extra-mile-doctor-dice','leaf-dark-horse','extra-mile-whisper','leaf-toucan','extra-mile-silly-goose'],[2,3,4,5,6,7,8,9],0,true);
    await expect(room.host.getByTestId('board-3d')).toHaveAttribute('data-loaded-models','8');
    expect(await room.host.locator('.fan-avatar').count()).toBeGreaterThanOrEqual(8);
    await expect.poll(()=>room.host.locator('.fan-avatar').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth===192))).toBe(true);
    await room.host.waitForTimeout(1800);
    await room.host.screenshot({path:`${output}/toy-after-final-triangle-and-avatars.png`});
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(c=>c.close())); }
});

test('reference banana and first lane quality sample',async({browser})=>{
  test.skip(!process.env.REFINEMENT_REFERENCE);
  const room=await pair(browser);
  try{
    await seed(room,['banana','coach'],[1,4]);
    await expect.poll(()=>room.host.evaluate(()=>window.__ART_QA_SCENE__!.stats().loadedModels)).toBe(2);
    await capture(room.host,'reference-banana-lane-default');await samplePerformance(room.host,'reference-banana-lane');
    await room.host.evaluate(()=>{const api=window.__ART_QA_SCENE__!,pose=api.getCamera();pose.position=[pose.target[0]!+7,10,pose.target[2]!+12];pose.zoom=135;api.setCamera(pose);});
    await capture(room.host,'reference-banana-lane-closer');
    await seed(room,['banana','coach'],[0,4]);
    await room.host.getByRole('button',{name:'恢复默认视角',exact:true}).click();await settle(room.host);
    await room.host.evaluate(()=>{const api=window.__ART_QA_SCENE__!,pose=api.getCamera();pose.target[0]!+=1.4;pose.target[1]=.65;pose.position=[pose.target[0]!+7,11.65,pose.target[2]!+15];pose.zoom=110;api.setCamera(pose);});
    await capture(room.host,'reference-banana-complete-start-gate');
    await room.host.getByRole('button',{name:'总览',exact:true}).click();
    await capture(room.host,'reference-stadium-overview');expect(room.errors).toEqual([]);
  }finally{await Promise.all(room.contexts.map(c=>c.close()));}
});
