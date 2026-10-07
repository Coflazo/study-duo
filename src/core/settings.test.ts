import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

describe('normalizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and rejects non-finite values', () => {
    const s = normalizeSettings({ focusMin: 0, shortBreakMin: NaN, longBreakMin: 9999, longBreakEvery: 2.6, bellVolume: 3 });
    expect(s.focusMin).toBe(1);
    expect(s.shortBreakMin).toBe(DEFAULT_SETTINGS.shortBreakMin);
    expect(s.longBreakMin).toBe(120);
    expect(s.longBreakEvery).toBe(3);
    expect(s.bellVolume).toBe(1);
  });

  it('keeps valid values and only known modes', () => {
    const s = normalizeSettings({ mode: 'flowtime', focusMin: 50, autoStartFocus: true });
    expect(s).toMatchObject({ mode: 'flowtime', focusMin: 50, autoStartFocus: true });
    expect(normalizeSettings({ mode: 'evil' }).mode).toBe('pomodoro');
  });
});
