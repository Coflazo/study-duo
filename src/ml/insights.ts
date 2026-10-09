import type { ActivityRecord, BlockedAttempt, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import type { Measure } from '@/core/settings';
import { blockSignals } from '@/core/signals';
import { fitBLR, predict, sampleWeights, type Fit, type Group } from './blr';
import { BINS, buildFeatures, cellWeights, DAYS, FIRST_HOUR, isWeekend, LENGTHS, type FeatureSet } from './features';
import { calibrate } from './focus-index';
import { walkForward } from './validate';
import { overlapping, seeded } from './random';
import { SPOTIFY_HOSTS } from '@/core/music';

const Z80 = 1.2816;
/** A best window is the winner of about 14 candidates: it must clear a one-sided 97.5% bound, not 80% (winner's curse). */
const Z_WINDOW = 1.96;
/** Rated (or index-filled) blocks before any map shows. */
export const NEED = 25;
/** A cell shows when its rating's SD is under half a point and blocks sit at or next to its hour. */
const CELL_SD = 0.5;
const NEED_CATEGORY = { Weekdays: 20, Weekend: 10 } as const;
const NEED_DAY = 10;
/** Smallest change in rating points worth telling the user about, even when the interval excludes zero. */
export const MIN_EFFECT = 0.25;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface HeatCell {
  day: number;
  bin: number;
  /** Expected rating, 1 to 5, for a silent standard block. */
  rating: number;
  sd: number;
  blocks: number;
  enough: boolean;
}
export type BestWindow =
  | { label: string; from: number; to: number; rating: number }
  | { label: string; learning: { have: number; need: number } }
  | { label: string; none: true };
export interface MusicEffect {
  /** Stable key: two songs can share a title. */
  id: string;
  name: string;
  detail: string;
  /** Change in focus rating (points on 1 to 5) against silence, with its 80% interval. */
  delta: number;
  lo: number;
  hi: number;
  claim: boolean;
  blocks: number;
}
export interface Insights {
  blocks: number;
  rated: number;
  /** Unrated blocks the focus index filled in. */
  imputed: number;
  learning: { have: number; need: number } | null;
  cells: HeatCell[];
  windows: BestWindow[];
  music: MusicEffect[];
  tryNext: string | null;
  blockLength: number | null;
  health: { modelMae: number; baselineMae: number; n: number } | null;
  index: { ready: boolean; rated: number; r: number };
}

export interface InsightsInput {
  sessions: SessionRecord[];
  listens: ListenRecord[];
  activity: ActivityRecord[];
  blocks: BlockedAttempt[];
  measure: Measure;
  /** Uniform 0 to 1; by default seeded by the week of `now`, so suggestions hold for the week the copy promises. */
  random?: () => number;
  now?: number;
}

/** ISO week-numbering year and week as one number (2026-W50 is 202650). */
export function weekSeed(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // the Thursday of this week
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return d.getFullYear() * 100 + week;
}

/** Heat-map shade 0 to 4 in fixed quarter-point steps around the middle: differences too small to claim stay one shade. */
export function cellLevel(rating: number, lo: number, hi: number): number {
  return Math.min(4, Math.max(0, 2 + Math.round((rating - (lo + hi) / 2) / 0.25)));
}

/** Each block's signals, each block reading only its own slice of the (sorted) activity and attempts. */
export function indexBlocks(sessions: SessionRecord[], activity: ActivityRecord[], attempts: BlockedAttempt[], measure: Measure) {
  const all = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const act = [...activity].sort((a, b) => a.startedAt - b.startedAt);
  const tries = [...attempts].sort((a, b) => a.at - b.at);
  const SPAN = 6 * 3_600_000;
  return all
    .map((block, i) => ({ block, previous: all[i - 1] ?? null }))
    .filter(({ block }) => block.phase === 'focus')
    .map(({ block, previous }) => {
      const near = overlapping(act, block.startedAt, block.endedAt, SPAN);
      const blocks = tries.filter((t) => t.at >= block.startedAt && t.at < block.endedAt);
      return { id: block.id, rating: block.rating, signals: blockSignals({ block, activity: near, blocks, previous, measure }) };
    });
}

const SOURCE_NAMES: Record<string, string> = { 'music site': 'Songs on music sites', file: 'Your own files', 'focus sound': 'Focus sounds' };
const key = (s: string) => s.trim().toLowerCase();
const sourceOf = (l: ListenRecord) => (l.host === 'file' ? 'file' : l.host === 'sound' ? 'focus sound' : 'music site');

/**
 * Everything the Insights screen shows, worked out on this computer from the event log. Each insight appears only when
 * the evidence is strong enough: cells need a small posterior SD and nearby blocks, best windows must beat the
 * category's average with an 80% interval above zero, and a music effect is claimed only when its 80% interval excludes
 * zero ("unclear" otherwise). Suggestions come from one Thompson sample of the posterior (Sutton and Barto, ch. 2).
 */
/** Hosts whose plays are shown but never learned from. Spotify's User Guidelines forbid using Spotify content in a
 *  machine learning model. ListenBrainz plays from Spotify are filed under Spotify; Last.fm does not say which app
 *  played a song, so none of its plays are learned from either (#46). */
export const NOT_FOR_INSIGHTS: ReadonlySet<string> = new Set([...SPOTIFY_HOSTS, 'last.fm']);

export function computeInsights(raw: InsightsInput): Insights {
  const input = { ...raw, listens: raw.listens.filter((l) => !NOT_FOR_INSIGHTS.has(l.host)) };
  const random = input.random ?? seeded(weekSeed(input.now ?? Date.now())).u;
  const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const all = [...input.sessions].sort((a, b) => a.startedAt - b.startedAt);
  const focus = all.filter((s) => s.phase === 'focus');

  // The focus index fills in unrated blocks once it predicts ratings well enough.
  const index = calibrate(indexBlocks(all, input.activity, input.blocks, input.measure));
  const f = buildFeatures({ sessions: all, listens: input.listens, activity: input.activity, imputed: index.ready ? index.imputed : undefined });
  const rated = focus.filter((s) => s.rating !== null).length;
  const rows = f.design.rows;
  const empty = (): HeatCell[] => DAYS.flatMap((_, day) => Array.from({ length: BINS }, (_, bin) => ({ day, bin, rating: 0, sd: Infinity, blocks: 0, enough: false })));
  const indexSummary = { ready: index.ready, rated: index.rated, r: index.looCorrelation };
  if (rows < NEED) {
    return { blocks: focus.length, rated, imputed: rows - rated, learning: { have: rows, need: NEED }, cells: empty(), windows: [], music: [], tryNext: null, blockLength: null, health: null, index: indexSummary };
  }

  const fit = fitBLR(f.design, f.groups, { iterations: 30 });
  const col = new Map(f.columns.map((c, i) => [c, i]));
  const vec = (weights: Record<string, number>) => {
    const x = new Float64Array(f.columns.length);
    for (const [c, v] of Object.entries(weights)) {
      const i = col.get(c);
      if (i !== undefined) x[i] = x[i]! + v;
    }
    return x;
  };
  const BASE = { intercept: 1, 'source:silence': 1, 'length:25': 1 };
  const nearby = (days: number[], bin: number) => f.blocks.filter((b) => days.includes(b.day) && Math.abs(b.bin - bin) <= 1).length;

  const cells: HeatCell[] = DAYS.flatMap((_, day) =>
    Array.from({ length: BINS }, (_, bin) => {
      const p = predict(fit, vec({ ...BASE, ...cellWeights(day, bin) }));
      const sd = 4 * Math.sqrt(p.variance);
      const blocks = nearby([day], bin);
      return { day, bin, rating: Math.min(5, Math.max(1, 1 + 4 * p.mean)), sd, blocks, enough: sd < CELL_SD && blocks >= 2 };
    }),
  );

  /** Average of cell vectors over some days (and optionally some bins). */
  const average = (days: number[], bins: number[]) => {
    const w: Record<string, number> = {};
    for (const d of days) for (const b of bins) for (const [c, v] of Object.entries(cellWeights(d, b))) w[c] = (w[c] ?? 0) + v / (days.length * bins.length);
    return w;
  };
  const bestWindow = (label: string, days: number[], need: number): BestWindow | null => {
    const have = f.blocks.filter((b) => days.includes(b.day)).length;
    if (have < need) return { label, learning: { have, need } };
    const usable = Array.from({ length: BINS }, (_, b) => b).filter((b) => nearby(days, b) >= 2 && 4 * Math.sqrt(predict(fit, vec({ ...BASE, ...average(days, [b]) })).variance) < CELL_SD);
    if (usable.length < 3) return { label, learning: { have, need: 0 } }; // enough blocks, spread over too many hours yet
    let best: { bin: number; score: number } | null = null;
    for (const b of usable) {
      if (!usable.includes(b + 1)) continue;
      const score = predict(fit, vec(average(days, [b, b + 1]))).mean;
      if (!best || score > best.score) best = { bin: b, score };
    }
    if (!best) return { label, none: true };
    // It must beat the usual hours of these days, not just come out on top by chance.
    const window = average(days, [best.bin, best.bin + 1]);
    const usual = average(days, usable);
    const diff = vec(window);
    const u = vec(usual);
    for (let i = 0; i < diff.length; i++) diff[i] = diff[i]! - u[i]!;
    const p = predict(fit, diff);
    if (p.mean - Z_WINDOW * Math.sqrt(p.variance) <= 0) return { label, none: true };
    const rating = Math.min(5, Math.max(1, 1 + 4 * predict(fit, vec({ ...BASE, ...window })).mean));
    return { label, from: FIRST_HOUR + best.bin, to: FIRST_HOUR + best.bin + 2, rating };
  };
  const windows: BestWindow[] = [];
  const weekdays = bestWindow('Weekdays', [0, 1, 2, 3, 4], NEED_CATEGORY.Weekdays);
  const weekend = bestWindow('Weekend', [5, 6], NEED_CATEGORY.Weekend);
  if (weekdays) windows.push(weekdays);
  // A single day earns its own row only when its best hours differ from its category's.
  for (let d = 0; d < 7 && windows.length < 3; d++) {
    const own = bestWindow(DAY_NAMES[d]!, [d], NEED_DAY);
    const parent = isWeekend(d) ? weekend : weekdays;
    if (own && 'from' in own && parent && 'from' in parent && (own.to <= parent.from || own.from >= parent.to)) windows.push(own);
  }
  if (weekend) windows.push(weekend);

  // Music claims need the music columns to earn their place in the evidence first: with many songs, a few can look
  // certain by chance (review: 5 of 12 pure-noise screens claimed something). Compare against music pinned to zero.
  const MUSIC = new Set(['source', 'genre', 'artist', 'track']);
  const pinned = fitBLR(f.design, f.groups.map((g): Group => (MUSIC.has(g.name) ? { ...g, alpha: 1e8 } : g)), { iterations: 20 });
  const musicMatters = fit.logEvidence - pinned.logEvidence > 2;
  const { effects: music, named } = musicEffects(fit, f.columns, f.design, vec, input.listens, musicMatters);
  return {
    blocks: focus.length,
    rated,
    imputed: rows - rated,
    learning: null,
    cells,
    windows,
    music,
    tryNext: tryNext(fit, vec, named, normal),
    blockLength: blockLength(fit, col, normal),
    health: rated >= 30 ? health(input, f) : null,
    index: indexSummary,
  };
}

type Named = Map<string, { name: string; detail: string; weights: Record<string, number> }>;

function musicEffects(fit: Fit, columns: string[], design: { rows: number; cols: number; x: Float64Array }, vec: (w: Record<string, number>) => Float64Array, listens: ListenRecord[], musicMatters: boolean): { effects: MusicEffect[]; named: Named } {
  const blocksWith = (c: string) => {
    const i = columns.indexOf(c);
    let n = 0;
    for (let r = 0; r < design.rows; r++) if (design.x[r * design.cols + i]! > 0.1) n++;
    return n;
  };
  const named: Named = new Map();
  const bySource = new Map<string, Set<string>>();
  for (const l of listens) {
    const source = `source:${sourceOf(l)}`;
    const artist = l.artist.trim() ? `artist:${key(l.artist)}` : null;
    const genre = l.genre?.trim() ? `genre:${key(l.genre)}` : null;
    const track = `track:${l.artist.trim() ? `${key(l.artist)} — ${key(l.title)}` : key(l.title)}`;
    if (!named.has(track)) named.set(track, { name: l.title, detail: [l.artist, SOURCE_NAMES[sourceOf(l)]].filter(Boolean).join(' · '), weights: { [track]: 1, ...(artist ? { [artist]: 1 } : {}), ...(genre ? { [genre]: 1 } : {}), [source]: 1 } });
    if (!bySource.has(source)) bySource.set(source, new Set());
    bySource.get(source)!.add(track);
    if (genre && !named.has(genre)) named.set(genre, { name: l.genre!.trim(), detail: 'genre', weights: { [genre]: 1, [source]: 1 } });
  }
  // A source's effect is the average of its tracks' full effects, by blocks: the model gives effects to tracks and may
  // shrink the source's own column to nothing, which alone would read as a falsely certain zero.
  for (const [source, tracks] of bySource) {
    const weights: Record<string, number> = {};
    let total = 0;
    for (const t of tracks) {
      if (!columns.includes(t)) continue;
      const n = blocksWith(t);
      total += n;
      for (const [c, v] of Object.entries(named.get(t)!.weights)) weights[c] = (weights[c] ?? 0) + n * v;
    }
    if (total === 0 || tracks.size < 2) continue;
    for (const c of Object.keys(weights)) weights[c] = weights[c]! / total;
    named.set(`${source}`, { name: SOURCE_NAMES[source.slice('source:'.length)]!, detail: `${tracks.size} songs or sounds, on average`, weights });
  }
  const out: MusicEffect[] = [];
  for (const [c, n] of named) {
    if (!columns.includes(c)) continue;
    const blocks = c.startsWith('source:') ? Infinity : blocksWith(c);
    if (blocks < 3) continue;
    const p = predict(fit, vec({ ...n.weights, 'source:silence': -1 }));
    const sd = 4 * Math.sqrt(p.variance);
    const delta = 4 * p.mean;
    const lo = delta - Z80 * sd;
    const hi = delta + Z80 * sd;
    out.push({ id: c, name: n.name, detail: n.detail, delta, lo, hi, claim: musicMatters && (lo > 0 || hi < 0) && Math.abs(delta) >= MIN_EFFECT, blocks: Number.isFinite(blocks) ? blocks : blocksWith(c) });
  }
  return { effects: out.sort((a, b) => Number(b.claim) - Number(a.claim) || Math.abs(b.delta) - Math.abs(a.delta) || b.blocks - a.blocks).slice(0, 6), named };
}

/** One Thompson sample over silence and every track heard, each scored with its full effect (genre, artist, source). */
function tryNext(fit: Fit, vec: (w: Record<string, number>) => Float64Array, named: Named, normal: () => number): string {
  const theta = sampleWeights(fit, normal);
  const score = (w: Record<string, number>) => vec(w).reduce((s, v, i) => s + v * theta[i]!, 0);
  let best = { name: 'Silence', value: score({ 'source:silence': 1 }) };
  for (const [key, n] of named) {
    if (!key.startsWith('track:')) continue;
    const v = score(n.weights);
    if (v > best.value) best = { name: n.name, value: v };
  }
  return best.name;
}

/** Thompson sampling over the four planned lengths (an unseen length gets explored now and then). */
function blockLength(fit: Fit, col: Map<string, number>, normal: () => number): number {
  const theta = sampleWeights(fit, normal);
  let best: { m: number; v: number } = { m: 25, v: -Infinity };
  for (const m of LENGTHS) {
    const v = theta[col.get(`length:${m}`)!]!;
    if (v > best.v) best = { m, v };
  }
  return best.m;
}

/** Walk-forward accuracy against a running average, in rating points: ratings only, precisions refitted on each prefix. */
function health(input: InsightsInput, f: FeatureSet) {
  const n = f.blocks.filter((b) => b.rated).length;
  const r = walkForward({ sessions: input.sessions, listens: input.listens, activity: input.activity }, { features: f, minTrain: 20, step: Math.max(5, Math.ceil((n - 20) / 6)), iterations: 10 });
  return { modelMae: 4 * r.modelMae, baselineMae: 4 * r.baselineMae, n: r.n };
}
