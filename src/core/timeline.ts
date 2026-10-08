import type { SessionRecord } from './sessions';

/** The timeline shows 06:00 to midnight; blocks outside it are clipped (and say so). */
export const VISIBLE_FROM = 6;
export const VISIBLE_TO = 24;

/** Monday 00:00 local time of the week containing t. */
export function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export interface TimelineItem {
  session: SessionRecord;
  /** Minutes from VISIBLE_FROM on this day, and length in minutes, after clipping. */
  top: number;
  height: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * The part of each session that falls on the day starting at dayStart (local midnight), placed by local wall-clock
 * minutes so a day when the clocks change still lines up. A session across midnight shows on both days.
 */
export function dayItems(sessions: SessionRecord[], dayStart: number): TimelineItem[] {
  const from = new Date(dayStart);
  from.setHours(VISIBLE_FROM, 0, 0, 0);
  const to = new Date(dayStart);
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);
  const lo = from.getTime();
  const hi = to.getTime(); // VISIBLE_TO is midnight
  const wall = (t: number) => {
    const d = new Date(t);
    return (d.getHours() - VISIBLE_FROM) * 60 + d.getMinutes() + d.getSeconds() / 60;
  };
  const items: TimelineItem[] = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const start = Math.max(s.startedAt, lo);
    const end = Math.min(s.endedAt, hi);
    if (end <= start) continue;
    const top = Math.round(wall(start));
    const bottom = end === hi ? (VISIBLE_TO - VISIBLE_FROM) * 60 : wall(end);
    items.push({ session: s, top, height: Math.max(1, Math.round(bottom - wall(start))), clippedStart: s.startedAt < lo, clippedEnd: s.endedAt > hi });
  }
  return items;
}
