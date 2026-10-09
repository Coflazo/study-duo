import { expect, test } from '@playwright/test';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

/** YouTube's embedded player as far as Study Duo uses it: its postMessage API, with time that runs while it plays. */
const FAKE_PLAYER = `<!doctype html><html><body style="margin:0;background:#000;color:#fff">fake player<script>
const q = new URLSearchParams(location.search);
const id = location.pathname.split('/').pop();
const list = q.get('list');
const videos = list ? ['aaaaaaaaaaa', 'bbbbbbbbbbb'] : [id];
let i = 0, t = Number(q.get('start') || 0), playing = false, last = Date.now();
const now = () => (playing ? t + (Date.now() - last) / 1000 : t);
const send = (event, info) => parent.postMessage(JSON.stringify({ event, info, channel: 'widget', id: 1 }), '*');
const info = () => ({ playerState: playing ? 1 : 2, currentTime: now(), duration: 600, videoData: { video_id: videos[i], title: 'Fake video ' + videos[i], author: 'Fake channel' } });
window.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.event === 'listening') {
    if (id === 'embedoffxyz') return send('onError', 150);
    if (q.get('autoplay') === '1' && !playing) { playing = true; last = Date.now(); }
    return send('infoDelivery', info());
  }
  if (m.event !== 'command') return;
  t = now(); last = Date.now();
  (window.calls = window.calls || []).push(m.func + (m.args.length ? ':' + m.args[0] : ''));
  document.title = window.calls.join(',');
  if (m.func === 'playVideo') playing = true;
  if (m.func === 'pauseVideo') playing = false;
  if (m.func === 'seekTo') t = m.args[0];
  if (m.func === 'nextVideo') { i = (i + 1) % videos.length; t = 0; }
  send('infoDelivery', info());
});
</script></body></html>`;

test('a YouTube link plays in the side panel, the popup controls it, and closing the panel stops it', async () => {
  const { ctx } = await launch(tempProfile());
  const embeds: string[] = [];
  await ctx.route('https://www.youtube-nocookie.com/embed/**', (r) => {
    embeds.push(r.request().url());
    return r.fulfill({ contentType: 'text/html', body: FAKE_PLAYER });
  });
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  const player = () => panel.evaluate(async () => (await chrome.storage.session.get('player')).player);

  // A link that is not YouTube is refused in plain words.
  await panel.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Streaming' }).click();
  await panel.getByLabel('YouTube link').fill('https://example.com/watch?v=X0Cv0l-j86Y');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText('That is not a YouTube link.');

  // A shared link plays from its start time; who shared it is dropped and never kept.
  await panel.getByLabel('YouTube link').fill('https://youtu.be/X0Cv0l-j86Y?t=60&si=sharer123');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await player())?.stream?.title).toBe('Fake video X0Cv0l-j86Y');
  expect(await player()).toMatchObject({ active: 'youtube', playing: true, stream: { url: 'https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=60' } });
  expect(embeds.at(-1)).toContain('/embed/X0Cv0l-j86Y?');
  expect(embeds.at(-1)).toContain('start=60');
  expect(embeds.join(' ')).not.toContain('sharer123');
  await expect(panel.locator('.title')).toHaveText('Fake video X0Cv0l-j86Y');
  const saved = await panel.evaluate(async () => (await chrome.storage.local.get('streamLinks')).streamLinks);
  expect(saved).toMatchObject([{ url: 'https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=60', title: 'Fake video X0Cv0l-j86Y', artist: 'Fake channel' }]);

  // The popup card shows it and drives it: pause, then next (one long video jumps 30 seconds).
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.locator('.title')).toHaveText('Fake video X0Cv0l-j86Y');
  await popup.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await player())?.playing).toBe(false);
  await popup.getByRole('button', { name: 'Next' }).click();
  const frame = panel.frameLocator('iframe[title="YouTube player"]');
  await expect.poll(() => panel.frames().find((f) => f.url().includes('/embed/'))?.title()).toMatch(/pauseVideo,seekTo:9\d/);
  void frame;

  // Noise from the popup; playing it, then picking the link again, hands over and the link plays on.
  await popup.getByRole('button', { name: /Play from|YOUTUBE/ }).click();
  await popup.getByRole('menuitemradio', { name: /Focus noise/ }).click();
  await popup.getByRole('radiogroup', { name: 'Noise colour' }).getByRole('radio', { name: 'Brown' }).click();
  await popup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await player())).toMatchObject({ active: 'noise', playing: true });

  // Then the panel closes: the background hears it and the link counts as stopped.
  await popup.getByRole('button', { name: /Play from|SOUNDS/ }).click();
  await popup.getByRole('menuitemradio', { name: /YouTube link/ }).click();
  await expect.poll(async () => (await player())?.active).toBe('youtube');
  await expect.poll(async () => (await player())?.playing).toBe(true);
  await panel.close();
  await expect.poll(async () => popup.evaluate(async () => (await chrome.storage.session.get('player')).player)).toMatchObject({ playing: false, panel: false });
  await ctx.close();
});

test('a video whose owner turned embedding off says so, with a way to YouTube', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://www.youtube-nocookie.com/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_PLAYER }));
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await panel.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Streaming' }).click();
  await panel.getByLabel('YouTube link').fill('youtube.com/watch?v=embedoffxyz');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Its owner lets it play only on YouTube.');
  await expect(panel.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=embedoffxyz');
  await ctx.close();
});

test('a link pasted into the popup card plays, and a wrong one is named plainly', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://www.youtube-nocookie.com/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_PLAYER }));
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.evaluate(() => chrome.runtime.sendMessage({ kind: 'player', op: 'source', source: 'youtube' }));
  await expect(popup.getByText('Play a YouTube link')).toBeVisible();
  await popup.getByLabel('YouTube link').fill('open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS');
  await popup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(popup.getByRole('alert')).toHaveText('That is not a YouTube link. Use one from youtube.com, youtu.be or music.youtube.com.');
  // The popup opens the side panel and closes itself, as it does for real; another page reads the result.
  const watcher = await ctx.newPage();
  await watcher.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await popup.getByLabel('YouTube link').fill('https://www.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp&si=x');
  await popup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => watcher.evaluate(async () => (await chrome.storage.session.get('player')).player.stream?.url)).toBe('https://www.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp');
  expect(await watcher.evaluate(async () => (await chrome.storage.local.get('streamLinks')).streamLinks.map((l: { url: string }) => l.url))).toEqual(['https://www.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp']);
  await ctx.close();
});
