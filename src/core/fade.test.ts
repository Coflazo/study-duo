import { describe, expect, it } from 'vitest';
import { crossfade, FADE_SECONDS, fadeCurve, highPass, seamlessLoop } from './fade';
import { noiseSamples } from './noise';

describe('fadeCurve', () => {
  it('rises along a quarter sine from silence to the volume, so it sounds even to the ear', () => {
    const c = fadeCurve(5, 'in', 0.8);
    expect(c[0]).toBe(0);
    expect(c[4]).toBeCloseTo(0.8, 6);
    expect(c[2]).toBeCloseTo(0.8 * Math.SQRT1_2, 6); // halfway is -3 dB, not -6 dB
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
  });

  it('falls the same way from the volume to silence', () => {
    const c = fadeCurve(5, 'out', 0.8);
    expect(c[0]).toBeCloseTo(0.8, 6);
    expect(c[4]).toBeCloseTo(0, 6);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeLessThan(c[i - 1]!);
  });
});

describe('crossfade', () => {
  it('keeps the loudness steady while one source hands over to the next', () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const { from, to } = crossfade(t);
      expect(from ** 2 + to ** 2).toBeCloseTo(1, 6);
    }
    expect(crossfade(0)).toEqual({ from: 1, to: 0 });
  });
});

describe('FADE_SECONDS', () => {
  it('gives deeper noise a longer, softer fade', () => {
    expect(FADE_SECONDS.white).toBeLessThan(FADE_SECONDS.pink);
    expect(FADE_SECONDS.pink).toBeLessThan(FADE_SECONDS.brown);
  });
});

describe('seamlessLoop', () => {
  /** The biggest jump between neighbouring samples, going round the loop once and across the seam. */
  const jumps = (s: Float32Array) => {
    let inside = 0;
    for (let i = 1; i < s.length; i++) inside = Math.max(inside, Math.abs(s[i]! - s[i - 1]!));
    return { inside, seam: Math.abs(s[0]! - s[s.length - 1]!) };
  };

  it('joins the end of a sound to its start with no step at the seam', () => {
    // A slow tone that does not fit the buffer a whole number of times: looped as is, it clicks at the seam.
    const raw = Float32Array.from({ length: 4410 }, (_, i) => Math.sin((2 * Math.PI * 7.3 * i) / 4410));
    expect(jumps(raw).seam).toBeGreaterThan(jumps(raw).inside * 10);
    const loop = seamlessLoop(raw, 441);
    expect(loop.length).toBe(4410 - 441);
    expect(jumps(loop).seam).toBeLessThanOrEqual(jumps(loop).inside * 1.5);
  });

  it('loops brown noise with no click, after taking out its slow drift', () => {
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const brown = highPass(noiseSamples('brown', 48_000, random), 48_000, 20);
    const loop = seamlessLoop(brown, 4_800);
    const { inside, seam } = jumps(loop);
    expect(seam).toBeLessThanOrEqual(inside);
  });
});

describe('highPass', () => {
  it('removes a constant offset and keeps the movement', () => {
    const sr = 8_000;
    const s = Float32Array.from({ length: sr * 2 }, (_, i) => 0.5 + 0.3 * Math.sin((2 * Math.PI * 200 * i) / sr));
    const out = highPass(s, sr, 20);
    const tail = out.slice(sr); // after the filter settles
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.max(...tail)).toBeGreaterThan(0.25);
  });
});
