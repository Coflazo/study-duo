import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from './settings';
import type { Bag } from './phrases';
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
