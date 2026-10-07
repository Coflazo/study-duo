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
  const was = before.window || before.idle;
  const is = after.window || after.idle;
  if (was !== is) await feed({ type: is ? 'away' : 'back' });
}

/** Event-driven: no timers or polling. Time counts only while the timer runs (see track). */
export function trackActivity(): void {
  const refocus = () => frontHost().then((host) => feed({ type: 'focus', host }), console.error);
  browser.tabs.onActivated.addListener(() => void refocus());
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
}
