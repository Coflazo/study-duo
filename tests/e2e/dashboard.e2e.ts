import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

test('dashboard: Today runs the timer, shows the plan, and navigates by keyboard', async () => {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  await sw.evaluate(() => chrome.storage.local.set({
    todos: [
      { id: 't1', text: 'Statistics problem set 4', course: 'STAT101', done: false, doneAt: null, ifThen: null },
      { id: 't2', text: 'Email study group about Friday', course: null, done: true, doneAt: Date.now(), ifThen: null },
    ],
  }));
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(`chrome-extension://${EXT_ID}/dashboard.html`);

  await expect(p.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(p.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await expect(p.getByRole('heading', { name: 'To-do' })).toBeVisible();
  await expect(p.getByText('1 left today')).toBeVisible();

  await p.getByLabel('Work on').selectOption('t1');
  await p.getByRole('button', { name: 'Start' }).click();
  await expect(p.getByText('Block 1 of 4')).toBeVisible();
  await expect(p.getByRole('listitem').filter({ hasText: /Now$/ })).toContainText('Statistics problem set 4');
  await expect(p.getByRole('listitem').filter({ hasText: 'On now' })).toContainText('Statistics problem set 4');

  // Ticking an item done from Today
  await p.getByRole('checkbox', { name: 'Statistics problem set 4' }).check();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('todos')).todos.find((t: any) => t.id === 't1').done)).toBe(true);

  // Keyboard navigation to Site lock and back
  await p.getByRole('link', { name: 'Site lock' }).focus();
  await p.keyboard.press('Enter');
  await expect(p).toHaveURL(/#sites$/);
  await expect(p.getByRole('heading', { name: 'Sites', exact: true })).toBeVisible();
  await p.goBack();
  await expect(p.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

  // Small screens: one column, no sideways scrolling.
  await p.setViewportSize({ width: 360, height: 800 });
  expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
