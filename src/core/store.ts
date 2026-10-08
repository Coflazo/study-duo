import { IDLE_TRACKER, type TrackerState } from './activity';
import type { OpenListen } from './music';
import type { NoiseKind } from './noise';
import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from './settings';
import type { Bag } from './phrases';
import type { Sites } from './sites';
import { initialState, type TimerState } from './timer';

export const settingsItem = storage.defineItem<TimerSettings>('local:settings', { fallback: DEFAULT_SETTINGS });
export const timerItem = storage.defineItem<TimerState>('local:timer', { fallback: initialState() });

export async function loadSettings(): Promise<TimerSettings> {
  return normalizeSettings(await settingsItem.getValue());
}

export async function loadState(): Promise<TimerState> {
  const s = await timerItem.getValue();
  return s && s.v === 1 ? s : initialState();
}

/** Which phase-word lines are still unseen, so lines do not repeat across restarts. */
export const phraseBagItem = storage.defineItem<Bag>('local:phraseBag', { fallback: {} });
/** Local date (Date.toDateString) of the last study-block announcement, for the first-block-of-the-day greeting. */
export const lastFocusDayItem = storage.defineItem<string | null>('local:lastFocusDay', { fallback: null });

/** Filed sites. Read by the background and extension pages; web pages only ever learn their own site's category. */
export const sitesItem = storage.defineItem<Sites>('local:sites', { fallback: {} });
/** Domains whose "is this for studying?" prompt was answered or closed. */
export const promptDismissedItem = storage.defineItem<string[]>('local:sitePromptDismissed', { fallback: [] });

/** Set once the music players have been filed as Not blocked, so removing one later is respected. */
export const musicSeededItem = storage.defineItem<boolean>('local:musicSitesSeeded', { fallback: false });

/** Songs playing now, by tab (session only; the background folds them into listens). */
export const listeningItem = storage.defineItem<Record<string, OpenListen>>('session:listening', { fallback: {} });
/** The focus sound playing now, if any (session only). */
export const soundItem = storage.defineItem<{ noise: NoiseKind; volume: number; startedAt: number; sessionId: string | null } | null>('session:focusSound', { fallback: null });
/** Bumped after the background writes sessions, so open pages reload Today exactly then (no polling). */
export const logVersionItem = storage.defineItem<number>('session:logVersion', { fallback: 0 });
/** The activity tracker's state between events (session only; the worker sleeps, the browser session does not). */
export const trackerItem = storage.defineItem<TrackerState>('session:activityTracker', { fallback: IDLE_TRACKER });

