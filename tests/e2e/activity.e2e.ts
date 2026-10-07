import { expect, test } from '@playwright/test';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

declare const chrome: any;

const PAGE = '<!doctype html><title>notes</title><input id="t" aria-label="Notes"><input id="p" type="password" aria-label="Password"><p style="height:2000px">text</p>';

test('a block logs time per kind of site and opt-in input counts, with site names only', async () => {
  const { ctx, sw } = await launch(tempProfile());
  await ctx.route('https://*.study-duo.test/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      sites: { 'notes.study-duo.test': 'study' },
      settings: { ...settings, // Time away off: an unattended test machine reads as idle to the OS, and that time then stays with the site.
      measure: { sites: true, blocked: true, outcome: true, away: false, music: true, input: true } },
    });
  });

  const page = await ctx.newPage();
  await page.goto('https://notes.study-duo.test/chapter-3?secret=1');
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await page.bringToFront();
  await page.waitForTimeout(1_500);

  await page.focus('#t');
  await page.keyboard.type('hello');
  await page.focus('#p');
  await page.keyboard.type('hunter2'); // never counted
  await page.mouse.click(400, 600);
  await page.mouse.click(400, 650);
  await page.mouse.wheel(0, 300);
  // Leaving the page hands over the counts.
  await page.goto('https://elsewhere.study-duo.test/page');
  await page.waitForTimeout(1_500);

  await popup.bringToFront();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(async () => (await readStore(sw, 'activity')).length, { timeout: 8_000 }).toBeGreaterThanOrEqual(2);
  const rows = await readStore(sw, 'activity');
  const study = rows.find((r) => r.domain === 'notes.study-duo.test')!;
  expect(study).toMatchObject({ category: 'study', phase: 'focus', keys: 5, clicks: 2, inputMinutes: 1 });
  expect(study.scrolls).toBeGreaterThanOrEqual(1);
  expect(rows.find((r) => r.domain === 'elsewhere.study-duo.test')).toMatchObject({ category: 'unfiled' });
  const all = JSON.stringify(rows);
  for (const leaked of ['chapter-3', 'secret', 'hunter2', 'hello', '/page']) expect(all).not.toContain(leaked);
  await ctx.close();
});
