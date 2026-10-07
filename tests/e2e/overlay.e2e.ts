import { expect, test, type CDPSession, type Page } from '@playwright/test';
import fs from 'node:fs';
import phrases from '../../src/locales/en/phrases.json' with { type: 'json' };
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

// Global CSS that flattens every element, a CSP that allows no scripts, fonts or connections,
// and a page that breaks DOM prototypes in its own world.
const HOSTILE = `<!doctype html><html><head><style>* { all: unset !important; }</style></head><body>
<button id="under" style="display:block!important;position:fixed!important;top:0!important;right:0!important;width:260px!important;height:120px!important">under the clock</button>
</body></html>`;

/** The overlay lives in a closed shadow root; DevTools protocol can still see it. */
async function shadow(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const find = async (cls: string): Promise<number | null> => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack: any[] = [root];
    while (stack.length) {
      const n = stack.pop();
      const attrs: string[] = n.attributes ?? [];
      const i = attrs.indexOf('class');
      if (i >= 0 && attrs[i + 1]!.split(' ').includes(cls)) return n.nodeId;
      stack.push(...(n.children ?? []), ...(n.shadowRoots ?? []));
    }
    return null;
  };
  const call = async (cls: string, fn: string) => {
    const nodeId = await find(cls);
    if (nodeId === null) return null;
    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, functionDeclaration: fn, returnByValue: true });
    return result.value;
  };
  return {
    style: (cls: string) =>
      call(cls, 'function () { const s = getComputedStyle(this); return { opacity: s.opacity, pointerEvents: s.pointerEvents, display: s.display }; }'),
    rect: (cls: string) => call(cls, 'function () { const r = this.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }'),
    text: (cls: string) => call(cls, 'function () { return this.textContent; }'),
    color: (cls: string) => call(cls, 'function () { return getComputedStyle(this).color; }'),
  };
}

test('corner clock and phase words survive a hostile page and never touch the network', async () => {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const offHost: string[] = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.host === 'study-duo.test') return route.fulfill({ contentType: 'text/html', body: HOSTILE, headers: { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } });
    offHost.push(url.href);
    return route.abort();
  });

  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Element.prototype.attachShadow = () => { throw new Error('blocked by page'); };
    Node.prototype.appendChild = () => { throw new Error('blocked by page'); };
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('https://study-duo.test/');
  await page.evaluate(() => document.getElementById('under')!.addEventListener('click', () => ((window as any).clicks = ((window as any).clicks ?? 0) + 1)));
  const dom = await shadow(page);

  // Nothing shows while the timer is stopped.
  await expect.poll(() => dom.style('clock')).toMatchObject({ display: 'none' });

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.close();
  await page.bringToFront();

  // Dim, click-through, 16 px from the top right corner.
  await expect.poll(() => dom.style('clock')).toEqual({ opacity: '0.15', pointerEvents: 'none', display: 'flex' });
  const box = (await dom.rect('clock'))!;
  expect(Math.round(1280 - (box.x + box.w))).toBe(16);
  expect(Math.round(box.y)).toBe(16);

  // The cursor 10 px away brings it up; a click on its body still reaches the page beneath.
  await page.mouse.move(box.x - 10, box.y + box.h / 2);
  await expect.poll(async () => (await dom.style('clock'))!.opacity).toBe('1');
  await page.mouse.click(box.x + 20, box.y + box.h / 2);
  expect(await page.evaluate(() => (window as any).clicks)).toBe(1);

  // The words follow the system theme live: dark mode switches to the lighter break green.
  await page.emulateMedia({ colorScheme: 'dark' });

  // Jump to 1.5 s before the end: the visible page ends the block and shows the phase words.
  await sw.evaluate(async () => {
    const { timer } = await chrome.storage.local.get('timer');
    await chrome.storage.local.set({ timer: { ...timer, endsAt: Date.now() + 1500 } });
  });
  await expect.poll(() => dom.text('line'), { timeout: 10_000 }).not.toBe('');
  expect(phrases.shortBreak).toContain(await dom.text('line'));
  expect(await dom.text('sub')).toBe('Short break, 5 minutes.');
  expect((await dom.style('words'))!.pointerEvents).toBe('none');
  expect(await dom.color('words-inner')).toBe('rgb(123, 197, 154)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => dom.color('words-inner')).toBe('rgb(36, 104, 65)');
  await expect.poll(() => dom.text('line'), { timeout: 6_000 }).toBe('');

  // The close button hides the clock on this page without clicking through.
  const near = (await dom.rect('clock'))!;
  await page.mouse.move(near.x - 10, near.y + near.h / 2);
  await expect.poll(async () => (await dom.style('close'))!.display).toBe('grid');
  const close = (await dom.rect('close'))!;
  await page.mouse.click(close.x + close.w / 2, close.y + close.h / 2);
  await expect.poll(async () => (await dom.style('clock'))!.display).toBe('none');
  expect(await page.evaluate(() => (window as any).clicks)).toBe(1);

  expect(offHost).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
