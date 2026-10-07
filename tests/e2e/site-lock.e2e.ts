import { expect, test, type BrowserContext, type CDPSession, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

const page = (host: string) => `<!doctype html><title>${host}</title><button id="b" style="position:fixed;top:0;right:0;width:400px;height:200px">${host}</button>`;

async function setup() {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const offHost: string[] = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.host.endsWith('study-duo.test') || url.host === 'intranet') return route.fulfill({ contentType: 'text/html', body: page(url.host) });
    offHost.push(url.href);
    return route.abort();
  });
  return { profile, ctx, sw, offHost };
}

async function startBlock(ctx: BrowserContext, sw: Worker) {
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.close();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('timer')).timer?.status)).toBe('running');
}

/** The overlay lives in a closed shadow root; DevTools protocol can still reach it. */
async function shadow(p: Page) {
  const cdp: CDPSession = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable');
  const call = async (cls: string, fn: string) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack: any[] = [root];
    let id: number | null = null;
    while (stack.length && id === null) {
      const n = stack.pop();
      const a: string[] = n.attributes ?? [];
      const i = a.indexOf('class');
      if (i >= 0 && a[i + 1]!.split(' ').includes(cls)) id = n.nodeId;
      stack.push(...(n.children ?? []), ...(n.shadowRoots ?? []));
    }
    if (id === null) return null;
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: id });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, functionDeclaration: fn, returnByValue: true });
    return result.value;
  };
  return {
    shown: (cls: string) => call(cls, 'function () { return getComputedStyle(this).display !== "none"; }'),
    text: (cls: string) => call(cls, 'function () { return this.textContent; }'),
    rect: (cls: string) => call(cls, 'function () { const r = this.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }'),
    dispatchClick: (cls: string) => call(cls, 'function () { this.click(); }'),
  };
}

test('asks once about an unfiled site and files it from the prompt', async () => {
  const { profile, ctx, sw, offHost } = await setup();
  const p = await ctx.newPage();
  await p.goto('https://learn.study-duo.test/');
  await startBlock(ctx, sw);
  await p.bringToFront();
  const dom = await shadow(p);

  await expect.poll(() => dom.shown('prompt'), { timeout: 5_000 }).toBe(true);
  expect(await dom.text('prompt-domain')).toBe('learn.study-duo.test');

  // A synthetic click from the page does nothing; only a real click files the site.
  await dom.dispatchClick('choice-study');
  await p.waitForTimeout(300);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('sites')).sites ?? {})).toEqual({});

  const r = (await dom.rect('choice-study'))!;
  await p.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('sites')).sites)).toEqual({ 'learn.study-duo.test': 'study' });
  await expect.poll(() => dom.shown('prompt')).toBe(false);

  await p.reload();
  const again = await shadow(p);
  await expect.poll(() => again.shown('clock')).toBe(true);
  expect(await again.shown('prompt')).toBe(false);

  expect(offHost).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

const sitesIn = (sw: Worker) => sw.evaluate(async () => (await chrome.storage.local.get('sites')).sites ?? {});
const BLOCKED = `chrome-extension://${EXT_ID}/blocked.html#`;

async function fileThroughSettings(ctx: BrowserContext) {
  const s = await ctx.newPage();
  await s.goto(`chrome-extension://${EXT_ID}/dashboard.html`);
  const add = async (list: number, domain: string) => {
    await s.getByRole('button', { name: 'Add' }).nth(list).click();
    await s.keyboard.type(domain);
    await s.keyboard.press('Enter');
    await expect(s.getByRole('button', { name: domain, exact: true })).toBeVisible();
  };
  await add(0, 'video.study-duo.test');
  await add(0, 'music.video.study-duo.test');
  await s.getByRole('button', { name: 'music.video.study-duo.test', exact: true }).click();
  await s.getByRole('menuitem', { name: 'Move to Not blocked' }).click();
  await add(1, 'learn.study-duo.test');
  await add(2, 'gone.study-duo.test');
  await s.getByRole('button', { name: 'Remove gone.study-duo.test' }).click();
  return s;
}

test('closes Blocked sites during a block, keeps exceptions open, and opens everything in the break', async () => {
  const { profile, ctx, sw, offHost } = await setup();
  const settings = await fileThroughSettings(ctx);
  expect(await sitesIn(sw)).toEqual({ 'video.study-duo.test': 'blocked', 'music.video.study-duo.test': 'neutral', 'learn.study-duo.test': 'study' });

  const open = await ctx.newPage();
  await open.goto('https://video.study-duo.test/already-open?t=1');
  await startBlock(ctx, sw);
  await expect.poll(() => open.url(), { timeout: 10_000 }).toBe(`${BLOCKED}https://video.study-duo.test/already-open?t=1`);
  await expect(open.getByRole('heading', { name: 'video.study-duo.test is closed' })).toBeVisible();

  const p = await ctx.newPage();
  await p.goto('https://www.video.study-duo.test/watch').catch(() => undefined);
  await expect.poll(() => p.url()).toContain(`${BLOCKED}https://www.video.study-duo.test/watch`);
  for (const host of ['music.video.study-duo.test', 'learn.study-duo.test', 'other.study-duo.test']) {
    await p.goto(`https://${host}/`);
    expect(p.url(), host).toBe(`https://${host}/`);
  }

  // Allow only Study: unfiled sites close too; Study and Not blocked stay open.
  await settings.getByRole('radio', { name: 'Allow only Study' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).some((r: any) => r.priority === 1))).toBe(true);
  await p.goto('https://other.study-duo.test/').catch(() => undefined);
  await expect.poll(() => p.url()).toContain(`${BLOCKED}https://other.study-duo.test/`);
  await p.goto('https://learn.study-duo.test/');
  expect(p.url()).toBe('https://learn.study-duo.test/');
  // Intranet names, localhost and IP addresses cannot be filed, so Allow only Study leaves them open.
  await p.goto('http://intranet/wiki');
  expect(p.url()).toBe('http://intranet/wiki');

  // Framed inside someone else's page, the blocked page shows no buttons at all.
  await p.setContent(`<iframe src="${BLOCKED}https://video.study-duo.test/"></iframe>`);
  const frame = p.frameLocator('iframe');
  await p.waitForTimeout(500);
  expect(await frame.locator('button').count()).toBe(0);

  // The break opens everything.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBe(0);
  await p.goto('https://video.study-duo.test/');
  expect(p.url()).toBe('https://video.study-duo.test/');

  expect(offHost).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('Open anyway waits 10 seconds and a reason, lasts for this block only, and pausing keeps sites closed', async () => {
  const { profile, ctx, sw, offHost } = await setup();
  await sw.evaluate(() => chrome.storage.local.set({ sites: { 'video.study-duo.test': 'blocked' } }));
  await startBlock(ctx, sw);
  // The timer is saved a moment before the rules land; a person is never that fast.
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBeGreaterThan(0);

  const p = await ctx.newPage();
  await p.goto('https://video.study-duo.test/clip').catch(() => undefined);
  await expect.poll(() => p.url()).toContain(BLOCKED);
  const later = p.getByRole('button', { name: /^Open anyway/ });
  await expect(later).toBeDisabled();
  await expect(later).toHaveText(/Open anyway in \d+ s/);
  await expect(later).toBeEnabled({ timeout: 12_000 });
  await later.click();
  const confirm = p.getByRole('button', { name: 'Open video.study-duo.test' });
  await p.getByLabel('Why open video.study-duo.test now?').fill('ab');
  await expect(confirm).toBeDisabled();
  await p.getByLabel('Why open video.study-duo.test now?').fill('lecture clip for the exam');
  await confirm.click();
  await expect.poll(() => p.url(), { timeout: 10_000 }).toBe('https://video.study-duo.test/clip');

  // Pause keeps the lock; the unlock still holds inside this block.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('timer')).timer?.status)).toBe('paused');
  expect((await sw.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length).toBeGreaterThan(0);

  // The next block closes it again.
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.session.get('unlocked')).unlocked ?? [])).toEqual([]);
  await popup.getByRole('button', { name: 'Skip' }).click();
  await popup.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBeGreaterThan(0);
  await p.goto('https://video.study-duo.test/clip').catch(() => undefined);
  await expect.poll(() => p.url()).toContain(BLOCKED);

  expect(offHost).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
