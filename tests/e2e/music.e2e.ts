import { expect, test } from '@playwright/test';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

// A music site the way the browser sees one: the page fills in navigator.mediaSession, as YouTube Music does.
const PLAYER = `<!doctype html><title>Player</title><script>
  window.play = (title) => {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Nils Frahm', album: 'Spaces' });
    navigator.mediaSession.playbackState = 'playing';
    document.dispatchEvent(new Event('loadedmetadata'));
  };
  window.stop = () => { navigator.mediaSession.playbackState = 'paused'; document.dispatchEvent(new Event('pause')); };
  play('Says');
</script>`;

test('songs playing in a music tab become listens, tied to the study block they played in', async () => {
  test.setTimeout(60_000);
  const { ctx, sw } = await launch(tempProfile());
  await ctx.route('https://music.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body: PLAYER }));
  await ctx.route('https://fake-music.example/**', (r) => r.fulfill({ contentType: 'text/html', body: PLAYER }));
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();

  const player = await ctx.newPage();
  await player.goto('https://music.youtube.com/watch?v=abc');
  // Not a music site: whatever it claims to play is ignored.
  const pretender = await ctx.newPage();
  await pretender.goto('https://fake-music.example/');

  await player.waitForTimeout(6_000);
  await player.evaluate(() => (window as any).play('Hammers'));
  await player.waitForTimeout(6_000);
  await player.evaluate(() => (window as any).stop());

  await expect.poll(async () => (await readStore(sw, 'listens')).map((l) => l.title), { timeout: 10_000 }).toEqual(['Says', 'Hammers']);
  const [first] = await readStore(sw, 'listens');
  expect(first).toMatchObject({ host: 'music.youtube.com', artist: 'Nils Frahm', album: 'Spaces', sessionId: expect.stringMatching(/-focus$/) });
  expect(first.endedAt - first.startedAt).toBeGreaterThanOrEqual(5_000);
  expect(JSON.stringify(await readStore(sw, 'listens'))).not.toContain('watch?v=');
  await ctx.close();
});
