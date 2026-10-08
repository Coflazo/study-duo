import { describe, expect, it } from 'vitest';
import { dueLabel } from './due';

const NOW = new Date(2026, 9, 8, 10, 0).getTime(); // Thursday 8 October, 10:00 local
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('dueLabel', () => {
  it('says today or tomorrow with the time, and marks less than a day left', () => {
    expect(dueLabel(at(8, 23, 59), NOW)).toEqual({ text: 'Due today 23:59', soon: true });
    expect(dueLabel(at(9, 9, 0), NOW)).toEqual({ text: 'Due tomorrow 09:00', soon: true });
    expect(dueLabel(at(9, 23, 59), NOW)).toEqual({ text: 'Due tomorrow 23:59', soon: false });
  });

  it('gives the weekday and date further out, with the time unless it is the end of the day', () => {
    expect(dueLabel(at(16, 23, 59), NOW).text).toMatch(/^Due Fri,? 16 Oct$/);
    expect(dueLabel(at(16, 14, 0), NOW).text).toMatch(/^Due Fri,? 16 Oct 14:00$/);
  });

  it('marks a missed deadline', () => {
    expect(dueLabel(at(7, 23, 59), NOW)).toEqual({ text: 'Was due yesterday 23:59', soon: true });
    expect(dueLabel(at(2, 12, 0), NOW).text).toMatch(/^Was due Fri,? 2 Oct 12:00$/);
  });
});
