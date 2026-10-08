import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

const DATA = `chrome-extension://${EXT_ID}/dashboard.html#data`;
const local = (sw: { evaluate: Function }, key: string) => (sw as any).evaluate(async (k: string) => (await (globalThis as any).chrome.storage.local.get(k))[k], key);

test('a move file carries settings, site lists and to-dos to a fresh profile, after a preview', async () => {
  const fromProfile = tempProfile();
  const from = await launch(fromProfile);
  await from.sw.evaluate(async () => {
    const c = (globalThis as any).chrome;
    const { settings } = await c.storage.local.get('settings');
    await c.storage.local.set({
      settings: { ...(settings ?? {}), focusMin: 50 },
      sites: { 'youtube.com': 'blocked', 'canvas.uva.nl': 'study' },
      todos: [{ id: 't1', text: 'Statistics problem set 4', course: 'STAT101', done: false, doneAt: null, ifThen: null }],
    });
  });
  const a = await from.ctx.newPage();
  await a.goto(DATA);
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Save file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^study-duo-move-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(Object.keys(saved).sort()).toEqual(['app', 'at', 'kind', 'settings', 'sites', 'todos', 'version']);
  expect(JSON.stringify(saved)).not.toMatch(/sessions|listens|connections/);

  // Show codes: one QR at a time, with its number.
  await a.getByRole('button', { name: 'Show codes' }).click();
  await expect(a.getByRole('img', { name: /^Move code 1 of \d+$/ })).toBeVisible();
  await a.getByRole('button', { name: 'Done' }).click();
  await expect(a.getByRole('button', { name: 'Show codes' })).toBeVisible();

  const toProfile = tempProfile();
  const to = await launch(toProfile);
  const b = await to.ctx.newPage();
  await b.goto(DATA);
  await b.locator('input[type="file"][accept*="json"]').setInputFiles(file);
  const preview = b.getByRole('region', { name: 'Ready to move in' });
  await expect(preview).toContainText('your settings, 2 sites and 1 to-do');
  expect((await local(to.sw, 'settings'))?.focusMin ?? 25).toBe(25); // nothing changes before Move in
  await preview.getByRole('button', { name: 'Move in' }).click();
  await expect(b.getByText('Moved in: your settings and site lists, and 1 to-do added.')).toBeVisible();
  expect((await local(to.sw, 'settings')).focusMin).toBe(50);
  expect(await local(to.sw, 'sites')).toEqual({ 'youtube.com': 'blocked', 'canvas.uva.nl': 'study' });
  expect((await local(to.sw, 'todos')).map((t: { text: string }) => t.text)).toEqual(['Statistics problem set 4']);

  // A file that is not a move file changes nothing.
  const junk = `${toProfile}-junk.json`;
  fs.writeFileSync(junk, JSON.stringify({ app: 'other' }));
  await b.locator('input[type="file"][accept*="json"]').setInputFiles(junk);
  await expect(b.getByText('That file is not a Study Duo move file. Nothing changed.')).toBeVisible();

  await from.ctx.close();
  await to.ctx.close();
  for (const p of [fromProfile, toProfile, junk]) fs.rmSync(p, { recursive: true, force: true });
});

test('the camera runs only while the Scan panel is open', async () => {
  const profile = tempProfile();
  const { ctx } = await launch(profile, ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']);
  const p = await ctx.newPage();
  await p.goto(DATA);
  // Keep a handle on the stream the page gets, to check its tracks afterwards.
  await p.evaluate(() => {
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => ((window as any).__stream = await original(c));
  });
  await p.getByRole('button', { name: 'Scan' }).click();
  await expect(p.getByRole('status')).toHaveText('Looking for the first code…');
  await expect.poll(() => p.evaluate(() => (window as any).__stream?.getVideoTracks()[0]?.readyState)).toBe('live');
  await p.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => p.evaluate(() => (window as any).__stream.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);

  // Leaving the screen turns it off too.
  await p.getByRole('button', { name: 'Scan' }).click();
  await expect.poll(() => p.evaluate(() => (window as any).__stream?.getVideoTracks()[0]?.readyState)).toBe('live');
  await p.evaluate(() => (location.hash = 'today'));
  await expect.poll(() => p.evaluate(() => (window as any).__stream.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
