import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { addSessions, localDayRange, pendingRating, rateSession, sessionId, sessionsBetween, type SessionRecord } from './sessions';
import type { Segment } from './timer';

const MIN = 60_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const seg = (startedAt: number, endedAt: number, extra: Partial<Segment> = {}): Segment => ({
  phase: 'focus', startedAt, endedAt, plannedMs: 25 * MIN, activeMs: endedAt - startedAt, pausedMs: 0, completed: true, taskId: null, ...extra,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('session log', () => {
  it('stores each block once, even when the same segment arrives twice', async () => {
    const s = seg(at(7, 9), at(7, 9, 25), { taskId: 't1' });
    await addSessions([s]);
    await addSessions([s]);
    const got = await sessionsBetween(at(7, 0), at(8, 0));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: sessionId(s), phase: 'focus', taskId: 't1', rating: null, ratingSkipped: false });
  });

  it('puts a block that crosses midnight on the day it ended', async () => {
    await addSessions([seg(at(7, 23, 50), at(8, 0, 15))]);
    const [from, to] = localDayRange(at(8, 10));
    expect(await sessionsBetween(from, to)).toHaveLength(1);
    const [from7, to7] = localDayRange(at(7, 10));
    expect(await sessionsBetween(from7, to7)).toHaveLength(0);
  });

  it('keeps a rating or a skip on the block', async () => {
    const a = seg(at(7, 9), at(7, 9, 25));
    const b = seg(at(7, 10), at(7, 10, 25));
    await addSessions([a, b]);
    await rateSession(sessionId(a), 4);
    await rateSession(sessionId(b), 'skip');
    const [ra, rb] = await sessionsBetween(at(7, 0), at(8, 0));
    expect(ra).toMatchObject({ rating: 4, ratingSkipped: false });
    expect(rb).toMatchObject({ rating: null, ratingSkipped: true });
    await addSessions([a]); // a late duplicate must not wipe the rating
    expect((await sessionsBetween(at(7, 0), at(8, 0)))[0]!.rating).toBe(4);
  });
});

describe('pendingRating', () => {
  const rec = (endedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
    id: String(endedAt), phase: 'focus', startedAt: endedAt - 25 * MIN, endedAt, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0,
    completed: true, taskId: null, rating: null, ratingSkipped: false, ...extra,
  });

  it('asks about the latest finished study block from the last two hours today', () => {
    const now = at(7, 11);
    expect(pendingRating([rec(at(7, 9, 25)), rec(at(7, 10, 30))], now)?.endedAt).toBe(at(7, 10, 30));
  });

  it('never asks about breaks, abandoned blocks, rated or skipped ones, old ones, or yesterday', () => {
    const now = at(8, 0, 30);
    expect(pendingRating([rec(at(8, 0, 10), { phase: 'shortBreak' })], now)).toBeNull();
    expect(pendingRating([rec(at(8, 0, 10), { completed: false })], now)).toBeNull();
    expect(pendingRating([rec(at(8, 0, 10), { rating: 3 })], now)).toBeNull();
    expect(pendingRating([rec(at(8, 0, 10), { ratingSkipped: true })], now)).toBeNull();
    expect(pendingRating([rec(at(7, 23, 50))], now)).toBeNull();
    expect(pendingRating([rec(at(8, 0, 10))], at(8, 3))).toBeNull();
  });
});
