import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import phrases from '../../src/locales/en/phrases.json' with { type: 'json' };
import { EXT_ID, launch, tempProfile } from './extension';
import { shadow } from './shadow';

declare const chrome: any;

// Global CSS that flattens every element, a CSP that allows no scripts, fonts or connections,
// and a page that breaks DOM prototypes in its own world.
const HOSTILE = `<!doctype html><html><head><style>* { all: unset !important; }</style></head><body>
<button id="under" style="display:block!important;position:fixed!important;top:0!important;right:0!important;width:260px!important;height:120px!important">under the clock</button>
</body></html>`;

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

  // Bright for the first seconds of the block, then dim, click-through, 16 px from the top right corner.
  await expect.poll(async () => (await dom.style('clock'))?.opacity).toBe('1');
  await expect.poll(() => dom.style('clock'), { timeout: 8_000 }).toEqual({ opacity: '0.4', pointerEvents: 'none', display: 'flex' });
  const box = (await dom.rect('clock'))!;
  expect(Math.round(1280 - (box.x + box.w))).toBe(16);
  expect(Math.round(box.y)).toBe(16);

  // A page that deletes unknown nodes under <html>, or fakes WXT's "newer script started" event, must not kill the clock.
  await page.evaluate((id) => {
    document.querySelector('study-duo-overlay')!.remove();
    document.dispatchEvent(new CustomEvent(`${id}:overlay:wxt:content-script-started`, { detail: { contentScriptName: 'overlay', messageId: 'spoof' } }));
  }, EXT_ID);
  await expect.poll(() => dom.style('clock'), { timeout: 4_000 }).toEqual({ opacity: '0.4', pointerEvents: 'none', display: 'flex' });
  // The clock is aria-hidden, so its close button must stay out of the keyboard order.
  expect(await dom.prop('close', 'this.tabIndex')).toBe(-1);

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
  // The bundled font loads through its per-session URL, even under the page's font-src 'none'.
  await expect.poll(() => page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('Study Duo')).map((f) => f.status))).toEqual(['loaded', 'loaded']);
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
