import { buildRules, wouldClose, type DnrRule } from '@/core/blocking';
import type { TimerSettings } from '@/core/settings';
import { hostOf, normalizeSites, type Sites } from '@/core/sites';
import { sitesItem } from '@/core/store';
import type { TimerState } from '@/core/timer';

/** Sites opened with "Open anyway" during the current block. Session storage: gone after a browser restart. */
export const unlockedItem = storage.defineItem<string[]>('session:unlocked', { fallback: [] });
/** Fingerprint of the rules last applied, so open tabs are swept only when the rules change. */
const ruleSigItem = storage.defineItem<string>('session:lockRules', { fallback: '' });

export const blockedPage = () => browser.runtime.getURL('/blocked.html');

/** Sites stay closed while a study block runs or is paused; breaks and a stopped timer open everything. */
export function lockActive(state: TimerState): boolean {
  return state.phase === 'focus' && state.status !== 'stopped';
}

export async function syncLock(state: TimerState, settings: TimerSettings, sites: Sites, unlocked: string[]): Promise<void> {
  const active = lockActive(state);
  const rules: DnrRule[] = active ? buildRules({ sites, mode: settings.siteMode, unlocked, blockedPage: blockedPage() }) : [];
  const sig = JSON.stringify(rules);
  if (!active && unlocked.length > 0) await unlockedItem.setValue([]);
  if (sig === (await ruleSigItem.getValue())) return;

  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: existing.map((r) => r.id), addRules: rules });
  await ruleSigItem.setValue(sig);
  if (rules.length === 0) return;

  // New navigations hit the rules; tabs that were already open need sending to the blocked page.
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined && wouldClose(rules, hostOf(t.url)))
      .map((t) => browser.tabs.update(t.id!, { url: `${blockedPage()}#${t.url}` }).catch(() => undefined)),
  );
}

/** syncLock with the stored site lists; runs inside the timer queue so rule updates never interleave. */
export async function syncLockFromStorage(state: TimerState, settings: TimerSettings): Promise<void> {
  const [sites, unlocked] = await Promise.all([sitesItem.getValue(), unlockedItem.getValue()]);
  await syncLock(state, settings, normalizeSites(sites), unlocked);
}
