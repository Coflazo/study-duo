import type { ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { binOf, dayOf, FIRST_HOUR, isWeekend } from './features';

const MIN = 60_000;

export { seeded } from './random';
import { seeded } from './random';

export interface StudentTruth {
  /** Effect of studying in this hour bin on this day (Monday 0), on the 0 to 1 rating scale. */
  cell(day: number, bin: number): number;
  /** Effect of a full block of each track (by track key), against silence. */
  tracks: Record<string, number>;
}

/** A typical student: sharp weekday mornings, an after-lunch dip, later weekends, Tuesdays a little better; lyrics hurt. */
export const TYPICAL: StudentTruth = {
  cell(day, bin) {
    const hour = bin + FIRST_HOUR;
    const weekday = hour >= 9 && hour < 12 ? 0.18 : hour >= 14 && hour < 17 ? -0.12 : hour >= 21 ? -0.1 : 0;
    const weekend = hour >= 13 && hour < 16 ? 0.12 : hour < 10 ? -0.08 : 0;
    return (isWeekend(day) ? weekend : weekday) + (day === 1 ? 0.05 : 0);
  },
  tracks: { 'singer — lyrics song': -0.2, 'pianist — piano piece': 0.1, 'someone — neutral song': 0 },
};

/** A student whose ratings are pure noise: there is nothing to find. */
export const NULL_STUDENT: StudentTruth = { cell: () => 0, tracks: { 'singer — lyrics song': 0, 'pianist — piano piece': 0, 'someone — neutral song': 0 } };

/**
 * Weeks of 25-minute study blocks at plausible hours, some with one of the student's tracks, rated 1 to 5 from the true
 * effects plus noise. Starts on Monday 5 October 2026 so weekdays line up.
 */
export function simulate(truth: StudentTruth, opts: { days: number; seed: number; noise?: number; perDay?: [number, number] }) {
  const r = seeded(opts.seed);
  const noise = opts.noise ?? 0.12;
  const [lo, hi] = opts.perDay ?? [2, 5];
  const tracks = Object.keys(truth.tracks);
  const sessions: SessionRecord[] = [];
  const listens: ListenRecord[] = [];
  for (let d = 0; d < opts.days; d++) {
    const day0 = new Date(2026, 9, 5 + d).getTime();
    const count = lo + Math.floor(r.u() * (hi - lo + 1));
    const hours = Array.from({ length: count }, () => 7 + Math.floor(r.u() * 15)).sort((a, b) => a - b);
    let last = -1;
    for (const h of hours) {
      const startedAt = Math.max(day0 + h * 60 * MIN + Math.floor(r.u() * 30) * MIN, last + 35 * MIN);
      last = startedAt;
      const endedAt = startedAt + 25 * MIN;
      let y = 0.55 + truth.cell(dayOf(startedAt), binOf(startedAt));
      if (r.u() < 0.6) {
        const track = tracks[Math.floor(r.u() * tracks.length)]!;
        const [artist, title] = track.split(' — ') as [string, string];
        listens.push({ id: `${startedAt}-file`, host: 'file', title, artist, album: '', startedAt, endedAt, sessionId: `${startedAt}-focus` });
        y += truth.tracks[track]!;
      }
      y += noise * r.normal();
      const rating = Math.min(5, Math.max(1, Math.round(1 + 4 * y))) as 1 | 2 | 3 | 4 | 5;
      sessions.push({ id: `${startedAt}-focus`, phase: 'focus', startedAt, endedAt, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0, completed: true, taskId: null, rating, ratingSkipped: false });
    }
  }
  return { sessions, listens };
}
