import { describe, expect, it } from 'vitest';
import { actionTitle, dial } from './dial';
import { DEFAULT_SETTINGS as S } from './settings';
import { initialState, reduce } from './timer';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 7, 9, 0);
const study = reduce(initialState(), { type: 'start' }, S, T0).state;
const close = (arcs: ReturnType<typeof dial>) => arcs?.arcs.map((a) => [+a.from.toFixed(3), +a.to.toFixed(3), a.tone]);

describe('toolbar dial', () => {
  it('is the plain app icon while stopped', () => {
    expect(dial(initialState(), S, T0)).toBeNull();
  });

  it('drains red study time from 12 o\'clock, with the next break in green after it', () => {
    expect(close(dial(study, S, T0 + 7 * MIN))).toEqual([
      [0, +(7 / 30).toFixed(3), 'elapsed'],
      [+(7 / 30).toFixed(3), +(25 / 30).toFixed(3), 'study'],
      [+(25 / 30).toFixed(3), 1, 'break'],
    ]);
  });

  it('keeps the real proportions before a long break', () => {
    expect(close(dial({ ...study, cycle: 3 }, S, T0))!.at(-1)).toEqual([+(25 / 40).toFixed(3), 1, 'break']);
  });

  it('drains the green section through the break', () => {
    const brk = { ...study, phase: 'shortBreak' as const, startedAt: T0, endsAt: T0 + 5 * MIN, plannedMs: 5 * MIN };
    expect(close(dial(brk, S, T0 + 2 * MIN))).toEqual([
      [0, 0.9, 'elapsed'],
      [0.9, 1, 'break'],
    ]);
  });

  it('turns grey and shows pause bars while paused', () => {
    const paused = reduce(study, { type: 'pause' }, S, T0 + 13 * MIN).state;
    const d = dial(paused, S, T0 + 20 * MIN)!;
    expect(d.paused).toBe(true);
    expect(d.arcs.map((a) => a.tone)).toEqual(['elapsed', 'pausedStudy', 'pausedBreak']);
    expect(d.arcs[1]!.from).toBeCloseTo(13 / 30, 3);
  });

  it('shows a whole red ring while Flowtime counts up', () => {
    const flow = reduce(initialState(), { type: 'start' }, { ...S, mode: 'flowtime' }, T0).state;
    expect(close(dial(flow, { ...S, mode: 'flowtime' }, T0 + 12 * MIN))).toEqual([[0, 1, 'study']]);
  });
});

describe('toolbar title', () => {
  it('says the phase and the time left in words, for screen readers and hover', () => {
    expect(actionTitle(initialState(), S, T0)).toBe('Study Duo');
    expect(actionTitle(study, S, T0 + 7 * MIN)).toBe('Study Duo: study block, 18 min left');
    expect(actionTitle(study, S, T0 + 24.5 * MIN)).toBe('Study Duo: study block, less than a minute left');
    expect(actionTitle({ ...study, phase: 'shortBreak', plannedMs: 5 * MIN, endsAt: T0 + 5 * MIN }, S, T0 + 2 * MIN)).toBe('Study Duo: short break, 3 min left');
    expect(actionTitle(reduce(study, { type: 'pause' }, S, T0 + 13 * MIN).state, S, T0 + 20 * MIN)).toBe('Study Duo: paused, 12 min left');
    const flow = reduce(initialState(), { type: 'start' }, { ...S, mode: 'flowtime' }, T0).state;
    expect(actionTitle(flow, { ...S, mode: 'flowtime' }, T0 + 12 * MIN)).toBe('Study Duo: study block, 12 min in');
  });
});
