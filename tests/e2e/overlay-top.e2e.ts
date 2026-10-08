import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { EXT_ID, launch, tempProfile } from './extension';
import { shadow } from './shadow';

/** The colour of one screen pixel, read from a 1x1 PNG screenshot. */
async function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  let at = 8;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)); // one row: filter byte, then RGB(A)
  return [raw[1]!, raw[2]!, raw[3]!];
}
const isRed = ([r, g, b]: [number, number, number]) => r > 200 && g < 60 && b < 60;

test('the corner clock stays above dialogs and popovers the page opens, and never throws there', async () => {
  const profile = tempProfile();
  const { ctx } = await launch(profile);
  await ctx.route('https://study-duo.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="background:#fff">page</body></html>' }));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); // the clock's script must never throw on a page
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('https://study-duo.test/');
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await popup.getByRole('button', { name: 'Start' }).click();
  await popup.close();
  await page.bringToFront();
  const dom = await shadow(page);
  await expect.poll(async () => (await dom.style('clock'))?.opacity).toBe('1');
  /** The clock's centre now (its width changes as it settles), where a red page above it would show. */
  const centre = async () => {
    const b = (await dom.rect('clock'))!;
    return [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)] as const;
  };

  // A full-screen modal dialog (the browser's top layer, above every z-index).
  await page.evaluate(() => {
    const d = document.createElement('dialog');
    d.setAttribute('style', 'width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:rgb(255,0,0)');
    document.body.append(d);
    d.showModal();
  });
  await expect.poll(() => pixel(page, 640, 400).then(isRed)).toBe(true); // the dialog covers the page
  await expect.poll(async () => pixel(page, ...(await centre())).then(isRed)).toBe(false); // but not the clock

  // A full-screen popover, opened later still.
  await page.evaluate(() => {
    const p = document.createElement('div');
    p.setAttribute('popover', 'manual');
    p.setAttribute('style', 'inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:rgb(255,0,0)');
    document.body.append(p);
    p.showPopover();
  });
  await expect.poll(async () => pixel(page, ...(await centre())).then(isRed)).toBe(false);
  expect(errors).toEqual([]);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
