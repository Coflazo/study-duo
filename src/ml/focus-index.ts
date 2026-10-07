import type { BlockSignals } from '@/core/signals';
import { fitBLR, predict, type Fit } from './blr';

/** Signals the index reads; counts and minutes on a log1p scale (spec: log1p rates). */
export const SIGNALS = ['studyShare', 'offSwitchesPerHour', 'blockedAttempts', 'unlocks', 'longestStudyMin', 'unobservedMin', 'pausedMin', 'extendedMin', 'completed', 'startDelayMin', 'inputShare'] as const;
type Signal = (typeof SIGNALS)[number];
const LOG = new Set<Signal>(['offSwitchesPerHour', 'blockedAttempts', 'unlocks', 'longestStudyMin', 'unobservedMin', 'pausedMin', 'extendedMin', 'startDelayMin']);
/**
 * Prior direction of each signal on the rating (on the robust z scale): more study share and longer stretches help;
 * switching away and blocked attempts hurt; time away and input volume start neutral (busy is not focused).
 */
const PRIOR: Record<Signal, number> = { studyShare: 0.04, offSwitchesPerHour: -0.04, blockedAttempts: -0.03, unlocks: -0.03, longestStudyMin: 0.03, unobservedMin: 0, pausedMin: -0.01, extendedMin: 0, completed: 0.02, startDelayMin: -0.01, inputShare: 0 };

const MIN_RATED = 15;
const MIN_CORRELATION = 0.3;
const WINDOW = 50;
/** Ask for a rating when the index's predictive SD for this block is above half a rating step (0.125 on 0 to 1). */
const UNSURE_SD = 0.11;

/** (v - median) / (1.4826 MAD), clipped to plus or minus 3; all zeros when there is no spread. */
export function robustZ(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const med = (xs: number[]) => (xs.length % 2 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2);
  const m = med(sorted);
  const mad = 1.4826 * med(values.map((v) => Math.abs(v - m)).sort((a, b) => a - b));
  return values.map((v) => (mad > 0 ? Math.max(-3, Math.min(3, (v - m) / mad)) : 0));
}

export interface IndexBlock {
  id: string;
  signals: BlockSignals;
  rating: 1 | 2 | 3 | 4 | 5 | null;
}

export interface Calibration {
  rated: number;
  ready: boolean;
  looCorrelation: number;
  /** Posterior mean weight per signal (z scale), for showing which signals carry the index. */
  weights: Partial<Record<Signal, number>>;
  /** Unrated blocks filled in: target on 0 to 1 and a row weight below 1. Empty until ready. */
  imputed: Map<string, { y: number; w: number }>;
  fit: Fit | null;
  /** Reference values (the last blocks) used to z-score a new block. */
  reference: Partial<Record<Signal, number[]>>;
}

const raw = (s: BlockSignals, k: Signal) => {
  const v = s[k];
  return v === undefined ? undefined : LOG.has(k) ? Math.log1p(v) : v;
};

/** z-scores one block against the reference blocks; a missing signal sits at the median (0). */
function zRow(ref: Partial<Record<Signal, number[]>>, s: BlockSignals): Float64Array {
  const x = new Float64Array(SIGNALS.length + 1);
  x[0] = 1;
  SIGNALS.forEach((k, j) => {
    const v = raw(s, k);
    const r = ref[k];
    if (v === undefined || !r || r.length === 0) return;
    x[j + 1] = robustZ([...r, v]).at(-1)!;
  });
  return x;
}

/**
 * The implicit focus index (spec: Implicit focus signals): a Bayesian regression of the 1 to 5 rating on robust
 * z-scores of the block's signals, with prior means in the expected directions. It fills in unrated blocks only after 15
 * rated ones and a leave-one-out correlation of at least 0.3, each with a weight that falls as its uncertainty grows.
 */
export function calibrate(blocks: IndexBlock[]): Calibration {
  const recent = blocks.slice(-WINDOW * 4);
  const ref: Partial<Record<Signal, number[]>> = {};
  for (const k of SIGNALS) {
    const vals = recent.slice(-WINDOW).map((b) => raw(b.signals, k)).filter((v): v is number => v !== undefined);
    if (vals.length) ref[k] = vals;
  }
  const rated = recent.filter((b) => b.rating !== null);
  const empty: Calibration = { rated: rated.length, ready: false, looCorrelation: 0, weights: {}, imputed: new Map(), fit: null, reference: ref };
  if (rated.length < 3) return empty;

  const p = SIGNALS.length + 1;
  const x = new Float64Array(rated.length * p);
  const y = new Float64Array(rated.length);
  rated.forEach((b, i) => {
    x.set(zRow(ref, b.signals), i * p);
    y[i] = (b.rating! - 1) / 4;
  });
  const groups = [
    { name: 'intercept', cols: [0], alpha: 1e-4 },
    { name: 'signals', cols: SIGNALS.map((_, j) => j + 1), priorMean: SIGNALS.map((k) => PRIOR[k]) },
  ];
  const fit = fitBLR({ rows: rated.length, cols: p, x, y }, groups);

  // Leave-one-out predictions with the fitted precisions held fixed (cheap: p is 12).
  const fixed = groups.map((g) => ({ ...g, alpha: fit.alphas[g.name] }));
  const loo: number[] = [];
  for (let i = 0; i < rated.length; i++) {
    const keep = rated.map((_, k) => k).filter((k) => k !== i);
    const xi = new Float64Array(keep.length * p);
    keep.forEach((k, r) => xi.set(x.subarray(k * p, (k + 1) * p), r * p));
    const f = fitBLR({ rows: keep.length, cols: p, x: xi, y: Float64Array.from(keep, (k) => y[k]!) }, fixed, { beta: fit.beta, iterations: 1 });
    loo.push(predict(f, x.subarray(i * p, (i + 1) * p)).mean);
  }
  const corr = correlation(loo, [...y]);
  const weights = Object.fromEntries(SIGNALS.map((k, j) => [k, fit.mean[j + 1]!]));
  const ready = rated.length >= MIN_RATED && corr >= MIN_CORRELATION;
  const imputed = new Map<string, { y: number; w: number }>();
  if (ready) {
    const noise = 1 / fit.beta;
    for (const b of recent) {
      if (b.rating !== null) continue;
      const pr = predict(fit, zRow(ref, b.signals));
      const w = (noise / (noise + pr.variance)) * corr ** 2; // less weight when unsure or when the index explains less
      imputed.set(b.id, { y: Math.min(1, Math.max(0, pr.mean)), w: Math.min(0.9, Math.max(0.05, w)) });
    }
  }
  return { rated: rated.length, ready, looCorrelation: corr, weights, imputed, fit, reference: ref };
}

/** Ask for the rating while the index is not ready, and afterwards only when it is unsure about this block. */
export function shouldAskRating(c: Calibration, signals: BlockSignals): boolean {
  if (!c.ready || !c.fit) return true;
  if (SIGNALS.every((k) => signals[k] === undefined)) return true;
  return Math.sqrt(predict(c.fit, zRow(c.reference, signals)).variance) > UNSURE_SD;
}

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
