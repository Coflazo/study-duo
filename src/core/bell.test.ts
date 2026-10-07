import { describe, expect, it } from 'vitest';
import { BOWL_PARTIALS, bellKindFor, playBell, strikes } from './bell';

function fakeCtx() {
  const calls = { osc: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (): { connect: () => unknown; gain: ReturnType<typeof param> } => ({ connect: () => node(), gain: param() });
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => node(),
    createOscillator: () => {
      calls.osc++;
      return { type: 'sine', frequency: param(), connect: () => node(), start() {}, stop() {} };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, calls };
}

describe('bell', () => {
  it('focus start is one strike, break start is two', () => {
    expect(strikes('focusStart')).toHaveLength(1);
    expect(strikes('breakStart')).toHaveLength(2);
  });

  it('maps the next phase to a bell kind', () => {
    expect(bellKindFor('focus')).toBe('focusStart');
    expect(bellKindFor('shortBreak')).toBe('breakStart');
    expect(bellKindFor('longBreak')).toBe('breakStart');
  });

  it('builds two slightly detuned oscillators per partial per strike', () => {
    const { ctx, calls } = fakeCtx();
    const seconds = playBell(ctx, 'breakStart', 0.5);
    expect(calls.osc).toBe(2 * BOWL_PARTIALS.length * 2);
    expect(seconds).toBeGreaterThan(4);
  });

  it('plays nothing at volume 0', () => {
    const { ctx, calls } = fakeCtx();
    expect(playBell(ctx, 'focusStart', 0)).toBe(0);
    expect(calls.osc).toBe(0);
  });
});
