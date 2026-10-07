import type { Phase } from './timer';

export type BellKind = 'focusStart' | 'breakStart';

/** Singing-bowl partials: frequency ratio, relative gain, decay in seconds. Higher partials fade faster. */
export const BOWL_PARTIALS = [
  { ratio: 1, gain: 1, decay: 5.2 },
  { ratio: 2.76, gain: 0.42, decay: 3.4 },
  { ratio: 5.4, gain: 0.18, decay: 1.9 },
  { ratio: 8.93, gain: 0.07, decay: 1.1 },
] as const;

export const BELL_BASE_HZ = 392;
const DETUNE_HZ = 1.3; // the slow beating that makes a bowl sound alive
const ATTACK_S = 0.008;
const MASTER = 0.25;

export function strikes(kind: BellKind): Array<{ at: number; baseHz: number; gain: number }> {
  return kind === 'focusStart'
    ? [{ at: 0, baseHz: BELL_BASE_HZ, gain: 1 }]
    : [
        { at: 0, baseHz: BELL_BASE_HZ * 1.5, gain: 0.75 },
        { at: 0.45, baseHz: BELL_BASE_HZ, gain: 0.9 },
      ];
}

export function bellKindFor(next: Phase): BellKind {
  return next === 'focus' ? 'focusStart' : 'breakStart';
}

/** Schedules the bell on ctx and returns how many seconds until it is silent. */
export function playBell(ctx: BaseAudioContext, kind: BellKind, volume: number, when = ctx.currentTime): number {
  if (volume <= 0) return 0;
  const master = ctx.createGain();
  master.gain.value = MASTER * volume;
  master.connect(ctx.destination);
  let end = 0;
  for (const strike of strikes(kind)) {
    for (const p of BOWL_PARTIALS) {
      for (const detune of [-DETUNE_HZ, DETUNE_HZ]) {
        const t0 = when + strike.at;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = strike.baseHz * p.ratio + detune;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(0.5 * p.gain * strike.gain, t0 + ATTACK_S);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);
        osc.connect(env).connect(master);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.05);
        end = Math.max(end, strike.at + p.decay + 0.05);
      }
    }
  }
  return end;
}
