import type { StreamSource } from './player';
import { readYouTube, ytCommand, YT_ORIGIN, type YouTubeNews } from './youtube-embed';

/**
 * How Study Duo talks to each service's embedded player in the side panel, through the postMessage formats the
 * services' own embed APIs use, so none of their scripts runs in Study Duo's pages. Apple Music and Tidal publish no
 * such channel: they play with their own buttons in the panel.
 */
export const EMBED_ORIGIN: Record<StreamSource, string> = {
  youtube: YT_ORIGIN,
  spotify: 'https://open.spotify.com',
  soundcloud: 'https://w.soundcloud.com',
  apple: 'https://embed.music.apple.com',
  tidal: 'https://embed.tidal.com',
};

export interface Caps {
  play: boolean;
  seek: boolean;
  skip: boolean;
  volume: boolean;
  /** Says what plays, so the card can show the title. */
  title: boolean;
}
const ALL: Caps = { play: true, seek: true, skip: true, volume: true, title: true };
const NONE: Caps = { play: false, seek: false, skip: false, volume: false, title: false };
export const CAPS: Record<StreamSource, Caps> = { youtube: ALL, soundcloud: ALL, spotify: { play: true, seek: true, skip: false, volume: false, title: false }, apple: NONE, tidal: NONE };

export type EmbedOp = { op: 'play' } | { op: 'pause' } | { op: 'next' } | { op: 'prev' } | { op: 'seek'; ms: number } | { op: 'volume'; volume: number };
export interface EmbedNews extends YouTubeNews {
  /** Spotify: the player is up and wants its acknowledgement. */
  ready?: boolean;
  /** SoundCloud: a new sound started in a set; ask what it is. */
  newSound?: boolean;
  /** Spotify plays 30-second previews until you sign in. */
  preview?: boolean;
}

const sc = (method: string, value?: unknown) => JSON.stringify(value === undefined ? { method } : { method, value });

/** What to send once the player has loaded, so it starts telling Study Duo what it plays. */
export function embedHello(source: StreamSource): unknown[] {
  if (source === 'youtube') return [JSON.stringify({ event: 'listening', id: 1, channel: 'widget' })];
  if (source === 'soundcloud') return [...['playProgress', 'play', 'pause', 'finish'].map((e) => sc('addEventListener', e)), sc('getCurrentSound')];
  return []; // Spotify says "ready" first and is answered then; Apple Music and Tidal say nothing
}

/** The messages for one command, given whether it plays a list and where it is now (ms). */
export function embedCommand(source: StreamSource, cmd: EmbedOp, at: { list: boolean; here: number }): unknown[] {
  const here = at.here / 1000;
  if (source === 'youtube') {
    if (cmd.op === 'play') return [ytCommand('playVideo')];
    if (cmd.op === 'pause') return [ytCommand('pauseVideo')];
    if (cmd.op === 'seek') return [ytCommand('seekTo', [cmd.ms / 1000, true])];
    if (cmd.op === 'volume') return [ytCommand('setVolume', [Math.round(cmd.volume * 100)])];
    if (cmd.op === 'next') return [at.list ? ytCommand('nextVideo') : ytCommand('seekTo', [here + 30, true])];
    return [at.list && here < 3 ? ytCommand('previousVideo') : ytCommand('seekTo', [at.list ? 0 : Math.max(0, here - 30), true])];
  }
  if (source === 'soundcloud') {
    if (cmd.op === 'seek') return [sc('seekTo', cmd.ms)];
    if (cmd.op === 'volume') return [sc('setVolume', Math.round(cmd.volume * 100))];
    return [sc(cmd.op)];
  }
  if (source === 'spotify') {
    if (cmd.op === 'play') return [{ command: at.here > 0 ? 'resume' : 'play' }];
    if (cmd.op === 'pause') return [{ command: 'pause' }];
    if (cmd.op === 'seek') return [{ command: 'seek', timestamp: Math.round(cmd.ms / 1000) }];
    return [];
  }
  return [];
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const str = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 300) : undefined);

/** What a message from the player says, or null for anything that is not that service's player talking. */
export function readEmbed(source: StreamSource, origin: string, data: unknown): EmbedNews | null {
  if (origin !== EMBED_ORIGIN[source]) return null;
  if (source === 'youtube') return readYouTube(origin, data);
  if (source === 'soundcloud') {
    if (typeof data !== 'string' || data.length > 100_000) return null;
    let m: { method?: unknown; value?: unknown };
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
    const v = (m.value && typeof m.value === 'object' ? m.value : {}) as Record<string, unknown>;
    if (m.method === 'ready') return { ready: true };
    if (m.method === 'playProgress') return fin(v.currentPosition) ? { position: Math.round(v.currentPosition), state: 'playing' } : null;
    if (m.method === 'play') return { state: 'playing', newSound: true };
    if (m.method === 'pause') return { state: 'paused' };
    if (m.method === 'finish') return { state: 'ended' };
    if (m.method === 'getCurrentSound') {
      const user = (v.user && typeof v.user === 'object' ? v.user : {}) as Record<string, unknown>;
      const out: EmbedNews = {};
      const title = str(v.title);
      const artist = str(user.username);
      if (title) out.title = title;
      if (artist) out.artist = artist;
      if (fin(v.duration) && v.duration > 0) out.duration = Math.round(v.duration);
      return out;
    }
    return null;
  }
  if (source === 'spotify') {
    if (!data || typeof data !== 'object') return null;
    const m = data as { type?: unknown; payload?: unknown };
    if (m.type === 'ready') return { ready: true };
    if (m.type === 'error') return { problem: 'gone' };
    if (m.type !== 'playback_update' || !m.payload || typeof m.payload !== 'object') return null;
    const p = m.payload as Record<string, unknown>;
    const out: EmbedNews = { state: p.isBuffering === true && p.isPaused !== true ? 'buffering' : p.isPaused === true ? 'paused' : 'playing' };
    if (p.isBuffering === false || p.isPaused === true) out.state = p.isPaused === true ? 'paused' : 'playing';
    if (fin(p.duration) && p.duration > 0) out.duration = Math.round(p.duration);
    if (fin(p.position)) out.position = Math.round(p.position);
    // A preview is 30 s long; a song that short is rare enough to read it this way.
    if (out.duration !== undefined && out.duration >= 29_000 && out.duration <= 31_000) out.preview = true;
    return out;
  }
  return null;
}
