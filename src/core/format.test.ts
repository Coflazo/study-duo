import { describe, expect, it } from 'vitest';
import { formatClock } from './format';

describe('formatClock', () => {
  it('rounds countdowns up so 25:00 shows for the first second', () => {
    expect(formatClock(25 * 60_000, false)).toBe('25:00');
    expect(formatClock(25 * 60_000 - 500, false)).toBe('25:00');
    expect(formatClock(25 * 60_000 - 1000, false)).toBe('24:59');
    expect(formatClock(0, false)).toBe('00:00');
  });

  it('rounds count-ups down and adds hours past 60 minutes', () => {
    expect(formatClock(59_999, true)).toBe('00:59');
    expect(formatClock(65 * 60_000, true)).toBe('1:05:00');
  });
});
