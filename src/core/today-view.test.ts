import { describe, expect, it } from 'vitest';
import type { SessionRecord } from './sessions';
import { DEFAULT_SETTINGS as S } from './settings';
import { initialState, reduce } from './timer';
import { boardLabel, plateNote, timetable } from './today-view';
import type { Todo } from './todos';

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m).getTime();
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const todo = (id: string, text: string): Todo => ({ id, text, course: null, done: false, doneAt: null, ifThen: null });
const rec = (startedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: String(startedAt), phase: 'focus', startedAt, endedAt: startedAt + 25 * MIN, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0,
  completed: true, taskId: null, rating: null, ratingSkipped: false, ...extra,
});

describe('plate and board text', () => {
  const running = reduce(initialState(), { type: 'start' }, S, at(9, 30)).state;
  it('says where the cycle is', () => {
    expect(plateNote(initialState(), S)).toBe('Up next');
    expect(plateNote(running, S)).toBe('Block 1 of 4');
    expect(plateNote(reduce(running, { type: 'pause' }, S, at(9, 40)).state, S)).toBe('Paused');
    expect(plateNote({ ...running, phase: 'shortBreak', plannedMs: 5 * MIN }, S)).toBe('5 min');
  });
  it('labels the board with the end time, the length, or Paused', () => {
    expect(boardLabel(running, S)).toBe(`Ends ${clock(at(9, 55))}`);
    expect(boardLabel(initialState(), S)).toBe('25 min study');
    expect(boardLabel(reduce(running, { type: 'pause' }, S, at(9, 40)).state, S)).toBe('Paused');
  });
});

describe('timetable', () => {
  const todos = [todo('t1', 'Statistics problem set 4')];
  it('lists finished blocks with their task, then the current one, then what comes next', () => {
    const running = reduce(initialState(), { type: 'start', taskId: 't1' }, S, at(10)).state;
    const rows = timetable({ timer: running, settings: S, sessions: [rec(at(9), { taskId: 't1' }), rec(at(9, 25), { phase: 'shortBreak', completed: false, activeMs: 2 * MIN })], todos, now: at(10, 5), chosen: null });
    expect(rows.map((r) => [r.state, r.task, r.duration])).toEqual([
      ['done', 'Statistics problem set 4', '25 min'],
      ['skipped', 'Short break', '2 min'],
      ['current', 'Statistics problem set 4', ''],
      ['planned', 'Short break', '5 min'],
    ]);
    expect(rows[2]!.time).toBe(clock(at(10)));
    expect(rows[3]!.time).toBe(clock(at(10, 25)));
  });
  it('keeps only the latest finished blocks when asked, and shows the chosen task up next while stopped', () => {
    const many = [rec(at(8)), rec(at(9)), rec(at(10))];
    const rows = timetable({ timer: initialState(), settings: S, sessions: many, todos, now: at(11), chosen: 't1', keepDone: 2 });
    expect(rows.map((r) => r.state)).toEqual(['done', 'done', 'planned']);
    expect(rows.at(-1)!.task).toBe('Statistics problem set 4');
  });
});
