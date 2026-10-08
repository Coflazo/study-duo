import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { computeInsights } from './insights';
import { NULL_STUDENT, seeded, simulate, TYPICAL } from './synthetic';

const run = (sessions: ReturnType<typeof simulate>['sessions'], listens: ReturnType<typeof simulate>['listens'], seed = 1) =>
  computeInsights({ sessions, listens, activity: [], blocks: [], measure: DEFAULT_SETTINGS.measure, random: seeded(seed).u });

describe('computeInsights', () => {
  it('starts with a learning state, never an error, on no data or a few blocks', () => {
    const none = run([], []);
    expect(none.learning).toEqual({ have: 0, need: 25 });
    expect(none.cells.every((c) => !c.enough)).toBe(true);
    expect(none.windows).toEqual([]);
    expect(none.music).toEqual([]);
    const few = simulate(TYPICAL, { days: 3, seed: 2 });
    const r = run(few.sessions, few.listens);
    expect(r.learning!.have).toBe(few.sessions.length);
    expect(r.windows).toEqual([]);
  });

  it('finds the best weekday and weekend windows of a typical student', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 56, seed: 3 });
    const r = run(sessions, listens);
    expect(r.learning).toBeNull();
    const weekdays = r.windows.find((w) => w.label === 'Weekdays')!;
    if (!('from' in weekdays)) throw new Error(`no weekday window: ${JSON.stringify(weekdays)}`);
    expect(weekdays.from).toBeGreaterThanOrEqual(9);
    expect(weekdays.to).toBeLessThanOrEqual(12);
    const weekend = r.windows.find((w) => w.label === 'Weekend');
    if (weekend && 'from' in weekend) expect(weekend.from).toBeGreaterThanOrEqual(12);
    expect(r.cells.filter((c) => c.enough).length).toBeGreaterThan(40);
  });

  it('claims the lyrics penalty, calls the neutral song unclear, and suggests something to try', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 56, seed: 4 });
    const r = run(sessions, listens);
    const lyrics = r.music.find((m) => m.name === 'lyrics song')!;
    expect(lyrics.claim).toBe(true);
    expect(lyrics.delta).toBeLessThan(0);
    // A song with no effect is rarely claimed (80% intervals miss by chance, and tiny effects are not reported).
    let claimed = 0;
    for (const seed of [4, 5, 6, 7]) {
      const s = simulate(TYPICAL, { days: 56, seed });
      if (run(s.sessions, s.listens).music.find((m) => m.name === 'neutral song')?.claim) claimed++;
    }
    expect(claimed).toBeLessThanOrEqual(1);
    const files = r.music.find((m) => m.name === 'Your own files')!;
    expect(files.hi - files.lo).toBeGreaterThan(0.05); // a real interval, not a falsely certain zero
    expect(r.tryNext).not.toBeNull();
    expect([25, 35, 45, 50]).toContain(r.blockLength);
    expect(r.health!.modelMae).toBeLessThan(r.health!.baselineMae);
  });

  it('shows no best windows and claims little for a student with nothing to find', () => {
    let windows = 0;
    let claims = 0;
    for (const seed of [21, 22, 23]) {
      const { sessions, listens } = simulate(NULL_STUDENT, { days: 56, seed });
      const r = run(sessions, listens, seed);
      windows += r.windows.filter((w) => 'from' in w).length;
      claims += r.music.filter((m) => m.claim).length;
    }
    expect(windows).toBeLessThanOrEqual(1);
    expect(claims).toBeLessThanOrEqual(2);
  });

  it('works out a year of blocks in well under a second', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 365, seed: 5 });
    // CPU time of this test process, not wall time: other test files share the cores while this runs.
    const t = process.cpuUsage();
    run(sessions, listens);
    const used = process.cpuUsage(t);
    expect((used.user + used.system) / 1000).toBeLessThan(1000);
  }, 20_000);
});
