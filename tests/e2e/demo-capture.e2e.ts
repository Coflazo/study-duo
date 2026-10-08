import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { simulate, TYPICAL } from '../../src/ml/synthetic';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

/**
 * Shoots the real extension for the demo video (demo/): every frame in the film is one of these screenshots or
 * screencast frames, never a mock-up. Insights use simulated students only. Run with:
 *   npm run build:test && DEMO_CAPTURE=1 npx playwright test tests/e2e/demo-capture.e2e.ts
 * Footage lands in demo/public/footage/ (git-ignored; rebuild it with this script).
 */
test.skip(!process.env.DEMO_CAPTURE, 'shoots demo footage only when asked (DEMO_CAPTURE=1)');

const OUT = path.resolve('demo/public/footage');
const VIEW = { width: 1408, height: 720 }; // the browser content area in the film, 1:1
const POPUP = { width: 360, height: 560 };
const DASH = `chrome-extension://${EXT_ID}/dashboard.html`;
const MIN = 60_000;

const NOTES = `<!doctype html><html><head><meta charset="utf-8"><title>Week 6 · Eigenvalues</title><style>
  body { margin: 0; font: 16px/1.6 Georgia, 'Times New Roman', serif; color: #1f2328; background: #fbfaf7; }
  nav { position: fixed; inset: 0 auto 0 0; width: 250px; padding: 28px 24px; box-sizing: border-box; border-right: 1px solid #e6e3dc; background: #f4f2ec; font: 14px/1.5 system-ui, sans-serif; color: #4b5059; }
  nav b { display: block; margin-bottom: 14px; color: #1f2328; font-size: 15px; }
  nav p { margin: 8px 0; } nav p.on { color: #1f2328; font-weight: 600; }
  main { margin-left: 250px; padding: 44px 72px; max-width: 760px; }
  h1 { font: 600 32px/1.2 system-ui, sans-serif; margin: 0 0 6px; } .sub { font: 14px system-ui, sans-serif; color: #6a6f78; margin-bottom: 26px; }
  .eq { margin: 22px 0; padding: 16px 22px; background: #fff; border: 1px solid #e6e3dc; border-radius: 6px; font: italic 22px Georgia, serif; text-align: center; }
  h2 { font: 600 19px system-ui, sans-serif; margin: 26px 0 8px; }
</style></head><body>
<nav><b>Linear Algebra</b><p>Week 4 · Determinants</p><p>Week 5 · Vector spaces</p><p class="on">Week 6 · Eigenvalues</p><p>Week 7 · Diagonalisation</p><p>Problem sets</p></nav>
<main><h1>Eigenvalues and eigenvectors</h1><div class="sub">Lecture 6 · reading notes</div>
<p>A non-zero vector <i>v</i> is an eigenvector of a square matrix <i>A</i> when multiplying by <i>A</i> only stretches it: the direction stays, the length scales by a number λ, the eigenvalue.</p>
<div class="eq">A v = λ v &nbsp;&nbsp;⟺&nbsp;&nbsp; det(A − λI) = 0</div>
<p>So the eigenvalues are the roots of the characteristic polynomial. For a 2 × 2 matrix that polynomial is λ² − (trace A) λ + det A, which is why the eigenvalues add up to the trace and multiply to the determinant.</p>
<h2>Worked example</h2>
<p>Take A = [[2, 1], [1, 2]]. The trace is 4 and the determinant is 3, so λ² − 4λ + 3 = 0 and the eigenvalues are 1 and 3, with eigenvectors (1, −1) and (1, 1).</p>
</main></body></html>`;

const VIDEOS = `<!doctype html><html><head><meta charset="utf-8"><title>Watch</title><style>
  body { margin: 0; background: #0f0f10; color: #f1f1f1; font: 14px/1.4 system-ui, sans-serif; }
  header { height: 56px; display: flex; align-items: center; gap: 16px; padding: 0 24px; border-bottom: 1px solid #222; }
  .logo { width: 28px; height: 20px; border-radius: 5px; background: #e5484d; } .search { flex: 1; max-width: 520px; height: 34px; margin: 0 auto; border-radius: 17px; background: #1d1d20; border: 1px solid #2b2b30; }
  main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px 18px; padding: 24px; }
  .t { aspect-ratio: 16 / 9; border-radius: 10px; } .n { margin-top: 8px; font-weight: 600; } .m { color: #9a9aa2; font-size: 12px; }
</style></head><body><header><div class="logo"></div><div class="search"></div></header><main>
${[
  ['10 hours of rain on a tin roof', '#3a4a5c,#1c2633'],
  ['I studied like a monk for 30 days', '#6b4f2a,#2d2214'],
  ['Every cat video from 2014, ranked', '#5c3a52,#2a1a26'],
  ['Why you can’t focus (and how to fix it)', '#2f5b4a,#15291f'],
  ['Satisfying slime, four hours', '#4f5c2a,#232a12'],
  ['The surprisingly long history of the pencil', '#5c4b3a,#2a2219'],
  ['Top 50 goals of the decade', '#2a3f5c,#121c2a'],
  ['Lo-fi beats to stare at', '#523a5c,#26192a'],
]
  .map(([n, g]) => `<div><div class="t" style="background:linear-gradient(135deg,${g})"></div><div class="n">${n}</div><div class="m">1.2M views · 3 days ago</div></div>`)
  .join('')}
</main></body></html>`;

function feed(now: number) {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const tomorrow = new Date(now + 86_400_000);
  tomorrow.setHours(23, 59, 0, 0);
  const ev = (uid: string, due: number, s: string) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${stamp(due)}\r\nDTEND:${stamp(due)}\r\nSUMMARY:${s}\r\nEND:VEVENT\r\n`;
  return `BEGIN:VCALENDAR\r\n${ev('event-assignment-51', tomorrow.getTime(), 'Problem set 5 [Linear Algebra]')}${ev('event-assignment-52', now + 6 * 86_400_000, 'Essay draft [Academic Writing]')}END:VCALENDAR\r\n`;
}

async function page(ctx: BrowserContext, view = VIEW) {
  const p = await ctx.newPage();
  await p.setViewportSize(view);
  return p;
}
const shot = (p: Page, name: string, opts: Parameters<Page['screenshot']>[0] = {}) => p.screenshot({ path: `${OUT}/${name}.png`, ...opts });

test('shoot the demo footage', async () => {
  test.setTimeout(300_000);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { ctx, sw } = await launch(tempProfile(), [], 2); // 2x stills: sharp in the film, and close-ups crop from them
  const now = Date.now();
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === 'chrome-extension:') return r.continue();
    if (u.host === 'lecture-notes.example') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: NOTES });
    if (u.host === 'videos.example') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: VIDEOS });
    if (u.host === 'canvas.example.edu') return r.fulfill({ contentType: 'text/calendar', body: feed(now) });
    return r.abort();
  });

  // Setup: Reddit blocked, the notes filed as Study, the course calendar imported (Problem set 5, due tomorrow).
  await sw.evaluate(async () => {
    const c = (globalThis as any).chrome;
    const { sites } = await c.storage.local.get('sites');
    await c.storage.local.set({ sites: { ...(sites ?? {}), 'reddit.com': 'blocked', 'lecture-notes.example': 'study' } });
  });
  const dash = await page(ctx);
  await dash.goto(`${DASH}#connections`);
  await dash.getByLabel('Calendar link').fill('https://canvas.example.edu/feeds/calendars/user_demo.ics');
  await dash.getByRole('button', { name: 'Import' }).click();
  await expect(dash.getByText('2 deadlines in your to-do list')).toBeVisible({ timeout: 15_000 });

  // 1. Problem: the notes, then the video site.
  const notes = await page(ctx);
  await notes.goto('https://lecture-notes.example/linear-algebra/week-6');
  await notes.waitForTimeout(600);
  await shot(notes, 'notes');
  const videos = await page(ctx);
  await videos.goto('https://videos.example/');
  await videos.waitForTimeout(400);
  await shot(videos, 'videos');
  await videos.close();

  // 2. Start: the popup ready on Problem set 5, then running.
  const popup = await page(ctx, POPUP);
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.getByRole('combobox').locator('option:checked')).toHaveText(/Problem set 5/); // the nearest deadline comes first
  await popup.waitForTimeout(500);
  await shot(popup, 'popup-ready');
  await popup.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('timer')).timer?.status)).toBe('running');
  await popup.waitForTimeout(400);
  await shot(popup, 'popup-running');
  await popup.close();

  // 3. The corner clock on the notes: bright for the first seconds, then faint; one still per second.
  await notes.bringToFront();
  for (let s = 0; s < 8; s++) {
    await shot(notes, `clock-${s}`);
    await shot(notes, `clock-close-${s}`, { clip: { x: VIEW.width - 300, y: 0, width: 300, height: 120 } }); // 600x240 at 2x
    await notes.waitForTimeout(1000 - 250);
  }

  // 4. Lock: reddit.com is closed, with the wait counting down.
  const blocked = await page(ctx);
  await blocked.goto('https://www.reddit.com/').catch(() => undefined);
  await expect.poll(() => blocked.url()).toContain('blocked.html');
  await blocked.waitForTimeout(700);
  await shot(blocked, 'blocked-10');
  await blocked.waitForTimeout(1000);
  await shot(blocked, 'blocked-9');
  await blocked.close();
  await notes.bringToFront();
  await notes.waitForTimeout(300);
  await shot(notes, 'clock-back'); // the clock a few seconds on, after "Back to work"

  // 5. The block ends three seconds from now. Stills as fast as the page allows from just before the end until the
  //    phase words have faded, each named by its time from the end in ms, so the film plays the overlay's real fade.
  await notes.bringToFront();
  const end = await sw.evaluate(async () => {
    const c = (globalThis as any).chrome;
    const { timer } = await c.storage.local.get('timer');
    const end = Date.now() + 3000;
    await c.storage.local.set({ timer: { ...timer, startedAt: end - 25 * 60_000, endsAt: end } });
    return end;
  });
  fs.mkdirSync(`${OUT}/break`, { recursive: true });
  await notes.waitForTimeout(Math.max(0, end - 1200 - Date.now()));
  const times: number[] = [];
  while (Date.now() < end + 5600) { // until the phase words have fully cleared
    const t = Date.now() - end;
    await notes.screenshot({ type: 'jpeg', quality: 92, path: `${OUT}/break/${t}.jpg` });
    times.push(t);
  }
  fs.writeFileSync(`${OUT}/break/times.json`, JSON.stringify(times));
  const rate = await page(ctx, POPUP);
  await rate.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await rate.waitForTimeout(600);
  await shot(rate, 'popup-rating');
  await rate.getByRole('radio', { name: '4' }).click();
  await rate.waitForTimeout(500);
  await shot(rate, 'popup-rated');
  await rate.close();

  // 6. Insights from eight weeks of simulated students, shifted by whole days so their hours stay true.
  const { sessions, listens } = simulate(TYPICAL, { days: 56, seed: 7 });
  const last = Math.max(...sessions.map((s) => s.endedAt));
  const shift = Math.ceil((now - last) / 86_400_000) * 86_400_000 - 86_400_000;
  await sw.evaluate(
    async ([sess, lis]) => {
      const open = indexedDB.open('study-duo');
      const db: IDBDatabase = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = () => rej(open.error))));
      const tx = db.transaction(['sessions', 'listens'], 'readwrite');
      for (const s of sess as any[]) tx.objectStore('sessions').put(s);
      for (const l of lis as any[]) tx.objectStore('listens').put(l);
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
    },
    [
      sessions.map((s) => ({ ...s, startedAt: s.startedAt + shift, endedAt: s.endedAt + shift, id: `${s.startedAt + shift}-${s.phase}` })),
      listens.map((l) => ({ ...l, id: `${l.id}-demo`, startedAt: l.startedAt + shift, endedAt: l.endedAt + shift })),
    ],
  );
  expect((await readStore(sw, 'sessions')).length).toBeGreaterThan(100);
  await dash.goto(`${DASH}#insights`);
  await dash.waitForTimeout(5000);
  await shot(dash, 'insights');
  await dash.evaluate(() => window.scrollTo(0, 260));
  await dash.waitForTimeout(300);
  await shot(dash, 'insights-lower');
  await dash.goto(`${DASH}#todo`);
  await dash.waitForTimeout(800);
  await shot(dash, 'todo');
  await ctx.close();
  console.log('footage', fs.readdirSync(OUT).length, 'items');
});
