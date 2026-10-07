import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

declare const chrome: any;

const PLAYER = `<!doctype html><script>navigator.mediaSession.metadata = new MediaMetadata({ title: 'Says', artist: 'Nils Frahm', album: 'Spaces' }); navigator.mediaSession.playbackState = 'playing';</script>`;

/** Seven seconds of a quiet 220 Hz tone as a WAV file (no tags: the file name is the title). */
function wav(seconds = 7, rate = 8000): Buffer {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(2000 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2);
  return b;
}

test('Music: songs in tabs, focus noise, your own files, and today\'s listens', async () => {
  test.setTimeout(90_000);
  const { ctx, sw } = await launch(tempProfile());
  await ctx.route('https://music.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body: PLAYER }));
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#music`);
  await expect(page.getByRole('heading', { name: 'Music', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing is playing in your tabs')).toBeVisible();

  const tab = await ctx.newPage();
  await tab.goto('https://music.youtube.com/watch?v=1');
  await page.bringToFront();
  await expect(page.getByText('Nils Frahm · Spaces · music.youtube.com')).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(5_500); // under 5 seconds is a skip, not a listen
  await tab.close();

  // Focus noise plays in the offscreen page and is logged as a listen when it stops.
  await page.getByRole('radio', { name: 'Brown' }).click();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.getByText('Brown noise is playing')).toBeVisible();
  await expect.poll(() => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length)).toBe(1);
  await page.waitForTimeout(5_500);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Silence')).toBeVisible();

  // Your own file: plays here; the title comes from the file name when there are no tags.
  const file = `${test.info().outputDir}/03 - Lecture tune.wav`;
  fs.mkdirSync(test.info().outputDir, { recursive: true });
  fs.writeFileSync(file, wav());
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('Lecture tune', { exact: true })).toBeVisible();
  await expect(page.getByText('1 song')).toBeVisible();
  await page.waitForTimeout(5_500);
  await page.getByRole('button', { name: 'Pause' }).click();

  await expect.poll(async () => (await readStore(sw, 'listens')).map((l) => [l.host, l.title]).sort(), { timeout: 8_000 }).toEqual([
    ['file', 'Lecture tune'],
    ['music.youtube.com', 'Says'],
    ['sound', 'Brown noise'],
  ]);
  await expect(page.getByText('Focus sound', { exact: false }).first()).toBeVisible();
  await ctx.close();
});

test('Your data: one switch per signal, export everything, delete only after typing delete', async () => {
  const { ctx, sw } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#data`);
  await expect(page.getByRole('heading', { name: 'Your data', level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Keys, clicks and scrolls per minute' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Songs you play' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.measure?.music)).toBe(false);

  // Something to export and delete.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(async () => (await readStore(sw, 'sessions')).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText(/^1 blocks and breaks/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await (await download).path();
  const exported = JSON.parse(fs.readFileSync(file!, 'utf8'));
  expect(exported).toMatchObject({ app: 'Study Duo', sessions: [expect.objectContaining({ phase: 'focus' })], listens: [], activity: expect.any(Array), blocks: [] });

  await page.getByRole('button', { name: 'Delete…' }).click();
  const confirm = page.getByRole('button', { name: 'Delete everything' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type delete to confirm').fill('delete');
  await confirm.click();
  await expect(page.getByRole('status')).toHaveText(/Deleted/);
  await expect(page.getByText(/^0 blocks and breaks/)).toBeVisible();
  expect(await readStore(sw, 'sessions')).toEqual([]);
  await ctx.close();
});
