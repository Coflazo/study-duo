import { elapsedMs, remainingMs, type TimerState } from './timer';

/** Badge backgrounds behind white digits: red-500, green-500 and neutral-600 from src/ui/tokens.css (5:1, 5:1 and 7.9:1). */
export const PHASE_COLORS = {
  focus: '#D52B1E',
  break: '#2E7D4F',
  paused: '#4E524E',
} as const;

export function badgeText(state: TimerState, now: number): string {
  if (state.status === 'stopped') return '';
  if (state.plannedMs === null) return `+${Math.floor(elapsedMs(state, now) / 60_000)}`;
  const left = remainingMs(state, now) ?? 0;
  return left < 60_000 ? '<1' : String(Math.ceil(left / 60_000));
}

export function badgeColor(state: TimerState): string {
  if (state.status === 'paused') return PHASE_COLORS.paused;
  return state.phase === 'focus' ? PHASE_COLORS.focus : PHASE_COLORS.break;
}
