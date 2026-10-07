import type { TimerSettings } from './settings';

export type Phase = 'focus' | 'shortBreak' | 'longBreak';
export type Status = 'stopped' | 'running' | 'paused';

export interface TimerState {
  v: 1;
  phase: Phase;
  status: Status;
  /** When the current phase started. */
  startedAt: number | null;
  /** Countdown end while running. Null when stopped, paused or counting up. */
  endsAt: number | null;
  /** Countdown length including extensions. Null for a Flowtime focus (counts up). */
  plannedMs: number | null;
  /** Countdown time left while paused. */
  remainingMs: number | null;
  pausedAt: number | null;
  /** Paused time already closed off in this phase. */
  pausedMs: number;
  /** Completed focus blocks since the last long break. */
  cycle: number;
  /** Flowtime: break earned by the last focus block. */
  nextBreakMs: number | null;
  taskId: string | null;
}

export interface Segment {
  phase: Phase;
  startedAt: number;
  endedAt: number;
  plannedMs: number | null;
  activeMs: number;
  pausedMs: number;
  /** Ran to its planned end (or a Flowtime focus the user finished), not skipped or reset. */
  completed: boolean;
  taskId: string | null;
}

export type TimerEvent =
  | { type: 'start'; taskId?: string | null }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toggle' }
  | { type: 'skip' }
  | { type: 'reset' }
  | { type: 'extend'; ms: number }
  | { type: 'tick' }
  | { type: 'finish' };

export interface ReduceResult {
  state: TimerState;
  segments: Segment[];
}

/** A phase end noticed later than this (laptop asleep) does not auto-start the next phase. */
export const LATE_GRACE_MS = 120_000;
const MIN_FLOW_BREAK_MS = 60_000;

export function initialState(): TimerState {
  return {
    v: 1,
    phase: 'focus',
    status: 'stopped',
    startedAt: null,
    endsAt: null,
    plannedMs: null,
    remainingMs: null,
    pausedAt: null,
    pausedMs: 0,
    cycle: 0,
    nextBreakMs: null,
    taskId: null,
  };
}

export function isBreak(phase: Phase): boolean {
  return phase !== 'focus';
}

export function phaseLengthMs(phase: Phase, settings: TimerSettings, state: TimerState): number | null {
  if (phase === 'focus') return settings.mode === 'flowtime' ? null : settings.focusMin * 60_000;
  const fixed = (phase === 'shortBreak' ? settings.shortBreakMin : settings.longBreakMin) * 60_000;
  if (settings.mode === 'flowtime' && state.nextBreakMs !== null) {
    // A long break is a promise of real rest, so the earned length never shortens it.
    return phase === 'longBreak' ? Math.max(state.nextBreakMs, fixed) : state.nextBreakMs;
  }
  return fixed;
}

export function remainingMs(state: TimerState, now: number): number | null {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.status === 'paused' && state.remainingMs !== null) return state.remainingMs;
  return null;
}

/** Active (unpaused) time spent in the current phase. */
export function elapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === null || state.status === 'stopped') return 0;
  const until = state.status === 'paused' && state.pausedAt !== null ? state.pausedAt : now;
  return Math.max(0, until - state.startedAt - state.pausedMs);
}

export function displayMs(state: TimerState, settings: TimerSettings, now: number): { ms: number; countsUp: boolean } {
  if (state.status === 'stopped') {
    const len = phaseLengthMs(state.phase, settings, state);
    return len === null ? { ms: 0, countsUp: true } : { ms: len, countsUp: false };
  }
  if (state.plannedMs === null) return { ms: elapsedMs(state, now), countsUp: true };
  return { ms: remainingMs(state, now) ?? 0, countsUp: false };
}

export function nextPhase(state: TimerState, settings: TimerSettings, completedFocus: boolean): Phase {
  if (state.phase !== 'focus') return 'focus';
  if (completedFocus && state.cycle + 1 >= settings.longBreakEvery) return 'longBreak';
  return 'shortBreak';
}

function begin(state: TimerState, phase: Phase, at: number, settings: TimerSettings): TimerState {
  const planned = phaseLengthMs(phase, settings, state);
  return {
    ...state,
    phase,
    status: 'running',
    startedAt: at,
    plannedMs: planned,
    endsAt: planned === null ? null : at + planned,
    remainingMs: null,
    pausedAt: null,
    pausedMs: 0,
  };
}

function stoppedAt(state: TimerState, phase: Phase): TimerState {
  return { ...state, phase, status: 'stopped', startedAt: null, endsAt: null, plannedMs: null, remainingMs: null, pausedAt: null, pausedMs: 0 };
}

function segmentOf(state: TimerState, endedAt: number, completed: boolean): Segment {
  const openPause = state.status === 'paused' && state.pausedAt !== null ? endedAt - state.pausedAt : 0;
  const paused = state.pausedMs + Math.max(0, openPause);
  const startedAt = state.startedAt ?? endedAt;
  return {
    phase: state.phase,
    startedAt,
    endedAt,
    plannedMs: state.plannedMs,
    activeMs: Math.max(0, endedAt - startedAt - paused),
    pausedMs: paused,
    completed,
    taskId: state.taskId,
  };
}

/** Close the current phase and move to the next one, auto-starting it when allowed. */
function endPhase(state: TimerState, endedAt: number, completed: boolean, settings: TimerSettings, now: number): ReduceResult {
  const segment = segmentOf(state, endedAt, completed);
  const completedFocus = state.phase === 'focus' && completed;
  const next = nextPhase(state, settings, completedFocus);

  let carried: TimerState = { ...state };
  if (completedFocus) carried.cycle = state.cycle + 1;
  if (state.phase === 'longBreak') carried.cycle = 0;
  if (state.phase === 'focus' && settings.mode === 'flowtime') {
    carried.nextBreakMs = Math.max(MIN_FLOW_BREAK_MS, Math.round(segment.activeMs / settings.flowBreakRatio));
  }
  if (state.phase !== 'focus') carried.nextBreakMs = null;

  const auto = isBreak(next) ? settings.autoStartBreaks : settings.autoStartFocus;
  const onTime = now - endedAt <= LATE_GRACE_MS;
  carried = auto && onTime ? begin(carried, next, endedAt, settings) : stoppedAt(carried, next);
  return { state: carried, segments: [segment] };
}

export function reduce(state: TimerState, event: TimerEvent, settings: TimerSettings, now: number): ReduceResult {
  // A command that arrives after the running block already ended (laptop woke, alarm not yet delivered)
  // targets a phase that is over: close it at its real end time and drop the stale command.
  if (event.type !== 'tick' && state.status === 'running' && state.endsAt !== null && now >= state.endsAt) {
    return reduce(state, { type: 'tick' }, settings, now);
  }
  const same: ReduceResult = { state, segments: [] };
  const countUp = state.plannedMs === null;

  switch (event.type) {
    case 'start':
      if (state.status !== 'stopped') return same;
      return { state: begin({ ...state, taskId: event.taskId ?? state.taskId }, state.phase, now, settings), segments: [] };

    case 'pause':
      if (state.status !== 'running') return same;
      return {
        state: { ...state, status: 'paused', pausedAt: now, endsAt: null, remainingMs: countUp ? null : Math.max(0, (state.endsAt ?? now) - now) },
        segments: [],
      };

    case 'resume': {
      if (state.status !== 'paused' || state.pausedAt === null) return same;
      const pausedMs = state.pausedMs + Math.max(0, now - state.pausedAt);
      return {
        state: { ...state, status: 'running', pausedAt: null, pausedMs, endsAt: countUp ? null : now + (state.remainingMs ?? 0), remainingMs: null },
        segments: [],
      };
    }

    case 'toggle':
      if (state.status === 'stopped') return reduce(state, { type: 'start' }, settings, now);
      return reduce(state, { type: state.status === 'running' ? 'pause' : 'resume' }, settings, now);

    case 'extend':
      if (state.status === 'stopped' || state.plannedMs === null) return same;
      return {
        state: {
          ...state,
          plannedMs: state.plannedMs + event.ms,
          endsAt: state.status === 'running' && state.endsAt !== null ? state.endsAt + event.ms : state.endsAt,
          remainingMs: state.status === 'paused' && state.remainingMs !== null ? state.remainingMs + event.ms : state.remainingMs,
        },
        segments: [],
      };

    case 'tick': {
      let current = state;
      const segments: Segment[] = [];
      for (let i = 0; i < 10 && current.status === 'running' && current.endsAt !== null && now >= current.endsAt; i++) {
        const r = endPhase(current, current.endsAt, true, settings, now);
        current = r.state;
        segments.push(...r.segments);
      }
      return segments.length === 0 ? same : { state: current, segments };
    }

    case 'finish':
      if (state.status === 'stopped' || state.phase !== 'focus' || !countUp) return same;
      return endPhase(state, now, true, settings, now);

    case 'skip': {
      if (state.status === 'stopped') {
        const next = nextPhase(state, settings, false);
        const cycle = state.phase === 'longBreak' ? 0 : state.cycle;
        return { state: { ...stoppedAt(state, next), cycle, nextBreakMs: null }, segments: [] };
      }
      const flowFocus = state.phase === 'focus' && countUp;
      return endPhase(state, now, flowFocus, settings, now);
    }

    case 'reset': {
      const segments = state.status === 'stopped' ? [] : [segmentOf(state, now, false)];
      return { state: { ...initialState(), taskId: state.taskId }, segments };
    }
  }
}
