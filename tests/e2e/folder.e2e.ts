import { expect, test, type Page } from '@playwright/test';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

/**
 * The music folder, end to end. A real folder needs a person to pick it, so the page's folder picker hands over a
 * folder in the browser's private file storage instead: same kind of handle, same reading code. Two short songs in
 * artist folders and a text file that must be skipped.
 */
async function fakeFolder(page: Page) {
  await page.evaluate(async () => {
    /** Silence as a WAV: 8 kHz, mono, 16-bit. */
    const wav = (seconds: number) => {
      const n = 8000 * seconds;
      const b = new DataView(new ArrayBuffer(44 + n * 2));
      const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
      s(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
      b.setUint32(24, 8000, true); b.setUint32(28, 16000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, 'data'); b.setUint32(40, n * 2, true);
      return b.buffer;
    };
    const root = await navigator.storage.getDirectory();
    const music = await root.getDirectoryHandle('Music', { create: true });
    const put = async (dir: FileSystemDirectoryHandle, name: string, data: ArrayBuffer | string) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    await put(await music.getDirectoryHandle('Chopin', { create: true }), '01 - Nocturne.wav', wav(1.5));
    await put(await music.getDirectoryHandle('Satie', { create: true }), 'Gymnopedie.wav', wav(1));
    await put(music, 'notes.txt', 'not a song');
    (window as any).showDirectoryPicker = async () => music;
  });
}

test('a picked music folder is listed, searched and played song after song by the one player', async () => {
  const { ctx } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#music`);
  await fakeFolder(page);
  const section = page.getByRole('region', { name: 'Your music folder' });

  await section.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(section.getByText('Music · 2 songs · on this computer')).toBeVisible();
  const rows = section.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Gymnopedie');
  await expect(rows.nth(1)).toContainText('Nocturne');

  // Search narrows the list; clearing it brings the rest back.
  await section.getByRole('searchbox', { name: 'Search your folder' }).fill('noct');
  await expect(rows).toHaveCount(1);
  await section.getByRole('searchbox', { name: 'Search your folder' }).fill('');

  // Play from the first song: it plays, then the next one by itself, then the player stops at the end.
  const player = () => page.evaluate(async () => (await chrome.storage.session.get('player')).player);
  const nowTitle = async () => (await player())?.now?.title ?? null;
  await rows.nth(0).getByRole('button').click();
  await expect.poll(async () => (await player())?.playing).toBe(true);
  await expect.poll(nowTitle).toBe('Gymnopedie');
  await expect.poll(async () => (await player())?.duration, { timeout: 5_000 }).toBe(1000);
  await expect(rows.nth(0).getByRole('button')).toHaveAttribute('aria-current', 'true');
  await expect.poll(nowTitle, { timeout: 6_000 }).toBe('Nocturne');
  await expect.poll(async () => (await player())?.playing, { timeout: 6_000 }).toBe(false);

  // Forget folder clears the list.
  await section.getByRole('button', { name: 'Forget folder' }).click();
  await expect(section.getByRole('button', { name: 'Choose a folder' })).toBeVisible();
  await ctx.close();
});

test('the popup card shows the folder song: cover, seek line, previous and next, and the source list', async () => {
  const { ctx } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#music`);
  await fakeFolder(page);
  const section = page.getByRole('region', { name: 'Your music folder' });
  await section.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(section.getByRole('listitem')).toHaveCount(2);

  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const card = popup.getByRole('region', { name: 'Player' });

  // Pick the folder from the source list: nothing queued yet, so the card offers Play all.
  await card.getByRole('button', { name: /SOUNDS/ }).click();
  await popup.getByRole('menuitemradio', { name: /Your folder/ }).click();
  await expect(card.getByRole('button', { name: /FOLDER/ })).toBeVisible();
  await expect(card.getByText('2 songs on this computer')).toBeVisible();
  await card.getByRole('button', { name: 'Play all' }).click();

  // The song: its title, the seek line with its length, previous and next.
  await expect(card.locator('.title')).toHaveText('Gymnopedie');
  await expect(card.getByRole('slider', { name: 'Position' })).toBeEnabled({ timeout: 5_000 });
  await expect(card.getByText('Your folder · 1 of 2 · Up next: Nocturne')).toBeVisible();
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card.locator('.title')).toHaveText('Nocturne');
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await ctx.close();
});

test('the side panel: library, then now playing with shuffle, repeat and up next', async () => {
  const { ctx } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await fakeFolder(page);
  const player = () => page.evaluate(async () => (await chrome.storage.session.get('player')).player);

  // Noise first: the panel plays it and shows its colours.
  await page.getByRole('radiogroup', { name: 'Noise colour' }).getByRole('radio', { name: 'White' }).click();
  await expect.poll(async () => (await player())?.noise).toBe('white');

  // The library tab reads the folder; a song plays and Now playing shows it with what comes next.
  await page.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('listitem').nth(0).getByRole('button').click();
  await page.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Now playing' }).click();
  await expect(page.locator('.title')).toHaveText('Gymnopedie');
  await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible();

  // Repeat cycles off, all songs, this song; shuffle is a toggle.
  await page.getByRole('button', { name: 'Repeat: off' }).click();
  await expect(page.getByRole('button', { name: 'Repeat: all songs' })).toBeVisible();
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect(page.getByRole('button', { name: 'Shuffle' })).toHaveAttribute('aria-pressed', 'true');

  // Up next: a click jumps to that song.
  await page.getByRole('list').getByRole('button', { name: /Nocturne/ }).click();
  await expect(page.locator('.title')).toHaveText('Nocturne');

  // The popup opened mid-song shows the disc already out and turning at full speed, never spinning up from rest.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.locator('.art.ready')).toBeVisible();
  expect(await popup.evaluate(() => ({ out: document.querySelector('.disc')!.classList.contains('out'), turning: document.querySelector('.spin')!.getAnimations().length > 0 }))).toEqual({ out: true, turning: true });
  await popup.close();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await player())?.playing).toBe(false);
  await ctx.close();
});
