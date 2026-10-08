import { describe, expect, it } from 'vitest';
import { fitBLR, predict } from './blr';
import { buildFeatures, cellWeights } from './features';
import { NULL_STUDENT, simulate, TYPICAL } from './synthetic';
import { walkForward } from './validate';

const Z80 = 1.2816;

function fitStudent(truth: typeof TYPICAL, days: number, seed: number) {
  const { sessions, listens } = simulate(truth, { days, seed });
  const f = buildFeatures({ sessions, listens, activity: [] });
  return { f, fit: fitBLR(f.design, f.groups), sessions, listens };
}
/** Effect of a contrast vector: mean and 80% interval. */
function contrast(fit: ReturnType<typeof fitBLR>, columns: string[], weights: Record<string, number>) {
  const x = new Float64Array(columns.length);
  for (const [c, v] of Object.entries(weights)) x[columns.indexOf(c)] = v;
  const p = predict(fit, x);
  const sd = Math.sqrt(p.variance);
  return { mean: p.mean, lo: p.mean - Z80 * sd, hi: p.mean + Z80 * sd };
}
const cell = (day: number, bin: number) => cellWeights(day, bin);
const minus = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) - v;
  return out;
};

describe('a typical student over eight weeks', () => {
  const { f, fit } = fitStudent(TYPICAL, 56, 1);

  it('finds that weekday mornings beat weekday afternoons', () => {
    const c = contrast(fit, f.columns, minus(cell(2, 4), cell(2, 9))); // Wednesday 10:00 vs 15:00
    expect(c.mean).toBeGreaterThan(0.15);
    expect(c.lo).toBeGreaterThan(0);
  });

  it('finds the later weekend peak', () => {
    const c = contrast(fit, f.columns, minus(cell(6, 8), cell(6, 2))); // Sunday 14:00 vs 08:00
    expect(c.mean).toBeGreaterThan(0.05);
  });

  it('finds the lyrics penalty and calls the neutral song unclear', () => {
    const lyrics = contrast(fit, f.columns, { 'track:singer — lyrics song': 1, 'artist:singer': 1, 'source:file': 1, 'source:silence': -1 });
    expect(lyrics.hi).toBeLessThan(0);
    const neutral = contrast(fit, f.columns, { 'track:someone — neutral song': 1, 'artist:someone': 1, 'source:file': 1, 'source:silence': -1 });
    expect(neutral.lo).toBeLessThan(0);
    expect(neutral.hi).toBeGreaterThan(0);
  });

  it('predicts ratings better than a running average, walking forward', () => {
    const { sessions, listens } = simulate(TYPICAL, { days: 42, seed: 2 });
    const r = walkForward({ sessions, listens, activity: [] }, { minTrain: 30, step: 10 });
    expect(r.n).toBeGreaterThan(60);
    expect(r.modelMae).toBeLessThan(r.baselineMae);
  }, 60_000);
});

describe('a student with nothing to find', () => {
  it('rarely claims a music effect', () => {
    let claimed = 0;
    let tried = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
      const { f, fit } = fitStudent(NULL_STUDENT, 42, seed);
      for (const [artist, track] of [['singer', 'singer — lyrics song'], ['pianist', 'pianist — piano piece'], ['someone', 'someone — neutral song']]) {
        const c = contrast(fit, f.columns, { [`track:${track}`]: 1, [`artist:${artist}`]: 1, 'source:file': 1, 'source:silence': -1 });
        tried++;
        if (c.lo > 0 || c.hi < 0) claimed++;
      }
    }
    expect(claimed / tried).toBeLessThanOrEqual(0.3); // an 80% interval misses about 20% of the time by chance
  }, 60_000);
});
