import { expect, test, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, tempProfile } from './extension';

/** The install page at its real address, served from site/ with the extension's tokens and fonts, as pages.yml does. */
async function serveSite(ctx: BrowserContext, opts: { xpi?: boolean } = {}) {
  const files: Record<string, string> = {
    'tokens.css': 'src/ui/tokens.css',
    'favicon.png': 'public/icon/32.png',
    'fonts/atkinson-next-latin.woff2': 'public/fonts/atkinson-next-latin.woff2',
    'fonts/atkinson-mono-latin.woff2': 'public/fonts/atkinson-mono-latin.woff2',
  };
  const types: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp' };
  await ctx.route('https://coflazo.github.io/study-duo/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/study-duo\//, '') || 'index.html';
    if (rel === 'study-duo.xpi') return opts.xpi ? route.fulfill({ contentType: 'application/x-xpinstall', body: 'xpi' }) : route.fulfill({ status: 404, body: '' });
    const file = files[rel] ?? path.join('site', rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: types[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
  });
}

test('the install page builds one line for the browsers picked, and only the steps that apply', async () => {
  const { ctx } = await launch(tempProfile());
  await serveSite(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));
  await page.goto('https://coflazo.github.io/study-duo/');
  // This browser is found and ticked; the line names it.
  await expect(page.getByRole('checkbox', { name: 'Chrome' })).toBeChecked();
  await expect(page.locator('#command')).toHaveText(/--browsers chrome$/);
  await expect(page.locator('#step-firefox')).toBeHidden();
  // Firefox too: a fourth step, and the line carries both.
  await page.getByRole('checkbox', { name: 'Firefox' }).check();
  await expect(page.locator('#command')).toHaveText(/--browsers chrome,firefox$/);
  await expect(page.locator('#step-firefox [data-num]')).toHaveText('4');
  // Not signed and published yet: the button says so instead of failing.
  await expect(page.getByText('The signed Firefox version is on its way.')).toBeVisible();
  // Firefox alone needs no installer at all.
  await page.getByRole('checkbox', { name: 'Chrome' }).uncheck();
  await expect(page.locator('#step-installer')).toBeHidden();
  await expect(page.locator('#step-firefox [data-num]')).toHaveText('2');
  // Windows: PowerShell and its own line.
  await page.getByRole('checkbox', { name: 'Chrome' }).check();
  await page.getByRole('link', { name: 'On Windows?' }).click();
  await expect(page.locator('#command')).toHaveText(/-Browsers chrome,firefox"$/);
  await expect(page.locator('#step-installer h3')).toHaveText('Where is PowerShell?');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the install page notices Study Duo arrived, and only that page may ask', async () => {
  const { ctx } = await launch(tempProfile());
  await serveSite(ctx);
  const page = await ctx.newPage();
  await page.goto('https://coflazo.github.io/study-duo/');
  await expect(page.getByText('Study Duo is in Chrome.')).toBeVisible();
  // Another site cannot ask: Chrome gives it no channel to Study Duo.
  await ctx.route('https://evil.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>hi</p>' }));
  const other = await ctx.newPage();
  await other.goto('https://evil.test/study-duo/');
  expect(await other.evaluate(() => typeof (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage)).toBe('undefined');
  await ctx.close();
});

test('on a phone the page says Study Duo runs on a computer and offers to send the link', async () => {
  const { ctx } = await launch(tempProfile());
  await serveSite(ctx);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { get: () => ({ mobile: true, platform: 'Android', brands: [] }) }));
  await page.goto('https://coflazo.github.io/study-duo/');
  await expect(page.getByRole('heading', { name: 'Study Duo runs on a computer' })).toBeVisible();
  await expect(page.locator('#desktop')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Email me the link' })).toHaveAttribute('href', /^mailto:/);
  await ctx.close();
});
