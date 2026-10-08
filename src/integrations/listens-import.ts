import type { ListenRecord } from '@/core/db';
import { LASTFM_ORIGIN, LISTENBRAINZ_ORIGIN } from '@/core/net';
import type { SessionRecord } from '@/core/sessions';

/** Listening history from ListenBrainz or Last.fm: what phone and desktop apps played, matched to study blocks. */

const MAX_TEXT = 200;
const MAX_LISTENS = 1000;
/** Neither service always says how long a song lasted; 3.5 minutes is a typical song. */
const TYPICAL_MS = 210_000;
/** The browser may have caught the same play on a music site; within this gap it is the same play. */
const SAME_PLAY_MS = 3 * 60_000;

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_TEXT) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};
const sec = (ms: number) => Math.floor(ms / 1000);

export const listenBrainzUrl = (user: string, sinceMs: number) => `${LISTENBRAINZ_ORIGIN}/1/user/${encodeURIComponent(user)}/listens?min_ts=${sec(sinceMs)}&count=${MAX_LISTENS}`;

export const lastfmUrl = (user: string, key: string, sinceMs: number, page: number) =>
  `${LASTFM_ORIGIN}/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&from=${sec(sinceMs)}&limit=200&page=${page}&format=json`;

function listen(prefix: string, host: string, at: number, title: string, artist: string, album: string, durationMs: number | null): ListenRecord | null {
  if (!Number.isFinite(at) || at <= 0 || !title) return null;
  const length = durationMs && durationMs > 0 && durationMs < 3_600_000 ? durationMs : TYPICAL_MS;
  return { id: `${prefix}-${sec(at)}-${hash(`${title}|${artist}`)}`, host, title, artist, album, startedAt: at, endedAt: at + length, sessionId: null };
}

/** ListenBrainz says which service played a song in several places; any of them naming Spotify counts. */
function fromSpotify(info: Record<string, unknown>): boolean {
  if (typeof info.spotify_id === 'string' && info.spotify_id) return true;
  return ['music_service', 'music_service_name', 'media_player', 'submission_client', 'origin_url'].some((k) => typeof info[k] === 'string' && /spotify/i.test(info[k] as string));
}

/** ListenBrainz `GET /1/user/{user}/listens` to listens. Plays from Spotify are filed under Spotify. Malformed entries are skipped. */
export function fromListenBrainz(json: unknown): ListenRecord[] {
  const raw = obj(obj(json).payload).listens;
  if (!Array.isArray(raw)) return [];
  const out: ListenRecord[] = [];
  for (const r of raw.slice(0, MAX_LISTENS)) {
    const o = obj(r);
    const meta = obj(o.track_metadata);
    const info = obj(meta.additional_info);
    const at = typeof o.listened_at === 'number' ? o.listened_at * 1000 : NaN;
    const l = listen('lb', fromSpotify(info) ? 'app:spotify' : 'listenbrainz', at, text(meta.track_name), text(meta.artist_name), text(meta.release_name), typeof info.duration_ms === 'number' ? info.duration_ms : null);
    if (l) out.push(l);
  }
  return out;
}

/** Last.fm `user.getRecentTracks` (JSON) to listens; the track playing right now has no date yet and waits. */
export function fromLastfm(json: unknown): ListenRecord[] {
  const t = obj(obj(json).recenttracks).track;
  const raw = Array.isArray(t) ? t : t ? [t] : [];
  const out: ListenRecord[] = [];
  for (const r of raw.slice(0, MAX_LISTENS)) {
    const o = obj(r);
    if (obj(o['@attr']).nowplaying === 'true') continue;
    const at = Number(obj(o.date).uts) * 1000;
    const l = listen('fm', 'last.fm', at, text(o.name), text(obj(o.artist)['#text']), text(obj(o.album)['#text']), null);
    if (l) out.push(l);
  }
  return out;
}

/** How many pages Last.fm says there are, at most 5 (1,000 songs). */
export function lastfmPages(json: unknown): number {
  const n = Number(obj(obj(obj(json).recenttracks)['@attr']).totalPages);
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.floor(n)) : 1;
}

/** Keeps the plays that started inside a study block or break and ties each to it, as the browser's own listens are. */
export function attachToSessions(listens: ListenRecord[], sessions: SessionRecord[]): ListenRecord[] {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const out: ListenRecord[] = [];
  for (const l of listens) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]!.startedAt <= l.startedAt) lo = mid + 1;
      else hi = mid;
    }
    const s = sorted[lo - 1];
    if (s && l.startedAt < s.endedAt) out.push({ ...l, sessionId: s.id });
  }
  return out;
}

const key = (l: ListenRecord) => `${l.title.trim().toLowerCase()}|${l.artist.trim().toLowerCase()}`;

/** The imported plays that are new: not stored before, and not a play the browser already caught on a music site. */
export function mergeImported(existing: ListenRecord[], imported: ListenRecord[]): ListenRecord[] {
  const ids = new Set(existing.map((l) => l.id));
  const byKey = new Map<string, number[]>();
  for (const l of existing) {
    const k = key(l);
    byKey.set(k, [...(byKey.get(k) ?? []), l.startedAt]);
  }
  return imported.filter((l) => !ids.has(l.id) && !(byKey.get(key(l)) ?? []).some((t) => Math.abs(t - l.startedAt) <= SAME_PLAY_MS));
}
