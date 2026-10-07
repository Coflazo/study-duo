import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { initialState, type TimerState } from '@/core/timer';
import { createTimerService, type EffectInput } from './timer-service';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

function harness(start: TimerState = initialState()) {
  let stored = start;
  let clock = T0;
  const effects: EffectInput[] = [];
  const service = createTimerService({
    now: () => clock,
    loadSettings: async () => DEFAULT_SETTINGS,
    loadState: async () => stored,
    saveState: async (s) => {
      await new Promise((r) => setTimeout(r, 1)); // leave room for interleaving
      stored = s;
    },
    applyEffects: async (e) => {
      effects.push(e);
    },
  });
  return {
    service,
    effects,
    stored: () => stored,
    setClock: (t: number) => {
      clock = t;
    },
  };
}

describe('timer service', () => {
  it('persists the reduced state and reports effects', async () => {
    const h = harness();
    await h.service.dispatch({ type: 'start' });
    expect(h.stored()).toMatchObject({ status: 'running', endsAt: T0 + 25 * MIN });
    expect(h.effects).toHaveLength(1);
    expect(h.effects[0]?.prev.status).toBe('stopped');
  });

  it('two simultaneous ticks log the completed focus once', async () => {
    const h = harness();
    await h.service.dispatch({ type: 'start' });
    h.setClock(T0 + 25 * MIN);
    await Promise.all([h.service.dispatch({ type: 'tick' }), h.service.dispatch({ type: 'tick' })]);
    expect(h.effects.flatMap((e) => e.segments)).toHaveLength(1);
    expect(h.stored().phase).toBe('shortBreak');
  });

  it('runs effects even when the state did not change, so a restart restores alarms and badge', async () => {
    const running: TimerState = { ...initialState(), status: 'running', startedAt: T0, endsAt: T0 + 25 * MIN, plannedMs: 25 * MIN };
    const h = harness(running);
    h.setClock(T0 + 5 * MIN);
    await h.service.dispatch({ type: 'tick' });
    expect(h.effects).toHaveLength(1);
    expect(h.effects[0]?.state).toBe(running);
  });

  it('a failing effect does not block later events', async () => {
    const service = createTimerService({
      now: () => T0,
      loadSettings: async () => DEFAULT_SETTINGS,
      loadState: async () => initialState(),
      saveState: async () => {},
      applyEffects: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined),
    });
    await expect(service.dispatch({ type: 'start' })).rejects.toThrow('boom');
    await expect(service.dispatch({ type: 'start' })).resolves.toBeDefined();
  });
});
