import type { SessionRecord } from './sessions';
import type { TimerSettings } from './settings';
import { isBreak, nextPhase, phaseLengthMs, type Phase, type TimerState } from './timer';
import type { Todo } from './todos';

/** Words shared by the popup and the dashboard's Today. */
export const PHASE_NAME: Record<Phase, string> = { focus: 'Study block', shortBreak: 'Short break', longBreak: 'Long break' };

export const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const minutesText = (ms: number | null) => (ms === null ? '' : ms < 60_000 ? '<1 min' : `${Math.round(ms / 60_000)} min`);

export function plateNote(timer: TimerState, settings: TimerSettings): string {
  if (timer.status === 'stopped') return 'Up next';
  if (timer.status === 'paused') return 'Paused';
  if (isBreak(timer.phase)) return minutesText(timer.plannedMs);
  if (timer.plannedMs === null) return 'Counting up';
  return `Block ${timer.cycle + 1} of ${settings.longBreakEvery}`;
}

export function boardLabel(timer: TimerState, settings: TimerSettings): string {
  if (timer.status === 'paused') return 'Paused';
  if (timer.status === 'stopped') {
    return `${minutesText(phaseLengthMs(timer.phase, settings, timer)) || 'Open-ended'} ${isBreak(timer.phase) ? 'break' : 'study'}`;
  }
  return timer.endsAt !== null ? `Ends ${clockTime(timer.endsAt)}` : 'Counting up';
}

export interface Row {
  key: string;
  state: 'done' | 'skipped' | 'current' | 'planned';
  time: string;
  task: string;
  duration: string;
  isBreak: boolean;
}

/** Today as a departures board: finished blocks (optionally only the latest few), the current one, and what comes next. */
export function timetable(input: {
  timer: TimerState; settings: TimerSettings; sessions: SessionRecord[]; todos: Todo[]; now: number; chosen: string | null; keepDone?: number;
}): Row[] {
  const { timer, settings, todos, now } = input;
  const text = (phase: Phase, taskId: string | null) => (phase === 'focus' && taskId && todos.find((t) => t.id === taskId)?.text) || PHASE_NAME[phase];
  const sessions = input.keepDone === undefined ? input.sessions : input.sessions.slice(-input.keepDone);
  const done: Row[] = sessions.map((s) => ({
    key: s.id, state: s.completed ? 'done' : 'skipped', time: clockTime(s.startedAt), task: text(s.phase, s.taskId),
    duration: minutesText(s.activeMs), isBreak: isBreak(s.phase),
  }));
  if (timer.status === 'stopped') {
    return [...done, { key: 'next', state: 'planned', time: clockTime(now), task: text(timer.phase, input.chosen), duration: minutesText(phaseLengthMs(timer.phase, settings, timer)), isBreak: isBreak(timer.phase) }];
  }
  const after = nextPhase(timer, settings, true);
  return [
    ...done,
    { key: 'now', state: 'current', time: clockTime(timer.startedAt ?? now), task: text(timer.phase, timer.taskId), duration: '', isBreak: isBreak(timer.phase) },
    { key: 'next', state: 'planned', time: timer.endsAt ? clockTime(timer.endsAt) : '--:--', task: PHASE_NAME[after], duration: minutesText(phaseLengthMs(after, settings, timer)), isBreak: isBreak(after) },
  ];
}

/** The task offered under "Work on": the last block's task while it is still open, else the first open to-do. */
export function defaultTask(open: Todo[], timer: Pick<TimerState, 'taskId'>): string {
  return timer.taskId && open.some((t) => t.id === timer.taskId) ? timer.taskId : (open[0]?.id ?? '');
}
