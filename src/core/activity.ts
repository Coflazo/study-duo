import type { ActivityCategory, ActivityRecord } from './db';
import { categoryFor, type Sites } from './sites';
import type { Phase } from './timer';

interface Open {
  startedAt: number;
  category: ActivityCategory;
  domain: string | null;
  phase: Phase;
  keys?: number;
  clicks?: number;
  scrolls?: number;
  inputMinutes?: number;
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
  /** The record that closed last, kept briefly: a page's final counts can arrive just after it closed. */
  last?: ActivityRecord | null;
}

export const IDLE_TRACKER: TrackerState = { phase: null, host: null, away: false, open: null };
/** How long after a record closes its page's last counts still belong to it. */
const LATE_COUNTS_MS = 10_000;

export type TrackerEvent =
  | { type: 'timer'; phase: Phase | null }
  | { type: 'focus'; host: string | null }
  | { type: 'away' }
  | { type: 'back' }
  /** The site lists changed: the open record may now belong to another category. */
  | { type: 'sites' }
  /** Opt-in input counts from one page (host from the sender's address): at most a minute's worth. */
  | { type: 'input'; host: string | null; keys: number; clicks: number; scrolls: number };

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
  if (event.type === 'input') {
    const add = <T extends Open | ActivityRecord>(r: T): T => ({
      ...r,
      keys: (r.keys ?? 0) + event.keys,
      clicks: (r.clicks ?? 0) + event.clicks,
      scrolls: (r.scrolls ?? 0) + event.scrolls,
      inputMinutes: (r.inputMinutes ?? 0) + (event.keys + event.clicks + event.scrolls > 0 ? 1 : 0),
    });
    const counts = (r: { phase: Phase; category: ActivityCategory; domain: string | null }) => r.phase === 'focus' && r.category !== 'unobserved' && r.domain === event.host;
    if (state.open && counts(state.open)) return { state: { ...state, open: add(state.open) }, closed: [] };
    const last = state.last;
    if (last && counts(last) && at - last.endedAt <= LATE_COUNTS_MS) {
      const updated = add(last);
      return { state: { ...state, last: updated }, closed: [updated] }; // saved again over the stored record
    }
    return { state, closed: [] }; // study blocks only, and only for the page they came from
  }
  const next: TrackerState = { ...state };
  if (event.type === 'timer') next.phase = event.phase;
  else if (event.type === 'focus') next.host = event.host;
  else if (event.type === 'away') next.away = true;
  else if (event.type === 'back') next.away = false;

  const open = state.open;
  // Away can be dated back to when the user left (idle is noticed late); never before the open record began.
  if (open && at < open.startedAt) at = open.startedAt;
  const want = current(next, sites);
  if (open && want && open.category === want.category && open.domain === want.domain && open.phase === want.phase) {
    return { state: { ...next, open }, closed: [] };
  }
  const closed: ActivityRecord[] =
    open && at > open.startedAt
      ? [{ id: `${open.startedAt}-${open.phase}-${open.domain ?? open.category}`, ...open, endedAt: at }]
      : [];
  return { state: { ...next, open: want ? { ...want, startedAt: at } : null, last: closed[0] ?? state.last ?? null }, closed };
}
