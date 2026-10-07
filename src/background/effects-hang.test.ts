import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { initialState, reduce } from '@/core/timer';
import { ALARM_PHASE_END, applyEffects } from './effects';

// A database that never answers (blocked upgrade, wedged browser profile).
vi.mock('@/core/sessions', async (original) => ({ ...(await original<typeof import('@/core/sessions')>()), addSessions: () => new Promise(() => {}) }));

beforeEach(() => {
  fakeBrowser.reset();
  Object.assign(fakeBrowser.action, { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setBadgeTextColor: vi.fn(), setIcon: vi.fn(), setTitle: vi.fn() });
  Object.assign(fakeBrowser, { declarativeNetRequest: { getSessionRules: vi.fn(async () => []), updateSessionRules: vi.fn(async () => {}) } });
});

describe('session log never holds up the timer', () => {
  it('sets the alarms and the badge before the database write, and gives up on the write', async () => {
    const T = Date.UTC(2026, 9, 7, 9, 0);
    const state = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T).state;
    const seg = { phase: 'focus' as const, startedAt: T - 1, endedAt: T, plannedMs: null, activeMs: 0, pausedMs: 0, completed: false, taskId: null };
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const done = applyEffects({ event: { type: 'start' }, prev: initialState(), state, settings: DEFAULT_SETTINGS, segments: [seg], now: T });
      await vi.advanceTimersByTimeAsync(0);
      expect((await fakeBrowser.alarms.get(ALARM_PHASE_END))?.scheduledTime).toBe(state.endsAt);
      await vi.advanceTimersByTimeAsync(5_000);
      await done; // resolves: the write is abandoned after a few seconds
    } finally {
      vi.useRealTimers();
    }
  });
});
