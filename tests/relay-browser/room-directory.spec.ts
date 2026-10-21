import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Identity, Room, RoomView } from '../../src/shared/types.js';

const url = process.env.RELAY_URL ?? 'http://127.0.0.1:8787';

async function saved(page: Page, code: string): Promise<Room> {
  return JSON.parse(await page.evaluate(async code => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('magical-athlete-browser-authority-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('rooms').objectStore('rooms').get(code); request.onsuccess = () => resolve(JSON.stringify(request.result.room)); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  }, code)) as Room;
}
async function identity(page: Page, code: string): Promise<Identity> {
  return page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!), code);
}
async function synced(page: Page, version: number) {
  await expect.poll(async () => Number(await page.locator('.game-shell').getAttribute('data-room-version'))).toBeGreaterThanOrEqual(version);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function directory(page: Page, name: string) {
  await page.goto(url); await page.getByRole('tab', { name: '加入朋友', exact: true }).click(); await page.getByLabel('你的昵称').fill(name);
  await expect(page.getByRole('region', { name: '现有房间', exact: true })).toBeVisible();
}
async function refresh(page: Page) {
  const button = page.getByRole('button', { name: '刷新列表', exact: true }); await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeEnabled();
}
async function roomPeers(browser: Browser) {
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [], viewerSnapshots: RoomView[] = [];
  try {
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: index === 2 ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1 }); contexts.push(context);
      await context.addInitScript(() => { try { localStorage.setItem('magical-athlete:muted', 'true'); localStorage.setItem('magical-athlete:low-quality', 'true'); localStorage.setItem('magical-athlete:animation-speed', '4'); localStorage.setItem('magical-athlete:reduced-motion', 'true'); } catch { /* Initial opaque page. */ } });
      const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.stack ?? error.message));
      if (index === 2) page.on('websocket', socket => socket.on('framereceived', frame => {
        try { const message = JSON.parse(String(frame.payload)); if (message.type === 'snapshot') viewerSnapshots.push(message.room); } catch { /* Raw heartbeat frames. */ }
      }));
    }
    const [host, guest, viewer] = pages as [Page, Page, Page];
    await host.goto(url); await host.getByLabel('你的昵称').fill('目录房主'); await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
    await host.getByRole('button', { name: '创建房间，召集朋友', exact: true }).click(); await expect(host.locator('.connection.is-online')).toBeVisible();
    const code = host.url().split('/').at(-1)!;
    await directory(guest, '目录选手'); const guestRow = guest.getByTestId(`directory-room-${code}`); await expect(guestRow).toContainText('1 / 2 位选手'); await guestRow.getByRole('button', { name: '加入房间', exact: true }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
    await directory(viewer, '手机观众'); const viewerRow = viewer.getByTestId(`directory-room-${code}`); await expect(viewerRow).toContainText('2 / 2 位选手'); await expect(viewerRow.getByRole('button', { name: '已满员', exact: true })).toBeDisabled(); await noOverflow(viewer);
    await viewerRow.getByRole('button', { name: '观战', exact: true }).click(); await expect(viewer.locator('.connection.is-online')).toBeVisible(); await expect(viewer.locator('.spectator-badge')).toHaveText('正在观战');
    return { contexts, pages: [host, guest, viewer] as [Page, Page, Page], code, errors, viewerSnapshots };
  } catch (error) { await Promise.all(contexts.map(context => context.close())); throw error; }
}

test('directory: full lobby spectating, explicit departures, seat reuse and fresh viewer credentials work on mobile', async ({ browser }, testInfo) => {
  const peers = await roomPeers(browser), [host, guest, viewer] = peers.pages;
  try {
    const guestBefore = await identity(guest, peers.code), viewerBefore = await identity(viewer, peers.code);
    await synced(viewer, (await saved(host, peers.code)).version);
    expect((await saved(host, peers.code)).game.players).toHaveLength(2); expect((await saved(host, peers.code)).spectators).toHaveLength(1);
    await expect(viewer.getByRole('button', { name: /我准备好了|开始选秀|结束房间/ })).toHaveCount(0); await noOverflow(viewer);
    await viewer.screenshot({ path: testInfo.outputPath('spectator-lobby-mobile.png'), fullPage: true });
    await viewer.getByRole('button', { name: '退出观看', exact: true }).click(); await expect(viewer).toHaveURL(`${url}/`);
    await expect.poll(async () => (await saved(host, peers.code)).spectators?.length).toBe(0);
    expect(await viewer.evaluate(code => localStorage.getItem(`magical-athlete:identity:${code}:spectator`), peers.code)).toBeNull();
    await guest.getByRole('button', { name: '退出房间', exact: true }).click(); await expect(guest).toHaveURL(`${url}/`); await expect.poll(async () => (await saved(host, peers.code)).game.players.length).toBe(1);
    await viewer.getByRole('tab', { name: '加入朋友', exact: true }).click(); const row = viewer.getByTestId(`directory-room-${peers.code}`); await expect(row).toContainText('1 / 2 位选手'); await expect(row).toContainText('0 人观战'); await noOverflow(viewer);
    await viewer.screenshot({ path: testInfo.outputPath('directory-mobile.png'), fullPage: true });
    await guest.getByRole('tab', { name: '加入朋友', exact: true }).click(); await guest.getByTestId(`directory-room-${peers.code}`).getByRole('button', { name: '加入房间', exact: true }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
    const guestAfter = await identity(guest, peers.code); expect(guestAfter.playerId).not.toBe(guestBefore.playerId); expect((await saved(host, peers.code)).game.players.find(player => player.id === guestAfter.playerId)?.seat).toBe(1);
    await refresh(viewer); await expect(row).toContainText('2 / 2 位选手'); await row.getByRole('button', { name: '观战', exact: true }).click(); await expect(viewer.locator('.connection.is-online')).toBeVisible();
    const viewerAfter = await identity(viewer, peers.code); expect(viewerAfter.role).toBe('spectator'); expect(viewerAfter.playerId).not.toBe(viewerBefore.playerId); expect(viewerAfter.token).not.toBe(viewerBefore.token); expect((await saved(host, peers.code)).game.players).toHaveLength(2);
    expect(peers.errors).toEqual([]);
  } finally { await Promise.all(peers.contexts.map(context => context.close())); }
});

test('spectating: public draft, hidden deployment, live 3D race and active-match re-entry stay read-only', async ({ browser }, testInfo) => {
  const peers = await roomPeers(browser), [host, guest, viewer] = peers.pages;
  try {
    const ids = await Promise.all([host, guest].map(async page => (await identity(page, peers.code)).playerId));
    for (const page of [host, guest]) { await synced(page, (await saved(host, peers.code)).version); await page.getByRole('button', { name: '我准备好了', exact: true }).click(); await expect(page.getByRole('button', { name: '取消准备', exact: true })).toBeVisible(); }
    await synced(host, (await saved(host, peers.code)).version); await host.getByRole('button', { name: '开始选秀', exact: true }).click(); await expect.poll(async () => (await saved(host, peers.code)).game.phase).toBe('draft');
    await synced(viewer, (await saved(host, peers.code)).version); await expect(viewer.locator('.draft-order')).toBeVisible(); await expect(viewer.locator('.character-grid .character-art:not([disabled])')).toHaveCount(0);
    while ((await saved(host, peers.code)).game.phase === 'draft') {
      const room = await saved(host, peers.code), draft = room.game.draft!; const picker = peers.pages[ids.indexOf(draft.order[draft.cursor]!)]!;
      await synced(picker, room.version); await picker.locator('.character-grid .character-art:not([disabled])').first().click(); await picker.getByRole('button', { name: /^确认选择/ }).click();
      await expect.poll(async () => (await saved(host, peers.code)).game.draft?.cursor ?? -1).not.toBe(draft.cursor);
    }
    await synced(viewer, (await saved(host, peers.code)).version); await expect(viewer.getByText('选手正在秘密选择上场角色', { exact: false })).toBeVisible(); await expect(viewer.locator('.hand-selection')).toHaveCount(0); await expect(viewer.getByRole('button', { name: '锁定上场角色', exact: true })).toHaveCount(0);
    expect(peers.viewerSnapshots.length).toBeGreaterThan(0); for (const snapshot of peers.viewerSnapshots) { expect(snapshot.role).toBe('spectator'); expect(snapshot.pending).toBeUndefined(); for (const player of snapshot.players) { expect(player.hand).toBeUndefined(); expect(player.selection).toBeUndefined(); } }
    for (const page of [host, guest]) {
      await synced(page, (await saved(host, peers.code)).version); for (let count = 0; count < 2; count++) await page.locator('.hand-selection .character-art[aria-pressed="false"]:not([disabled])').first().click();
      await page.getByRole('button', { name: '锁定上场角色', exact: true }).click(); const selfId = ids[[host, guest].indexOf(page)]!;
      await expect.poll(async () => { const game = (await saved(host, peers.code)).game; return game.phase === 'selection' ? game.players.find(player => player.id === selfId)!.selection.length : 2; }).toBe(2);
    }
    await expect(viewer.getByTestId('board-3d').locator('.board-webgl canvas')).toBeVisible(); await expect(viewer.getByTestId('scene-racer')).toHaveCount(4); await expect(viewer.getByTestId('roll-button')).toHaveCount(0); await noOverflow(viewer);
    await viewer.screenshot({ path: testInfo.outputPath('spectator-race-mobile.png') }); const firstViewer = await identity(viewer, peers.code);
    await viewer.getByTestId('presentation-settings').click(); await viewer.locator('.race-menu-links').getByRole('button', { name: '退出观看', exact: true }).click(); await expect(viewer).toHaveURL(`${url}/`);
    await viewer.getByRole('tab', { name: '加入朋友', exact: true }).click(); const row = viewer.getByTestId(`directory-room-${peers.code}`); await expect(row.getByRole('button', { name: '已开赛', exact: true })).toBeDisabled(); await row.getByRole('button', { name: '观战', exact: true }).click();
    await expect(viewer.getByTestId('board-3d').locator('.board-webgl canvas')).toBeVisible(); expect((await identity(viewer, peers.code)).token).not.toBe(firstViewer.token); await expect(viewer.getByTestId('roll-button')).toHaveCount(0); await noOverflow(viewer);
    await expect.poll(async () => { const game = (await saved(host, peers.code)).game; return !!game.pending || !!game.flags.awaitRoll; }).toBe(true);
    const room = await saved(host, peers.code), game = room.game;
    if (game.pending) {
      const actor = peers.pages[ids.indexOf(game.pending.playerId)]!; await synced(actor, room.version); const option = game.pending.options.find(option => ['skip', 'pass', 'decline'].includes(option.id)) ?? game.pending.options[0]!;
      await actor.getByRole('region', { name: '待处理技能' }).getByRole('button', { name: option.label, exact: true }).click();
    } else {
      const actor = peers.pages[ids.indexOf(game.racers.find(racer => racer.id === game.currentRacerId)!.playerId)]!; await synced(actor, room.version); await actor.getByRole('button', { name: '掷骰子', exact: true }).click();
    }
    await expect.poll(async () => (await saved(host, peers.code)).version).toBeGreaterThan(room.version); await synced(viewer, (await saved(host, peers.code)).version); expect(peers.errors).toEqual([]);
  } finally { await Promise.all(peers.contexts.map(context => context.close())); }
});

test('same browser: watching in another tab preserves the host authority and original player credentials', async ({ browser }) => {
  const peers = await roomPeers(browser), [host] = peers.pages;
  try {
    const player = await identity(host, peers.code), observer = await peers.contexts[0]!.newPage(); observer.on('pageerror', error => peers.errors.push(error.stack ?? error.message));
    await directory(observer, '同浏览器观众'); await observer.getByTestId(`directory-room-${peers.code}`).getByRole('button', { name: '观战', exact: true }).click(); await expect(observer.locator('.connection.is-online')).toBeVisible();
    const watching = await identity(observer, peers.code); expect(watching.role).toBe('spectator'); expect(watching.playerId).not.toBe(player.playerId);
    await expect(host.locator('.connection.is-online')).toBeVisible(); await expect(host.getByRole('button', { name: '开始选秀', exact: true })).toBeVisible();
    const room = await saved(host, peers.code); expect(room.hostId).toBe(player.playerId); expect(room.game.players).toHaveLength(2); expect(room.game.players.find(person => person.id === player.playerId)?.connected).toBe(true);
    expect(await observer.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}:player`)!), peers.code)).toEqual(player);
    await observer.getByRole('button', { name: '退出观看', exact: true }).click(); await expect(observer).toHaveURL(`${url}/`);
    expect(await observer.evaluate(code => localStorage.getItem(`magical-athlete:identity:${code}:spectator`), peers.code)).toBeNull();
    expect(await observer.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}:player`)!), peers.code)).toEqual(player); await expect(host.locator('.connection.is-online')).toBeVisible();
    await observer.getByRole('tab', { name: '加入朋友', exact: true }).click(); await observer.getByTestId(`directory-room-${peers.code}`).getByRole('button', { name: '返回房间', exact: true }).click(); await expect(observer.locator('.connection.is-online')).toBeVisible();
    expect(await identity(observer, peers.code)).toEqual(player); await expect(observer.getByRole('button', { name: '我准备好了', exact: true })).toBeVisible(); expect((await saved(host, peers.code)).game.players).toHaveLength(2); expect(peers.errors).toEqual([]);
  } finally { await Promise.all(peers.contexts.map(context => context.close())); }
});

test('spectators can exit while offline and return with their retained viewing identity', async ({ browser }) => {
  const peers = await roomPeers(browser), viewer = peers.pages[2];
  try {
    const before = await identity(viewer, peers.code);
    await peers.contexts[2]!.setOffline(true);
    await viewer.getByRole('button', { name: '退出观看', exact: true }).click(); await expect(viewer).toHaveURL(`${url}/`);
    expect(await identity(viewer, peers.code)).toEqual(before);
    await peers.contexts[2]!.setOffline(false);
    await viewer.getByRole('tab', { name: '加入朋友', exact: true }).click();
    await viewer.getByTestId(`directory-room-${peers.code}`).getByRole('button', { name: '观战', exact: true }).click();
    await expect(viewer.locator('.connection.is-online')).toBeVisible(); expect(await identity(viewer, peers.code)).toEqual(before);
    expect(peers.errors).toEqual([]);
  } finally { await Promise.all(peers.contexts.map(context => context.close())); }
});
