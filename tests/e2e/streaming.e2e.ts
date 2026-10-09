import { expect, test } from '@playwright/test';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

// Spotify's embed as far as Study Duo uses it: plain-object messages, "ready", then playback updates in ms. A
// 30-second track is a preview (not signed in).
const FAKE_SPOTIFY = (duration: number) => `<!doctype html><body>spotify<script>
let playing = false, t = 0, last = Date.now(), acked = false;
const now = () => (playing ? t + (Date.now() - last) : t);
const update = () => parent.postMessage({ type: 'playback_update', payload: { isPaused: !playing, isBuffering: false, duration: ${duration}, position: Math.round(now()), playingURI: 'spotify:track:x' } }, '*');
window.calls = [];
window.addEventListener('message', (e) => {
  const m = e.data; if (!m || typeof m !== 'object') return;
  window.calls.push(m.command + (m.timestamp !== undefined ? ':' + m.timestamp : '')); document.title = window.calls.join(',');
  if (m.command === 'load_complete_ack') acked = true;
  t = now(); last = Date.now();
  if (m.command === 'play' || m.command === 'resume') playing = true;
  if (m.command === 'pause') playing = false;
  if (m.command === 'seek') t = m.timestamp * 1000;
  update();
});
parent.postMessage({ type: 'ready' }, '*');
</script></body>`;

// SoundCloud's widget: JSON-string messages, "ready", then events it was asked to send.
const FAKE_SOUNDCLOUD = `<!doctype html><body>soundcloud<script>
const send = (method, value) => parent.postMessage(JSON.stringify({ widgetId: 'widget_1', method, value }), '*');
const listen = new Set(); let playing = false, t = 0, last = Date.now();
window.calls = [];
window.addEventListener('message', (e) => {
  const m = JSON.parse(e.data); window.calls.push(m.method + (m.value !== undefined && m.method !== 'addEventListener' ? ':' + m.value : '')); document.title = window.calls.join(',');
  if (m.method === 'addEventListener') return listen.add(m.value);
  if (m.method === 'getCurrentSound') return send('getCurrentSound', { title: 'Flickermood', user: { username: 'Forss' }, duration: 213000 });
  t = playing ? t + Date.now() - last : t; last = Date.now();
  if (m.method === 'play') { playing = true; if (listen.has('play')) send('play', null); }
  if (m.method === 'pause') { playing = false; if (listen.has('pause')) send('pause', null); }
  if (m.method === 'seekTo') t = m.value;
  if (listen.has('playProgress') && playing) send('playProgress', { currentPosition: t, relativePosition: t / 213000 });
});
setTimeout(() => send('ready', null), 100);
</script></body>`;

async function openPanel(ctx: any) {
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await panel.getByRole('radiogroup', { name: 'Sections' }).getByRole('radio', { name: 'Streaming' }).click();
  return panel;
}
const embedTitle = (panel: any, host: string) => panel.frames().find((f: any) => f.url().includes(host))?.title();
const stateOf = (page: any) => page.evaluate(async () => (await chrome.storage.session.get('player')).player);

test('Spotify plays in the side panel: play, pause and seek from the card; previews say to sign in', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://open.spotify.com/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_SPOTIFY(200_000) }));
  const panel = await openPanel(ctx);
  await panel.getByLabel('Link to play').fill('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ?si=sharer');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  // Ready is answered, then the state's "play" is sent.
  await expect.poll(() => embedTitle(panel, 'open.spotify.com')).toMatch(/load_complete_ack,play/);
  await expect.poll(async () => (await stateOf(panel))?.stream).toMatchObject({ source: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', duration: 200_000 });
  expect((await stateOf(panel)).playing).toBe(true);
  // From the popup card: seek and pause; skipping is Spotify's own.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.locator('.title')).toHaveText('Playing in the side panel');
  await expect(popup.getByRole('button', { name: 'Next' })).toBeDisabled();
  await popup.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => embedTitle(panel, 'open.spotify.com')).toMatch(/pause/);
  await expect.poll(async () => (await stateOf(panel))?.playing).toBe(false);
  await ctx.close();
});

test('a Spotify preview says to sign in, and Sign in opens a small window on Spotify', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://open.spotify.com/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_SPOTIFY(30_000) }));
  await ctx.route('https://accounts.spotify.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Spotify login</title>' }));
  const panel = await openPanel(ctx);
  await panel.getByLabel('Link to play').fill('spotify:track:2i6veFyjDIodH3hgpkwxK6');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Only 30 s previews');
  await expect.poll(async () => (await stateOf(panel))?.stream?.problem).toBe('preview');
  const opened = ctx.waitForEvent('page');
  await panel.getByRole('status').getByRole('button', { name: 'Sign in' }).click();
  expect((await opened).url()).toMatch(/^https:\/\/accounts\.spotify\.com\/([a-z]{2}(-[A-Z]{2})?\/)?login/);
  await ctx.close();
});

test('SoundCloud plays with the title from the widget, and next and seek reach it', async () => {
  const { ctx } = await launch(tempProfile());
  await ctx.route('https://w.soundcloud.com/player/**', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_SOUNDCLOUD }));
  const panel = await openPanel(ctx);
  await panel.getByLabel('Link to play').fill('https://soundcloud.com/forss/flickermood?in=x');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await stateOf(panel))?.stream?.title).toBe('Flickermood');
  await expect(panel.locator('.title')).toHaveText('Flickermood');
  await panel.getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => embedTitle(panel, 'w.soundcloud.com')).toMatch(/next/);
  await ctx.close();
});

test('Apple Music and Tidal play in their own player, and say to use its buttons', async () => {
  const { ctx } = await launch(tempProfile());
  const frames: string[] = [];
  await ctx.route('https://embed.music.apple.com/**', (r) => (frames.push(r.request().url()), r.fulfill({ contentType: 'text/html', body: '<p>apple</p>' })));
  const panel = await openPanel(ctx);
  await panel.getByLabel('Link to play').fill('https://music.apple.com/us/album/random-access-memories/617154241');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => frames.length).toBe(1);
  expect(frames[0]).toBe('https://embed.music.apple.com/us/album/random-access-memories/617154241');
  await expect(panel.getByText("Play and pause with Apple Music's own buttons, above.")).toBeVisible();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.getByText("Use Apple Music's own buttons there.")).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  await ctx.close();
});
