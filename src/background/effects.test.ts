import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import phrases from '@/locales/en/phrases.json';
import { lastFocusDayItem, phraseBagItem } from '@/core/store';
import { initialState, reduce, type TimerState } from '@/core/timer';
import { ALARM_PHASE_END, ALARM_REFRESH, applyEffects, syncAlarms } from './effects';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

beforeEach(() => {
  fakeBrowser.reset();
  Object.assign(fakeBrowser.action, {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setIcon: vi.fn(async () => {}),
  });
  Object.assign(fakeBrowser.offscreen, { createDocument: vi.fn(async () => {}) });
  Object.assign(fakeBrowser.runtime, { getContexts: vi.fn(async () => []) });
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
  Object.assign(fakeBrowser.notifications, { create: vi.fn(async () => 'phase') });
  Object.assign(fakeBrowser, { declarativeNetRequest: { getSessionRules: vi.fn(async () => []), updateSessionRules: vi.fn(async () => {}) } });
});

describe('alarms', () => {
  it('schedules phase end and refresh while running, clears both when stopped', async () => {
    const running = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    await syncAlarms(running);
    expect((await fakeBrowser.alarms.get(ALARM_PHASE_END))?.scheduledTime).toBe(T0 + 25 * MIN);
    expect(await fakeBrowser.alarms.get(ALARM_REFRESH)).toBeDefined();
    await syncAlarms(initialState());
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);
  });
});

describe('applyEffects', () => {
  it('sets the badge and rings only when a phase completes on its own', async () => {
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, T0 + 25 * MIN);
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + 25 * MIN });
    expect(fakeBrowser.action.setBadgeText).toHaveBeenLastCalledWith({ text: '5' });
    expect(fakeBrowser.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: DEFAULT_SETTINGS.bellVolume });
    expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('still notifies when the bell cannot play', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(fakeBrowser.offscreen, { createDocument: vi.fn(async () => { throw new Error('no audio'); }) });
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, T0 + 25 * MIN);
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + 25 * MIN });
    expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the user skipped', async () => {
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'skip' }, DEFAULT_SETTINGS, T0 + MIN);
    await applyEffects({ event: { type: 'skip' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + MIN });
    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
  });
});

describe('phase words', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m).getTime();
  const sent = () => (fakeBrowser.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
  const finishFocus = async (startedAt: number, extra: Partial<TimerState> = {}) => {
    const prev = { ...reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, startedAt).state, ...extra };
    const end = prev.endsAt!;
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, end);
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: end });
    return r.state;
  };

  beforeEach(() => {
    Object.assign(fakeBrowser.tabs, {
      query: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
      sendMessage: vi.fn(async (id: number) => { if (id === 2) throw new Error('no receiver'); return true; }),
    });
  });

  it('sends the line to the active tabs and skips the notification when a page showed it', async () => {
    await finishFocus(at(9));
    expect(sent()).toHaveLength(2);
    expect(sent()[0]).toMatchObject({ kind: 'announce', phase: 'shortBreak', sub: 'Short break, 5 minutes.' });
    expect(phrases.shortBreak).toContain(sent()[0].line);
    expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
  });

  it('counts a page that could not show the words (fullscreen video, minimised window) as not shown', async () => {
    Object.assign(fakeBrowser.tabs, { query: vi.fn(async () => [{ id: 1 }]), sendMessage: vi.fn(async () => false) });
    await finishFocus(at(9));
    expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('with default settings, a finished break says the next block waits for start', async () => {
    const prev = { ...initialState(), phase: 'shortBreak' as const, status: 'running' as const, startedAt: at(10), endsAt: at(10, 5), plannedMs: 5 * MIN };
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, prev.endsAt);
    expect(r.state.status).toBe('stopped');
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: prev.endsAt });
    expect(sent()[0]).toMatchObject({ phase: 'focus', sub: 'Study time. Press start when you are ready.' });
  });

  it('does not let a page stuck in a dialog hold up the timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      Object.assign(fakeBrowser.tabs, { query: vi.fn(async () => [{ id: 1 }]), sendMessage: vi.fn(() => new Promise(() => {})) });
      const done = finishFocus(at(9));
      await vi.advanceTimersByTimeAsync(2_000);
      await done;
      expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a notification when no page can show it', async () => {
    Object.assign(fakeBrowser.tabs, { query: vi.fn(async () => []) });
    await finishFocus(at(9));
    expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('greets the first study block of the day and then uses the usual lines', async () => {
    const shortBreak = { ...initialState(), phase: 'shortBreak' as const, status: 'running' as const, startedAt: at(8, 0), endsAt: at(8, 5), plannedMs: 5 * MIN };
    const settings = { ...DEFAULT_SETTINGS, autoStartFocus: true };
    for (const [i, expected] of [[0, 'focusFirstMorning'], [1, 'focusStart']] as const) {
      const prev = { ...shortBreak, startedAt: at(8 + i, 0), endsAt: at(8 + i, 5) };
      const r = reduce(prev, { type: 'tick' }, settings, prev.endsAt);
      await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings, segments: r.segments, now: prev.endsAt });
      expect(phrases[expected], `call ${i}`).toContain(sent()[sent().length - 2].line);
    }
  });

  it('uses the after-long-break lines and remembers which lines were shown', async () => {
    await lastFocusDayItem.setValue(new Date(at(9)).toDateString());
    const prev = { ...initialState(), phase: 'longBreak' as const, status: 'running' as const, startedAt: at(11), endsAt: at(11, 15), plannedMs: 15 * MIN, cycle: 4 };
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, prev.endsAt);
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: prev.endsAt });
    expect(phrases.focusAfterLong).toContain(sent()[0].line);
    expect((await phraseBagItem.getValue()).focusAfterLong).toHaveLength(phrases.focusAfterLong.length - 1);
  });
});
