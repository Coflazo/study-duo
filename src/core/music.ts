import type { ListenRecord } from './db';
import { MUSIC_SITES } from './sites';

/** Where Study Duo looks for now-playing: the music players, plus YouTube itself. */
export const MUSIC_HOSTS = [...MUSIC_SITES, 'youtube.com'];
const MAX_TEXT = 200;
/** Shorter listens are skips through a playlist, not listening. */
const MIN_LISTEN_MS = 5_000;

export function isMusicHost(host: string | null): boolean {
  return host !== null && MUSIC_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
}

/** A page's now-playing report. Page text is untrusted: plain strings only, trimmed and cut to 200 characters. */
export function parseNowPlaying(raw: unknown): NowPlaying | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'music' || r.op !== 'now') return null;
  if (typeof r.title !== 'string' || typeof r.artist !== 'string' || typeof r.album !== 'string' || typeof r.playing !== 'boolean') return null;
  // eslint-disable-next-line no-control-regex
  const cut = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_TEXT);
  const title = cut(r.title);
  return title ? { title, artist: cut(r.artist), album: cut(r.album), playing: r.playing } : null;
}

export interface OpenListen {
  host: string;
  title: string;
  artist: string;
  album: string;
  startedAt: number;
  /** The study block or break it played in, if the timer ran. */
  sessionId: string | null;
}

/** One tab's listening: the same song playing on changes nothing; a pause, another song or a closed tab (null) ends it. */
export function foldListen(open: OpenListen | null, now: NowPlaying | null, at: number, host: string, sessionId: string | null): { open: OpenListen | null; closed: ListenRecord | null } {
  const same = open && now && open.host === host && open.title === now.title && open.artist === now.artist && open.album === now.album;
  if (same && now.playing) return { open, closed: null };
  const closed = open && at - open.startedAt >= MIN_LISTEN_MS ? { id: `${open.startedAt}-${open.host}`, ...open, endedAt: at } : null;
  const next = now?.playing ? { host, title: now.title, artist: now.artist, album: now.album, startedAt: at, sessionId } : null;
  return { open: next, closed };
}

/** A page saying nothing plays there any more. */
export function isMusicStop(raw: unknown): boolean {
  return raw !== null && typeof raw === 'object' && (raw as Record<string, unknown>).kind === 'music' && (raw as Record<string, unknown>).op === 'none';
}

