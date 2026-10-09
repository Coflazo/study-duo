import { storage } from 'wxt/utils/storage';
import { IDLE_TRACKER, type TrackerState } from './activity';
import type { OpenListen } from './music';
import type { NoiseKind } from './noise';
import { INITIAL_PLAYER, type PlayerState, type PlayerTrack } from './player';

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
/** The one player: which source, playing or not, the noise colour and the volume (session only; #51). */
export const playerItem = storage.defineItem<PlayerState>('session:player', { fallback: INITIAL_PLAYER });
/** The folder queue's songs by id, written only when a new list starts, so a volume change never rewrites them. */
export const playerTracksItem = storage.defineItem<Record<string, PlayerTrack>>('session:playerTracks', { fallback: {} });

/** The side panel section the popup opened it on (Streaming, to paste a link); read and cleared when it opens. */
export const panelSectionItem = storage.defineItem<'now' | 'library' | 'streaming' | null>('session:panelSection', { fallback: null });

/** Which open side panel plays links: with panels open in two windows, only the newest plays, so nothing doubles. */
export const panelOwnerItem = storage.defineItem<string | null>('session:panelOwner', { fallback: null });
