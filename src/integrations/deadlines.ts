import type { Todo } from '@/core/todos';
import type { FeedEvent } from './ics-feed';

const DAY = 86_400_000;
/** Deadlines from a day ago up to eight weeks ahead become to-dos; older and later ones wait. */
const WINDOW_BEFORE = DAY;
const WINDOW_AFTER = 56 * DAY;
const MAX_NEW = 200;

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};

/** A stable to-do id for a feed event, so two checks of the same feed give the same list. */
export const feedTodoId = (uid: string) => `feed-${hash(uid)}-${uid.length}`;

/**
 * Brings a feed's deadlines into the to-do list. New ones are added after the user's own to-dos, soonest first;
 * known ones get their new due date (the user's edits to the text stay); deleted ones (dismissed) never come back;
 * done ones stay done; open ones whose event left the feed are removed. Returns the list and the open feed to-dos.
 */
export function mergeDeadlines(todos: Todo[], events: FeedEvent[], dismissed: string[], now: number): { todos: Todo[]; count: number } {
  const byUid = new Map(events.map((e) => [e.uid, e]));
  const gone = new Set(dismissed);
  const known = new Set<string>();
  const kept: Todo[] = [];
  for (const t of todos) {
    if (!t.feedUid) {
      kept.push(t);
      continue;
    }
    known.add(t.feedUid);
    const e = byUid.get(t.feedUid);
    if (!e) {
      if (t.done) kept.push(t);
      continue;
    }
    kept.push(t.due === e.due ? t : { ...t, due: e.due });
  }
  const fresh = events
    .filter((e) => !known.has(e.uid) && !gone.has(e.uid) && e.due >= now - WINDOW_BEFORE && e.due <= now + WINDOW_AFTER)
    .sort((a, b) => a.due - b.due)
    .slice(0, MAX_NEW)
    .map((e): Todo => ({ id: feedTodoId(e.uid), text: e.title, course: e.course, done: false, doneAt: null, ifThen: null, due: e.due, feedUid: e.uid }));
  const next = [...kept, ...fresh];
  return { todos: next, count: next.filter((t) => t.feedUid && !t.done).length };
}
