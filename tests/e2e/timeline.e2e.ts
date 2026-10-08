import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;

test('Timeline shows this week\'s blocks and breaks, moves by week and day, and exports a calendar file', async () => {
  const { ctx, sw } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#data`); // opens the database

  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const at = (dayOffset: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayOffset, h, m).getTime();
  const block = (start: number, minutes: number, phase: string, extra: object = {}) => ({ id: `${start}-${phase}`, phase, startedAt: start, endedAt: start + minutes * 60_000, plannedMs: minutes * 60_000, activeMs: minutes * 60_000, pausedMs: 0, completed: true, taskId: null, rating: null, ratingSkipped: false, ...extra });
  const sessions = [
    block(at(0, 9, 30), 25, 'focus', { taskId: 't1', rating: 4 }),
    block(at(0, 9, 55), 5, 'shortBreak'),
    block(at(2, 14, 0), 25, 'focus', { completed: false }),
  ];
  const lastWeek = block(at(-7, 10, 0), 25, 'focus');
  await sw.evaluate(async ({ sessions, lastWeek }) => {
    await chrome.storage.local.set({ todos: [{ id: 't1', text: 'Linear algebra, chapter 3', course: null, done: false, doneAt: null, ifThen: null }] });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('study-duo');
      req.onsuccess = () => {
        const tx = req.result.transaction(['sessions', 'listens'], 'readwrite');
        for (const s of [...sessions, lastWeek]) tx.objectStore('sessions').put(s);
        tx.objectStore('listens').put({ id: 'l1', host: 'file', title: 'Says', artist: 'Nils Frahm', album: '', startedAt: sessions[0]!.startedAt, endedAt: sessions[0]!.endedAt, sessionId: sessions[0]!.id });
        tx.oncomplete = () => (req.result.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { sessions, lastWeek });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#timeline`);
  await expect(page.getByRole('heading', { name: 'Timeline', level: 1 })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /^Study, Linear algebra, chapter 3, 09:30 to 09:55, focus 4 of 5$/ })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /^Break, 09:55 to 10:00$/ })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /ended early$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('listitem', { name: /^Study, 10:00 to 10:25$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Day' }).click();
  await expect(page.getByRole('region')).toHaveCount(1);

  // Export: every block and break, with the task name and the rating; songs only after turning them on.
  const first = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to calendar' }).click();
  const ics = fs.readFileSync((await (await first).path())!, 'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  expect(ics).toContain('SUMMARY:Study: Linear algebra\\, chapter 3\r\n');
  expect(ics).toContain('DESCRIPTION:Focus: 4 of 5\r\n');
  expect(ics).not.toContain('Says');

  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, calendarSongs: true } });
  });
  const second = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to calendar' }).click();
  expect(fs.readFileSync((await (await second).path())!, 'utf8')).toContain('Songs: Says\\, Nils Frahm');
  await ctx.close();
});
