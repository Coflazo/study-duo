import { describe, expect, it } from 'vitest';
import type { SessionRecord } from './sessions';
import { dayItems, startOfWeek, VISIBLE_FROM, VISIBLE_TO } from './timeline';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const s = (from: number, to: number, phase: SessionRecord['phase'] = 'focus'): SessionRecord => ({
  id: `${from}-${phase}`, phase, startedAt: from, endedAt: to, plannedMs: to - from, activeMs: to - from, pausedMs: 0, completed: true, taskId: null, rating: null, ratingSkipped: false,
});

describe('startOfWeek', () => {
  it('starts weeks on Monday at local midnight', () => {
    expect(startOfWeek(at(8, 15))).toBe(at(5, 0)); // Thursday 8 October -> Monday 5
    expect(startOfWeek(at(11, 23, 59))).toBe(at(5, 0)); // Sunday
    expect(startOfWeek(at(5, 0))).toBe(at(5, 0));
  });
});

describe('dayItems', () => {
  it('places blocks by minutes from 06:00, clipped to the visible hours', () => {
    const items = dayItems([s(at(6, 9, 30), at(6, 9, 55)), s(at(6, 5, 0), at(6, 6, 30)), s(at(6, 23, 30), at(7, 0, 0))], at(6, 0));
    expect(VISIBLE_FROM).toBe(6);
    expect(VISIBLE_TO).toBe(24);
    expect(items.map((i) => [i.top, i.height])).toEqual([[0, 30], [210, 25], [1050, 30]]);
    expect(items[0]!.clippedStart).toBe(true);
  });

  it('shows a block that crosses midnight on both days', () => {
    const late = s(at(6, 23, 50), at(7, 0, 15));
    expect(dayItems([late], at(6, 0)).map((i) => [i.top, i.height])).toEqual([[1070, 10]]);
    expect(dayItems([late], at(7, 0))).toEqual([]); // 00:00 to 00:15 is before 06:00
    const night = s(at(6, 23, 0), at(7, 7, 0));
    expect(dayItems([night], at(7, 0)).map((i) => [i.top, i.height])).toEqual([[0, 60]]);
  });

  it('measures from local 06:00 on the day the clocks change', () => {
    const dst = new Date(2026, 9, 25, 0).getTime(); // Sunday 25 October: clocks go back in Europe
    expect(dayItems([s(new Date(2026, 9, 25, 9, 0).getTime(), new Date(2026, 9, 25, 9, 25).getTime())], dst).map((i) => i.top)).toEqual([180]);
  });
});
