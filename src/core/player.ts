import type { SoundCommand } from './messages';
import { NOISES, type NoiseKind } from './noise';
import { current, handoff, newQueue, nextIn, prevIn, setRepeat, toggleShuffle, type Queue, type Repeat } from './queue';

/** Every source the player can hand over between. Only one plays at a time. */
export const PLAYER_SOURCES = ['folder', 'noise', 'youtube', 'spotify', 'apple', 'soundcloud', 'tidal', 'tab'] as const;
export type PlayerSource = (typeof PLAYER_SOURCES)[number];
/** Sources that play in the side panel, in the service's own player. */
export const STREAM_SOURCES = ['youtube', 'spotify', 'apple', 'soundcloud', 'tidal'] as const;
export type StreamSource = (typeof STREAM_SOURCES)[number];
export const isStream = (s: unknown): s is StreamSource => (STREAM_SOURCES as readonly unknown[]).includes(s);
/** Services whose embedded player publishes no way to control it or hear from it. */
const QUIET: ReadonlySet<StreamSource> = new Set(['apple', 'tidal']);

/** A music site in a tab, as its page reported it. Only music sites report, and only the song, never the page. */
export interface TabMusic {
  tabId: number;
  host: string;
  title: string;
  artist: string;
  playing: boolean;
}
const MAX_TABS = 8;

/** A link playing in the side panel, and what its player last said. Its place runs forward like the folder's. */
export interface StreamState {
  source: StreamSource;
  url: string;
  title: string | null;
  artist: string | null;
  position: number;
  at: number;
  duration: number | null;
  /** The service will not play it here (embedding is off, or it is gone), or plays only previews until you sign in. */
  problem: 'embed' | 'gone' | 'preview' | null;
}

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
  /** The link in the side panel, and whether the panel is open to play it. */
  stream: StreamState | null;
  panel: boolean;
  /** Music sites playing or paused in tabs, newest first, and the one the card controls. */
  tabs: TabMusic[];
  tab: number | null;
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
  stream: null,
  panel: false,
  tabs: [],
  tab: null,
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
  | { op: 'stream'; source: StreamSource; url: string; at?: number }
  // From the side panel:
  | { op: 'stream-report'; url: string; title: string | null; artist: string | null; position: number; duration: number | null; playing: boolean; problem: 'embed' | 'gone' | 'preview' | null }
  | { op: 'panel'; open: boolean }
  // A tab listed in the panel, from the extension's pages:
  | { op: 'tab'; tabId: number; action: 'pick' | 'play' | 'pause' | 'next' | 'prev' }
  // From the background only, built from a music page's own report (never parsed from a message):
  | ({ op: 'tab-report' } & TabMusic)
  | { op: 'tab-gone'; tabId: number }
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
  | { type: 'panel-load'; source: StreamSource; url: string; at: number; play: boolean; volume: number }
  | { type: 'panel'; op: 'play' | 'pause' | 'next' | 'prev' }
  | { type: 'panel-seek'; at: number }
  | { type: 'panel-volume'; volume: number }
  | { type: 'tab'; op: 'play' | 'pause' | 'next' | 'prev'; tabId: number };

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
    case 'stream': {
      const url = text(r.url, 2_000);
      if (!isStream(r.source) || !url || !/^https:\/\/[^\s]+$/.test(url)) return null;
      const at = num(r.at);
      return at !== null && at > 0 ? { op: 'stream', source: r.source, url, at } : { op: 'stream', source: r.source, url };
    }
    case 'stream-report': {
      const url = text(r.url, 2_000);
      const position = num(r.position);
      if (!url || position === null || typeof r.playing !== 'boolean') return null;
      const d = num(r.duration);
      const problem = r.problem === 'embed' || r.problem === 'gone' || r.problem === 'preview' ? r.problem : null;
      return { op: 'stream-report', url, title: text(r.title, 300), artist: text(r.artist, 300), position: Math.max(0, position), duration: d && d > 0 ? d : null, playing: r.playing, problem };
    }
    case 'panel':
      return typeof r.open === 'boolean' ? { op: 'panel', open: r.open } : null;
    case 'tab': {
      const tabId = num(r.tabId);
      const action = r.action;
      return tabId !== null && Number.isInteger(tabId) && (action === 'pick' || action === 'play' || action === 'pause' || action === 'next' || action === 'prev') ? { op: 'tab', tabId, action } : null;
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

/** Where the side panel's link is now, run forward while it plays. */
export function streamAt(s: PlayerState, now: number): number {
  const st = s.stream;
  if (!st) return 0;
  const p = s.playing && s.active === st.source ? st.position + Math.max(0, now - st.at) : st.position;
  return st.duration ? Math.min(p, st.duration) : p;
}

/** The playing source's place written down, before it stops or hands over. */
function freeze(s: PlayerState, now: number): PlayerState {
  if (!s.playing) return s;
  if (s.active === 'folder') return { ...s, position: positionAt(s, now), at: now };
  if (s.stream && s.active === s.stream.source) return { ...s, stream: { ...s.stream, position: streamAt(s, now), at: now } };
  return s;
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
  if (isStream(s.active)) {
    if (s.stream?.source !== s.active) return null;
    // A closed panel cannot play: the state says playing, and the panel starts it when it opens.
    return s.panel ? { type: 'panel', op: 'play' } : null;
  }
  if (s.active === 'tab') return s.tab !== null && s.tabs.some((t) => t.tabId === s.tab) ? { type: 'tab', op: 'play', tabId: s.tab } : null;
  return null;
}
/** What stops a source when another takes over or it pauses. */
function stop(source: PlayerSource, s: PlayerState): PlayerEffect[] {
  if (source === 'noise') return [{ type: 'noise-stop' }];
  if (source === 'folder') return [{ type: 'file-pause' }];
  if (isStream(source)) return [{ type: 'panel', op: 'pause' }];
  return s.tab !== null ? [{ type: 'tab', op: 'pause', tabId: s.tab }] : [];
}
const streamOn = (s: PlayerState) => isStream(s.active) && s.stream?.source === s.active;

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
      const state: PlayerState = { ...s, active: s.active ?? 'noise', playing: true, startedAt: now, at: now, problem: null, ...(s.stream ? { stream: { ...s.stream, at: now } } : {}) };
      const go = start(state);
      if (go) return { state, effects: [go] };
      return streamOn(s) ? { state, effects: [] } : { state: s, effects: [] };
    }
    case 'pause':
      if (!s.playing || !s.active) return { state: s, effects: [] };
      return { state: { ...freeze(s, now), playing: false, startedAt: null, at: now }, effects: stop(s.active, s) };
    case 'toggle':
      return applyPlayer(s, { op: s.playing ? 'pause' : 'play' }, now);
    case 'source': {
      const h = handoff({ active: s.active, playing: s.playing }, cmd.source);
      const leaving = freeze(s, now);
      // The link coming back runs on from where it stopped, counted from now.
      const back = leaving.stream && h.active === leaving.stream.source ? { stream: { ...leaving.stream, at: now } } : {};
      const state: PlayerState = { ...leaving, ...back, active: h.active, at: now, ...(h.start ? { startedAt: now } : {}) };
      if (!h.start) return { state, effects: [] };
      const go = start(state);
      if (go) return { state, effects: [...stop(h.fadeOut!, s), go] };
      // A link whose panel is closed plays when the panel opens.
      if (streamOn(state)) return { state, effects: stop(h.fadeOut!, s) };
      // A folder with nothing queued: the old source stops and the card shows the folder, waiting.
      return { state: { ...state, playing: false, startedAt: null }, effects: stop(h.fadeOut!, s) };
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
      // The panel's player keeps its own volume even while paused, so it is told either way.
      if (streamOn(s) && s.panel) return { state, effects: [{ type: 'panel-volume', volume: cmd.volume }] };
      if (!s.playing) return { state, effects: [] };
      if (s.active === 'noise') return { state, effects: [{ type: 'noise-volume', volume: cmd.volume }] };
      if (s.active === 'folder') return { state, effects: [{ type: 'file-volume', volume: cmd.volume }] };
      if (streamOn(s)) return { state, effects: [{ type: 'panel-volume', volume: cmd.volume }] };
      return { state, effects: [] };
    }
    case 'folder': {
      const tracks = Object.fromEntries(cmd.tracks.map((t) => [t.id, t]));
      let queue = newQueue(cmd.tracks.map((t) => t.id), cmd.start);
      if (cmd.shuffle) queue = toggleShuffle(queue);
      // Whatever else played stops; a folder already playing just moves to the new list.
      const before = s.playing && s.active && s.active !== 'folder' ? stop(s.active, s) : [];
      const state: PlayerState = { ...s, active: 'folder', playing: true, queue: { ...queue, repeat: s.queue?.repeat ?? 'off' }, tracks, position: 0, at: now, startedAt: now, duration: null, problem: null };
      return { state, effects: [...before, start(state)!] };
    }
    case 'stream': {
      const before = s.playing && s.active && s.active !== cmd.source ? stop(s.active, s) : [];
      const from = cmd.at ?? 0;
      // Apple Music and Tidal start with their own Play button and never say whether they play: not counted as playing.
      const plays = !QUIET.has(cmd.source);
      const stream: StreamState = { source: cmd.source, url: cmd.url, title: null, artist: null, position: from, at: now, duration: null, problem: null };
      const state: PlayerState = { ...freeze(s, now), active: cmd.source, playing: plays, startedAt: plays ? now : null, at: now, stream };
      return { state, effects: [...before, { type: 'panel-load', source: cmd.source, url: cmd.url, at: from, play: plays, volume: s.volume }] };
    }
    case 'stream-report': {
      const st = s.stream;
      if (!st || st.url !== cmd.url) return { state: s, effects: [] };
      const stream: StreamState = { ...st, title: cmd.title ?? st.title, artist: cmd.artist ?? st.artist, position: cmd.position, at: now, duration: cmd.duration ?? st.duration, problem: cmd.problem };
      if (s.active === st.source) {
        const playing = cmd.playing;
        return { state: { ...s, stream, playing, startedAt: playing ? (s.playing ? s.startedAt : now) : null }, effects: [] };
      }
      // Play pressed inside the service's own player: it takes over from whatever played.
      if (cmd.playing) return { state: { ...s, stream, active: st.source, playing: true, startedAt: now, at: now }, effects: s.playing && s.active ? stop(s.active, s) : [] };
      return { state: { ...s, stream }, effects: [] };
    }
    case 'panel': {
      if (cmd.open) return { state: { ...s, panel: true }, effects: streamOn(s) && s.playing && !s.panel ? [{ type: 'panel', op: 'play' }] : [] };
      const state: PlayerState = { ...s, panel: false };
      return streamOn(s) && s.playing ? { state: { ...freeze(state, now), playing: false, startedAt: null }, effects: [] } : { state, effects: [] };
    }
    case 'tab-report': {
      const t: TabMusic = { tabId: cmd.tabId, host: cmd.host, title: cmd.title, artist: cmd.artist, playing: cmd.playing };
      // Newest first, at most 8, and never without the tab the card controls.
      const rest = s.tabs.filter((x) => x.tabId !== t.tabId);
      const kept = rest.slice(0, MAX_TABS - 1);
      const mine = rest.find((x) => x.tabId === s.tab);
      const tabs = [t, ...(mine && !kept.includes(mine) ? [...kept.slice(0, MAX_TABS - 2), mine] : kept)];
      if (s.active === 'tab' && s.tab === t.tabId) return { state: { ...s, tabs, playing: t.playing, startedAt: t.playing ? (s.playing ? s.startedAt : now) : null }, effects: [] };
      // Music started in a tab takes over: only one source plays.
      if (t.playing) return { state: { ...freeze(s, now), tabs, active: 'tab', tab: t.tabId, playing: true, startedAt: now, at: now }, effects: s.playing && s.active ? stop(s.active, s) : [] };
      return { state: { ...s, tabs }, effects: [] };
    }
    case 'tab-gone': {
      if (!s.tabs.some((t) => t.tabId === cmd.tabId) && s.tab !== cmd.tabId) return { state: s, effects: [] };
      const tabs = s.tabs.filter((t) => t.tabId !== cmd.tabId);
      if (s.tab !== cmd.tabId) return { state: { ...s, tabs }, effects: [] };
      // The card's own tab closed: the card goes back to its default, so Play plays noise rather than nothing.
      return { state: { ...s, tabs, tab: null, ...(s.active === 'tab' ? { active: null, playing: false, startedAt: null } : {}) }, effects: [] };
    }
    case 'tab': {
      if (!s.tabs.some((t) => t.tabId === cmd.tabId)) return { state: s, effects: [] };
      const mine = s.active === 'tab' && s.tab === cmd.tabId;
      // Picked in the source list: it takes over if something plays, otherwise the card just shows it.
      if (cmd.action === 'pick' && !s.playing) return { state: { ...s, active: 'tab', tab: cmd.tabId }, effects: [] };
      if (cmd.action === 'play' || cmd.action === 'pick') {
        if (mine && s.playing) return { state: s, effects: [] };
        const before = s.playing && s.active ? stop(s.active, s) : [];
        return { state: { ...freeze(s, now), active: 'tab', tab: cmd.tabId, playing: true, startedAt: now, at: now }, effects: [...before, { type: 'tab', op: 'play', tabId: cmd.tabId }] };
      }
      if (cmd.action === 'pause') return { state: mine ? { ...s, playing: false, startedAt: null } : s, effects: [{ type: 'tab', op: 'pause', tabId: cmd.tabId }] };
      return { state: s, effects: [{ type: 'tab', op: cmd.action, tabId: cmd.tabId }] };
    }
    case 'next': {
      if (s.active === 'tab' && s.tab !== null) return { state: s, effects: [{ type: 'tab', op: 'next', tabId: s.tab }] };
      if (streamOn(s)) return { state: s, effects: [{ type: 'panel', op: 'next' }] };
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
      return toSong({ ...s, playing: true, problem: null, startedAt: s.playing ? s.startedAt : now }, { ...s.queue, at: cmd.at }, now);
    }
    case 'prev': {
      if (s.active === 'tab' && s.tab !== null) return { state: s, effects: [{ type: 'tab', op: 'prev', tabId: s.tab }] };
      if (streamOn(s)) return { state: s, effects: [{ type: 'panel', op: 'prev' }] };
      if (s.active !== 'folder' || !s.queue) return { state: s, effects: [] };
      const back = prevIn(s.queue, positionAt(s, now));
      if (back.restart) return applyPlayer(s, { op: 'seek', ms: 0 }, now);
      return toSong(s, back.queue, now);
    }
    case 'seek': {
      if (streamOn(s)) {
        const at = s.stream!.duration ? Math.min(cmd.ms, s.stream!.duration) : cmd.ms;
        // YouTube's seek keeps a paused video paused, so the panel moves even while paused.
        return { state: { ...s, stream: { ...s.stream!, position: at, at: now } }, effects: s.panel ? [{ type: 'panel-seek', at }] : [] };
      }
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
  if (cmd.op === 'play') return [{ op: 'volume', volume: cmd.volume }, { op: 'noise', noise: cmd.noise }, { op: 'source', source: 'noise' }, { op: 'play' }];
  if (cmd.op === 'stop') return [{ op: 'pause' }];
  return [{ op: 'volume', volume: cmd.volume }];
}
