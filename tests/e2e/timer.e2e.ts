import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

// Runs inside the extension's service worker, where only `chrome` exists.
declare const chrome: any;

const timerField = (sw: import('@playwright/test').Worker, key: string) =>
  sw.evaluate(async (k) => (await chrome.storage.local.get('timer')).timer?.[k], key);

test('start, badge, alarm, completion with bell, pause, and badge restored after a browser restart', async () => {
  const profile = tempProfile();
  let { ctx, sw } = await launch(profile);
  expect(new URL(sw.url()).host).toBe(EXT_ID);

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => timerField(sw, 'status')).toBe('running');
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('25');
  expect(await sw.evaluate(() => chrome.action.getTitle({}))).toBe('Study Duo: study block, 25 min left');

  const endsAt = await timerField(sw, 'endsAt');
  const alarm = await sw.evaluate(() => chrome.alarms.get('phase-end'));
  expect(alarm.scheduledTime).toBe(endsAt);

  // Jump to the last 1.5 s of the block: the open popup reaching 00:00 must complete it.
  await sw.evaluate(async () => {
    const { timer } = await chrome.storage.local.get('timer');
    await chrome.storage.local.set({ timer: { ...timer, endsAt: Date.now() + 1500 } });
  });
  await expect.poll(() => timerField(sw, 'phase'), { timeout: 10_000 }).toBe('shortBreak');
  // The finished block is in the local session log.
  const logged = () =>
    sw.evaluate(
      () =>
        new Promise<unknown[]>((resolve, reject) => {
          const req = indexedDB.open('study-duo');
          req.onsuccess = () => {
            const all = req.result.transaction('sessions').objectStore('sessions').getAll();
            all.onsuccess = () => resolve(all.result.map((r: any) => [r.phase, r.completed]));
            all.onerror = () => reject(all.error);
          };
          req.onerror = () => reject(req.error);
        }),
    );
  await expect.poll(logged).toEqual([['focus', true]]);
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('5');
  expect(await sw.evaluate(() => chrome.action.getBadgeBackgroundColor({}))).toEqual([46, 125, 79, 255]);
  await expect
    .poll(() => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length))
    .toBe(1);

  await popup.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeBackgroundColor({}))).toEqual([78, 82, 78, 255]);

  // Badges do not survive a browser restart on their own; the startup tick must rebuild it.
  await ctx.close();
  ({ ctx, sw } = await launch(profile));
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({})), { timeout: 10_000 }).toBe('5');
  expect(await timerField(sw, 'status')).toBe('paused');
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
