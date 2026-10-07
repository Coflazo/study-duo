import { expect, test } from '@playwright/test';
import { EXT_ID, launch, tempProfile } from './extension';
import { shadow } from './shadow';

declare const chrome: any;

test('drag the clock on one page; every open and new tab follows, and Settings puts it back', async () => {
  const { ctx, sw } = await launch(tempProfile());
  await ctx.route('https://*.study-duo.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>page</p>' }));
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.close();

  const a = await ctx.newPage();
  const b = await ctx.newPage();
  for (const p of [a, b]) await p.setViewportSize({ width: 1200, height: 700 });
  await b.goto('https://b.study-duo.test/');
  await a.goto('https://a.study-duo.test/');
  await a.bringToFront();
  const domA = await shadow(a);
  await expect.poll(() => domA.rect('clock').then((r) => r && Math.round(r.y))).toBe(16);
  // Hover first: the clock brightens and shows its close button, which widens it to the left.
  const first = (await domA.rect('clock'))!;
  await a.mouse.move(first.x - 10, first.y + 20, { steps: 4 });
  await expect.poll(() => domA.style('clock').then((st) => st?.pointerEvents)).toBe('auto');
  const start = (await domA.rect('clock'))!;

  // Grab the clock off-centre and drop it near the bottom left: it follows the pointer 1:1 from the grab point.
  const grabX = start.x + 30;
  const grabY = start.y + 20;
  await a.mouse.move(grabX, grabY, { steps: 2 });
  await a.mouse.down();
  await a.mouse.move(300, 450, { steps: 6 });
  await a.mouse.move(70, 620, { steps: 6 });
  await a.mouse.up();
  const dropped = (await domA.rect('clock'))!;
  expect(Math.round(dropped.x)).toBe(40);
  expect(Math.round(dropped.y)).toBe(600);

  // Saved relative to the nearest corner (bottom left), shared by every tab.
  await expect.poll(async () => (await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.overlayPos))).toEqual({ h: 'left', v: 'bottom', x: 40, y: 700 - 600 - Math.round(dropped.h) });
  await b.bringToFront();
  const domB = await shadow(b);
  await expect.poll(() => domB.rect('clock').then((r) => r && [Math.round(r.x), Math.round(r.y)])).toEqual([40, 600]);
  const c = await ctx.newPage();
  await c.setViewportSize({ width: 1200, height: 700 });
  await c.goto('https://c.study-duo.test/');
  const domC = await shadow(c);
  await expect.poll(() => domC.rect('clock').then((r) => r && [Math.round(r.x), Math.round(r.y)])).toEqual([40, 600]);

  // A narrower window keeps the clock the same distance from its corner.
  await c.setViewportSize({ width: 900, height: 500 });
  await expect.poll(() => domC.rect('clock').then((r) => r && [Math.round(r.x), Math.round(r.y)])).toEqual([40, 400]);

  // Settings: no preset matches a dragged spot; Top right puts it back everywhere.
  const settings = await ctx.newPage();
  await settings.goto(`chrome-extension://${EXT_ID}/dashboard.html#settings`);
  const group = settings.getByRole('radiogroup', { name: 'Clock position' });
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
  await group.getByRole('radio', { name: 'Top right' }).click();
  await expect(group.getByRole('radio', { name: 'Top right' })).toHaveAttribute('aria-checked', 'true');
  await a.bringToFront();
  await expect.poll(() => domA.rect('clock').then((r) => r && [Math.round(1200 - r.x - r.w), Math.round(r.y)])).toEqual([16, 16]);
  await ctx.close();
});
