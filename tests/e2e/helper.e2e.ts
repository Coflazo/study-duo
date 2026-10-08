import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { EXT_ID, launch, readStore, tempProfile } from './extension';

const CONN = `chrome-extension://${EXT_ID}/dashboard.html#connections`;

/** Registers the real helper (with a fake song) where Chrome looks for this profile's native messaging hosts. */
function registerHelper(profile: string) {
  const dir = path.join(profile, 'NativeMessagingHosts');
  fs.mkdirSync(dir, { recursive: true });
  // A copy, as the installer makes: macOS keeps browsers out of folders like Desktop, where this repository may live.
  const helper = path.join(profile, 'study-duo-helper.sh');
  fs.copyFileSync(path.resolve('helper/study-duo-helper.sh'), helper);
  const wrapper = path.join(profile, 'helper.sh');
  fs.writeFileSync(wrapper, `#!/bin/sh\nSTUDY_DUO_HELPER_FAKE="$(printf 'Says\\tNils Frahm\\tSpaces\\tMusic')" STUDY_DUO_HELPER_INTERVAL=1 exec sh "${helper}"\n`);
  fs.chmodSync(wrapper, 0o755);
  fs.writeFileSync(path.join(dir, 'com.coflazo.study_duo.json'), JSON.stringify({ name: 'com.coflazo.study_duo', description: 'test', path: wrapper, type: 'stdio', allowed_origins: [`chrome-extension://${EXT_ID}/`] }));
}

test('the desktop helper tells Study Duo what a desktop app plays, and it counts like a tab', async () => {
  test.skip(process.platform === 'win32', 'the Windows helper is tested in tests/helper/test-helper.ps1');
  const profile = tempProfile();
  registerHelper(profile);
  const { ctx, sw } = await launch(profile);
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.close();

  const p = await ctx.newPage();
  await p.goto(CONN);
  await p.getByRole('button', { name: 'Turn on' }).click();
  await expect(p.getByText('On. Last heard from Music.')).toBeVisible({ timeout: 15_000 });
  await p.waitForTimeout(6_000); // a song counts after 5 seconds
  await p.getByRole('button', { name: 'Turn off' }).click();
  await expect.poll(async () => (await readStore(sw, 'listens')).map((l) => [l.host, l.title, l.artist, String(l.sessionId).endsWith('-focus')])).toEqual([['app:music', 'Says', 'Nils Frahm', true]]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('without the helper installed, Desktop apps says how to install it', async () => {
  const profile = tempProfile();
  const { ctx } = await launch(profile);
  const p = await ctx.newPage();
  await p.goto(CONN);
  await p.getByRole('button', { name: 'Turn on' }).click();
  await expect(p.getByText(/The desktop helper isn't installed\. Run the install line again with --helper/)).toBeVisible({ timeout: 15_000 });
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
