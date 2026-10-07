import { elapsedMs, remainingMs, type TimerState } from './timer';

/** Provisional; S2 (Figma) finalizes the palette in src/ui/tokens.css. */
export const PHASE_COLORS = {
  focus: '#E3A13B',
  break: '#7FB38E',
  paused: '#8A8A84',
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
