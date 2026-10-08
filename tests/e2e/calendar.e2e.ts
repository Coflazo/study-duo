import { expect, test } from '@playwright/test';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

/**
 * Google Calendar sync end to end, with Google faked: the sign-in is stubbed in the service worker (a real one needs
 * a person and a Google account), and www.googleapis.com is answered by the test. Connect makes the calendar; a block
 * that ends goes in by itself, once, under an id made from its session.
 */
test('connecting makes the Study Duo calendar, and a block that ends goes in by itself', async () => {
  const { ctx, sw } = await launch(tempProfile());
  const calls: { method: string; path: string; body: any }[] = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.host !== 'www.googleapis.com') return route.abort();
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    calls.push({ method: req.method(), path: url.pathname, body });
    expect(req.headers().authorization).toBe('Bearer test-token');
    if (url.pathname === '/calendar/v3/calendars') return route.fulfill({ json: { id: 'cal-test' } });
    return route.fulfill({ json: body ?? {} });
  });
  await sw.evaluate(() => {
    const c = (globalThis as any).chrome;
    c.identity.getAuthToken = async () => ({ token: 'test-token' });
    c.identity.removeCachedAuthToken = async () => undefined;
  });

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`);
  expect(await page.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ kind: 'calendar', op: 'connect' }))).toBe(true);
  expect(calls.filter((c) => c.method === 'POST' && c.path === '/calendar/v3/calendars')).toHaveLength(1);
  const conn = await sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('connections')).connections.google);
  expect(conn).toEqual(expect.objectContaining({ on: true, calendarId: 'cal-test', error: null }));

  // One block through the popup: Start, then Skip ends it early.
  await page.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('timer')).timer?.status)).toBe('running');
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Skip' }).click();
  const [s] = await (async () => {
    await expect.poll(async () => (await readStore(sw, 'sessions')).length).toBe(1);
    return readStore(sw, 'sessions');
  })();

  const id = [...new TextEncoder().encode(s.id)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.path === '/calendar/v3/calendars/cal-test/events').length).toBe(1);
  const ev = calls.find((c) => c.path.endsWith('/events'))!.body;
  expect(ev.id).toBe(id);
  expect(ev.summary).toBe('Study (ended early)');
  expect(ev.colorId).toBe('11');
  expect(ev.description).toContain('Logged by Study Duo');

  // A second sync sends nothing new.
  await page.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ kind: 'connections', op: 'sync', which: 'google' }));
  expect(calls.filter((c) => c.path.endsWith('/events'))).toHaveLength(1);
  await ctx.close();
});
