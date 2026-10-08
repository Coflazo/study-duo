import { describe, expect, it } from 'vitest';
import type { Todo } from '@/core/todos';
import { feedTodoId, mergeDeadlines } from './deadlines';
import type { FeedEvent } from './ics-feed';

const NOW = Date.UTC(2026, 9, 8, 8);
const DAY = 86_400_000;
const ev = (uid: string, dueInDays: number, title = `Task ${uid}`, course: string | null = 'FPTS'): FeedEvent => ({ uid, title, course, due: NOW + dueInDays * DAY });
const mine: Todo = { id: 'mine', text: 'Read chapter 4', course: null, done: false, doneAt: null, ifThen: null };

describe('mergeDeadlines', () => {
  it('adds deadlines from yesterday to 8 weeks ahead, soonest first, after your own to-dos', () => {
    const { todos, count } = mergeDeadlines([mine], [ev('far', 60), ev('b', 5), ev('old', -3), ev('a', 2), ev('late', -0.5)], [], NOW);
    expect(todos.map((t) => t.text)).toEqual(['Read chapter 4', 'Task late', 'Task a', 'Task b']);
    expect(todos[2]).toEqual({ id: feedTodoId('a'), text: 'Task a', course: 'FPTS', done: false, doneAt: null, ifThen: null, due: NOW + 2 * DAY, feedUid: 'a' });
    expect(count).toBe(3);
  });

  it('is idempotent', () => {
    const once = mergeDeadlines([mine], [ev('a', 2), ev('b', 5)], [], NOW).todos;
    expect(mergeDeadlines(once, [ev('a', 2), ev('b', 5)], [], NOW).todos).toEqual(once);
  });

  it('moves due dates, keeps your edits, keeps done ones done and deleted ones deleted', () => {
    let todos = mergeDeadlines([], [ev('a', 2), ev('b', 5), ev('c', 6)], [], NOW).todos;
    todos = todos.map((t) => (t.feedUid === 'a' ? { ...t, text: 'Homework 3, start with Q2' } : t.feedUid === 'b' ? { ...t, done: true, doneAt: NOW } : t));
    todos = todos.filter((t) => t.feedUid !== 'c');
    const next = mergeDeadlines(todos, [ev('a', 4), ev('b', 5), ev('c', 6)], ['c'], NOW).todos;
    expect(next.map((t) => [t.feedUid, t.text, t.done, t.due])).toEqual([
      ['a', 'Homework 3, start with Q2', false, NOW + 4 * DAY],
      ['b', 'Task b', true, NOW + 5 * DAY],
    ]);
  });

  it('removes open feed to-dos whose deadline left the feed, but never your own or done ones', () => {
    const todos = mergeDeadlines([mine], [ev('a', 2), ev('b', 3)], [], NOW).todos.map((t) => (t.feedUid === 'b' ? { ...t, done: true, doneAt: NOW } : t));
    expect(mergeDeadlines(todos, [], [], NOW).todos.map((t) => t.text)).toEqual(['Read chapter 4', 'Task b']);
  });

  it('keeps an overdue feed to-do that is still in the feed', () => {
    const todos = mergeDeadlines([], [ev('a', 0.5)], [], NOW).todos;
    expect(mergeDeadlines(todos, [ev('a', 0.5)], [], NOW + 10 * DAY).todos).toHaveLength(1);
  });

  it('adds at most 200 at once', () => {
    const many = Array.from({ length: 300 }, (_, i) => ev(`e${i}`, 1 + i / 10));
    expect(mergeDeadlines([], many, [], NOW).todos).toHaveLength(200);
  });
});
