import { expect, test } from '@playwright/test';
import { EXT_ID, launchBare } from './extension';
import { shadow } from './shadow';

test('tabs that were open before an install or a reload get one working clock, without reloading the page', async () => {
  const b = await launchBare();
  try {
    await b.ctx.route('https://open.study-duo.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>Open before Study Duo</p>' }));
    const page = await b.ctx.newPage();
    await page.goto('https://open.study-duo.test/');
    const hosts = () => page.evaluate(() => document.querySelectorAll('study-duo-overlay').length);
    expect(await hosts()).toBe(0);

    await b.install();
    await expect.poll(hosts).toBe(1);

    const popup = await b.ctx.newPage();
    await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
    await popup.getByRole('button', { name: 'Start' }).click();
    await popup.getByRole('button', { name: 'Pause' }).click();
    await popup.close();
    await page.bringToFront();
    const dom = await shadow(page);
    await expect.poll(() => dom.prop('clock', 'this.dataset.status')).toBe('paused');

    // The reload arrow on chrome://extensions: the old copy in the page goes deaf, a new one takes over.
    await b.install();
    const again = await b.ctx.newPage();
    await again.goto(`chrome-extension://${EXT_ID}/popup.html`);
    await again.getByRole('button', { name: 'Resume' }).click();
    // The Resume reached the timer (separates a lost click from a clock that did not follow).
    await expect.poll(() => again.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('timer')).timer?.status)).toBe('running');
    await again.close();
    await page.bringToFront();
    const live = await shadow(page);
    const clocks = () => live.all('clock', 'function () { return this.dataset.status; }');
    await expect.poll(clocks, { timeout: 8_000 }).toEqual(['running']);
    await expect.poll(() => live.style('clock').then((s) => s?.display)).toBe('flex');
    // Only the working clock is left: no stale copy underneath showing the old time.
    await page.waitForTimeout(1_500);
    expect(await hosts()).toBe(1);
  } finally {
    await b.close();
  }
});
