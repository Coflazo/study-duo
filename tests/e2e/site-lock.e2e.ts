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
    if (url.host.endsWith('study-duo.test')) return route.fulfill({ contentType: 'text/html', body: page(url.host) });
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
