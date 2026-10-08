import { test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXT_ID, launchBare } from './extension';
import { shadow } from './shadow';

/**
 * Does the corner clock show up, every time, on real sites? Tabs opened before Study Duo was installed, tabs left
 * open across an extension reload, new tabs, new windows, and pages restored from the back/forward cache.
 * Uses the live web, so it runs only when asked: STRESS=1 npx playwright test tests/e2e/clock-stress.e2e.ts
 * A check passes when the clock is in the page, shown, and its amber digits are on screen in the corner.
 */
test.skip(!process.env.STRESS, 'live-web stress test, run with STRESS=1');

const SITES = [
  'https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors',
  'https://www.wikipedia.org/',
  'https://www.youtube.com/',
  'https://github.com/',
  'https://stackoverflow.com/questions',
  'https://canvas.uva.nl/',
  'https://www.uva.nl/',
  'https://chatgpt.com/',
  'https://www.notion.so/',
  'https://docs.google.com/document/u/0/',
  'https://mail.google.com/',
  'https://www.google.com/search?q=eigenvalues',
  'https://scholar.google.com/',
  'https://www.linkedin.com/',
  'https://x.com/',
  'https://www.instagram.com/',
  'https://www.netflix.com/',
  'https://open.spotify.com/',
  'https://music.youtube.com/',
  'https://soundcloud.com/',
  'https://www.bbc.com/news',
  'https://www.nytimes.com/',
  'https://medium.com/',
  'https://www.khanacademy.org/',
  'https://www.coursera.org/',
  'https://quizlet.com/',
  'https://www.desmos.com/calculator',
  'https://www.wolframalpha.com/',
  'https://www.overleaf.com/',
  'https://www.figma.com/',
  'https://www.canva.com/',
  'https://www.bol.com/',
  'https://nos.nl/',
  'https://www.amazon.com/',
  'https://www.duolingo.com/',
  'https://arxiv.org/',
  'https://www.reddit.com/r/learnmath/',
  'https://claude.ai/',
];

type Result = { scenario: string; url: string; ok: boolean; why: string };

/** Amber LED pixels in the top-right corner of the visible page (the clock's lit segments). */
async function amberPixels(page: Page): Promise<number> {
  const [w] = await page.evaluate(() => [innerWidth, innerHeight]);
  const file = path.join(os.tmpdir(), `sd-stress-${process.pid}.png`);
  await page.screenshot({ path: file, clip: { x: Math.max(0, w! - 260), y: 0, width: 260, height: 110 } });
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  let n = 0;
  for (let i = 0; i + 2 < raw.length; i += 3) if (raw[i]! > 200 && raw[i + 1]! > 120 && raw[i + 1]! < 215 && raw[i + 2]! < 90) n++;
  return n;
}

/** A page that never answers DevTools must not stall the run: each check gets 30 s. */
async function check(scenario: string, page: Page, url: string, out: Result[]) {
  const timedOut = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 30_000));
  if ((await Promise.race([inspect(scenario, page, url, out), timedOut])) === 'timeout') {
    out.push({ scenario, url, ok: false, why: 'check timed out (page never answered)' });
    console.log(`FAIL ${scenario.padEnd(18)} ${url}  (check timed out)`);
  }
}

async function inspect(scenario: string, page: Page, url: string, out: Result[]) {
  let why = '';
  try {
    await page.bringToFront();
    const deadline = Date.now() + 8_000;
    for (;;) {
      const hosts = await page.evaluate(() => document.querySelectorAll('study-duo-overlay').length).catch(() => -1);
      if (hosts < 1) why = hosts < 0 ? 'page not scriptable' : 'no clock in the page';
      else {
        const dom = await shadow(page);
        const display = (await dom.style('clock'))?.display;
        const top = await page.evaluate(() => document.querySelector('study-duo-overlay')?.matches(':popover-open') ?? false).catch(() => false);
        if (display !== 'flex') why = `clock not shown (display ${display})`;
        else if (!top) why = 'clock not in the top layer';
        else {
          const px = await amberPixels(page);
          if (px >= 40) why = '';
          else why = `clock not visible on screen (${px} amber px)`;
        }
        if (hosts > 1 && !why) why = `${hosts} clocks in the page`;
      }
      if (!why || Date.now() > deadline) break;
      await page.waitForTimeout(500);
    }
  } catch (e) {
    why = `check failed: ${(e as Error).message.split('\n')[0]}`;
  }
  out.push({ scenario, url, ok: !why, why });
  console.log(`${why ? 'FAIL' : 'ok  '} ${scenario.padEnd(18)} ${url}${why ? `  (${why})` : ''}`);
}

async function open(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(1_500);
    return true;
  } catch {
    console.log(`skip (did not load) ${url}`);
    return false;
  }
}

test('the corner clock shows on real sites, in every way a page can come to be open', async () => {
  test.setTimeout(90 * 60_000);
  const b = await launchBare();
  const out: Result[] = [];
  try {
    const only = process.env.STRESS_ONLY;
    if (only === 'back') {
      await b.install();
      const p = await b.ctx.newPage();
      await p.goto(`chrome-extension://${EXT_ID}/popup.html`);
      await p.evaluate(async () => {
        const c = (globalThis as any).chrome;
        const { settings } = await c.storage.local.get('settings');
        await c.storage.local.set({ settings: { ...(settings ?? {}), overlayIdle: 'full' } });
      });
      await p.getByRole('button', { name: 'Start' }).click();
      await p.waitForTimeout(800);
      await p.close();
    }
    // 1. Old tabs: open before Study Duo exists. Most in this window, a few in a second window.
    const old: { page: Page; url: string }[] = [];
    for (const url of only ? [] : SITES.slice(0, 14)) {
      const page = await b.ctx.newPage();
      if (await open(page, url)) old.push({ page, url });
    }
    const cdp = await b.browser.newBrowserCDPSession();
    const otherWindow: { page: Page; url: string }[] = [];
    for (const url of only ? [] : SITES.slice(14, 20)) {
      const made = b.ctx.waitForEvent('page');
      await cdp.send('Target.createTarget', { url, newWindow: true });
      const page = await made;
      await page.waitForLoadState('domcontentloaded', { timeout: 25_000 }).catch(() => undefined);
      await page.waitForTimeout(1_500);
      otherWindow.push({ page, url });
    }

    if (!only) await b.install();
    const popup = await b.ctx.newPage();
    await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
    // Full brightness, so the screenshot sees the digits at their real colour.
    await popup.evaluate(async () => {
      const c = (globalThis as any).chrome;
      const { settings } = await c.storage.local.get('settings');
      await c.storage.local.set({ settings: { ...(settings ?? {}), overlayIdle: 'full' } });
    });
    if (!only) await popup.getByRole('button', { name: 'Start' }).click();
    await popup.waitForTimeout(800);
    await popup.close();

    for (const { page, url } of old) await check('old tab', page, url, out);
    for (const { page, url } of otherWindow) await check('old, other window', page, url, out);

    // 2. New tabs during a block.
    for (const url of only ? [] : SITES) {
      const page = await b.ctx.newPage();
      if (await open(page, url)) await check('new tab', page, url, out);
      await Promise.race([page.close(), new Promise((r) => setTimeout(r, 5_000))]);
    }

    // 3. New windows during a block.
    for (const url of only ? [] : SITES.slice(0, 20)) {
      const made = b.ctx.waitForEvent('page');
      await cdp.send('Target.createTarget', { url, newWindow: true });
      const page = await made;
      await page.waitForLoadState('domcontentloaded', { timeout: 25_000 }).catch(() => undefined);
      await page.waitForTimeout(1_500);
      await check('new window', page, url, out);
      await Promise.race([page.close(), new Promise((r) => setTimeout(r, 5_000))]);
    }

    // 4. The extension reloads (an update, or the reload arrow) with old tabs still open.
    if (!only) await b.install();
    await new Promise((r) => setTimeout(r, 2_000));
    for (const { page, url } of [...old, ...otherWindow]) await check('after reload', page, url, out);

    // 5. Back/forward cache: leave a page and come back.
    const nav = await b.ctx.newPage();
    for (let i = 0; i + 1 < 24; i += 2) {
      if (!(await open(nav, SITES[i]!)) || !(await open(nav, SITES[i + 1]!))) continue;
      // A page restored from the back/forward cache fires no load events: wait for the navigation to commit only.
      await nav.goBack({ waitUntil: 'commit', timeout: 15_000 }).catch(() => undefined);
      await nav.waitForTimeout(1_000);
      await check('back button', nav, SITES[i]!, out);
    }
  } finally {
    const failed = out.filter((r) => !r.ok);
    console.log(`\n${out.length - failed.length} of ${out.length} checks passed`);
    for (const f of failed) console.log(`FAILED ${f.scenario}: ${f.url} (${f.why})`);
    fs.writeFileSync(path.join(os.tmpdir(), 'sd-clock-stress.json'), JSON.stringify(out, null, 2));
    await b.close();
  }
});
