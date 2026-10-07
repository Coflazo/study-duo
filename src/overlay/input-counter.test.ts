import { describe, expect, it } from 'vitest';
import { createInputCounter, type CountableEvent } from './input-counter';

const ev = (type: string, target: unknown = { type: 'text' }): CountableEvent => ({ type, composedPath: () => [target] });

describe('createInputCounter', () => {
  it('counts keys, clicks and scrolls, and hands over the totals once', () => {
    const c = createInputCounter();
    for (const t of ['keydown', 'keydown', 'pointerdown', 'wheel', 'wheel', 'wheel']) c.count(ev(t));
    expect(c.take()).toEqual({ keys: 2, clicks: 1, scrolls: 3 });
    expect(c.take()).toBeNull(); // nothing new: nothing to send
  });

  it('never counts typing in a password field, or anything else', () => {
    const c = createInputCounter();
    c.count(ev('keydown', { type: 'password' }));
    c.count(ev('keydown', { type: 'PASSWORD' }));
    c.count(ev('mousemove'));
    expect(c.take()).toBeNull();
  });

  it('caps a minute at 10 000 of each, so a stuck key cannot flood the log', () => {
    const c = createInputCounter();
    for (let i = 0; i < 10_050; i++) c.count(ev('keydown'));
    expect(c.take()).toEqual({ keys: 10_000, clicks: 0, scrolls: 0 });
  });
});
