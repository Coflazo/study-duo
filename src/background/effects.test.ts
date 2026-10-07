import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { initialState, reduce } from '@/core/timer';
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

  it('stays quiet when the user skipped', async () => {
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'skip' }, DEFAULT_SETTINGS, T0 + MIN);
    await applyEffects({ event: { type: 'skip' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + MIN });
    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
  });
});
