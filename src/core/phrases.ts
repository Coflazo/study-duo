import phrases from '@/locales/en/phrases.json';
import type { TimerSettings } from './settings';
import { phaseLengthMs, type Phase, type TimerState } from './timer';

export type Moment =
  | 'focusStart'
  | 'focusFirstMorning'
  | 'focusFirstAfternoon'
  | 'focusFirstEvening'
  | 'focusAfterLong'
  | 'shortBreak'
  | 'longBreak'
  | 'lateNight';

/** Indices not yet shown, per moment. Persisted so lines do not repeat across browser restarts. */
export type Bag = Partial<Record<Moment, number[]>>;

const BANK = phrases as Record<Moment, string[]>;

export function momentFor(next: Phase, ctx: { hour: number; firstOfDay: boolean; afterLong: boolean }): Moment {
  if (next === 'shortBreak') return 'shortBreak';
  if (next === 'longBreak') return 'longBreak';
  if (ctx.hour >= 23 || ctx.hour < 5) return 'lateNight';
  if (ctx.firstOfDay) return ctx.hour < 12 ? 'focusFirstMorning' : ctx.hour < 17 ? 'focusFirstAfternoon' : 'focusFirstEvening';
  return ctx.afterLong ? 'focusAfterLong' : 'focusStart';
}

export function drawLine(moment: Moment, bag: Bag, random: () => number = Math.random): { line: string; bag: Bag } {
  const lines = BANK[moment];
  const left = bag[moment]?.length ? [...bag[moment]!] : lines.map((_, i) => i);
  const [index] = left.splice(Math.floor(random() * left.length), 1);
  return { line: lines[index!]!, bag: { ...bag, [moment]: left } };
}

/** `state` is the timer after the phase change; a phase that waits for the start button must not sound started. */
export function subLine(next: Phase, settings: TimerSettings, state: TimerState): string {
  const label = next === 'focus' ? 'Study time' : next === 'shortBreak' ? 'Short break' : 'Long break';
  if (state.status !== 'running') return `${label}. Press start when you are ready.`;
  const ms = phaseLengthMs(next, settings, state);
  if (ms === null) return 'Study time. Stop when you are ready.';
  const minutes = Math.round(ms / 60_000);
  return `${label}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}
