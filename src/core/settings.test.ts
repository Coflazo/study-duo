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

  it('defaults the corner clock on', () => {
    expect(DEFAULT_SETTINGS.overlayEnabled).toBe(true);
    expect(normalizeSettings({ overlayEnabled: false }).overlayEnabled).toBe(false);
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
    expect(DEFAULT_SETTINGS.discMotion).toBe('system');
    expect(normalizeSettings({ discMotion: 'always' }).discMotion).toBe('always');
    expect(normalizeSettings({ discMotion: 'wild' }).discMotion).toBe('system');
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

  it('shows the corner clock softly by default when the mouse is away', () => {
    expect(DEFAULT_SETTINGS.overlayIdle).toBe('soft');
    expect(normalizeSettings({ overlayIdle: 'faint' }).overlayIdle).toBe('faint');
    expect(normalizeSettings({ overlayIdle: 'full' }).overlayIdle).toBe('full');
    expect(normalizeSettings({ overlayIdle: 'invisible' }).overlayIdle).toBe('soft');
  });
});

describe('clock position', () => {
  it('starts top right and keeps an old corner choice', () => {
    expect(DEFAULT_SETTINGS.overlayPos).toEqual({ h: 'right', v: 'top', x: 16, y: 16 });
    expect(normalizeSettings({ overlayCorner: 'bottom-right' }).overlayPos).toEqual({ h: 'right', v: 'bottom', x: 16, y: 16 });
  });

  it('accepts a dragged position and repairs a broken one', () => {
    expect(normalizeSettings({ overlayPos: { h: 'left', v: 'bottom', x: 40, y: 74 } }).overlayPos).toEqual({ h: 'left', v: 'bottom', x: 40, y: 74 });
    expect(normalizeSettings({ overlayPos: { h: 'middle', v: 'top', x: -5, y: 1e9 } }).overlayPos).toEqual({ h: 'right', v: 'top', x: 0, y: 10000 });
    expect(normalizeSettings({ overlayPos: 'top' }).overlayPos).toEqual({ h: 'right', v: 'top', x: 16, y: 16 });
  });
});

describe('calendar', () => {
  it('leaves songs out of calendar events unless asked', () => {
    expect(DEFAULT_SETTINGS.calendarSongs).toBe(false);
    expect(normalizeSettings({ calendarSongs: true }).calendarSongs).toBe(true);
    expect(normalizeSettings({ calendarSongs: 'yes' }).calendarSongs).toBe(false);
  });
});

