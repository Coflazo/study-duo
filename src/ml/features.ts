import type { ActivityRecord, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import type { Design, Group } from './blr';

const MIN = 60_000;
/** Hour bins 06 to 22; earlier hours join 06 and later ones 22. */
export const FIRST_HOUR = 6;
export const BINS = 17;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const SOURCES = ['silence', 'music site', 'file', 'focus sound'] as const;

export const binOf = (t: number) => Math.min(BINS - 1, Math.max(0, new Date(t).getHours() - FIRST_HOUR));
/** Monday 0 to Sunday 6, local time. */
export const dayOf = (t: number) => (new Date(t).getDay() + 6) % 7;
export const isWeekend = (day: number) => day >= 5;

export interface Vocabulary {
  genres: number;
  artists: number;
  tracks: number;
}
const DEFAULT_VOCAB: Vocabulary = { genres: 10, artists: 15, tracks: 25 };
/** Per-day differences in 3-hour steps (06-08, 09-11, 12-14, 15-17, 18-20, 21-22): coarse on purpose, and cheap. */
export const DAY_STEPS = 6;
export const dayStepOf = (bin: number) => Math.min(DAY_STEPS - 1, Math.floor(bin / 3));
/** Planned block lengths the block-length suggestion chooses between. */
export const LENGTHS = [25, 35, 45, 50] as const;
export const lengthOf = (minutes: number) => (minutes <= 30 ? 25 : minutes <= 40 ? 35 : minutes <= 47 ? 45 : 50);

export interface FeatureInput {
  sessions: SessionRecord[];
  listens: ListenRecord[];
  activity: ActivityRecord[];
  /** Unrated blocks the focus index filled in: target in 0 to 1 and a row weight below 1. */
  imputed?: Map<string, { y: number; w: number }>;
}

export interface FeatureSet {
  design: Design;
  groups: Group[];
  columns: string[];
  blocks: Array<{ id: string; startedAt: number; day: number; bin: number; rated: boolean }>;
}

/**
 * The time columns for a block in this hour bin on this day. Cumulative coding ("this hour or later"): each weight is
 * the step from one hour to the next, so the Gaussian prior on it is a random walk along the day and neighbouring hours
 * share evidence. Global hourly steps, plus hourly steps that differ for weekdays or weekends, plus 3-hour steps that
 * differ for the day itself.
 */
export function cellWeights(day: number, bin: number): Record<string, number> {
  const out: Record<string, number> = {};
  const category = isWeekend(day) ? 'weekend' : 'weekday';
  for (let h = 0; h <= bin; h++) {
    if (h > 0) out[`hour:${h}`] = 1;
    out[`${category}:${h}`] = 1;
  }
  for (let k = 0; k <= dayStepOf(bin); k++) out[`day:${day}:${k}`] = 1;
  return out;
}

const key = (s: string) => s.trim().toLowerCase();
const sourceOf = (l: ListenRecord): (typeof SOURCES)[number] => (l.host === 'file' ? 'file' : l.host === 'sound' ? 'focus sound' : 'music site');
const trackOf = (l: ListenRecord) => (l.artist.trim() ? `${key(l.artist)} — ${key(l.title)}` : key(l.title));

/** Columns for the most-heard names (by minutes inside blocks), and one pooled column for the rest. */
function vocabulary(minutes: Map<string, number>, cap: number): string[] {
  const ranked = [...minutes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  return ranked.length > cap ? [...ranked.slice(0, cap), 'other'] : ranked;
}

/**
 * Features of each study block for the insights model. Everything describes the block itself or was known when it
 * started (hour, day, block of the day, planned length bucket, leisure in the hour before), plus what played during it.
 * Nothing here comes from the focus index inputs (site shares, switches, blocked attempts): the index is built from
 * those, and the hour and music model must not learn from its own label.
 */
export function buildFeatures(input: FeatureInput, cap: Vocabulary = DEFAULT_VOCAB): FeatureSet {
  const focus = input.sessions.filter((s) => s.phase === 'focus').sort((a, b) => a.startedAt - b.startedAt);
  const rows = focus.filter((s) => s.rating !== null || input.imputed?.has(s.id));

  // Songs inside each block, as minutes per source, genre, artist and track.
  type Mix = { source: Map<string, number>; genre: Map<string, number>; artist: Map<string, number>; track: Map<string, number> };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const totals: Mix = { source: new Map(), genre: new Map(), artist: new Map(), track: new Map() };
  const mixes = rows.map((b) => {
    const mix: Mix = { source: new Map(), genre: new Map(), artist: new Map(), track: new Map() };
    for (const l of input.listens) {
      const overlap = Math.min(l.endedAt, b.endedAt) - Math.max(l.startedAt, b.startedAt);
      if (overlap <= 0) continue;
      const m = overlap / MIN;
      add(mix.source, sourceOf(l), m);
      if (l.genre?.trim()) add(mix.genre, key(l.genre), m);
      if (l.artist.trim()) add(mix.artist, key(l.artist), m);
      add(mix.track, trackOf(l), m);
    }
    for (const k of ['genre', 'artist', 'track'] as const) for (const [n, v] of mix[k]) add(totals[k], n, v);
    return mix;
  });
  const genres = vocabulary(totals.genre, cap.genres);
  const artists = vocabulary(totals.artist, cap.artists);
  const tracks = vocabulary(totals.track, cap.tracks);

  const columns: string[] = [];
  const groups: Group[] = [];
  const group = (name: string, names: string[], alpha?: number) => {
    const cols = names.map((n) => columns.push(n) - 1);
    if (cols.length) groups.push({ name, cols, ...(alpha === undefined ? {} : { alpha }) });
  };
  const bins = Array.from({ length: BINS }, (_, h) => h);
  group('intercept', ['intercept'], 1e-4);
  group('hour', bins.slice(1).map((h) => `hour:${h}`)); // the level is the intercept
  group('category', [...bins.map((h) => `weekday:${h}`), ...bins.map((h) => `weekend:${h}`)]);
  group('day', DAYS.flatMap((_, d) => Array.from({ length: DAY_STEPS }, (_, k) => `day:${d}:${k}`)));
  group('source', SOURCES.map((s) => `source:${s}`));
  group('genre', genres.map((g) => `genre:${g}`));
  group('artist', artists.map((a) => `artist:${a}`));
  group('track', tracks.map((t) => `track:${t}`));
  group('controls', ['control:block of the day', 'control:leisure before']);
  group('length', LENGTHS.map((m) => `length:${m}`));
  const at = new Map(columns.map((c, i) => [c, i]));

  const p = columns.length;
  const x = new Float64Array(rows.length * p);
  const y = new Float64Array(rows.length);
  const w = new Float64Array(rows.length);
  const blocks: FeatureSet['blocks'] = [];
  rows.forEach((b, r) => {
    const set = (name: string, v: number) => {
      const c = at.get(name);
      if (c !== undefined) x[r * p + c] = x[r * p + c]! + v;
    };
    const day = dayOf(b.startedAt);
    const bin = binOf(b.startedAt);
    set('intercept', 1);
    for (const [name, v] of Object.entries(cellWeights(day, bin))) set(name, v);

    const minutes = Math.max(1, (b.endedAt - b.startedAt) / MIN);
    const mix = mixes[r]!;
    let music = 0;
    for (const [s, m] of mix.source) {
      const share = Math.min(1, m / minutes);
      music += share;
      set(`source:${s}`, share);
    }
    set('source:silence', Math.max(0, 1 - music));
    const pooled = (k: 'genre' | 'artist' | 'track', vocab: string[]) => {
      for (const [n, m] of mix[k]) set(`${k}:${vocab.includes(n) ? n : 'other'}`, Math.min(1, m / minutes));
    };
    pooled('genre', genres);
    pooled('artist', artists);
    pooled('track', tracks);

    const dayStart = new Date(b.startedAt).setHours(0, 0, 0, 0);
    const before = focus.filter((o) => o.startedAt >= dayStart && o.startedAt < b.startedAt).length;
    set('control:block of the day', before / 4);
    set(`length:${lengthOf((b.plannedMs ?? 25 * MIN) / MIN)}`, 1);
    let leisure = 0;
    for (const a of input.activity) {
      if (a.category === 'study' || a.category === 'unobserved') continue;
      leisure += Math.max(0, Math.min(a.endedAt, b.startedAt) - Math.max(a.startedAt, b.startedAt - 60 * MIN));
    }
    set('control:leisure before', leisure / (60 * MIN));

    const filled = b.rating === null ? input.imputed!.get(b.id)! : null;
    y[r] = filled ? filled.y : (b.rating! - 1) / 4;
    w[r] = filled ? filled.w : 1;
    blocks.push({ id: b.id, startedAt: b.startedAt, day, bin, rated: !filled });
  });
  return { design: { rows: rows.length, cols: p, x, y, w }, groups, columns, blocks };
}
