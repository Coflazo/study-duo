import { expect, test, type BrowserContext, type Worker } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

const DASH = `chrome-extension://${EXT_ID}/dashboard.html`;
const FEED = 'https://canvas.study-duo.test/feeds/calendars/user_abc.ics';

/** Records every request that leaves the extension, from pages and the service worker alike. */
async function setup() {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const outside: string[] = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    outside.push(url.href);
    return route.abort();
  });
  return { profile, ctx, sw, outside };
}

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function feed(now: number) {
  const ev = (uid: string, due: number, summary: string) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${stamp(due)}\r\nDTEND:${stamp(due)}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
  const tomorrow = new Date(now + 86_400_000);
  tomorrow.setHours(23, 59, 0, 0);
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${ev('event-assignment-1', tomorrow.getTime(), 'Homework 3 [Linear Algebra]')}${ev('event-assignment-2', now + 9 * 86_400_000, 'Essay draft [Academic Writing]')}BEGIN:VEVENT\r\nUID:event-calendar-event-3\r\nDTSTART:${stamp(now + 3_600_000)}\r\nDTEND:${stamp(now + 7_200_000)}\r\nSUMMARY:Lecture 6 [Linear Algebra]\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}

async function block(ctx: BrowserContext, sw: Worker) {
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('timer')).timer?.status)).toBe('running');
  await popup.waitForTimeout(1_500);
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(async () => (await readStore(sw, 'sessions')).length).toBe(1);
  await popup.close();
}

test('with every connection off, a block and every dashboard screen make no requests', async () => {
  const { profile, ctx, sw, outside } = await setup();
  await block(ctx, sw);
  const p = await ctx.newPage();
  for (const screen of ['today', 'todo', 'insights', 'timeline', 'music', 'sites', 'connections', 'settings', 'data']) {
    await p.goto(`${DASH}#${screen}`);
    await p.waitForTimeout(400);
  }
  // The service worker's own resource log, as a second witness besides the routes.
  const fetched = await sw.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith('chrome-extension:')));
  expect(outside).toEqual([]);
  expect(fetched).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('a course calendar link turns deadlines into to-dos with due dates, and only that host is asked', async () => {
  const { profile, ctx, sw, outside } = await setup();
  const now = Date.now();
  await ctx.route(FEED, (route) => route.fulfill({ contentType: 'text/calendar', body: feed(now) }));
  const p = await ctx.newPage();
  await p.goto(`${DASH}#connections`);
  await p.getByLabel('Calendar link').fill(FEED.replace('https://', 'webcal://'));
  await p.getByRole('button', { name: 'Import' }).click();
  await expect(p.getByText('2 deadlines in your to-do list')).toBeVisible({ timeout: 15_000 });
  await expect(p.getByText(/From canvas\.study-duo\.test\. Checked at \d\d:\d\d/)).toBeVisible();

  await p.goto(`${DASH}#todo`);
  await expect(p.getByText('2 left, 0 done today · 2 from your course calendar')).toBeVisible();
  const homework = p.locator('li', { hasText: 'Homework 3' });
  await expect(homework).toContainText('LA');
  await expect(homework).toContainText('Due tomorrow 23:59');
  await expect(p.locator('li', { hasText: 'Lecture 6' })).toHaveCount(0);

  // Deleted stays deleted after the next check.
  await homework.getByRole('button', { name: /More/ }).click();
  await p.getByRole('menuitem', { name: 'Delete' }).click();
  await p.goto(`${DASH}#connections`);
  await p.getByRole('button', { name: 'Check now' }).click();
  await expect(p.getByText('1 deadline in your to-do list')).toBeVisible({ timeout: 15_000 });
  await p.goto(`${DASH}#todo`);
  await expect(p.locator('li', { hasText: 'Homework 3' })).toHaveCount(0);
  await expect(p.locator('li', { hasText: 'Essay draft' })).toBeVisible();

  expect(outside).toEqual([]); // the feed was answered by its own route; nothing else left the browser
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('ListenBrainz plays that fell inside a block are counted, and the rest are not', async () => {
  const { profile, ctx, sw, outside } = await setup();
  await block(ctx, sw);
  const [session] = await readStore(sw, 'sessions');
  const at = (ms: number) => Math.floor(ms / 1000);
  await ctx.route('https://api.listenbrainz.org/1/user/ana_b/listens?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ payload: { listens: [
        { listened_at: at(session.startedAt + 1_000), track_metadata: { artist_name: 'Nils Frahm', track_name: 'Says', release_name: 'Spaces' } },
        { listened_at: at(session.startedAt - 3_600_000), track_metadata: { artist_name: 'Nils Frahm', track_name: 'Earlier' } },
      ] } }),
    }),
  );
  const p = await ctx.newPage();
  await p.goto(`${DASH}#connections`);
  await p.getByPlaceholder('Username').first().fill('ana_b');
  await p.getByRole('button', { name: 'Connect', exact: true }).first().click();
  await expect(p.getByText('ListenBrainz: ana_b')).toBeVisible();
  await expect(p.getByText(/1 song counted in your blocks so far/)).toBeVisible({ timeout: 15_000 });
  const listens = (await readStore(sw, 'listens')).filter((l) => l.host === 'listenbrainz');
  expect(listens.map((l) => [l.title, l.sessionId])).toEqual([['Says', session.id]]);
  expect(outside).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
