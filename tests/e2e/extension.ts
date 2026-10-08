import { chromium, type Browser, type BrowserContext, type CDPSession, type Worker } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Tests run the copy in .test-build (npm run build:test), never the build/ folder a person loads in Chrome. */
export const EXT_DIR = path.resolve('.test-build/chrome-mv3');
export const EXT_ID = 'bcggiingdefmehpjcalkfpdnehpcieon';

/**
 * Branded Chrome 137+ ignores --load-extension, and Playwright's own Chromium no longer supports macOS 13,
 * so locally we drive Chrome for Testing (`npx @puppeteer/browsers install chrome@stable --path ~/.cache/chrome-for-testing`).
 * CI (Linux) falls back to Playwright's Chromium.
 */
export function chromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache/chrome-for-testing/chrome');
  if (!fs.existsSync(root)) return undefined;
  for (const build of fs.readdirSync(root).sort().reverse()) {
    const exe = path.join(root, build, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

export async function launch(userDataDir: string, extraArgs: string[] = [], deviceScaleFactor?: number): Promise<{ ctx: BrowserContext; sw: Worker }> {
  const executablePath = chromePath();
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, ...extraArgs],
    ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
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

/** Holds the session log for `ms` (an upgrade that keeps reading, then aborts), like a slow disk, so to-dos and settings arrive first. */
export function holdSessionLog(sw: Worker, ms: number): Promise<void> {
  return sw.evaluate((ms) => new Promise<void>((resolve) => {
    const req = indexedDB.open('study-duo', 99);
    req.onupgradeneeded = () => {
      const tx = req.transaction!;
      req.result.createObjectStore('hold');
      const until = Date.now() + ms;
      const spin = () => (Date.now() > until ? tx.abort() : (tx.objectStore('hold').count().onsuccess = spin));
      spin();
    };
    req.onerror = () => resolve();
    req.onsuccess = () => { req.result.close(); resolve(); };
  }), ms);
}

/**
 * A running browser without the extension, so a test can install and reload it the way a person does on
 * chrome://extensions, with tabs already open. Playwright cannot reload an extension it loaded itself.
 */
export async function launchBare(): Promise<{ browser: Browser; ctx: BrowserContext; install: (dir?: string) => Promise<void>; close: () => Promise<void> }> {
  const profile = tempProfile();
  const exe = chromePath() ?? chromium.executablePath();
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  // Chrome creates the file before it writes the port into it.
  const readPort = () => (fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').split('\n')[0]!.trim() : '');
  const stop = () => {
    proc.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  };
  let browser: Browser;
  let cdp: CDPSession;
  try {
    for (let i = 0; i < 100 && !readPort(); i++) await new Promise((r) => setTimeout(r, 100));
    if (!readPort()) throw new Error('Chrome did not open a debugging port within 10 s');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${readPort()}`);
    cdp = await browser.newBrowserCDPSession();
  } catch (e) {
    stop(); // a live Chrome child keeps the test worker, and so the CI job, from ever exiting
    throw e;
  }
  return {
    browser,
    ctx: browser.contexts()[0]!,
    install: async (dir = EXT_DIR) => void (await cdp.send('Extensions.loadUnpacked' as any, { path: dir })),
    close: async () => {
      await browser.close().catch(() => undefined);
      proc.kill();
      await new Promise((r) => setTimeout(r, 500));
      stop();
    },
  };
}

/** Every row of one event-log store (IndexedDB study-duo), read inside the extension. */
export function readStore(sw: Worker, store: 'sessions' | 'listens' | 'activity' | 'blocks'): Promise<any[]> {
  return sw.evaluate((store) => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('study-duo');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) return db.close(), resolve([]);
      const all = db.transaction(store).objectStore(store).getAll();
      all.onsuccess = () => (db.close(), resolve(all.result));
      all.onerror = () => (db.close(), reject(all.error));
    };
  }), store);
}

