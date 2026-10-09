import { chromium, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Screenshots of each browser's own extensions page for the install page (site/shots), with where to click read from
 * the page itself, so the red ring sits exactly on Developer mode and on Load unpacked. Runs a branded browser in a
 * throwaway profile, headless. Run with the browser to shoot:
 *   SITE_SHOTS=chrome npx playwright test tests/e2e/site-shots.e2e.ts
 *   SITE_SHOTS=edge SITE_SHOTS_EXE="/path/to/msedge" npx playwright test tests/e2e/site-shots.e2e.ts
 * Writes site/shots/<browser>-devmode.webp, <browser>-unpacked.webp and merges their marks into site/shots/marks.json.
 */
const BROWSER = process.env.SITE_SHOTS ?? '';
test.skip(!BROWSER, 'shoots install-page screenshots only when asked (SITE_SHOTS=<browser>)');

const PAGE: Record<string, string> = { chrome: 'chrome://extensions', edge: 'edge://extensions', brave: 'brave://extensions', opera: 'opera://extensions', vivaldi: 'vivaldi://extensions', arc: 'chrome://extensions' };
const NAMES: Record<string, string> = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi', arc: 'Arc' };
const OUT = path.resolve('site/shots');
// Edge folds Developer mode into a menu below about 1300 px, so it gets a wider window.
const VIEW = BROWSER === 'edge' ? { width: 1400, height: 760 } : { width: 1100, height: 640 };
const CROP = { width: 520, height: 300 };

async function first(page: Page, ...candidates: Locator[]): Promise<Locator> {
  for (let tries = 0; tries < 10; tries++) {
    for (const c of candidates) if (await c.first().isVisible().catch(() => false)) return c.first();
    await page.waitForTimeout(500);
  }
  // What the page showed instead, for fixing the selectors.
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `debug-${BROWSER}.png`) }).catch(() => undefined);
  const text = await page.evaluate(() => document.body?.innerText.slice(0, 400)).catch(() => '');
  console.log(await page.locator('body').ariaSnapshot().catch(() => 'no aria snapshot'));
  throw new Error(`nothing to click on ${page.url()}: ${text}`);
}
function webp(png: string, out: string) {
  execFileSync('cwebp', ['-quiet', '-q', '82', png, '-o', out]); // cwebp: the webp package (brew install webp, apt install webp)
}

test(`shoot ${BROWSER}'s extensions page`, async () => {
  test.setTimeout(90_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-shots-'));
  console.log(`launching ${BROWSER}`);
  const args = ['--no-first-run', '--no-default-browser-check', '--lang=en-US'];
  let ctx: BrowserContext;
  let stop = () => {};
  try {
    ctx = await chromium.launchPersistentContext(profile, {
      ...(process.env.SITE_SHOTS_EXE ? { executablePath: process.env.SITE_SHOTS_EXE } : { channel: BROWSER === 'edge' ? 'msedge' : 'chrome' }),
      headless: !process.env.SITE_SHOTS_HEADED,
      timeout: 90_000, // Edge's first start on a fresh runner is slow
      viewport: VIEW,
      deviceScaleFactor: 2,
      args,
    });
  } catch (e) {
    // Some browsers (Opera, Vivaldi) do not answer Playwright's pipe: start them with a debugging port instead.
    console.log(`${BROWSER}: no pipe (${String(e).split('\n')[0]}), trying a debugging port`);
    const exe = process.env.SITE_SHOTS_EXE!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-shots-port-'));
    const proc = spawn(exe, [...(process.env.SITE_SHOTS_HEADED ? [] : ['--headless=new']), '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-sandbox', ...args, 'about:blank'], { stdio: 'ignore' });
    stop = () => proc.kill();
    const portFile = path.join(dir, 'DevToolsActivePort');
    let port = '';
    for (let i = 0; i < 120 && !port; i++) {
      await new Promise((r) => setTimeout(r, 500));
      port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').split('\n')[0]!.trim() : '';
    }
    if (!port) throw new Error(`${BROWSER} never opened a debugging port`);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    ctx = browser.contexts()[0]!;
  }
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.setViewportSize(VIEW);
    // Sharp at 2x either way; a browser reached over its debugging port starts at 1x.
    await (await ctx.newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', { ...VIEW, deviceScaleFactor: 2, mobile: false });
    await page.goto(PAGE[BROWSER]!);
    await page.waitForTimeout(1500);
    // Named switch first; Edge's switch has no name of its own, and clicking its label does not flip it.
    // The switch, most specific first. Edge's has no name of its own, and clicking its label does not flip it.
    const label = page.getByText(/^\s*developer mode\s*$/i).first();
    const switches = [page.locator('#devMode'), page.getByRole('switch', { name: /developer mode/i }), page.getByRole('checkbox', { name: /developer mode/i }), page.getByRole('switch'), page.getByRole('checkbox'), page.locator('input[type=checkbox]'), label];
    const toggle = await first(page, ...switches);
    const marks = fs.existsSync(path.join(OUT, 'marks.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'marks.json'), 'utf8')) : {};
    const save = async (name: string, target: Locator, alt: string, label?: Locator) => {
      // The ring takes in the target's label too when there is one, so it marks the words people look for.
      const t = (await target.boundingBox())!;
      const l = label && (await label.isVisible().catch(() => false)) ? await label.boundingBox() : null;
      const box = l ? { x: Math.min(t.x, l.x), y: Math.min(t.y, l.y), width: Math.max(t.x + t.width, l.x + l.width) - Math.min(t.x, l.x), height: Math.max(t.y + t.height, l.y + l.height) - Math.min(t.y, l.y) } : t;
      // A crop around the target, readable at the size the install page shows it, with enough page around it to
      // recognise where it is. Held inside the window.
      const clip = { width: CROP.width, height: CROP.height, x: 0, y: 0 };
      clip.x = Math.round(Math.min(Math.max(box.x + box.width / 2 - CROP.width / 2, 0), VIEW.width - CROP.width));
      clip.y = Math.round(Math.min(Math.max(box.y + box.height / 2 - CROP.height / 3, 0), VIEW.height - CROP.height));
      const png = path.join(os.tmpdir(), `${BROWSER}-${name}.png`);
      await page.screenshot({ path: png, clip });
      fs.mkdirSync(OUT, { recursive: true });
      webp(png, path.join(OUT, `${BROWSER}-${name}.webp`));
      const pad = 8;
      const ring = [box.x - clip.x - pad, box.y - clip.y - pad, box.width + 2 * pad, box.height + 2 * pad].map((v) => Math.round(v * 2));
      const [w, h] = [CROP.width * 2, CROP.height * 2];
      // The arrow comes in from the open side of the page, toward the ring.
      const cx = ring[0]! + ring[2]! / 2;
      const cy = ring[1]! + ring[3]! / 2;
      const from = [cx > w / 2 ? cx - 220 : cx + 220, Math.min(h - 40, cy + 170)];
      const to = [cx > w / 2 ? ring[0]! - 8 : ring[0]! + ring[2]! + 8, cy + 6];
      marks[`${BROWSER}-${name}`] = { file: `${BROWSER}-${name}.webp`, w, h, ring, arrow: [...from, ...to], alt };
    };
    await save('devmode', toggle, `${NAMES[BROWSER]}'s extensions page, with Developer mode marked`, label);
    // Flip it: try each switch in turn until Load unpacked shows.
    const loads = [page.locator('#loadUnpacked'), page.getByRole('button', { name: /load unpacked/i }), page.getByText(/^\s*load unpacked\s*$/i)];
    const loadShows = async () => { for (const l of loads) if (await l.first().isVisible().catch(() => false)) return true; return false; };
    for (const s of switches) {
      if (await loadShows()) break;
      if (!(await s.first().isVisible().catch(() => false))) continue;
      await s.first().click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(800);
    const load = await first(page, page.locator('#loadUnpacked'), page.getByRole('button', { name: /load unpacked/i }), page.getByText(/load unpacked/i));
    await save('unpacked', load, `${NAMES[BROWSER]}'s extensions page with Developer mode on, Load unpacked marked`);
    const sorted = Object.fromEntries(Object.keys(marks).sort().map((k) => [k, marks[k]]));
    fs.writeFileSync(path.join(OUT, 'marks.json'), `${JSON.stringify(sorted, null, 2)}\n`);
  } finally {
    await ctx.close().catch(() => undefined);
    stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
