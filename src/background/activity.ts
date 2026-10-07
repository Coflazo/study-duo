import { IDLE_TRACKER, track, type TrackerEvent, type TrackerState } from '@/core/activity';
import { addRecords } from '@/core/log';
import { normalizeSettings } from '@/core/settings';
import { hostOf, normalizeSites } from '@/core/sites';
import { settingsItem, sitesItem, timerItem } from '@/core/store';

/** Kept in session storage: the service worker sleeps between events, the browser session does not. */
const trackerItem = storage.defineItem<TrackerState>('session:activityTracker', { fallback: IDLE_TRACKER });
/** Why the user counts as away: the browser lost focus, the computer went idle or locked. */
const awayItem = storage.defineItem<{ window: boolean; idle: boolean }>('session:activityAway', { fallback: { window: false, idle: false } });

let queue: Promise<void> = Promise.resolve();

/** Applies one event in order, and stores the records that closed, minus whatever the user switched off. */
export function feed(event: TrackerEvent, at = Date.now()): Promise<void> {
  queue = queue
    .then(async () => {
      const [state, sites, settings] = await Promise.all([trackerItem.getValue(), sitesItem.getValue().then(normalizeSites), settingsItem.getValue().then(normalizeSettings)]);
      const r = track(state, event, at, sites);
      await trackerItem.setValue(r.state);
      await addRecords('activity', r.closed.filter((c) => (c.category === 'unobserved' ? settings.measure.away : settings.measure.sites)));
    })
    .catch(console.error);
  return queue;
}

async function frontHost(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return hostOf(tab?.url);
}

async function setAway(reason: 'window' | 'idle', value: boolean): Promise<void> {
  const before = await awayItem.getValue();
  const after = { ...before, [reason]: value };
  await awayItem.setValue(after);
  await syncAway(before.window || before.idle);
}

/** With "time away" switched off, nothing counts as away: that time stays with the site in front. */
async function syncAway(was: boolean | null = null): Promise<void> {
  const { window, idle } = await awayItem.getValue();
  const watching = normalizeSettings(await settingsItem.getValue()).measure.away;
  const is = watching && (window || idle);
  const tracked = (await trackerItem.getValue()).away;
  if ((was ?? tracked) !== is || tracked !== is) await feed({ type: is ? 'away' : 'back' });
}

/** Event-driven: no timers or polling. Time counts only while the timer runs (see track). */
export function trackActivity(): void {
  const refocus = () => frontHost().then((host) => feed({ type: 'focus', host }), console.error);
  // Switching tabs means the user is in the browser, even if a focus-lost event (some systems send one when an
  // extension popup opens) was never followed by a focus-gained one.
  browser.tabs.onActivated.addListener(() => void setAway('window', false).then(refocus));
  browser.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.url && tab.active) void refocus();
  });
  browser.windows.onFocusChanged.addListener((windowId) => {
    const away = windowId === browser.windows.WINDOW_ID_NONE;
    void setAway('window', away).then(() => (away ? undefined : refocus()));
  });
  browser.idle.onStateChanged.addListener((state) => void setAway('idle', state !== 'active'));
  timerItem.watch((t) => {
    // Know where the user is before the clock starts counting.
    void refocus().then(() => feed({ type: 'timer', phase: t?.status === 'running' ? t.phase : null }));
  });
  sitesItem.watch(() => void feed({ type: 'sites' }));
  settingsItem.watch(() => void syncAway());
}

const lastCounts = new Map<number, number>();

/** One report per tab per minute (a page could send more), and only while the user has input counting on. */
export async function acceptCounts(tabId: number, url: string | undefined, counts: { keys: number; clicks: number; scrolls: number }, now = Date.now()): Promise<void> {
  if (now - (lastCounts.get(tabId) ?? 0) < 50_000) return;
  lastCounts.set(tabId, now);
  if (!normalizeSettings(await settingsItem.getValue()).measure.input) return;
  await feed({ type: 'input', host: hostOf(url), ...counts }, now);
}

