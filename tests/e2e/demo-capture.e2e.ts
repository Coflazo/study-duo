import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const YOUTUBE_FILM = 'https://www.youtube.com/watch?v=7fYKMCCPh28';
/** The hosts YouTube's embedded player needs; everything else stays blocked in the capture. */
const YOUTUBE_HOSTS = /(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com|ggpht\.com|gstatic\.com|google\.com|googleapis\.com)$/;
/** A music site in a tab, as the browser sees it: what plays, in navigator.mediaSession, with its own play and pause. */
const MUSIC_SITE = `<!doctype html><title>Gymnopédie No. 1 - YouTube Music</title><script>
  const show = (state) => {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Gymnopédie No. 1', artist: 'Erik Satie', album: 'Trois Gymnopédies' });
    navigator.mediaSession.playbackState = state;
    document.dispatchEvent(new Event(state === 'playing' ? 'play' : 'pause'));
  };
  navigator.mediaSession.setActionHandler('play', () => show('playing'));
  navigator.mediaSession.setActionHandler('pause', () => show('paused'));
  navigator.mediaSession.setActionHandler('nexttrack', () => show('playing'));
  show('playing');
</script>`;
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
/** Where things sit in the shots (CSS px in the page or popup), so the film's pointer lands on the real buttons. */
const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
async function mark(name: string, loc: Locator) {
  const b = await loc.boundingBox({ timeout: 10_000 });
  if (!b) throw new Error(`no box for ${name}`);
  boxes[name] = b;
}

test('shoot the demo footage', async () => {
  test.setTimeout(420_000);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { ctx, sw } = await launch(tempProfile(), ['--autoplay-policy=no-user-gesture-required'], 2); // 2x stills: sharp in the film, and close-ups crop from them
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
  await mark('popup.start', popup.getByRole('button', { name: 'Start' }));
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
  // The ten-second wait runs out, then "Open anyway" asks why first.
  await expect(blocked.getByRole('button', { name: 'Open anyway', exact: true })).toBeEnabled({ timeout: 12_000 });
  await blocked.waitForTimeout(300);
  await shot(blocked, 'blocked-open');
  await mark('blocked.openAnyway', blocked.getByRole('button', { name: 'Open anyway', exact: true }));
  await blocked.getByRole('button', { name: 'Open anyway', exact: true }).click();
  await expect(blocked.getByLabel('Why open reddit.com now?')).toBeVisible();
  await blocked.waitForTimeout(300);
  await shot(blocked, 'blocked-why');
  await blocked.getByLabel('Why open reddit.com now?').fill('one quick post');
  await blocked.waitForTimeout(200);
  await shot(blocked, 'blocked-reason');
  await mark('blocked.reason', blocked.getByLabel('Why open reddit.com now?'));
  await mark('blocked.back', blocked.getByRole('button', { name: 'Back to work' }));
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
  await mark('popup.rate4', rate.getByRole('radio', { name: '4' }));
  await rate.getByRole('radio', { name: '4' }).click();
  await rate.waitForTimeout(500);
  await shot(rate, 'popup-rated');
  await rate.close();

  // 6. Insights from eight weeks of simulated students, shifted by whole days so their hours stay true.
  const { sessions, listens: raw } = simulate(TYPICAL, { days: 56, seed: 7 });
  // The simulated student's tracks, renamed to the two recordings the film plays (demo/public/audio).
  const TITLES: Record<string, { title: string; artist: string }> = {
    'piano piece': { title: 'Nocturne in F major, Op. 15 No. 1', artist: 'Chopin' },
    'neutral song': { title: 'Waltz in A-flat major, Op. 69 No. 1', artist: 'Chopin' },
    'lyrics song': { title: 'A song with lyrics', artist: 'A singer' },
  };
  const listens = raw.map((l) => ({ ...l, ...TITLES[l.title] }));
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
  await mark('insights.map', dash.getByRole('region', { name: 'Focus by hour' }));
  await dash.evaluate(() => window.scrollTo(0, 260));
  await dash.waitForTimeout(300);
  await shot(dash, 'insights-lower');
  const musicRows = dash.getByRole('heading', { name: 'Music and focus' });
  await musicRows.evaluate((h) => window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120));
  await dash.waitForTimeout(300);
  await shot(dash, 'insights-music');
  await mark('insights.music', dash.getByRole('region', { name: 'Music and focus' }));
  await mark('insights.next', dash.getByRole('region', { name: 'Try next' }));

  // 7. Timeline: the simulated weeks as blocks, then the calendar file it exports.
  await dash.goto(`${DASH}#timeline`);
  await expect(dash.getByRole('heading', { name: 'Timeline', level: 1 })).toBeVisible();
  await dash.waitForTimeout(1200);
  await shot(dash, 'timeline');
  await mark('timeline.export', dash.getByRole('button', { name: 'Export to calendar' }));
  const download = dash.waitForEvent('download');
  await dash.getByRole('button', { name: 'Export to calendar' }).click();
  fs.writeFileSync(`${OUT}/ics.json`, JSON.stringify(fs.readFileSync((await (await download).path())!, 'utf8').split(/\r?\n/)));

  // 8. Move: settings and to-dos as QR codes.
  await dash.goto(`${DASH}#data`);
  await dash.getByRole('button', { name: 'Show codes' }).click();
  const qr = dash.getByRole('img', { name: /^Move code 1 of \d+$/ });
  await expect(qr).toBeVisible();
  await qr.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 220));
  await dash.waitForTimeout(500);
  await shot(dash, 'move');
  await mark('move.qr', qr);
  await dash.goto(`${DASH}#todo`);
  await dash.waitForTimeout(800);
  await shot(dash, 'todo');
  await mark('todo.first', dash.getByText('Problem set 5', { exact: true }));
  fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
  await ctx.close();
  console.log('footage', fs.readdirSync(OUT).length, 'items');
});

/**
 * The player, for the film's player, folder, link and tab scenes. A block runs, as in the main footage. The popup's
 * disc is shot frame by frame: the page's clock is held, and each film frame (1/30 s) moves it on and sets every
 * animation on the page to the same moment, so the slide out of the sleeve and the turning come out as the browser
 * draws them. Footage lands in demo/public/footage/player/, positions in player/boxes.json.
 */
test('shoot the player footage', async () => {
  test.setTimeout(900_000);
  const P = `${OUT}/player`;
  fs.rmSync(P, { recursive: true, force: true });
  fs.mkdirSync(P, { recursive: true });
  const { ctx, sw } = await launch(tempProfile(), ['--autoplay-policy=no-user-gesture-required'], 2);
  const now = Date.now();
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === 'chrome-extension:') return r.continue();
    if (u.host === 'lecture-notes.example') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: NOTES });
    if (u.host === 'canvas.example.edu') return r.fulfill({ contentType: 'text/calendar', body: feed(now) });
    if (u.host === 'music.youtube.com') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: MUSIC_SITE });
    if (u.host === 'www.googleapis.com') return r.fulfill({ json: u.pathname === '/calendar/v3/calendars' ? { id: 'demo-calendar' } : {} });
    if (YOUTUBE_HOSTS.test(u.host)) return r.continue();
    return r.abort();
  });
  // As in the main footage: the notes filed as Study, so the page carries no "File this site" prompt.
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
  const start = await page(ctx, POPUP);
  await start.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await start.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('timer')).timer?.status)).toBe('running');
  await start.close();

  // The side panel next to the notes: the page narrows by the panel's width.
  const PANEL = { width: 380, height: VIEW.height };
  const notes = await page(ctx, { width: VIEW.width - PANEL.width, height: VIEW.height });
  await notes.goto('https://lecture-notes.example/linear-algebra/week-6');
  await notes.waitForTimeout(800);
  await shot(notes, 'player/notes-beside-panel');
  const panel = await page(ctx, PANEL);
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Player', level: 1 })).toBeVisible();

  // Your music folder: the two Chopin recordings (public domain, demo/public/audio) tagged with composer and album, and
  // four more public-domain pieces as silent MP3s of their real length. ffmpeg writes the tags; the folder sits in the
  // browser's own file storage, the way the folder test hands one over.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-songs-'));
  const ff = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  const tags = (title: string, artist: string, album: string) => ['-map_metadata', '-1', '-id3v2_version', '3', '-metadata', `title=${title}`, '-metadata', `artist=${artist}`, '-metadata', `album=${album}`];
  const songs: [string, string, string][] = [];
  const real = (src: string, file: string, title: string, album: string) => {
    ff('-i', src, '-c', 'copy', ...tags(title, 'Frédéric Chopin', album), path.join(tmp, file));
    songs.push(['Frédéric Chopin', file, fs.readFileSync(path.join(tmp, file)).toString('base64')]);
  };
  const silent = (artist: string, file: string, title: string, album: string, seconds: number) => {
    ff('-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', String(seconds), '-c:a', 'libmp3lame', '-b:a', '32k', ...tags(title, artist, album), path.join(tmp, file));
    songs.push([artist, file, fs.readFileSync(path.join(tmp, file)).toString('base64')]);
  };
  real('demo/public/audio/chopin-nocturne-op15-1.mp3', 'Nocturne Op 15 No 1.mp3', 'Nocturne in F major, Op. 15 No. 1', 'Nocturnes');
  real('demo/public/audio/chopin-waltz-op69-1.mp3', 'Waltz Op 69 No 1.mp3', 'Waltz in A-flat major, Op. 69 No. 1', 'Waltzes');
  silent('Erik Satie', 'Gymnopedie No 1.mp3', 'Gymnopédie No. 1', 'Trois Gymnopédies', 185);
  silent('Claude Debussy', 'Clair de lune.mp3', 'Clair de lune', 'Suite bergamasque', 302);
  silent('J. S. Bach', 'Prelude BWV 846.mp3', 'Prelude in C major, BWV 846', 'The Well-Tempered Clavier', 140);
  silent('Robert Schumann', 'Traumerei.mp3', 'Träumerei', 'Kinderszenen', 165);
  fs.rmSync(tmp, { recursive: true, force: true });
  await panel.evaluate(async (songs) => {
    const root = await navigator.storage.getDirectory();
    const music = await root.getDirectoryHandle('Music', { create: true });
    for (const [artist, name, data] of songs) {
      const dir = await music.getDirectoryHandle(artist, { create: true });
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
    }
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => music;
  }, songs);
  await panel.getByRole('radio', { name: 'Library' }).click();
  await panel.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(panel.getByText(/6 songs/).first()).toBeVisible({ timeout: 20_000 });
  await panel.waitForTimeout(600);
  await shot(panel, 'player/panel-library');
  await mark('panel.playAll', panel.getByRole('button', { name: 'Play all' }));
  const nocturne = panel.getByRole('listitem').filter({ hasText: 'Nocturne in F major' });
  await mark('panel.nocturne', nocturne);
  await nocturne.getByRole('button').first().click();
  await expect.poll(async () => sw.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('player')).player?.now?.title)).toMatch(/Nocturne/);
  await panel.getByRole('radio', { name: 'Now playing' }).click().catch(() => undefined);
  const seek = panel.getByRole('slider', { name: 'Position' });
  await expect(seek).toBeVisible();
  await seek.focus();
  await seek.press('Home');
  for (let i = 0; i < 11; i++) await seek.press('ArrowRight'); // 5 s a press: 0:55, then on to 0:57 by the time it shows
  await panel.waitForTimeout(2200);
  await shot(panel, 'player/panel-now');
  await mark('panel.seek', seek);

  // Where it can play from, in the panel, tall enough for the whole list and its service logos.
  await panel.getByRole('button', { name: /FOLDER/ }).click();
  await expect(panel.getByRole('menu', { name: 'Play from' })).toBeVisible();
  await panel.waitForTimeout(500);
  await shot(panel, 'player/panel-sources');
  await mark('panel.menu', panel.getByRole('menu', { name: 'Play from' }));
  await panel.keyboard.press('Escape');

  // A YouTube link plays in the panel: NASA's "The Earth: 4K Extended Edition", public domain (NASA Johnson, see
  // demo/public/footage-credits.md). YouTube is the one outside service this capture lets through.
  await panel.getByRole('radio', { name: 'Streaming' }).click();
  await panel.getByLabel('Link to play').fill(YOUTUBE_FILM);
  await shot(panel, 'player/panel-link');
  await mark('panel.link', panel.getByLabel('Link to play')); // before Enter: playing switches the panel to Now playing
  await panel.getByLabel('Link to play').press('Enter');
  await expect.poll(async () => sw.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('player')).player?.stream?.title), { timeout: 30_000 }).toBe('The Earth: 4K Extended Edition');
  await panel.waitForTimeout(8000); // past YouTube's own title overlay
  await shot(panel, 'player/panel-youtube');
  const yt = await page(ctx, POPUP);
  await yt.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await yt.getByRole('region', { name: 'Player' }).scrollIntoViewIfNeeded();
  await yt.waitForTimeout(1500);
  await shot(yt, 'player/popup-youtube');
  await mark('popup.youtube.pause', yt.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Pause' }));
  await yt.close();

  // Music already playing in a tab: a music site's page that says what plays through the browser's media session.
  const site = await ctx.newPage();
  await site.goto('https://music.youtube.com/watch?v=demo');
  await expect.poll(async () => sw.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('player')).player?.tabs?.[0]?.title), { timeout: 15_000 }).toBe('Gymnopédie No. 1');
  const tabPop = await page(ctx, POPUP);
  await tabPop.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const tabCard = tabPop.getByRole('region', { name: 'Player' });
  await tabCard.scrollIntoViewIfNeeded();
  await expect(tabCard.getByText('Gymnopédie No. 1')).toBeVisible();
  await tabPop.waitForTimeout(1200);
  await shot(tabPop, 'player/popup-tab');
  await mark('popup.tab.pause', tabCard.getByRole('button', { name: 'Pause' }));
  await mark('popup.tab.next', tabCard.getByRole('button', { name: 'Next' }));
  await tabPop.close();
  await panel.getByRole('radio', { name: 'Tabs' }).click();
  await panel.waitForTimeout(800);
  await shot(panel, 'player/panel-tabs');

  // Google Calendar: one sign-in, and the blocks go to a Study Duo calendar by themselves. Google's sign-in needs a
  // person and an account, so the browser's answer is stood in for and Google's calendar service is answered here,
  // as in the calendar test.
  await sw.evaluate(() => {
    const c = (globalThis as any).chrome;
    c.identity.getAuthToken = async () => ({ token: 'demo-token' });
    c.identity.removeCachedAuthToken = async () => undefined;
  });
  await dash.goto(`${DASH}#connections`);
  expect(await dash.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ kind: 'calendar', op: 'connect' }))).toBe(true);
  await dash.reload();
  const google = dash.getByRole('region', { name: /Google Calendar/ });
  await google.scrollIntoViewIfNeeded().catch(() => undefined);
  await dash.waitForTimeout(1000);
  await shot(dash, 'player/connections-google');
  await mark('connections.google', google);
  // Last, because the page clock it holds still is shared by every page in the browser: the popup's record player,
  // Sounds at rest on white noise, then frame by frame.
  const pop = await page(ctx, POPUP);
  await pop.clock.install();
  await pop.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const card = pop.getByRole('region', { name: 'Player' });
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: /TAB|YOUTUBE|FOLDER/ }).click();
  await pop.getByRole('menuitemradio', { name: /Focus noise/ }).click();
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByRole('button', { name: 'Play' })).toBeVisible();
  await card.getByRole('radio', { name: 'White' }).click(); // the film names them in order: white, pink, brown
  await expect(card.getByRole('radio', { name: 'White' })).toHaveAttribute('aria-checked', 'true');
  await pop.waitForTimeout(1200);
  await pop.evaluate(() => window.scrollTo(0, 0)); // the source list scrolled the popup; it opens at the top
  await pop.waitForTimeout(300);
  await shot(pop, 'player/rest');
  await mark('player.card', card);
  for (const name of ['White', 'Pink', 'Brown']) await mark(`player.${name.toLowerCase()}`, card.getByRole('radio', { name }));
  await mark('player.play', card.getByRole('button', { name: 'Play' }));
  await mark('player.source', card.getByRole('button', { name: /SOUNDS/ }));

  // Frame by frame from here: the page's clock stands still unless a frame moves it.
  let k = 0;
  const FRAME = 1000 / 30;
  const frames = async (name: string, count: number) => {
    for (let i = 0; i < count; i++, k++) {
      await pop.clock.runFor(FRAME);
      await pop.evaluate((k) => {
        const w = window as unknown as { __born?: Map<Animation, number> };
        const born = (w.__born ??= new Map());
        for (const a of document.getAnimations()) {
          if (!born.has(a)) born.set(a, k);
          a.pause();
          a.currentTime = (k - born.get(a)!) * (1000 / 30);
        }
      }, k);
      await pop.screenshot({ type: 'jpeg', quality: 90, path: `${P}/${name}-${String(i).padStart(3, '0')}.jpg` });
    }
  };
  await pop.clock.pauseAt(Date.now() + 2000);
  await card.getByRole('button', { name: 'Play' }).click();
  await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible();
  await frames('white', 90); // out of the sleeve, up to speed, turning
  await card.getByRole('radio', { name: 'Pink' }).click();
  await expect(card.getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true');
  await frames('pink', 54); // one turn at 33 1/3 rpm
  await card.getByRole('radio', { name: 'Brown' }).click();
  await expect(card.getByRole('radio', { name: 'Brown' })).toHaveAttribute('aria-checked', 'true');
  await frames('brown', 54);

  await pop.close();
  fs.writeFileSync(`${P}/boxes.json`, JSON.stringify(boxes, null, 1));
  await ctx.close();
  console.log('player footage', fs.readdirSync(P).length, 'items');
});
