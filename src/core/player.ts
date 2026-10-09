import type { SoundCommand } from './messages';
import { NOISES, type NoiseKind } from './noise';
import { current, handoff, newQueue, nextIn, prevIn, setRepeat, toggleShuffle, type Queue, type Repeat } from './queue';

/** Every source the player can hand over between. Only one plays at a time. */
export const PLAYER_SOURCES = ['folder', 'noise', 'youtube', 'spotify', 'apple', 'soundcloud', 'tidal', 'tab'] as const;
export type PlayerSource = (typeof PLAYER_SOURCES)[number];

/** A song from the music folder, as the player needs it: what to show, and where to find the file. */
export interface PlayerTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  color: string | null;
  cover: boolean;
}

/**
 * The one player, owned by the background. The position is a timestamp, not a stream: `position` ms at time `at`,
 * which pages run forward while it plays, so nothing is written every second. `position` belongs to the folder: it
 * keeps its place while noise or another source plays, and picks up there.
 */
export interface PlayerState {
  active: PlayerSource | null;
  playing: boolean;
  noise: NoiseKind;
  volume: number;
  position: number;
  at: number;
  /** When the current source started playing, for its listen. */
  startedAt: number | null;
  /** The study block or break the current listen belongs to (set by the background). */
  sessionId: string | null;
  /** The folder's queue, and the songs in it by id. */
  queue: Queue | null;
  tracks: Record<string, PlayerTrack>;
  /** Length of the playing song in ms, once the file says. */
  duration: number | null;
  /** Why the folder could not play: Chrome needs the folder again, or the file is gone. */
  problem: 'reconnect' | 'missing' | null;
  /** For pages: the folder's song and the next title. The full list is stored apart (see background/player.ts). */
  now: PlayerTrack | null;
  upNext: string | null;
}

export const INITIAL_PLAYER: PlayerState = {
  active: null,
  playing: false,
  noise: 'pink',
  volume: 0.6,
  position: 0,
  at: 0,
  startedAt: null,
  sessionId: null,
  queue: null,
  tracks: {},
  duration: null,
  problem: null,
  now: null,
  upNext: null,
};

export type PlayerCommand =
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'toggle' }
  | { op: 'source'; source: PlayerSource }
  | { op: 'noise'; noise: NoiseKind }
  | { op: 'volume'; volume: number }
  | { op: 'folder'; tracks: PlayerTrack[]; start: number; shuffle: boolean }
  | { op: 'next' }
  | { op: 'prev' }
  | { op: 'jump'; at: number }
  | { op: 'seek'; ms: number }
  | { op: 'shuffle' }
  | { op: 'repeat'; repeat: Repeat }
  // From the page that plays the file:
  | { op: 'ended'; path?: string }
  | { op: 'loaded'; duration: number; path?: string }
  | { op: 'problem'; problem: 'reconnect' | 'missing'; path?: string };

/** What the background has to carry out after a command. Streaming and tabs arrive in later steps (#51). */
export type PlayerEffect =
  | { type: 'noise-start'; noise: NoiseKind; volume: number }
  | { type: 'noise-stop' }
  | { type: 'noise-volume'; volume: number }
  | { type: 'file-play'; track: PlayerTrack; at: number; volume: number }
  | { type: 'file-pause' }
  | { type: 'file-seek'; at: number; path: string }
  | { type: 'file-volume'; volume: number }
  | { type: 'source-start'; source: PlayerSource }
  | { type: 'source-stop'; source: PlayerSource };

const MAX_QUEUE = 5_000;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

function parseTrack(raw: unknown): PlayerTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 200);
  const path = text(r.path, 1_000);
  const title = text(r.title, 200);
  if (!id || !path || title === null) return null;
  const color = typeof r.color === 'string' && /^#[0-9a-f]{6}$/.test(r.color) ? r.color : null;
  return { id, path, title, artist: text(r.artist, 200) ?? '', album: text(r.album, 200) ?? '', genre: text(r.genre, 100) ?? '', color, cover: r.cover === true };
}

const pathOf = (r: Record<string, unknown>) => (typeof r.path === 'string' && r.path.length <= 1_000 ? { path: r.path } : {});

/** Player commands, from the extension's own pages only (the background checks the sender). */
export function parsePlayer(raw: unknown): PlayerCommand | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'player') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (r.op) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'next':
    case 'prev':
    case 'shuffle':
      return { op: r.op };
    case 'ended':
      return { op: 'ended', ...pathOf(r) };
    case 'source':
      return (PLAYER_SOURCES as readonly unknown[]).includes(r.source) ? { op: 'source', source: r.source as PlayerSource } : null;
    case 'noise':
      return (NOISES as readonly unknown[]).includes(r.noise) ? { op: 'noise', noise: r.noise as NoiseKind } : null;
    case 'volume': {
      const v = num(r.volume);
      return v === null ? null : { op: 'volume', volume: Math.min(1, Math.max(0, v)) };
    }
    case 'jump': {
      const at = num(r.at);
      return at === null ? null : { op: 'jump', at: Math.max(0, Math.floor(at)) };
    }
    case 'seek': {
      const ms = num(r.ms);
      return ms === null ? null : { op: 'seek', ms: Math.max(0, ms) };
    }
    case 'loaded': {
      const d = num(r.duration);
      return d === null || d <= 0 ? null : { op: 'loaded', duration: d, ...pathOf(r) };
    }
    case 'repeat':
      return r.repeat === 'off' || r.repeat === 'all' || r.repeat === 'one' ? { op: 'repeat', repeat: r.repeat } : null;
    case 'problem':
      return r.problem === 'reconnect' || r.problem === 'missing' ? { op: 'problem', problem: r.problem, ...pathOf(r) } : null;
    case 'folder': {
      if (!Array.isArray(r.tracks) || r.tracks.length === 0 || r.tracks.length > MAX_QUEUE) return null;
      const tracks = r.tracks.map(parseTrack);
      if (tracks.some((t) => t === null)) return null;
      const s = num(r.start) ?? 0;
      return { op: 'folder', tracks: tracks as PlayerTrack[], start: Math.min(Math.max(0, Math.floor(s)), tracks.length - 1), shuffle: r.shuffle === true };
    }
    default:
      return null;
  }
}

/** Where the folder's song is now: its stored position, run forward while it plays. */
export function positionAt(s: PlayerState, now: number): number {
  const p = s.playing && s.active === 'folder' ? s.position + Math.max(0, now - s.at) : s.position;
  return s.duration ? Math.min(p, s.duration) : p;
}

const nowTrack = (s: PlayerState): PlayerTrack | null => {
  const id = s.queue ? current(s.queue) : null;
  return id ? (s.tracks[id] ?? null) : null;
};

/** What starts the active source; null when there is nothing to play (a folder with no songs queued). */
function start(s: PlayerState): PlayerEffect | null {
  if (s.active === 'noise' || s.active === null) return { type: 'noise-start', noise: s.noise, volume: s.volume };
  if (s.active === 'folder') {
    const track = nowTrack(s);
    return track ? { type: 'file-play', track, at: s.position, volume: s.volume } : null;
  }
  return { type: 'source-start', source: s.active };
}
const stop = (source: PlayerSource): PlayerEffect => (source === 'noise' ? { type: 'noise-stop' } : source === 'folder' ? { type: 'file-pause' } : { type: 'source-stop', source });

/** Moves the folder to another song: from its start, playing it if the folder was playing. */
function toSong(s: PlayerState, queue: Queue, now: number): { state: PlayerState; effects: PlayerEffect[] } {
  const state: PlayerState = { ...s, queue, position: 0, at: now, duration: null, ...(s.playing ? { startedAt: now } : {}) };
  const track = nowTrack(state);
  return { state, effects: s.playing && s.active === 'folder' && track ? [{ type: 'file-play', track, at: 0, volume: s.volume }] : [] };
}

/** A report from the page playing the file counts only for the folder's current song: a late one is ignored. */
const aboutThisSong = (s: PlayerState, path: string | undefined) => s.active === 'folder' && (path === undefined || nowTrack(s)?.path === path);

/** The end of the queue: stopped, back at the start of the last song. */
const atEnd = (s: PlayerState, now: number) => ({ state: { ...s, playing: false, position: 0, at: now, startedAt: null }, effects: s.playing ? [{ type: 'file-pause' } as PlayerEffect] : [] });

export function applyPlayer(s: PlayerState, cmd: PlayerCommand, now: number): { state: PlayerState; effects: PlayerEffect[] } {
  switch (cmd.op) {
    case 'play': {
      if (s.playing) return { state: s, effects: [] };
      const state: PlayerState = { ...s, active: s.active ?? 'noise', playing: true, startedAt: now, at: now, problem: null };
      const go = start(state);
      return go ? { state, effects: [go] } : { state: s, effects: [] };
    }
    case 'pause':
      if (!s.playing || !s.active) return { state: s, effects: [] };
      return { state: { ...s, playing: false, startedAt: null, position: positionAt(s, now), at: now }, effects: [stop(s.active)] };
    case 'toggle':
      return applyPlayer(s, { op: s.playing ? 'pause' : 'play' }, now);
    case 'source': {
      const h = handoff({ active: s.active, playing: s.playing }, cmd.source);
      const leaving: PlayerState = s.playing && s.active === 'folder' ? { ...s, position: positionAt(s, now) } : s;
      const state: PlayerState = { ...leaving, active: h.active, at: now, ...(h.start ? { startedAt: now } : {}) };
      if (!h.start) return { state, effects: [] };
      const go = start(state);
      // A folder with nothing queued: the old source stops and the card shows the folder, waiting.
      return go ? { state, effects: [stop(h.fadeOut!), go] } : { state: { ...state, playing: false, startedAt: null }, effects: [stop(h.fadeOut!)] };
    }
    case 'noise': {
      const coloured = { ...s, noise: cmd.noise };
      // Picking a colour while something else plays means "play this noise": hand over to it.
      if (s.playing && s.active !== 'noise') return applyPlayer(coloured, { op: 'source', source: 'noise' }, now);
      const go = start(coloured);
      return { state: coloured, effects: s.playing && go ? [go] : [] };
    }
    case 'volume': {
      const state = { ...s, volume: cmd.volume };
      if (!s.playing) return { state, effects: [] };
      if (s.active === 'noise') return { state, effects: [{ type: 'noise-volume', volume: cmd.volume }] };
      if (s.active === 'folder') return { state, effects: [{ type: 'file-volume', volume: cmd.volume }] };
      return { state, effects: [] };
    }
    case 'folder': {
      const tracks = Object.fromEntries(cmd.tracks.map((t) => [t.id, t]));
      let queue = newQueue(cmd.tracks.map((t) => t.id), cmd.start);
      if (cmd.shuffle) queue = toggleShuffle(queue);
      // Whatever else played stops; a folder already playing just moves to the new list.
      const before = s.playing && s.active && s.active !== 'folder' ? [stop(s.active)] : [];
      const state: PlayerState = { ...s, active: 'folder', playing: true, queue: { ...queue, repeat: s.queue?.repeat ?? 'off' }, tracks, position: 0, at: now, startedAt: now, duration: null, problem: null };
      return { state, effects: [...before, start(state)!] };
    }
    case 'next': {
      if (s.active !== 'folder' || !s.queue) return { state: s, effects: [] };
      // Next always moves on, even with repeat one (which only repeats a song that ends by itself).
      const next = nextIn({ ...s.queue, repeat: s.queue.repeat === 'one' ? 'all' : s.queue.repeat });
      if (!next) return atEnd(s, now);
      return toSong(s, { ...next, repeat: s.queue.repeat }, now);
    }
    case 'ended': {
      if (!aboutThisSong(s, cmd.path) || !s.queue) return { state: s, effects: [] };
      const next = nextIn(s.queue);
      if (!next) return atEnd(s, now);
      if (s.queue.repeat === 'one') return { state: { ...s, position: 0, at: now, startedAt: now }, effects: [{ type: 'file-play', track: nowTrack(s)!, at: 0, volume: s.volume }] };
      return toSong(s, next, now);
    }
    case 'jump': {
      if (s.active !== 'folder' || !s.queue || cmd.at >= s.queue.order.length) return { state: s, effects: [] };
      return toSong({ ...s, playing: true, startedAt: s.playing ? s.startedAt : now }, { ...s.queue, at: cmd.at }, now);
    }
    case 'prev': {
      if (s.active !== 'folder' || !s.queue) return { state: s, effects: [] };
      const back = prevIn(s.queue, positionAt(s, now));
      if (back.restart) return applyPlayer(s, { op: 'seek', ms: 0 }, now);
      return toSong(s, back.queue, now);
    }
    case 'seek': {
      if (s.active !== 'folder' || !nowTrack(s)) return { state: s, effects: [] };
      const ms = s.duration ? Math.min(cmd.ms, s.duration) : cmd.ms;
      return { state: { ...s, position: ms, at: now }, effects: s.playing ? [{ type: 'file-seek', at: ms, path: nowTrack(s)!.path }] : [] };
    }
    case 'shuffle':
      return s.queue ? { state: { ...s, queue: toggleShuffle(s.queue) }, effects: [] } : { state: s, effects: [] };
    case 'repeat':
      return s.queue ? { state: { ...s, queue: setRepeat(s.queue, cmd.repeat) }, effects: [] } : { state: s, effects: [] };
    case 'loaded':
      return aboutThisSong(s, cmd.path) ? { state: { ...s, duration: cmd.duration }, effects: [] } : { state: s, effects: [] };
    case 'problem':
      return aboutThisSong(s, cmd.path) ? { state: { ...s, playing: false, startedAt: null, problem: cmd.problem, position: positionAt(s, now), at: now }, effects: [] } : { state: s, effects: [] };
  }
}

/** The song the folder is on, if any. */
export const playingTrack = nowTrack;

/** The title of the song after this one in play order, if any. */
export function nextTitle(s: PlayerState): string | null {
  const q = s.queue;
  if (!q || q.at + 1 >= q.order.length) return null;
  return s.tracks[q.items[q.order[q.at + 1]!]!]?.title ?? null;
}

/** The Music page's focus sound buttons, as player commands, so there is one player and one state. */
export function soundToPlayer(cmd: SoundCommand): PlayerCommand[] {
  if (cmd.op === 'play') return [{ op: 'volume', volume: cmd.volume }, { op: 'noise', noise: cmd.noise }, { op: 'play' }];
  if (cmd.op === 'stop') return [{ op: 'pause' }];
  return [{ op: 'volume', volume: cmd.volume }];
}
