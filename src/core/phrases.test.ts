import { describe, expect, it } from 'vitest';
import phrases from '@/locales/en/phrases.json';
import { drawLine, momentFor, subLine, type Moment } from './phrases';
import { DEFAULT_SETTINGS } from './settings';
import { initialState } from './timer';

const MIN: Record<Moment, number> = {
  focusStart: 120, shortBreak: 120, longBreak: 80, focusAfterLong: 60,
  focusFirstMorning: 40, focusFirstAfternoon: 30, focusFirstEvening: 30, lateNight: 40,
};
const BANNED = /seamless|unleash|journey|crush|grind|hustle|supercharge|elevate|unlock|productivity|synergy|delve|embark/i;
const bank = phrases as Record<string, string[]>;

describe('phrase bank contract', () => {
  it('has every moment with at least its minimum count', () => {
    for (const [m, n] of Object.entries(MIN)) expect(bank[m]?.length ?? 0, m).toBeGreaterThanOrEqual(n);
  });

  it('keeps every line short, finished, plain and unique', () => {
    const seen = new Set<string>();
    for (const [moment, lines] of Object.entries(bank)) {
      expect(lines.filter((l) => l.endsWith('!')).length, `${moment} exclamations`).toBeLessThanOrEqual(10);
      for (const line of lines) {
        expect(line.length, line).toBeGreaterThanOrEqual(3);
        expect(line.length, line).toBeLessThanOrEqual(34);
        expect(line, line).toMatch(/[.?!]$/);
        expect(line, line).not.toMatch(/[—–]/);
        expect(line, line).not.toMatch(BANNED);
        expect(line, line).not.toMatch(/\p{Extended_Pictographic}/u);
        const key = line.toLowerCase();
        expect(seen.has(key), `duplicate: ${line}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('drawing lines', () => {
  it('never repeats a line until the moment is used up', () => {
    let bag = {};
    const got = new Set<string>();
    const n = bank.lateNight!.length;
    for (let i = 0; i < n; i++) {
      const r = drawLine('lateNight', bag);
      bag = r.bag;
      got.add(r.line);
    }
    expect(got.size).toBe(n);
    expect(drawLine('lateNight', bag).bag.lateNight?.length).toBe(n - 1);
  });

  it('picks the moment from the next phase and context', () => {
    const ctx = (hour: number, firstOfDay = false, afterLong = false) => ({ hour, firstOfDay, afterLong });
    expect(momentFor('shortBreak', ctx(10))).toBe('shortBreak');
    expect(momentFor('longBreak', ctx(10))).toBe('longBreak');
    expect(momentFor('focus', ctx(8, true))).toBe('focusFirstMorning');
    expect(momentFor('focus', ctx(14, true))).toBe('focusFirstAfternoon');
    expect(momentFor('focus', ctx(19, true))).toBe('focusFirstEvening');
    expect(momentFor('focus', ctx(23))).toBe('lateNight');
    expect(momentFor('focus', ctx(2, true))).toBe('lateNight');
    expect(momentFor('focus', ctx(11, false, true))).toBe('focusAfterLong');
    expect(momentFor('focus', ctx(11))).toBe('focusStart');
  });

  it('writes the sub line from the settings', () => {
    const running = { ...initialState(), status: 'running' as const };
    expect(subLine('focus', DEFAULT_SETTINGS, running)).toBe('Study time, 25 minutes.');
    expect(subLine('shortBreak', DEFAULT_SETTINGS, running)).toBe('Short break, 5 minutes.');
    expect(subLine('longBreak', DEFAULT_SETTINGS, running)).toBe('Long break, 15 minutes.');
    expect(subLine('focus', { ...DEFAULT_SETTINGS, mode: 'flowtime' }, running)).toBe('Study time. Stop when you are ready.');
    expect(subLine('shortBreak', { ...DEFAULT_SETTINGS, mode: 'flowtime' }, { ...running, nextBreakMs: 7 * 60_000 })).toBe('Short break, 7 minutes.');
  });

  it('never claims a block started when the next phase waits for the start button', () => {
    expect(subLine('focus', DEFAULT_SETTINGS, initialState())).toBe('Study time. Press start when you are ready.');
    expect(subLine('shortBreak', DEFAULT_SETTINGS, { ...initialState(), phase: 'shortBreak' })).toBe('Short break. Press start when you are ready.');
  });
});
