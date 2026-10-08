import type { NoiseKind } from './noise';

/** Deeper noise fades in and out more slowly, so it never arrives or leaves with a lurch. */
export const FADE_SECONDS: Record<NoiseKind, number> = { white: 1.0, pink: 1.4, brown: 1.8 };

/**
 * A fade shaped for the ear: a quarter sine, so halfway is -3 dB rather than the -6 dB of a straight ramp that makes
 * a fade-out sound like it drops off a cliff. For AudioParam.setValueCurveAtTime, from silence up to `volume` or back.
 */
export function fadeCurve(points: number, direction: 'in' | 'out', volume = 1): Float32Array {
  const n = Math.max(2, Math.floor(points));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (Math.PI / 2);
    out[i] = volume * (direction === 'in' ? Math.sin(t) : Math.cos(t));
  }
  return out;
}

/** Equal-power gains at `t` (0 to 1) of a handover: the outgoing source falls as the incoming one rises, loudness steady. */
export function crossfade(t: number): { from: number; to: number } {
  const a = Math.min(1, Math.max(0, t)) * (Math.PI / 2);
  return { from: Math.cos(a), to: Math.sin(a) };
}

/**
 * A buffer that loops with no click: its last `overlap` samples are faded into its first ones, so the end runs
 * straight into the start. The result is `overlap` samples shorter.
 */
export function seamlessLoop(samples: Float32Array, overlap: number): Float32Array {
  const n = samples.length - overlap;
  const out = samples.slice(0, n);
  for (let i = 0; i < overlap; i++) {
    const { from, to } = crossfade(i / overlap);
    out[i] = samples[n + i]! * from + samples[i]! * to;
  }
  return out;
}

/** A gentle one-pole high-pass: takes out the slow drift brown noise builds up, which the ear hears as a thump at a loop. */
export function highPass(samples: Float32Array, sampleRate: number, hz: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const alpha = rc / (rc + 1 / sampleRate);
  const out = new Float32Array(samples.length);
  for (let i = 1; i < samples.length; i++) out[i] = alpha * (out[i - 1]! + samples[i]! - samples[i - 1]!);
  return out;
}
