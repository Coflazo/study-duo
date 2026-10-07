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

/** Loops a few seconds of noise with a gentle fade in; stop fades out. Runs where audio may play on (offscreen page). */
export function startNoise(ctx: AudioContext, kind: NoiseKind, volume: number): { setVolume(v: number): void; stop(): void } {
  const seconds = 6;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  buffer.copyToChannel(noiseSamples(kind, buffer.length) as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.5);
  source.connect(gain).connect(ctx.destination);
  source.start();
  return {
    setVolume(v) {
      gain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    },
    stop() {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      source.stop(ctx.currentTime + 1);
    },
  };
}
