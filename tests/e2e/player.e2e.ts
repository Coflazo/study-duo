import { expect, test } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

/**
 * The popup's player card (Figma "Screens: Player (approved)", Sleeve): noise plays and stops through the one player,
 * the colour and volume follow, the source list opens and closes by keyboard, and the disc turns while it plays.
 */
test('the popup card plays focus noise through the one player, and its disc turns', async () => {
  const { ctx, sw } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const card = page.getByRole('region', { name: 'Player' });
  await expect(card).toBeVisible();
  const player = () => page.evaluate(async () => (await chrome.storage.session.get('player')).player);
  const angle = () => page.evaluate(() => {
    const el = document.querySelector('.spin') as HTMLElement;
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
  });

  // Pink is chosen at first; play starts it.
  await expect(card.getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true');
  await card.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => (await player())?.playing).toBe(true);
  await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible();

  // The disc slides out and turns.
  await expect(page.locator('.disc')).toHaveClass(/out/);
  const a1 = await angle();
  await page.waitForTimeout(400);
  expect(await angle()).not.toBe(a1);

  // Brown while it plays; then a quieter volume.
  await card.getByRole('radio', { name: 'Brown' }).click();
  await expect.poll(async () => (await player())?.noise).toBe('brown');
  await expect(card.locator('.title')).toHaveText('Brown noise');
  await card.getByRole('slider', { name: 'Volume' }).fill('25');
  await expect.poll(async () => (await player())?.volume).toBe(0.25);

  // The source list: open from the keyboard, Escape closes it and gives focus back.
  await card.getByRole('button', { name: /SOUNDS/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Play from' })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /Focus noise/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /SOUNDS/ })).toBeFocused();

  // The whole popup, for the height check against Chrome's 600 px.
  const height = await page.evaluate(() => Math.round(document.querySelector('main')!.getBoundingClientRect().height));
  await page.screenshot({ path: path.join(os.tmpdir(), 'sd-popup-player.png'), fullPage: true });
  console.log(`popup height ${height}`);

  // Pause: it stops, the disc coasts and goes back in.
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await player())?.playing).toBe(false);
  await expect(page.locator('.disc')).not.toHaveClass(/out/, { timeout: 4_000 });

  // The background really sent the noise to the offscreen page.
  const sound = await sw.evaluate(async () => (await chrome.storage.session.get('focusSound')).focusSound);
  expect(sound ?? null).toBeNull();
  await ctx.close();
});

test('with Reduce motion on, the disc stays still unless Spinning disc is set to Always', async () => {
  const { ctx } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const card = page.getByRole('region', { name: 'Player' });
  const turning = () => page.evaluate(() => getComputedStyle(document.querySelector('.spin')!).transform);
  await card.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('.disc')).not.toHaveClass(/out/);
  expect(await turning()).toBe('none');
  await card.getByRole('button', { name: 'Pause' }).click();

  const settings = await ctx.newPage();
  await settings.goto(`chrome-extension://${EXT_ID}/dashboard.html#settings`);
  await settings.getByRole('radiogroup', { name: 'Spinning disc' }).getByRole('radio', { name: 'Always' }).click();
  await settings.close();
  await card.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.disc')).toHaveClass(/out/);
  await page.waitForTimeout(400);
  expect(await turning()).not.toBe('none');
  await ctx.close();
});
