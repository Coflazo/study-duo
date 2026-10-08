import type { ActivityRecord, BlockedAttempt, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import type { Measure } from '@/core/settings';
import { blockSignals } from '@/core/signals';
import { fitBLR, predict, sampleWeights, type Fit } from './blr';
import { BINS, buildFeatures, cellWeights, DAYS, FIRST_HOUR, isWeekend, LENGTHS } from './features';
import { calibrate } from './focus-index';
import { walkForward } from './validate';

const Z80 = 1.2816;
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
  /** Uniform 0 to 1; seeded in tests. */
  random?: () => number;
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
export function computeInsights(input: InsightsInput): Insights {
  const random = input.random ?? Math.random;
  const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const all = [...input.sessions].sort((a, b) => a.startedAt - b.startedAt);
  const focus = all.filter((s) => s.phase === 'focus');

  // The focus index fills in unrated blocks once it predicts ratings well enough.
  const indexBlocks = all
    .map((block, i) => ({ block, previous: all[i - 1] ?? null }))
    .filter(({ block }) => block.phase === 'focus')
    .map(({ block, previous }) => ({ id: block.id, rating: block.rating, signals: blockSignals({ block, activity: input.activity, blocks: input.blocks, previous, measure: input.measure }) }));
  const index = calibrate(indexBlocks);
  const f = buildFeatures({ sessions: all, listens: input.listens, activity: input.activity, imputed: index.ready ? index.imputed : undefined });
  const rated = focus.filter((s) => s.rating !== null).length;
  const rows = f.design.rows;
  const empty = (): HeatCell[] => DAYS.flatMap((_, day) => Array.from({ length: BINS }, (_, bin) => ({ day, bin, rating: 0, sd: Infinity, blocks: 0, enough: false })));
  const indexSummary = { ready: index.ready, rated: index.rated, r: index.looCorrelation };
  if (rows < NEED) {
    return { blocks: focus.length, rated, learning: { have: rows, need: NEED }, cells: empty(), windows: [], music: [], tryNext: null, blockLength: null, health: null, index: indexSummary };
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
    if (usable.length < 3) return { label, learning: { have, need: have + 5 } };
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
    if (p.mean - Z80 * Math.sqrt(p.variance) <= 0) return { label, none: true };
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

  const music = musicEffects(fit, f.columns, f.design, vec, input.listens);
  return {
    blocks: focus.length,
    rated,
    learning: null,
    cells,
    windows,
    music,
    tryNext: tryNext(fit, f.columns, vec, input.listens, normal),
    blockLength: blockLength(fit, col, normal),
    health: rated >= 30 ? health(input, fit) : null,
    index: indexSummary,
  };
}

function musicEffects(fit: Fit, columns: string[], design: { rows: number; cols: number; x: Float64Array }, vec: (w: Record<string, number>) => Float64Array, listens: ListenRecord[]): MusicEffect[] {
  const blocksWith = (c: string) => {
    const i = columns.indexOf(c);
    let n = 0;
    for (let r = 0; r < design.rows; r++) if (design.x[r * design.cols + i]! > 0.1) n++;
    return n;
  };
  const named = new Map<string, { name: string; detail: string; weights: Record<string, number> }>();
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
    out.push({ name: n.name, detail: n.detail, delta, lo, hi, claim: (lo > 0 || hi < 0) && Math.abs(delta) >= MIN_EFFECT, blocks: Number.isFinite(blocks) ? blocks : blocksWith(c) });
  }
  return out.sort((a, b) => Number(b.claim) - Number(a.claim) || Math.abs(b.delta) - Math.abs(a.delta) || b.blocks - a.blocks).slice(0, 6);
}

/** One Thompson sample over silence, the sources and the tracks heard: the best-looking draw is worth trying next. */
function tryNext(fit: Fit, columns: string[], vec: (w: Record<string, number>) => Float64Array, listens: ListenRecord[], normal: () => number): string {
  const theta = sampleWeights(fit, normal);
  const score = (w: Record<string, number>) => vec(w).reduce((s, v, i) => s + v * theta[i]!, 0);
  let best = { name: 'Silence', value: score({ 'source:silence': 1 }) };
  const seen = new Set<string>();
  for (const l of listens) {
    const track = `track:${l.artist.trim() ? `${key(l.artist)} — ${key(l.title)}` : key(l.title)}`;
    if (seen.has(track) || !columns.includes(track)) continue;
    seen.add(track);
    const v = score({ [track]: 1, [`source:${sourceOf(l)}`]: 1, ...(l.artist.trim() ? { [`artist:${key(l.artist)}`]: 1 } : {}) });
    if (v > best.value) best = { name: l.title, value: v };
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

/** Walk-forward accuracy against a running average, in rating points, with the fitted precisions held fixed. */
function health(input: InsightsInput, fit: Fit) {
  const n = input.sessions.filter((s) => s.phase === 'focus' && s.rating !== null).length;
  const r = walkForward({ sessions: input.sessions, listens: input.listens, activity: input.activity }, { minTrain: 20, step: Math.max(5, Math.ceil((n - 20) / 8)), alphas: fit.alphas, beta: fit.beta });
  return { modelMae: 4 * r.modelMae, baselineMae: 4 * r.baselineMae, n: r.n };
}
