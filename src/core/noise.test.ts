import { describe, expect, it, vi } from 'vitest';
import { FADE_SECONDS } from './fade';
import { noiseSamples, NOISES, startNoise } from './noise';

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

/** Enough of an AudioContext to see what startNoise schedules. */
function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const param = new Proxy({ value: 0 } as Record<string, unknown>, {
    get: (t, k) => (k === 'value' ? t.value : (...args: unknown[]) => void calls.push({ name: String(k), args })),
  });
  const source = { buffer: null as { length: number } | null, loop: false, connect: () => gain, start: vi.fn(), stop: vi.fn() };
  const gain = { gain: param, connect: () => undefined };
  const ctx = {
    sampleRate: 8_000,
    currentTime: 10,
    destination: {},
    createBuffer: (_c: number, length: number) => ({ length, copyToChannel: vi.fn() }),
    createBufferSource: () => source,
    createGain: () => gain,
  };
  return { ctx: ctx as unknown as AudioContext, calls, source };
}

describe('startNoise', () => {
  it('loops six seconds and fades in along an ear-shaped curve, longer for deeper noise', () => {
    for (const kind of NOISES) {
      const { ctx, calls, source } = fakeContext();
      startNoise(ctx, kind, 0.6);
      expect(source.loop).toBe(true);
      expect(source.buffer!.length).toBe(6 * 8_000);
      const curve = calls.find((c) => c.name === 'setValueCurveAtTime')!;
      const values = curve.args[0] as Float32Array;
      expect(values[0]).toBe(0);
      expect(values[values.length - 1]).toBeCloseTo(0.6, 5);
      expect(curve.args.slice(1)).toEqual([10, FADE_SECONDS[kind]]);
    }
  });

  it('fades out from where it is, then stops, and says when it will be silent', () => {
    const { ctx, calls, source } = fakeContext();
    const n = startNoise(ctx, 'brown', 0.6);
    calls.length = 0;
    const silentIn = n.stop();
    expect(calls[0]!.name === 'cancelAndHoldAtTime' || calls[0]!.name === 'cancelScheduledValues').toBe(true);
    const out = calls.find((c) => c.name === 'setValueCurveAtTime')!;
    expect((out.args[0] as Float32Array).at(-1)).toBeCloseTo(0, 5);
    expect(out.args[2]).toBe(FADE_SECONDS.brown);
    expect(source.stop).toHaveBeenCalledWith(10 + FADE_SECONDS.brown + 0.05);
    expect(silentIn).toBeCloseTo(FADE_SECONDS.brown + 0.05, 5);
  });
});
