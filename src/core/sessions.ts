import { withDb } from './db';
import type { Phase, Segment, TimerState } from './timer';

/** One study block or break, as the timer emitted it. Times and a task id only; never pages or titles. */
export interface SessionRecord {
  id: string;
  phase: Phase;
  startedAt: number;
  endedAt: number;
  plannedMs: number | null;
  activeMs: number;
  pausedMs: number;
  completed: boolean;
  taskId: string | null;
  /** The focus rating, the label the insights learn from. */
  rating: 1 | 2 | 3 | 4 | 5 | null;
  ratingSkipped: boolean;
  /** Quiet focus signals, worked out when a study block ends (see signals.ts). */
  signals?: Record<string, number>;
}

/** Stable id: the same segment written twice stays one record. */
export const sessionId = (s: Pick<Segment, 'phase' | 'startedAt'>) => `${s.startedAt}-${s.phase}`;

export async function addSessions(segments: Segment[]): Promise<void> {
  if (segments.length === 0) return;
  await withDb(async (db) => {
    const tx = db.transaction('sessions', 'readwrite');
    for (const s of segments) {
      const id = sessionId(s);
      const old = await tx.store.get(id);
      await tx.store.put({ ...s, id, rating: old?.rating ?? null, ratingSkipped: old?.ratingSkipped ?? false, signals: old?.signals });
    }
    await tx.done;
  });
}

/** Sessions that ended in [from, to), oldest first. */
export function sessionsBetween(from: number, to: number): Promise<SessionRecord[]> {
  return withDb((db) => db.getAllFromIndex('sessions', 'endedAt', IDBKeyRange.bound(from, to, false, true)));
}

export function rateSession(id: string, rating: 1 | 2 | 3 | 4 | 5 | 'skip'): Promise<void> {
  return withDb(async (db) => {
    const tx = db.transaction('sessions', 'readwrite');
    const rec = await tx.store.get(id);
    if (rec) await tx.store.put(rating === 'skip' ? { ...rec, ratingSkipped: true } : { ...rec, rating, ratingSkipped: false });
    await tx.done;
  });
}

/** The local calendar day around `now`, as [start, next start). A block belongs to the day it ended. */
export function localDayRange(now: number): [number, number] {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return [start, end];
}

const RATE_WITHIN_MS = 2 * 60 * 60_000;

/**
 * The study block to ask "How focused were you?" about: the latest one finished today, in the last two hours, not yet
 * answered, and not already followed by a new study block (the question must never cover a running timer).
 */
export function pendingRating(
  sessions: SessionRecord[],
  now: number,
  timer?: Pick<TimerState, 'phase' | 'status' | 'startedAt'>,
): SessionRecord | null {
  const [dayStart] = localDayRange(now);
  const done = sessions.filter((s) => s.phase === 'focus' && s.completed && s.endedAt >= dayStart && now - s.endedAt <= RATE_WITHIN_MS);
  const latest = done.sort((a, b) => b.endedAt - a.endedAt)[0];
  if (!latest || latest.rating !== null || latest.ratingSkipped) return null;
  const newerBlock = timer && timer.phase === 'focus' && timer.status !== 'stopped' && timer.startedAt !== null && timer.startedAt > latest.endedAt;
  return newerBlock ? null : latest;
}
