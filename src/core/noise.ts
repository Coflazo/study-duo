import { fadeCurve, FADE_SECONDS, highPass, seamlessLoop } from './fade';

export const NOISES = ['white', 'pink', 'brown'] as const;
export type NoiseKind = (typeof NOISES)[number];

/**
 * Focus noise, generated, so there is no file or licence. White is even hiss; pink falls 3 dB per octave (Paul
 * Kellet's filter); brown 6 dB per octave (a leaky random walk), a low rumble. Peak scaled to 0.9 for headroom.
 */
export function noiseSamples(kind: NoiseKind, length: number, random: () => number = Math.random): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = random() * 2 - 1;
    if (kind === 'white') out[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      out[i] = last;
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] = (out[i]! / peak) * 0.9;
  return out;
}

/** Brings the loudest sample back to 0.9 after filtering. */
function normalize(x: Float32Array): Float32Array {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! / peak) * 0.9;
  return x;
}

/**
 * Loops six seconds of noise with no click at the seam, fading in and out along an ear-shaped curve (white 1 s, pink
 * 1.4 s, brown 1.8 s). Brown noise loses its slow drift first, which would thump at every loop. Runs where audio may
 * play on (the offscreen page, or Firefox's background page).
 */
export function startNoise(ctx: AudioContext, kind: NoiseKind, volume: number): { setVolume(v: number): void; stop(): number } {
  const seconds = 6;
  const overlap = Math.round(ctx.sampleRate / 2);
  let samples = noiseSamples(kind, ctx.sampleRate * seconds + overlap);
  if (kind === 'brown') samples = normalize(highPass(samples, ctx.sampleRate, 20));
  const loop = seamlessLoop(samples, overlap);
  const buffer = ctx.createBuffer(1, loop.length, ctx.sampleRate);
  buffer.copyToChannel(loop as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  const fade = FADE_SECONDS[kind];
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.setValueCurveAtTime(fadeCurve(64, 'in', volume), ctx.currentTime, fade);
  source.connect(gain).connect(ctx.destination);
  source.start();
  /** Stops whatever the gain was doing, holding its value now, so a new move starts from what is heard. */
  const hold = (now: number) => {
    if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(now);
    else {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
    }
  };
  return {
    setVolume(v) {
      const now = ctx.currentTime;
      hold(now);
      gain.gain.setTargetAtTime(v, now, 0.08);
    },
    stop() {
      const now = ctx.currentTime;
      hold(now);
      try {
        gain.gain.setValueCurveAtTime(fadeCurve(64, 'out', gain.gain.value || volume), now, fade);
      } catch {
        gain.gain.setTargetAtTime(0, now, fade / 4); // a browser that refuses the curve still fades
      }
      source.stop(now + fade + 0.05);
      return fade + 0.05;
    },
  };
}
