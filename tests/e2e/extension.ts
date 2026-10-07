import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EXT_DIR = path.resolve('build/chrome-mv3');
export const EXT_ID = 'bcggiingdefmehpjcalkfpdnehpcieon';

/**
 * Branded Chrome 137+ ignores --load-extension, and Playwright's own Chromium no longer supports macOS 13,
 * so locally we drive Chrome for Testing (`npx @puppeteer/browsers install chrome@stable --path ~/.cache/chrome-for-testing`).
 * CI (Linux) falls back to Playwright's Chromium.
 */
function chromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache/chrome-for-testing/chrome');
  if (!fs.existsSync(root)) return undefined;
  for (const build of fs.readdirSync(root).sort().reverse()) {
    const exe = path.join(root, build, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

export async function launch(userDataDir: string): Promise<{ ctx: BrowserContext; sw: Worker }> {
  const executablePath = chromePath();
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  // Wait for the install step (music players filed as Not blocked), so tests never race it.
  for (let i = 0; i < 50; i++) {
    if (await sw.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('musicSitesSeeded')).musicSitesSeeded === true)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ctx, sw };
}

export function tempProfile(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'study-duo-e2e-'));
}
