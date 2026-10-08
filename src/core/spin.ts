/**
 * The player's disc turns like a record: 33 1/3 rpm, a soft start (critically damped, no overshoot, about a second to
 * full speed) and a coast to a stop like a turntable after its motor cuts (a little friction plus drag, about 1.6 s).
 * Played again mid-coast, it speeds up from the speed it has. Pure, so the motion is tested, not eyeballed.
 */

/** 33 1/3 rpm in degrees a second. */
export const FULL_SPEED = (100 / 3) * 6;
/** Spin-up: critically damped with this time constant (seconds). */
const RISE = 0.22;
/** Coasting: speed falls by FRICTION deg/s² plus speed / DRAG each second, which stops it in COAST seconds. */
const DRAG = 0.6;
const COAST = 1.6;
const FRICTION = FULL_SPEED / DRAG / (Math.exp(COAST / DRAG) - 1);

export interface Spin {
  angle: number;
  /** Degrees a second. */
  speed: number;
  /** Degrees a second, per second. */
  accel: number;
  /** Still, or turning steadily at full speed: nothing left to animate frame by frame. */
  settled: boolean;
}

export const SPIN_STILL: Spin = { angle: 0, speed: 0, accel: 0, settled: true };

export function stepSpin(s: Spin, playing: boolean, dt: number): Spin {
  if (!playing && s.speed === 0) return s.settled ? s : { ...s, accel: 0, settled: true };
  let { speed, accel } = s;
  if (playing) {
    const w = 1 / RISE;
    accel += (w * w * (FULL_SPEED - speed) - 2 * w * accel) * dt;
    speed = Math.min(FULL_SPEED, speed + accel * dt);
  } else {
    accel = -(FRICTION + speed / DRAG);
    speed = Math.max(0, speed + accel * dt);
  }
  const angle = (((s.angle + speed * dt) % 360) + 360) % 360;
  const settled = playing ? FULL_SPEED - speed < 0.5 && Math.abs(accel) < 5 : speed === 0;
  return { angle, speed, accel: speed === 0 ? 0 : accel, settled };
}
