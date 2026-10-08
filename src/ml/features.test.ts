import { describe, expect, it } from 'vitest';
import type { ActivityRecord, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { buildFeatures, BINS, binOf, cellWeights, dayOf } from './features';

const MIN = 60_000;
/** Tuesday 6 October 2026, 09:30 local time. */
const TUE_0930 = new Date(2026, 9, 6, 9, 30).getTime();

const block = (startedAt: number, rating: SessionRecord['rating'], extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `${startedAt}-focus`, phase: 'focus', startedAt, endedAt: startedAt + 25 * MIN, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0,
  completed: true, taskId: null, rating, ratingSkipped: false, ...extra,
});
const listen = (from: number, minutes: number, extra: Partial<ListenRecord> = {}): ListenRecord => ({
  id: `${from}-x`, host: 'file', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', startedAt: from, endedAt: from + minutes * MIN, sessionId: null, ...extra,
});

describe('time', () => {
  it('maps local hours into 17 bins from 06 to 22, and days Monday first', () => {
    expect(BINS).toBe(17);
    expect(binOf(new Date(2026, 9, 6, 9, 30).getTime())).toBe(3);
    expect(binOf(new Date(2026, 9, 6, 2, 0).getTime())).toBe(0);
    expect(binOf(new Date(2026, 9, 6, 23, 50).getTime())).toBe(16);
    expect(dayOf(TUE_0930)).toBe(1);
    expect(dayOf(new Date(2026, 9, 11, 12).getTime())).toBe(6); // Sunday
  });
});

describe('buildFeatures', () => {
  it('gives a rated block its hour, weekday and day columns and maps the rating to 0 to 1', () => {
    const f = buildFeatures({ sessions: [block(TUE_0930, 5)], listens: [], activity: [] });
    expect(f.design.rows).toBe(1);
    expect(f.design.y[0]).toBe(1);
    const row = (name: string) => f.design.x[f.columns.indexOf(name)];
    // "this hour or later": 09:30 sets the steps up to its bin, nothing after it
    for (const name of ['hour:1', 'hour:3', 'weekday:0', 'weekday:3', 'day:1:0', 'day:1:1', 'length:25']) expect(row(name)).toBe(1);
    for (const name of ['hour:4', 'weekday:4', 'weekend:0', 'day:1:2', 'day:2:0', 'length:50']) expect(row(name)).toBe(0);
    expect(row('source:silence')).toBe(1);
    expect(cellWeights(1, 3)).toEqual({ 'hour:1': 1, 'hour:2': 1, 'hour:3': 1, 'weekday:0': 1, 'weekday:1': 1, 'weekday:2': 1, 'weekday:3': 1, 'day:1:0': 1, 'day:1:1': 1 });
  });

  it('turns songs during a block into time shares, the rest is silence', () => {
    const sessions = [block(TUE_0930, 3)];
    const listens = [
      listen(TUE_0930 - 5 * MIN, 10, { genre: 'Ambient' }), // 5 of its minutes fall inside the block
      listen(TUE_0930 + 10 * MIN, 5, { host: 'music.youtube.com', title: 'Hammers' }),
      listen(TUE_0930 + 15 * MIN, 5, { host: 'sound', title: 'Brown noise', artist: '' }),
    ];
    const f = buildFeatures({ sessions, listens, activity: [] });
    const v = (name: string) => f.design.x[f.columns.indexOf(name)];
    expect(v('source:file')).toBeCloseTo(5 / 25);
    expect(v('source:music site')).toBeCloseTo(5 / 25);
    expect(v('source:focus sound')).toBeCloseTo(5 / 25);
    expect(v('source:silence')).toBeCloseTo(10 / 25);
    expect(v('genre:ambient')).toBeCloseTo(5 / 25);
    expect(v('artist:nils frahm')).toBeCloseTo(10 / 25);
    expect(v('track:nils frahm — hammers')).toBeCloseTo(5 / 25);
    expect(v('track:brown noise')).toBeCloseTo(5 / 25);
  });

  it('keeps the busiest artists and tracks and pools the rest', () => {
    const sessions = Array.from({ length: 6 }, (_, i) => block(TUE_0930 + i * 60 * MIN, 4));
    const listens = sessions.map((s, i) => listen(s.startedAt, 25 - i, { artist: `Artist ${i}`, title: `Song ${i}` }));
    const f = buildFeatures({ sessions, listens, activity: [] }, { artists: 2, tracks: 2, genres: 2 });
    expect(f.columns.length).toBeLessThan(160);
    expect(f.columns.filter((c) => c.startsWith('artist:'))).toEqual(['artist:artist 0', 'artist:artist 1', 'artist:other']);
    expect(f.design.x[5 * f.columns.length + f.columns.indexOf('artist:other')]).toBeCloseTo(20 / 25);
  });

  it('adds controls known when the block starts, and leaves out unrated blocks unless the index fills them in', () => {
    const first = block(TUE_0930, 4);
    const second = block(TUE_0930 + 60 * MIN, null);
    const third = block(TUE_0930 + 120 * MIN, 2, { plannedMs: 50 * MIN, endedAt: TUE_0930 + 170 * MIN });
    const activity: ActivityRecord[] = [{ id: 'a', startedAt: third.startedAt - 30 * MIN, endedAt: third.startedAt - 10 * MIN, category: 'blocked', domain: 'youtube.com', phase: 'shortBreak' }];
    const f = buildFeatures({ sessions: [first, second, third], listens: [], activity });
    expect(f.blocks.map((b) => b.id)).toEqual([first.id, third.id]);
    const v = (r: number, name: string) => f.design.x[r * f.columns.length + f.columns.indexOf(name)];
    expect(v(1, 'control:block of the day')).toBe(2 / 4); // third block today
    expect(v(1, 'length:50')).toBe(1);
    expect(v(1, 'length:25')).toBe(0);
    expect(v(1, 'control:leisure before')).toBeCloseTo(20 / 60);
    const imputed = buildFeatures({ sessions: [first, second, third], listens: [], activity, imputed: new Map([[second.id, { y: 0.6, w: 0.4 }]]) });
    expect(imputed.design.rows).toBe(3);
    expect(imputed.design.w![1]).toBe(0.4);
  });

  it('puts every column in exactly one prior group, with a vague intercept', () => {
    const f = buildFeatures({ sessions: [block(TUE_0930, 4)], listens: [listen(TUE_0930, 5, { genre: 'Ambient' })], activity: [] });
    const seen = f.groups.flatMap((g) => g.cols).sort((a, b) => a - b);
    expect(seen).toEqual(f.columns.map((_, i) => i));
    expect(f.groups.find((g) => g.name === 'intercept')!.alpha).toBeLessThan(0.01);
  });
});
