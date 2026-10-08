import { describe, expect, it } from 'vitest';
import { noiseSamples, NOISES } from './noise';

/** A seeded generator, so the test sees the same noise every run. */
function seeded(seed = 7) {
  let a = seed >>> 0; // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
/** Mean step between neighbouring samples relative to the signal's size: high for hiss, low for rumble. */
function roughness(x: Float32Array) {
  let step = 0;
  let size = 0;
  for (let i = 1; i < x.length; i++) {
    step += Math.abs(x[i]! - x[i - 1]!);
    size += Math.abs(x[i]!);
  }
  return step / size;
}

describe('noiseSamples', () => {
  it('makes white, pink and brown noise, each softer in the highs than the last', () => {
    const [white, pink, brown] = NOISES.map((k) => roughness(noiseSamples(k, 48_000, seeded())));
    expect(white).toBeGreaterThan(pink! * 1.5);
    expect(pink).toBeGreaterThan(brown! * 2.5);
  });

  it('stays inside full scale with headroom, and is not silent', () => {
    for (const k of NOISES) {
      const x = noiseSamples(k, 48_000, seeded());
      const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeLessThanOrEqual(0.9);
      expect(peak).toBeGreaterThan(0.5);
    }
  });
});
