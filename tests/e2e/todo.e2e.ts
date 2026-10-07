import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { EXT_ID, launch, tempProfile } from './extension';

declare const chrome: any;
const stored = (sw: any) => sw.evaluate(async () => ((await chrome.storage.local.get('todos')).todos ?? []).map((t: any) => [t.text, t.course, t.done, t.ifThen]));

test('to-do: add, plan, edit, reorder by keyboard, complete, delete and undo, start a block on a task', async () => {
  const profile = tempProfile();
  const { ctx, sw } = await launch(profile);
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/dashboard.html#todo`);
  await expect(p.getByRole('heading', { name: 'To-do', level: 1 })).toBeVisible();
  await expect(p.getByText('Nothing here yet.')).toBeVisible();

  const task = p.getByLabel('Add something to work on');
  await task.fill('Read lecture 5 notes');
  await p.getByLabel('Course').fill('linalg');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await task.fill('Statistics problem set 4');
  await p.getByLabel('Course').fill('stat101');
  await p.getByRole('button', { name: 'Add an if-then plan' }).click();
  await p.getByLabel('If I get stuck, I will').fill('skim the worked examples first');
  await task.press('Enter');
  await expect.poll(() => stored(sw)).toEqual([
    ['Read lecture 5 notes', 'LINALG', false, null],
    ['Statistics problem set 4', 'STAT101', false, 'skim the worked examples first'],
  ]);

  // Reorder with the keyboard: open the row menu and move the second item up.
  await p.getByRole('button', { name: 'More for Statistics problem set 4' }).focus();
  await p.keyboard.press('Enter');
  await p.getByRole('menuitem', { name: 'Move up' }).click();
  await expect.poll(async () => (await stored(sw)).map((t: any) => t[0])).toEqual(['Statistics problem set 4', 'Read lecture 5 notes']);

  // Edit in place
  await p.getByRole('button', { name: 'More for Read lecture 5 notes' }).click();
  await p.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = p.getByLabel('Edit Read lecture 5 notes');
  await edit.fill('Read lecture 5 and 6 notes');
  await edit.press('Enter');
  await expect(p.getByText('Read lecture 5 and 6 notes')).toBeVisible();

  // Complete, then it sits under Done today
  await p.getByRole('checkbox', { name: 'Read lecture 5 and 6 notes' }).check();
  await expect(p.getByRole('region', { name: 'Done today' })).toContainText('Read lecture 5 and 6 notes');

  // Move up past a finished item still changes the visible order.
  await p.getByLabel('Add something to work on').fill('Third task');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.getByRole('button', { name: 'More for Third task' }).click();
  await p.getByRole('menuitem', { name: 'Move up' }).click();
  const openOrder = () => p.locator('main ul').first().getByRole('checkbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await expect.poll(openOrder).toEqual(['Third task', 'Statistics problem set 4']);

  // Delete with undo
  await p.getByRole('button', { name: 'More for Statistics problem set 4' }).click();
  await p.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(p.getByRole('status')).toContainText('Deleted');
  await p.getByRole('button', { name: 'Undo' }).click();
  await expect(p.getByRole('checkbox', { name: 'Statistics problem set 4' })).toBeVisible();
  expect((await stored(sw)).map((t: any) => t[0])).toEqual(['Third task', 'Statistics problem set 4', 'Read lecture 5 and 6 notes']);

  // Start a block on a task
  await p.getByRole('button', { name: 'Start a study block on Statistics problem set 4' }).click();
  await expect.poll(() => sw.evaluate(async () => {
    const { timer, todos } = await chrome.storage.local.get(['timer', 'todos']);
    return timer.status === 'running' && timer.taskId === todos.find((t: any) => t.text === 'Statistics problem set 4').id;
  })).toBe(true);

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
