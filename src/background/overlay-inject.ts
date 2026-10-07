import { normalizeSettings } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';

const OVERLAY = '/content-scripts/overlay.js';
const asking = new Set<number>();

/**
 * Chrome adds content scripts only to pages loaded after the extension starts, so a tab left open across an
 * install, an update or switching the extension off and on has no clock, or a deaf one. Ask the tab's clock;
 * add one when nobody answers. Loading pages are left alone: Chrome adds the clock when they finish.
 */
export async function ensureOverlay(tabId: number): Promise<void> {
  if (asking.has(tabId)) return;
  asking.add(tabId);
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.status !== 'complete') return;
    const answered = await browser.tabs.sendMessage(tabId, { kind: 'overlay', op: 'ping' }).catch(() => false);
    if (answered !== true) await browser.scripting.executeScript({ target: { tabId }, files: [OVERLAY] });
  } catch {
    // chrome:// pages, the Web Store, PDFs and closed tabs cannot have a clock
  } finally {
    asking.delete(tabId);
  }
}

async function clockWanted(): Promise<boolean> {
  const [timer, settings] = await Promise.all([timerItem.getValue(), settingsItem.getValue()]);
  return timer.status !== 'stopped' && normalizeSettings(settings).overlayEnabled;
}

async function ensureFrontTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true });
  await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : ensureOverlay(t.id))));
}

/** The tab in front always has a clock during a block: checked when a block starts and on every tab switch. */
export function keepClocksOnOpenTabs(): void {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void clockWanted().then((yes) => (yes ? ensureOverlay(tabId) : undefined)).catch(console.error);
  });
  timerItem.watch((now, before) => {
    if (!now || now.status === 'stopped' || (before && before.status !== 'stopped')) return;
    void clockWanted().then((yes) => (yes ? ensureFrontTabs() : undefined)).catch(console.error);
  });
}
