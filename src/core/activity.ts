import type { ActivityCategory, ActivityRecord } from './db';
import { categoryFor, type Sites } from './sites';
import type { Phase } from './timer';

interface Open {
  startedAt: number;
  category: ActivityCategory;
  domain: string | null;
  phase: Phase;
}

/** What the activity tracker knows between events. Small, so the background can keep it in storage.session. */
export interface TrackerState {
  /** The running phase; null while the timer is stopped or paused, when nothing is recorded. */
  phase: Phase | null;
  /** Site of the front tab in the focused window; null for pages without a web address. */
  host: string | null;
  /** The browser lost focus, or the computer is idle or locked. */
  away: boolean;
  open: Open | null;
}

export const IDLE_TRACKER: TrackerState = { phase: null, host: null, away: false, open: null };

export type TrackerEvent =
  | { type: 'timer'; phase: Phase | null }
  | { type: 'focus'; host: string | null }
  | { type: 'away' }
  | { type: 'back' }
  /** The site lists changed: the open record may now belong to another category. */
  | { type: 'sites' };

function current(s: TrackerState, sites: Sites): Omit<Open, 'startedAt'> | null {
  if (s.phase === null) return null;
  if (s.away) return { category: 'unobserved', domain: null, phase: s.phase };
  if (s.host === null) return { category: 'neutral', domain: null, phase: s.phase };
  return { category: categoryFor(s.host, sites) ?? 'unfiled', domain: s.host, phase: s.phase };
}

/**
 * One step of the activity log: time on each kind of site while the timer runs, split whenever the site, its
 * category, the phase or presence changes. Returns the records that closed at `at`.
 */
export function track(state: TrackerState, event: TrackerEvent, at: number, sites: Sites): { state: TrackerState; closed: ActivityRecord[] } {
  const next: TrackerState = { ...state };
  if (event.type === 'timer') next.phase = event.phase;
  else if (event.type === 'focus') next.host = event.host;
  else if (event.type === 'away') next.away = true;
  else if (event.type === 'back') next.away = false;

  const want = current(next, sites);
  const open = state.open;
  if (open && want && open.category === want.category && open.domain === want.domain && open.phase === want.phase) {
    return { state: { ...next, open }, closed: [] };
  }
  const closed: ActivityRecord[] =
    open && at > open.startedAt
      ? [{ id: `${open.startedAt}-${open.phase}-${open.domain ?? open.category}`, startedAt: open.startedAt, endedAt: at, category: open.category, domain: open.domain, phase: open.phase }]
      : [];
  return { state: { ...next, open: want ? { ...want, startedAt: at } : null }, closed };
}
