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

  it('defaults the corner clock on, top right, and rejects unknown corners', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ overlayEnabled: true, overlayCorner: 'top-right' });
    expect(normalizeSettings({ overlayEnabled: false, overlayCorner: 'bottom-right' })).toMatchObject({ overlayEnabled: false, overlayCorner: 'bottom-right' });
    expect(normalizeSettings({ overlayCorner: 'middle' }).overlayCorner).toBe('top-right');
  });

  it('closes Blocked sites by default without a hard lock, and rejects unknown modes', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ siteMode: 'closeBlocked', hardLock: false });
    expect(normalizeSettings({ siteMode: 'allowOnlyStudy', hardLock: true })).toMatchObject({ siteMode: 'allowOnlyStudy', hardLock: true });
    expect(normalizeSettings({ siteMode: 'nuke', hardLock: 'yes' })).toMatchObject({ siteMode: 'closeBlocked', hardLock: false });
  });

  it('follows the system theme by default and keeps a daily goal of whole blocks', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ appearance: 'system', dailyGoal: 8 });
    expect(normalizeSettings({ appearance: 'dark', dailyGoal: 5.6 })).toMatchObject({ appearance: 'dark', dailyGoal: 6 });
    expect(normalizeSettings({ appearance: 'sepia', dailyGoal: 400 })).toMatchObject({ appearance: 'system', dailyGoal: 24 });
    expect(normalizeSettings({ dailyGoal: 0 }).dailyGoal).toBe(1);
  });

  it('measures everything but input by default, keeps a year, and clamps retention', () => {
    expect(DEFAULT_SETTINGS.measure).toEqual({ sites: true, blocked: true, outcome: true, away: true, music: true, input: false });
    expect(DEFAULT_SETTINGS.retentionDays).toBe(365);
    expect(normalizeSettings({ measure: { sites: false, input: true, junk: 1 }, retentionDays: 5 })).toMatchObject({
      measure: { sites: false, blocked: true, outcome: true, away: true, music: true, input: true },
      retentionDays: 30,
    });
  });
});
