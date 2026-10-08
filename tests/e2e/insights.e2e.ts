import { expect, test } from '@playwright/test';
import { simulate, TYPICAL } from '../../src/ml/synthetic';
import { EXT_ID, launch, tempProfile } from './extension';

test('Insights: a learning state with no data, then best hours and music from eight weeks of blocks', async () => {
  test.setTimeout(90_000);
  const { ctx, sw } = await launch(tempProfile());
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/dashboard.html#insights`);
  await expect(page.getByRole('heading', { name: 'Your best hours', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Insights start after 25 study blocks. 0 of 25 so far.');

  // Eight weeks of a simulated student, written straight into the extension's database.
  // Moved ten weeks back (whole weeks keep the weekdays), so every block lies in the past.
  const shift = 70 * 86_400_000;
  const sim = simulate(TYPICAL, { days: 56, seed: 3 });
  const sessions = sim.sessions.map((s) => ({ ...s, id: `${s.startedAt - shift}-focus`, startedAt: s.startedAt - shift, endedAt: s.endedAt - shift }));
  const listens = sim.listens.map((l) => ({ ...l, id: `${l.startedAt - shift}-file`, startedAt: l.startedAt - shift, endedAt: l.endedAt - shift, sessionId: `${l.startedAt - shift}-focus` }));
  await sw.evaluate(
    ({ sessions, listens }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('study-duo');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(['sessions', 'listens'], 'readwrite');
          for (const s of sessions) tx.objectStore('sessions').put(s);
          for (const l of listens) tx.objectStore('listens').put(l);
          tx.oncomplete = () => (req.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    { sessions, listens },
  );
  await page.reload();
  await expect(page.getByText(`From ${sessions.length} study blocks`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: /Weekdays: (09|10):00 to (11|12):00/ })).toBeVisible();
  const weekdays = page.locator('.row', { hasText: 'Weekdays' });
  await expect(weekdays).toContainText(/(09|10):00 to (11|12):00/);
  const lyrics = page.locator('.row.music', { hasText: 'lyrics song' });
  await expect(lyrics).toContainText('−');
  await expect(page.locator('.row', { hasText: 'Predicts your ratings' })).toContainText('within');
  await expect(page.locator('.row', { hasText: 'Block length' })).toContainText(/(25|35|45|50) minutes for a week/);
  expect(await page.locator('.board .cell').count()).toBeGreaterThan(40);
  await ctx.close();
});
