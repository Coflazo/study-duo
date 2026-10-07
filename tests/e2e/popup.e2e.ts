import { expect, test, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

const sessions = (sw: Worker) =>
  sw.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('study-duo');
        req.onsuccess = () => {
          const all = req.result.transaction('sessions').objectStore('sessions').getAll();
          all.onsuccess = () => resolve(all.result.map((r: any) => ({ phase: r.phase, completed: r.completed, taskId: r.taskId, rating: r.rating, ratingSkipped: r.ratingSkipped })));
          all.onerror = () => reject(all.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );

const finishSoon = (sw: Worker) =>
  sw.evaluate(async () => {
    const { timer } = await chrome.storage.local.get('timer');
    await chrome.storage.local.set({ timer: { ...timer, endsAt: Date.now() + 1500 } });
  });

async function popup(page: Page) {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`);
}

test('pick a task, run a block, pause, and rate it afterwards', async () => {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const long = 'Statistics problem set 4 with every exercise from chapters six and seven';
  await sw.evaluate((text) => chrome.storage.local.set({
    todos: [
      { id: 't1', text, course: 'STAT101', done: false, doneAt: null, ifThen: null },
      { id: 't2', text: 'Read lecture 5 notes', course: null, done: false, doneAt: null, ifThen: null },
    ],
  }), long);
  const p = await ctx.newPage();
  await popup(p);

  await expect(p.getByText('Up next')).toBeVisible();
  await p.getByLabel('Work on').selectOption({ label: `${long} (STAT101)` });
  await p.getByRole('button', { name: 'Start' }).click();
  await expect(p.getByText('Block 1 of 4')).toBeVisible();
  await expect(p.getByRole('listitem').filter({ hasText: 'Now' })).toContainText(long);
  expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await p.getByRole('button', { name: 'Pause' }).click();
  await expect(p.getByText('Paused', { exact: true }).first()).toBeVisible();
  await p.getByRole('button', { name: 'Resume' }).click();
  await expect(p.getByRole('button', { name: 'Pause' })).toBeVisible();

  // The open popup ends the block on time; then it asks once how focused it was.
  await finishSoon(sw);
  await expect(p.getByRole('heading', { name: 'Block done.' })).toBeVisible({ timeout: 10_000 });
  await p.getByRole('radio', { name: '4' }).click();
  await expect(p.getByRole('heading', { name: 'Block done.' })).toBeHidden();
  await expect.poll(() => sessions(sw)).toEqual([{ phase: 'focus', completed: true, taskId: 't1', rating: 4, ratingSkipped: false }]);
  await expect(p.getByRole('listitem').filter({ has: p.getByRole('img', { name: 'Done' }) })).toContainText(long);

  // Reopening the popup does not ask again.
  await popup(p);
  await expect(p.getByRole('button', { name: 'Skip break' })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'Block done.' })).toBeHidden();

  // Next block: Skip on the question is remembered too.
  await p.getByRole('button', { name: 'Skip break' }).click();
  await expect(p.getByLabel('Work on')).toHaveValue('t1'); // keeps going with the last block's task
  await p.getByRole('button', { name: 'Start' }).click();
  await finishSoon(sw);
  await expect(p.getByRole('heading', { name: 'Block done.' })).toBeVisible({ timeout: 10_000 });
  // An unanswered question never covers the next running block.
  await p.getByRole('button', { name: 'Skip break' }).click();
  await p.getByRole('button', { name: 'Start' }).click();
  await expect(p.getByRole('heading', { name: 'Block done.' })).toBeHidden();
  await expect(p.getByText('Block 3 of 4')).toBeVisible();
  expect((await sessions(sw)).filter((s) => s.phase === 'focus' && s.completed && s.rating === null).length).toBe(1);

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
