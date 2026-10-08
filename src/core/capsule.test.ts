import { describe, expect, it } from 'vitest';
import { capsuleText, tickPlan } from './capsule';

describe('capsuleText', () => {
  it('shows MM:SS, rounding a countdown up', () => {
    expect(capsuleText(25 * 60_000, false)).toBe('25:00');
    expect(capsuleText(61_500, false)).toBe('01:02');
    expect(capsuleText(0, false)).toBe('00:00');
  });

  it('switches to H:MM from one hour', () => {
    expect(capsuleText(65 * 60_000, true)).toBe('1:05');
    expect(capsuleText(59 * 60_000 + 59_999, true)).toBe('59:59');
  });
});

describe('tickPlan', () => {
  const S = 1000;

  it('shows seconds and wakes on the next second when asked for seconds', () => {
    expect(tickPlan(24 * 60 * S + 30 * S, false, true)).toEqual({ text: '24:30', nextInMs: 1000 });
    expect(tickPlan(24 * 60 * S + 30_400, false, true)).toEqual({ text: '24:31', nextInMs: 400 });
  });

  it('shows minutes with the seconds unlit while dimmed, and wakes when the minute changes', () => {
    // 24:30 left shows "24" (the same minutes as the full clock), next change when 24:00 becomes 23:59.
    expect(tickPlan(24 * 60 * S + 30 * S, false, false)).toEqual({ text: '24:  ', nextInMs: 31 * S });
    expect(tickPlan(24 * 60 * S + 30_400, false, false)).toEqual({ text: '24:  ', nextInMs: 31_400 });
    expect(tickPlan(25 * 60 * S, false, false)).toEqual({ text: '25:  ', nextInMs: 1 * S });
  });

  it('switches to seconds for the last minute of a countdown, whatever the dimming', () => {
    // 61 s left: still minutes, but wake exactly when 01:00 is reached.
    expect(tickPlan(61 * S, false, false)).toEqual({ text: '01:  ', nextInMs: 1 * S });
    expect(tickPlan(119 * S, false, false)).toEqual({ text: '01:  ', nextInMs: 59 * S });
    expect(tickPlan(60 * S, false, false)).toEqual({ text: '01:00', nextInMs: 1 * S });
    expect(tickPlan(59 * S, false, false)).toEqual({ text: '00:59', nextInMs: 1 * S });
  });

  it('counts up by the minute while dimmed', () => {
    expect(tickPlan(5 * 60 * S + 20 * S, true, false)).toEqual({ text: '05:  ', nextInMs: 40 * S });
    expect(tickPlan(5 * 60 * S + 20_300, true, false)).toEqual({ text: '05:  ', nextInMs: 39_700 });
    expect(tickPlan(5 * 60 * S + 20 * S, true, true)).toEqual({ text: '05:20', nextInMs: 1000 });
  });

  it('keeps H:MM from one hour and wakes once a minute either way', () => {
    expect(tickPlan(65 * 60 * S + 10 * S, true, true)).toEqual({ text: '1:05', nextInMs: 50 * S });
    expect(tickPlan(65 * 60 * S + 10 * S, true, false)).toEqual({ text: '1:05', nextInMs: 50 * S });
    // A countdown leaving the hour: 1:00:00 shows 1:00 until it becomes 59 minutes.
    expect(tickPlan(60 * 60 * S, false, false)).toEqual({ text: '1:00', nextInMs: 1 * S });
    expect(tickPlan(60 * 60 * S - 1, false, false)).toEqual({ text: '1:00', nextInMs: 999 });
    expect(tickPlan(60 * 60 * S - S, false, false)).toEqual({ text: '59:  ', nextInMs: 60 * S });
  });
});
