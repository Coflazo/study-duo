import { storage } from 'wxt/utils/storage';
import { IDLE_TRACKER, type TrackerState } from './activity';
import type { OpenListen } from './music';
import type { NoiseKind } from './noise';

/*
 * Session storage items, kept apart from store.ts: WXT reads every item the moment it is defined, and content
 * scripts may not touch storage.session, so defining these in a module the corner clock imports threw an error on
 * every web page. Only the background and extension pages import this file.
 */

/** Songs playing now, by tab (session only; the background folds them into listens). */
export const listeningItem = storage.defineItem<Record<string, OpenListen>>('session:listening', { fallback: {} });
/** The focus sound playing now, if any (session only). */
export const soundItem = storage.defineItem<{ noise: NoiseKind; volume: number; startedAt: number; sessionId: string | null } | null>('session:focusSound', { fallback: null });
/** Bumped after the background writes sessions, so open pages reload Today exactly then (no polling). */
export const logVersionItem = storage.defineItem<number>('session:logVersion', { fallback: 0 });
/** The activity tracker's state between events (session only; the worker sleeps, the browser session does not). */
export const trackerItem = storage.defineItem<TrackerState>('session:activityTracker', { fallback: IDLE_TRACKER });
