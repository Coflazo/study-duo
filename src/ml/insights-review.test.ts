import { describe, expect, it } from 'vitest';
import type { ActivityRecord, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { binOf, dayOf, studyDayStart } from './features';
import { calibrate, robustZ } from './focus-index';
import { cellLevel, computeInsights, weekSeed } from './insights';
import { seeded } from './random';
import { simulate, TYPICAL } from './synthetic';

const MIN = 60_000;
type R = 1 | 2 | 3 | 4 | 5;
const rate = (y: number) => Math.min(5, Math.max(1, Math.round(1 + 4 * y))) as R;
const session = (startedAt: number, rating: R | null): SessionRecord => ({ id: `${startedAt}-focus`, phase: 'focus', startedAt, endedAt: startedAt + 25 * MIN, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0, completed: true, taskId: null, rating, ratingSkipped: false });
const run = (sessions: SessionRecord[], listens: ListenRecord[], extra: object = {}) => computeInsights({ sessions, listens, activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(1).u, ...extra });

/** A student with 30 songs and ratings that are pure noise (review probe 3). */
function nullLibrary(seed: number, days: number) {
  const r = seeded(seed);
  const sessions: SessionRecord[] = [];
  const listens: ListenRecord[] = [];
  for (let d = 0; d < days; d++) {
    const n = 2 + Math.floor(r.u() * 3);
    for (let k = 0; k < n; k++) {
      const startedAt = new Date(2026, 8, 1 + d, 8 + 3 * k, Math.floor(r.u() * 60)).getTime();
      if (r.u() < 0.8) {
        const i = Math.floor(r.u() * 30);
        listens.push({ id: `${startedAt}`, host: i < 15 ? 'file' : 'music.youtube.com', title: `song ${i}`, artist: `artist ${i % 12}`, album: '', genre: i < 15 ? `genre ${i % 6}` : undefined, startedAt, endedAt: startedAt + 25 * MIN, sessionId: null });
      }
      sessions.push(session(startedAt, rate(0.55 + 0.15 * r.normal())));
    }
  }
  return { sessions, listens };
}

describe('heat map shading (review 1)', () => {
  it('uses fixed quarter-point steps, so noise stays one shade', () => {
    expect(cellLevel(3.26518, 3.26518, 3.26521)).toBe(2);
    expect(cellLevel(3.26521, 3.26518, 3.26521)).toBe(2);
    expect(cellLevel(4.0, 3.0, 4.0)).toBe(4);
    expect(cellLevel(3.0, 3.0, 4.0)).toBe(0);
    expect(cellLevel(3.6, 3.0, 4.0)).toBe(2);
  });
});

describe('music rows', () => {
  it('give every row its own id when two songs share a title (review 2)', () => {
    const sessions: SessionRecord[] = [];
    const listens: ListenRecord[] = [];
    for (let d = 0; d < 40; d++) {
      for (let k = 0; k < 2; k++) {
        const startedAt = new Date(2026, 8, 1 + d, 9 + 4 * k).getTime();
        sessions.push(session(startedAt, 4));
        listens.push({ id: `${startedAt}`, host: 'file', title: 'Intro', artist: k ? 'Band A' : 'Band B', album: '', startedAt, endedAt: startedAt + 25 * MIN, sessionId: null });
      }
    }
    const ids = run(sessions, listens).music.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are rarely claimed for a student with a varied library and nothing to find (review 3)', () => {
    let screens = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { sessions, listens } = nullLibrary(seed, 30);
      if (run(sessions, listens).music.some((m) => m.claim)) screens++;
    }
    expect(screens).toBeLessThanOrEqual(2);
  }, 120_000);

  it('count genre when picking what to try next (review 4)', () => {
    const r = seeded(11);
    const sessions: SessionRecord[] = [];
    const listens: ListenRecord[] = [];
    for (let d = 0; d < 90; d++) {
      for (let k = 0; k < 3; k++) {
        const startedAt = new Date(2026, 5, 1 + d, 9 + 3 * k).getTime();
        let y = 0.55;
        if (r.u() < 0.75) {
          const pop = r.u() < 0.5;
          const i = Math.floor(r.u() * 12);
          listens.push({ id: `${startedAt}`, host: 'file', title: pop ? `pop ${i}` : `piano ${i}`, artist: pop ? `singer ${i}` : `pianist ${i}`, album: '', genre: pop ? 'Pop' : 'Piano', startedAt, endedAt: startedAt + 25 * MIN, sessionId: null });
          y += pop ? -0.25 : 0.1;
        }
        sessions.push(session(startedAt, rate(y + 0.12 * r.normal())));
      }
    }
    let pop = 0;
    for (let seed = 1; seed <= 20; seed++) if (computeInsights({ sessions, listens, activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(seed).u }).tryNext?.startsWith('pop')) pop++;
    expect(pop).toBeLessThanOrEqual(4);
  }, 120_000);
});

describe('focus index (review 5 and 9)', () => {
  it('keeps count and yes or no signals when most values are equal', () => {
    const z = robustZ([0, 0, 0, 0, 0, 0, 1, 2, 3, 5]);
    expect(z[6]).toBeGreaterThan(0);
    expect(z.at(-1)).toBe(3);
    expect(robustZ([1, 1, 1, 1, 0]).at(-1)).toBe(-3);
    expect(robustZ([2, 2, 2])).toEqual([0, 0, 0]);
  });

  it('fills in every unrated block once ready, not only the recent ones', () => {
    const r = seeded(5);
    const blocks = Array.from({ length: 400 }, (_, i) => {
      const studyShare = 0.3 + 0.7 * r.u();
      const offSwitchesPerHour = Math.floor(r.u() * 8);
      const y = 0.15 + 0.75 * studyShare - 0.04 * offSwitchesPerHour + 0.08 * r.normal();
      return { id: `b${i}`, signals: { studyShare, offSwitchesPerHour }, rating: i % 4 === 3 ? null : rate(y) };
    });
    const c = calibrate(blocks);
    expect(c.ready).toBe(true);
    expect(c.imputed.size).toBe(100);
  });
});

describe('suggestions (review 7)', () => {
  it('stay the same through a week, as the copy promises, and move on with the next week', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 56, seed: 3 });
    const at = (t: number) => computeInsights({ sessions, listens, activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, now: t });
    const monday = new Date(2026, 11, 7, 9).getTime();
    const sameWeek = [monday, monday + 2 * 86_400_000, monday + 6 * 86_400_000].map((t) => [at(t).tryNext, at(t).blockLength].join());
    expect(new Set(sameWeek).size).toBe(1);
    expect(weekSeed(monday)).not.toBe(weekSeed(monday + 7 * 86_400_000));
  });
});

describe('late-night study (review 8)', () => {
  it('files 00:00 to 03:59 under the evening before, in the last column', () => {
    const tue0100 = new Date(2026, 9, 6, 1, 0).getTime();
    expect(dayOf(tue0100)).toBe(0); // Monday's evening
    expect(binOf(tue0100)).toBe(16);
    expect(studyDayStart(tue0100)).toBe(new Date(2026, 9, 5, 4, 0).getTime());
    const tue0430 = new Date(2026, 9, 6, 4, 30).getTime();
    expect([dayOf(tue0430), binOf(tue0430)]).toEqual([1, 0]);
  });
});

describe('a year of real-sized data (review 6)', () => {
  it('works out a year with 20,000 activity records and 20,000 listens in under a second of CPU', () => {
    const { sessions } = simulate(TYPICAL, { days: 365, seed: 5 });
    const r = seeded(9);
    const activity: ActivityRecord[] = [];
    const listens: ListenRecord[] = [];
    for (let i = 0; activity.length < 20_000; i++) {
      const s = sessions[i % sessions.length]!;
      const t = s.startedAt + Math.floor(r.u() * 25) * MIN;
      activity.push({ id: `a${activity.length}`, startedAt: t, endedAt: t + 60_000, category: r.u() < 0.6 ? 'study' : 'unfiled', domain: 'example.org', phase: 'focus' });
      listens.push({ id: `l${listens.length}`, host: 'music.youtube.com', title: `song ${i % 50}`, artist: `artist ${i % 20}`, album: '', startedAt: t, endedAt: t + 60_000, sessionId: null });
    }
    const t = process.cpuUsage();
    computeInsights({ sessions, listens, activity, blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(1).u });
    const used = process.cpuUsage(t);
    expect((used.user + used.system) / 1000).toBeLessThan(1000);
  }, 60_000);
});

describe('Spotify plays (Spotify User Guidelines: no Spotify content in a machine learning model)', () => {
  it('never reach the model: a strong Spotify effect is not learned or shown', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 60, seed: 4 });
    const spotify = listens.map((l) => ({ ...l, host: 'open.spotify.com' }));
    const withSpotify = computeInsights({ sessions, listens: spotify, activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(1).u });
    const silent = computeInsights({ sessions, listens: [], activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(1).u });
    expect(withSpotify.music).toEqual([]);
    expect(withSpotify.cells).toEqual(silent.cells);
    expect(withSpotify.tryNext).toBe(silent.tryNext);
  });
});
