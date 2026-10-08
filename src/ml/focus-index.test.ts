import { describe, expect, it } from 'vitest';
import type { BlockSignals } from '@/core/signals';
import { calibrate, robustZ, shouldAskRating } from './focus-index';
import { seeded } from './synthetic';

describe('robustZ', () => {
  it('centres on the median, scales by the MAD, clips at plus or minus 3, and stays 0 without spread', () => {
    const z = robustZ([1, 2, 3, 4, 100]);
    expect(z[2]).toBe(0);
    expect(z[4]).toBe(3);
    expect(z[0]).toBeCloseTo(-2 / 1.4826, 6);
    expect(robustZ([5, 5, 5])).toEqual([0, 0, 0]);
  });
});

/** Blocks whose rating follows study share and switches, as a real student's might. */
function student(n: number, related: boolean, seed = 3) {
  const r = seeded(seed);
  return Array.from({ length: n }, (_, i) => {
    const studyShare = 0.3 + 0.7 * r.u();
    const offSwitchesPerHour = Math.floor(r.u() * 8);
    const signals: BlockSignals = { studyShare, offSwitchesPerHour, blockedAttempts: Math.floor(r.u() * 3), longestStudyMin: 25 * studyShare, completed: 1, pausedMin: 0 };
    const y = related ? 0.15 + 0.75 * studyShare - 0.04 * offSwitchesPerHour + 0.08 * r.normal() : r.u();
    const rating = Math.min(5, Math.max(1, Math.round(1 + 4 * y))) as 1 | 2 | 3 | 4 | 5;
    return { id: `b${i}`, signals, rating: i % 4 === 3 ? null : rating };
  });
}

describe('calibrate', () => {
  it('learns from rated blocks and fills in unrated ones once it predicts well', () => {
    const blocks = student(80, true);
    const c = calibrate(blocks);
    expect(c.rated).toBe(60);
    expect(c.ready).toBe(true);
    expect(c.looCorrelation).toBeGreaterThanOrEqual(0.3);
    expect(c.weights.studyShare).toBeGreaterThan(0);
    expect(c.weights.offSwitchesPerHour).toBeLessThan(0);
    expect(c.imputed.size).toBe(20);
    for (const v of c.imputed.values()) {
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(1);
      expect(v.w).toBeGreaterThan(0);
      expect(v.w).toBeLessThan(1);
    }
  });

  it('fills in nothing before 15 rated blocks, or when the signals say nothing about the ratings', () => {
    expect(calibrate(student(16, true)).ready).toBe(false); // 12 rated
    const noise = calibrate(student(80, false, 9));
    expect(noise.ready).toBe(false);
    expect(noise.imputed.size).toBe(0);
  });
});

describe('shouldAskRating', () => {
  it('asks until the index is calibrated, then only when the index is unsure about this block', () => {
    const blocks = student(120, true);
    expect(shouldAskRating(calibrate(blocks.slice(0, 10)), blocks[0]!.signals)).toBe(true);
    const c = calibrate(blocks);
    expect(shouldAskRating(c, { studyShare: 0.7, offSwitchesPerHour: 2, blockedAttempts: 1, longestStudyMin: 18, completed: 1, pausedMin: 0 })).toBe(false);
    expect(shouldAskRating(c, {})).toBe(true); // no signals at all: nothing to go on
  });
});
