import { describe, expect, it } from 'vitest';
import { current, handoff, newQueue, nextIn, prevIn, setRepeat, toggleShuffle } from './queue';

/** A fixed shuffle, so tests do not depend on luck. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe('queue', () => {
  const q0 = newQueue(['a', 'b', 'c', 'd'], 1);

  it('starts at the chosen song and plays in folder order', () => {
    expect(current(q0)).toBe('b');
    expect(current(nextIn(q0)!)).toBe('c');
  });

  it('stops at the end, or goes round with repeat all, or stays with repeat one', () => {
    const last = newQueue(['a', 'b'], 1);
    expect(nextIn(last)).toBeNull();
    expect(current(nextIn(setRepeat(last, 'all'))!)).toBe('a');
    expect(current(nextIn(setRepeat(last, 'one'))!)).toBe('b');
  });

  it('goes back to the start of the song first, then to the song before', () => {
    expect(prevIn(q0, 5_000)).toEqual({ queue: q0, restart: true });
    const back = prevIn(q0, 1_000);
    expect(back.restart).toBe(false);
    expect(current(back.queue)).toBe('a');
    expect(prevIn(newQueue(['a', 'b'], 0), 1_000).restart).toBe(true); // nothing before the first
  });

  it('shuffles the rest and keeps the playing song playing; turning it off returns to folder order', () => {
    const s = toggleShuffle(q0, seq(0.9, 0.1, 0.5));
    expect(s.shuffle).toBe(true);
    expect(current(s)).toBe('b');
    const order = s.order.map((i) => s.items[i]);
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(order[0]).toBe('b');
    const back = toggleShuffle(s, seq(0));
    expect(back.shuffle).toBe(false);
    expect(current(back)).toBe('b');
    expect(current(nextIn(back)!)).toBe('c');
  });
});

describe('handoff', () => {
  it('fades out what plays and starts the new source, when something was playing', () => {
    expect(handoff({ active: 'noise', playing: true }, 'folder')).toEqual({ fadeOut: 'noise', start: 'folder', active: 'folder' });
  });

  it('only changes the view when nothing was playing', () => {
    expect(handoff({ active: 'noise', playing: false }, 'folder')).toEqual({ fadeOut: null, start: null, active: 'folder' });
    expect(handoff({ active: null, playing: false }, 'youtube')).toEqual({ fadeOut: null, start: null, active: 'youtube' });
  });

  it('does nothing when the same source is picked again', () => {
    expect(handoff({ active: 'folder', playing: true }, 'folder')).toEqual({ fadeOut: null, start: null, active: 'folder' });
  });
});
