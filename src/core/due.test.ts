import { describe, expect, it } from 'vitest';
import { dueLabel, weekRange } from './due';

const NOW = new Date(2026, 9, 8, 10, 0).getTime(); // Thursday 8 October, 10:00 local
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('dueLabel', () => {
  it('says today or tomorrow with the time, and marks less than a day left', () => {
    expect(dueLabel(at(8, 23, 59), NOW)).toEqual({ text: 'Due today 23:59', soon: true });
    expect(dueLabel(at(9, 9, 0), NOW)).toEqual({ text: 'Due tomorrow 09:00', soon: true });
    expect(dueLabel(at(9, 23, 59), NOW)).toEqual({ text: 'Due tomorrow 23:59', soon: false });
  });

  it('gives the weekday and date further out, with the time unless it is the end of the day', () => {
    expect(dueLabel(at(16, 23, 59), NOW).text).toMatch(/^Due Fri,? (16 Oct|Oct 16)$/);
    expect(dueLabel(at(16, 14, 0), NOW).text).toMatch(/^Due Fri,? (16 Oct|Oct 16) 14:00$/);
  });

  it('marks a missed deadline', () => {
    expect(dueLabel(at(7, 23, 59), NOW)).toEqual({ text: 'Was due yesterday 23:59', soon: true });
    expect(dueLabel(at(2, 12, 0), NOW).text).toMatch(/^Was due Fri,? (2 Oct|Oct 2) 12:00$/);
  });
});

describe('weekRange', () => {
  it('writes a week the way the language orders dates, with "to" and never a dash', () => {
    const r = weekRange(new Date(2026, 9, 5).getTime(), new Date(2026, 9, 11).getTime());
    expect(['October 5 to 11', '5 to 11 October']).toContain(r);
    expect(weekRange(new Date(2026, 8, 28).getTime(), new Date(2026, 9, 4).getTime())).toMatch(/^(September 28 to October 4|28 September to 4 October)$/);
  });
});
