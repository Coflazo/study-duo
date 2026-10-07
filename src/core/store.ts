import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from './settings';
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
