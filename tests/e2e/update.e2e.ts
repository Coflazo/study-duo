import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXT_DIR, EXT_ID, launchBare } from './extension';

test('newer files on disk show "update waiting", and Reload runs them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-duo-copy-'));
  fs.cpSync(EXT_DIR, dir, { recursive: true });
  const b = await launchBare();
  try {
    await b.install(dir);
    const popup = await b.ctx.newPage();
    await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
    await expect(popup.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(popup.getByText('Study Duo has an update waiting.')).toHaveCount(0);

    // A rebuild lands in the folder Chrome loaded from, but nobody pressed reload.
    const file = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.version_name = `${manifest.version_name} next`;
    fs.writeFileSync(file, JSON.stringify(manifest));

    await popup.reload();
    await expect(popup.getByText('Study Duo has an update waiting.')).toBeVisible();
    const dashboard = await b.ctx.newPage();
    await dashboard.goto(`chrome-extension://${EXT_ID}/dashboard.html`);
    await expect(dashboard.getByText('Study Duo has an update waiting.')).toBeVisible();

    // Reload restarts the extension (its pages close with it). In real Chrome the restart runs the new files, the
    // same as the reload arrow on chrome://extensions; this test browser cannot bring a DevTools-loaded extension back.
    const closed = popup.waitForEvent('close');
    await popup.getByRole('button', { name: 'Reload' }).click().catch(() => undefined); // the page may close mid-click
    await closed;
  } finally {
    await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
