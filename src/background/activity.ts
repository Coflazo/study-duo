import { track, type TrackerEvent } from '@/core/activity';
import { addRecords } from '@/core/log';
import { normalizeSettings } from '@/core/settings';
import { hostOf, normalizeSites } from '@/core/sites';
import { settingsItem, sitesItem, timerItem, trackerItem } from '@/core/store';

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

let awayQueue: Promise<void> = Promise.resolve();

/** One at a time: idle and window focus often change together (unlocking), and each reads then writes the flags. */
function setAway(reason: 'window' | 'idle', value: boolean, at = Date.now()): Promise<void> {
  awayQueue = awayQueue
    .then(async () => {
      const before = await awayItem.getValue();
      await awayItem.setValue({ ...before, [reason]: value });
      await syncAway(at);
    })
    .catch(console.error);
  return awayQueue;
}

/** With "time away" switched off, nothing counts as away: that time stays with the site in front. */
async function syncAway(at = Date.now()): Promise<void> {
  const { window, idle } = await awayItem.getValue();
  const watching = normalizeSettings(await settingsItem.getValue()).measure.away;
  const is = watching && (window || idle);
  if ((await trackerItem.getValue()).away !== is) await feed({ type: is ? 'away' : 'back' }, at);
}

/** Chrome reports idle only after this many seconds without input (Study Duo's idle pause, or Chrome's 60 s default). */
async function idleDelayMs(): Promise<number> {
  const { idlePauseMin } = normalizeSettings(await settingsItem.getValue());
  return (idlePauseMin > 0 ? Math.max(15, Math.round(idlePauseMin * 60)) : 60) * 1000;
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
  // Idle is noticed after the delay; the user left when input stopped, so away starts then.
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'active') return void setAway('idle', false);
    void idleDelayMs().then((delay) => setAway('idle', true, Date.now() - delay));
  });
  timerItem.watch((t) => {
    // Know where the user is before the clock starts counting.
    void refocus().then(() => feed({ type: 'timer', phase: t?.status === 'running' ? t.phase : null }));
  });
  sitesItem.watch(() => void feed({ type: 'sites' }));
  settingsItem.watch(() => void (awayQueue = awayQueue.then(() => syncAway()).catch(console.error)));
  // The tracker lives in session storage, which a browser restart or an extension update clears while the timer runs
  // on; pick the running block up again (nothing changes on an ordinary worker wake).
  void refocus().then(() => timerItem.getValue()).then((t) => feed({ type: 'timer', phase: t?.status === 'running' ? t.phase : null }));
}

const recentCounts = new Map<number, number[]>();

/**
 * At most three reports per tab per minute (the minute beat, plus leaving or hiding the page; each is capped at 10 000),
 * and only while the user has input counting on.
 */
export async function acceptCounts(tabId: number, url: string | undefined, counts: { keys: number; clicks: number; scrolls: number }, now = Date.now()): Promise<void> {
  const recent = (recentCounts.get(tabId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 3) return;
  recentCounts.set(tabId, [...recent, now]);
  if (!normalizeSettings(await settingsItem.getValue()).measure.input) return;
  await feed({ type: 'input', host: hostOf(url), ...counts }, now);
}

