import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;
const setting = (sw: any, key: string) => sw.evaluate(async (k: string) => (await chrome.storage.local.get('settings')).settings?.[k], key);

test('settings: lengths, validation, switches, appearance and the bell preview', async () => {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/dashboard.html#settings`);
  await expect(p.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  // A study block length change shows up when the next block starts.
  const study = p.getByLabel('Study block', { exact: true });
  await study.fill('30');
  await study.press('Enter');
  await expect.poll(() => setting(sw, 'focusMin')).toBe(30);

  // Out of range: a plain message, nothing saved.
  await study.fill('0');
  await study.press('Enter');
  await expect(p.getByText('Use 1 to 180 minutes.')).toBeVisible();
  expect(await setting(sw, 'focusMin')).toBe(30);
  await study.fill('30');
  await study.press('Enter');
  await expect(p.getByText('Use 1 to 180 minutes.')).toBeHidden();

  await p.getByLabel('Daily goal').fill('6');
  await p.getByLabel('Daily goal').press('Tab');
  await expect.poll(() => setting(sw, 'dailyGoal')).toBe(6);

  await p.getByRole('switch', { name: 'Start study blocks on their own' }).click();
  await expect.poll(() => setting(sw, 'autoStartFocus')).toBe(true);
  await p.getByRole('switch', { name: 'Clock in the corner of every page' }).click();
  await expect.poll(() => setting(sw, 'overlayEnabled')).toBe(false);
  await p.getByRole('radio', { name: 'Bottom right' }).click();
  await expect.poll(() => setting(sw, 'overlayPos')).toEqual({ h: 'right', v: 'bottom', x: 16, y: 16 });
  await p.getByRole('radio', { name: 'Flowtime' }).click();
  await expect.poll(() => setting(sw, 'mode')).toBe('flowtime');
  await p.getByRole('radio', { name: 'Pomodoro' }).click();

  // Appearance overrides the system theme on extension pages, and survives a reload.
  await p.getByRole('radio', { name: 'Dark' }).click();
  await expect(p.locator('html')).toHaveAttribute('data-theme', 'dark');
  await p.reload();
  await expect(p.locator('html')).toHaveAttribute('data-theme', 'dark');
  const blocked = await ctx.newPage();
  await blocked.goto(`chrome-extension://${EXT_ID}/blocked.html#https://video.example/`);
  await expect(blocked.locator('html')).toHaveAttribute('data-theme', 'dark');
  await blocked.close();
  await p.getByRole('radio', { name: 'System' }).click();
  await expect(p.locator('html')).not.toHaveAttribute('data-theme', /.+/);

  // The bell preview plays without errors.
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.getByRole('button', { name: 'Play the bell' }).click();
  await p.waitForTimeout(300);
  expect(errors).toEqual([]);

  // The new length is used by the next block.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await expect(popup.getByText('30 min study')).toBeVisible();

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
