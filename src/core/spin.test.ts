import { describe, expect, it } from 'vitest';
import { FULL_SPEED, SPIN_STILL, stepSpin, type Spin } from './spin';

/** Runs the disc for `seconds` in 10 ms steps and returns where it ended. */
function run(s: Spin, playing: boolean, seconds: number): Spin {
  for (let t = 0; t < seconds; t += 0.01) s = stepSpin(s, playing, 0.01);
  return s;
}

describe('stepSpin', () => {
  it('turns at 33 1/3 rpm', () => {
    expect(FULL_SPEED).toBeCloseTo(200, 6); // degrees a second
  });

  it('speeds up softly: no jolt at the start, about full speed after a second, no overshoot', () => {
    const first = stepSpin(SPIN_STILL, true, 0.01);
    expect(first.speed).toBeLessThan(FULL_SPEED * 0.01);
    let s = SPIN_STILL;
    let top = 0;
    for (let t = 0; t < 3; t += 0.01) {
      s = stepSpin(s, true, 0.01);
      top = Math.max(top, s.speed);
    }
    expect(run(SPIN_STILL, true, 1.1).speed).toBeGreaterThan(FULL_SPEED * 0.93);
    expect(top).toBeLessThanOrEqual(FULL_SPEED * 1.0001);
  });

  it('coasts to a stop in about 1.6 s, then stays still', () => {
    const full = run(SPIN_STILL, true, 3);
    expect(run(full, false, 1.2).speed).toBeGreaterThan(0);
    const stopped = run(full, false, 1.7);
    expect(stopped.speed).toBe(0);
    expect(stepSpin(stopped, false, 0.01)).toEqual(stopped);
  });

  it('picks up from the speed it has when played again mid-coast, with no jump in angle', () => {
    const full = run(SPIN_STILL, true, 3);
    const coasting = run(full, false, 0.5);
    const again = stepSpin(coasting, true, 0.01);
    expect(Math.abs(again.speed - coasting.speed)).toBeLessThan(FULL_SPEED * 0.05);
    expect(Math.abs(again.angle - coasting.angle)).toBeLessThan(5);
  });

  it('keeps the angle between 0 and 360', () => {
    const s = run(SPIN_STILL, true, 10);
    expect(s.angle).toBeGreaterThanOrEqual(0);
    expect(s.angle).toBeLessThan(360);
  });

  it('knows when it is settled, so the page can hand the turning to the compositor', () => {
    expect(run(SPIN_STILL, true, 3).settled).toBe(true);
    expect(run(SPIN_STILL, true, 0.3).settled).toBe(false);
    expect(SPIN_STILL.settled).toBe(true);
  });
});
