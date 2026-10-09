import { expect, test } from '@playwright/test';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

declare const chrome: any;

// A music site as the browser sees it: metadata in navigator.mediaSession, and the site's own play, pause and skip
// handlers, which record what Study Duo presses.
const SITE = `<!doctype html><title>Music</title><script>
  window.calls = [];
  const songs = ['Weightless', 'Electra', 'Mellomaniac'];
  let i = 0;
  const show = (state) => {
    navigator.mediaSession.metadata = new MediaMetadata({ title: songs[i], artist: 'Marconi Union', album: 'Ambient' });
    navigator.mediaSession.playbackState = state;
    document.dispatchEvent(new Event(state === 'playing' ? 'play' : 'pause'));
  };
  const on = (action, fn) => navigator.mediaSession.setActionHandler(action, () => { calls.push(action); fn(); });
  on('play', () => show('playing'));
  on('pause', () => show('paused'));
  on('nexttrack', () => { i = (i + 1) % songs.length; show('playing'); });
  on('previoustrack', () => { i = (i + songs.length - 1) % songs.length; show('playing'); });
  show('playing');
</script>`;

test('music in a tab shows on the card and in Tabs, and Study Duo can pause it, skip it and hand over to noise', async () => {
  test.setTimeout(60_000);
  const { ctx, sw } = await launch(tempProfile());
  await ctx.route('https://music.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body: SITE }));
  const site = await ctx.newPage();
  await site.goto('https://music.youtube.com/watch?v=abc');
  const calls = () => site.evaluate(() => (window as any).calls as string[]);

  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  const player = () => panel.evaluate(async () => (await chrome.storage.session.get('player')).player);

  // Music started in a tab becomes what the card shows and controls.
  await expect.poll(async () => (await player())?.tabs?.[0]?.title, { timeout: 10_000 }).toBe('Weightless');
  expect(await player()).toMatchObject({ active: 'tab', playing: true });
  await expect(panel.locator('.title')).toHaveText('Weightless');

  // Pause and skip from the panel press the site's own buttons.
  await panel.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(calls).toContain('pause');
  await expect.poll(async () => (await player())?.playing).toBe(false);
  await panel.getByRole('button', { name: 'Next' }).click();
  await expect.poll(calls).toContain('nexttrack');
  await expect.poll(async () => (await player())?.tabs?.[0]?.title, { timeout: 10_000 }).toBe('Electra');

  // Tabs lists it, with its own play and next.
  await panel.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Tabs' }).click();
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByRole('listitem')).toContainText('music.youtube.com');

  // The skip started the next song, so it plays. Picking noise in the popup hands over: the tab pauses, noise starts.
  await site.evaluate(() => ((window as any).calls.length = 0));
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.locator('.title')).toHaveText('Electra');
  await popup.getByRole('button', { name: 'TAB' }).click();
  await expect(popup.getByRole('menuitemradio', { name: /YouTube Music tab/ })).toHaveAttribute('aria-checked', 'true');
  await popup.getByRole('menuitemradio', { name: /Focus noise/ }).click();
  await expect.poll(async () => (await player())).toMatchObject({ active: 'noise', playing: true });
  await expect.poll(calls).toEqual(['pause']);

  // The tab closes: it leaves the list.
  await site.close();
  await expect.poll(async () => (await player())?.tabs?.length).toBe(0);
  // The timer was never started: nothing became a listen.
  expect(await readStore(sw, 'listens')).toEqual([]);
  await ctx.close();
});

test('a web page cannot press a music tab\'s buttons through Study Duo, and sites that are not music sites are never listed', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://music.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body: SITE }));
  await ctx.route('https://fake-music.example/**', (r) => r.fulfill({ contentType: 'text/html', body: SITE }));
  const pretender = await ctx.newPage();
  await pretender.goto('https://fake-music.example/');
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await panel.waitForTimeout(3_000);
  expect((await panel.evaluate(async () => (await chrome.storage.session.get('player')).player))?.tabs ?? []).toEqual([]);
  await ctx.close();
});
