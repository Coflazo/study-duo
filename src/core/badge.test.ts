import { describe, expect, it } from 'vitest';
import { badgeColor, badgeText, PHASE_COLORS } from './badge';
import { DEFAULT_SETTINGS } from './settings';
import { initialState, reduce } from './timer';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const S = DEFAULT_SETTINGS;

describe('badge', () => {
  it('is empty when stopped', () => {
    expect(badgeText(initialState(), T0)).toBe('');
  });

  it('shows minutes left rounded up, then <1 in the last minute', () => {
    const s = reduce(initialState(), { type: 'start' }, S, T0).state;
    expect(badgeText(s, T0)).toBe('25');
    expect(badgeText(s, T0 + 30_000)).toBe('25');
    expect(badgeText(s, T0 + MIN)).toBe('24');
    expect(badgeText(s, T0 + 24 * MIN + 1)).toBe('<1');
  });

  it('shows +minutes for a Flowtime count-up', () => {
    const F = { ...S, mode: 'flowtime' as const };
    const s = reduce(initialState(), { type: 'start' }, F, T0).state;
    expect(badgeText(s, T0 + 12 * MIN + 5000)).toBe('+12');
  });

  it('uses the phase color, and gray while paused', () => {
    const run = reduce(initialState(), { type: 'start' }, S, T0).state;
    expect(badgeColor(run)).toBe(PHASE_COLORS.focus);
    expect(badgeColor(reduce(run, { type: 'pause' }, S, T0 + 1).state)).toBe(PHASE_COLORS.paused);
    expect(badgeColor({ ...run, phase: 'shortBreak' })).toBe(PHASE_COLORS.break);
  });
});
