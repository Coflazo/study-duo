import type { TimerSettings } from './settings';
import { elapsedMs, nextPhase, phaseLengthMs, remainingMs, type TimerState } from './timer';

export type Tone = 'elapsed' | 'study' | 'break' | 'pausedStudy' | 'pausedBreak';
/** A slice of the dial, as fractions of a full turn clockwise from 12 o'clock. */
export interface Arc {
  from: number;
  to: number;
  tone: Tone;
}
export interface Dial {
  arcs: Arc[];
  paused: boolean;
}

/**
 * The toolbar icon while a timer runs: one cycle (study block plus the break after it) on a clock dial,
 * the same picture as the app icon, with the time already spent as a dark track from 12 o'clock.
 * Null while stopped, when the plain app icon shows.
 */
export function dial(state: TimerState, settings: TimerSettings, now: number): Dial | null {
  if (state.status === 'stopped') return null;
  const paused = state.status === 'paused';
  const study: Tone = paused ? 'pausedStudy' : 'study';
  const rest: Tone = paused ? 'pausedBreak' : 'break';
  const left = remainingMs(state, now);
  if (state.plannedMs === null || left === null) return { arcs: [{ from: 0, to: 1, tone: study }], paused };

  const spent = state.plannedMs - left;
  if (state.phase === 'focus') {
    const brk = phaseLengthMs(nextPhase(state, settings, true), settings, state) ?? 0;
    const total = state.plannedMs + brk;
    return {
      arcs: [
        { from: 0, to: spent / total, tone: 'elapsed' },
        { from: spent / total, to: state.plannedMs / total, tone: study },
        { from: state.plannedMs / total, to: 1, tone: rest },
      ],
      paused,
    };
  }
  // A break: the study block before it is spent. Flowtime blocks have no fixed length, so its dial is the break alone.
  const before = settings.mode === 'pomodoro' ? settings.focusMin * 60_000 : 0;
  const total = before + state.plannedMs;
  return {
    arcs: [
      { from: 0, to: (before + spent) / total, tone: 'elapsed' },
      { from: (before + spent) / total, to: 1, tone: rest },
    ],
    paused,
  };
}

/** The toolbar button's tooltip and accessible name. */
export function actionTitle(state: TimerState, settings: TimerSettings, now: number): string {
  if (state.status === 'stopped') return 'Study Duo';
  const phase = state.status === 'paused' ? 'paused' : state.phase === 'focus' ? 'study block' : state.phase === 'shortBreak' ? 'short break' : 'long break';
  if (state.plannedMs === null) return `Study Duo: ${phase}, ${Math.floor(elapsedMs(state, now) / 60_000)} min in`;
  const left = remainingMs(state, now) ?? 0;
  return `Study Duo: ${phase}, ${left < 60_000 ? 'less than a minute' : `${Math.ceil(left / 60_000)} min`} left`;
}
