import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Room } from '../../src/shared/types.js';

const url = process.env.RELAY_URL ?? 'http://127.0.0.1:8787';

async function saved(page: Page, code: string): Promise<Room> {
  return JSON.parse(await page.evaluate(async code => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('magical-athlete-browser-authority-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('rooms').objectStore('rooms').get(code); request.onsuccess = () => resolve(JSON.stringify(request.result.room)); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  }, code)) as Room;
}
async function synced(page: Page, version: number) {
  await expect.poll(async () => Number(await page.locator('.game-shell').getAttribute('data-room-version'))).toBeGreaterThanOrEqual(version);
}

async function pair(browser: Browser, mobileHost = false) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const errors: string[] = [];
  const closeRequests: number[] = [0, 0];
  try {
    for (let seat = 0; seat < 2; seat++) {
      const context = await browser.newContext({ viewport: seat === 0 && mobileHost ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.stack ?? error.message));
      page.on('websocket', socket => socket.on('framesent', frame => { try { const message = JSON.parse(String(frame.payload)); if (message.type === 'action' && message.envelope.action.type === 'close') closeRequests[seat] = closeRequests[seat]! + 1; } catch { /* Raw ping frames are outside the action protocol. */ } }));
    }
    const [host, guest] = pages as [Page, Page];
    await host.goto(url); await host.getByLabel('你的昵称').fill('解散房主'); await host.getByLabel('房间人数上限').selectOption('2'); await host.getByLabel('每次操作时限').selectOption('0');
    await host.getByRole('button', { name: '创建房间，召集朋友' }).click(); await expect(host.locator('.connection.is-online')).toBeVisible();
    const code = host.url().split('/').at(-1)!;
    await guest.goto(`${url}/room/${code}`); await guest.getByLabel('你的昵称').fill('解散访客'); await guest.getByRole('button', { name: '加入这场胡闹' }).click(); await expect(guest.locator('.connection.is-online')).toBeVisible();
    await expect(host.getByText('解散访客', { exact: true })).toBeVisible();
    return { contexts, pages: [host, guest] as [Page, Page], code, errors, closeRequests };
  } catch (error) { await Promise.all(contexts.map(context => context.close())); throw error; }
}

async function expectClosed(page: Page) {
  await expect(page.getByRole('heading', { name: '房间已解散', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '结束房间', exact: true })).toHaveCount(0);
  await expect(page.locator('.game-shell')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /重新连接|立即重连|重新同步/ })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('close: lobby confirmation can cancel, management transfer applies, and both players leave permanently', async ({ browser }) => {
  const room = await pair(browser, true); const [host, guest] = room.pages;
  try {
    const end = host.getByRole('button', { name: '结束房间', exact: true });
    await end.scrollIntoViewIfNeeded();
    await expect(end).toBeInViewport(); expect((await end.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await expect(guest.getByRole('button', { name: '结束房间', exact: true })).toHaveCount(0);
    await end.click(); const dialog = host.getByRole('dialog', { name: '结束此房间？', exact: true });
    await expect(dialog).toBeInViewport(); await expect(dialog.getByText(/所有玩家都会退出/)).toBeVisible(); await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(dialog).toHaveCount(0);
    expect(room.closeRequests).toEqual([0, 0]); await expect(end).toBeEnabled();

    await host.getByText('转交房主', { exact: true }).click(); await host.getByRole('button', { name: '交给 解散访客', exact: true }).click();
    await expect(end).toHaveCount(0); await expect(guest.getByRole('button', { name: '结束房间', exact: true })).toBeEnabled();
    await guest.getByRole('button', { name: '结束房间', exact: true }).click(); await guest.getByRole('dialog', { name: '结束此房间？' }).getByRole('button', { name: '确认结束', exact: true }).click();
    await Promise.all(room.pages.map(expectClosed)); expect(room.closeRequests).toEqual([0, 1]);
    await host.reload(); await expectClosed(host);
    const joined = await guest.request.post(`${url}/api/browser/rooms/${room.code}/join`, { data: { name: '旧链接访客' } }); expect(joined.status()).toBe(410);
    await guest.getByRole('button', { name: '返回首页', exact: true }).click(); await expect(guest.getByRole('button', { name: '创建房间，召集朋友' })).toBeVisible();
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});

test('close: the management host can dissolve an active race without rolling or completing a game', async ({ browser }) => {
  const room = await pair(browser); const [host, guest] = room.pages;
  try {
    for (const page of room.pages) { await synced(page, (await saved(host, room.code)).version); await page.getByRole('button', { name: '我准备好了', exact: true }).click(); await expect(page.getByRole('button', { name: '取消准备', exact: true })).toBeVisible(); }
    const ids = await Promise.all(room.pages.map(page => page.evaluate(code => JSON.parse(localStorage.getItem(`magical-athlete:identity:${code}`)!).playerId as string, room.code)));
    await synced(host, (await saved(host, room.code)).version); await host.getByRole('button', { name: '开始选秀', exact: true }).click(); await expect.poll(async () => (await saved(host, room.code)).game.phase).toBe('draft');
    while ((await saved(host, room.code)).game.phase === 'draft') {
      const draft = (await saved(host, room.code)).game.draft!; const picker = room.pages[ids.indexOf(draft.order[draft.cursor]!)]!;
      await synced(picker, (await saved(host, room.code)).version);
      await picker.locator('.character-grid .character-art:not([disabled])').first().click(); await picker.getByRole('button', { name: /^确认选择/ }).click();
      await expect.poll(async () => (await saved(host, room.code)).game.draft?.cursor ?? -1).not.toBe(draft.cursor);
    }
    for (const page of room.pages) {
      await synced(page, (await saved(host, room.code)).version);
      await expect(page.locator('.hand-selection')).toBeVisible();
      for (let count = 0; count < 2; count++) await page.locator('.hand-selection .character-art[aria-pressed="false"]:not([disabled])').first().click();
      await page.getByRole('button', { name: '锁定上场角色', exact: true }).click();
      const selfId = ids[room.pages.indexOf(page)]!;
      await expect.poll(async () => { const game = (await saved(host, room.code)).game; return game.phase === 'selection' ? game.players.find(player => player.id === selfId)!.selection.length : 2; }).toBe(2);
    }
    await expect(host.getByRole('heading', { name: '比赛进行中', exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: '结束房间', exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: '结束房间', exact: true }).click(); await host.getByRole('dialog', { name: '结束此房间？' }).getByRole('button', { name: '确认结束', exact: true }).click();
    await Promise.all(room.pages.map(expectClosed)); expect(room.closeRequests).toEqual([1, 0]);
    await guest.reload(); await expectClosed(guest); await host.getByRole('button', { name: '返回首页', exact: true }).click(); await expect(host.getByRole('button', { name: '创建房间，召集朋友' })).toBeVisible();
    expect(room.errors).toEqual([]);
  } finally { await Promise.all(room.contexts.map(context => context.close())); }
});
