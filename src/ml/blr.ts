import { cholesky, inverseDiagonal, logDet, sampleFromPrecision, solve } from './linalg';

/** Rows of features (row-major) and targets, with optional row weights (a weight acts like that many copies). */
export interface Design {
  rows: number;
  cols: number;
  x: Float64Array;
  y: Float64Array;
  w?: Float64Array;
}

/** Columns that share one prior precision. Fixed when alpha is given; otherwise set by the evidence. */
export interface Group {
  name: string;
  cols: number[];
  /** Prior mean per column (default 0): where an effect sits until data says otherwise. */
  priorMean?: number[];
  alpha?: number;
}

export interface Fit {
  cols: number;
  mean: Float64Array;
  /** Cholesky factor of the posterior precision. */
  factor: Float64Array;
  /** Posterior variances (diagonal of the covariance). */
  varDiag: Float64Array;
  alphas: Record<string, number>;
  beta: number;
  logEvidence: number;
  /** Diagonal jitter the factorisation needed (0 when the problem was well posed). */
  jitter: number;
  /** Effective number of well-determined parameters. */
  gamma: number;
}

const CLAMP: [number, number] = [1e-6, 1e8];
const clamp = (v: number) => Math.min(CLAMP[1], Math.max(CLAMP[0], v));

/**
 * Bayesian linear regression with grouped Gaussian priors (Deisenroth et al., MML 9.3), each group's precision and the
 * noise precision set by evidence maximisation (MacKay's fixed point: gamma_g = sum over the group of 1 - alpha_g S_jj,
 * alpha_g = gamma_g / sum (m_j - m0_j)^2, beta = (N - gamma) / weighted residual sum of squares).
 */
/** Sufficient statistics of a weighted design: XᵀWX (lower triangle filled as rows are added), XᵀWy and sums. */
export interface Stats {
  cols: number;
  xtx: Float64Array;
  xty: Float64Array;
  nEff: number;
  ySum: number;
  yy: number;
  logW: number;
}

export function emptyStats(p: number): Stats {
  return { cols: p, xtx: new Float64Array(p * p), xty: new Float64Array(p), nEff: 0, ySum: 0, yy: 0, logW: 0 };
}

/** Adds one row (a block) to the statistics: O(p²), so a walk forward can grow them instead of rebuilding. */
export function addRow(s: Stats, x: Float64Array, y: number, w = 1): void {
  if (w <= 0) return;
  const p = s.cols;
  s.nEff += w;
  s.ySum += w * y;
  s.yy += w * y * y;
  s.logW += Math.log(w);
  for (let a = 0; a < p; a++) {
    const xa = x[a]!;
    if (xa === 0) continue;
    s.xty[a] = s.xty[a]! + w * xa * y;
    for (let b = 0; b <= a; b++) s.xtx[a * p + b] = s.xtx[a * p + b]! + w * xa * x[b]!;
  }
}

export function fitBLR(d: Design, groups: Group[], opts: { beta?: number; iterations?: number } = {}): Fit {
  const s = emptyStats(d.cols);
  for (let i = 0; i < d.rows; i++) addRow(s, d.x.subarray(i * d.cols, (i + 1) * d.cols), d.y[i]!, d.w?.[i] ?? 1);
  return fitStats(s, groups, opts);
}

/** The fit from sufficient statistics (see fitBLR). */
export function fitStats(s: Stats, groups: Group[], opts: { beta?: number; iterations?: number } = {}): Fit {
  const p = s.cols;
  const xtx = Float64Array.from(s.xtx);
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) xtx[b * p + a] = xtx[a * p + b]!;
  const { xty, nEff, ySum, yy, logW } = s;

  const m0 = new Float64Array(p);
  const colAlpha = new Float64Array(p);
  const alphas: Record<string, number> = {};
  for (const g of groups) {
    alphas[g.name] = g.alpha ?? 1;
    g.cols.forEach((c, k) => (m0[c] = g.priorMean?.[k] ?? 0));
  }
  const variance = nEff > 1 ? Math.max(1e-9, yy / nEff - (ySum / nEff) ** 2) : 1;
  let beta = opts.beta ?? 1 / variance;

  let mean = new Float64Array(p);
  let factor = new Float64Array(0);
  let varDiag = new Float64Array(p);
  let jitter = 0;
  let gamma = 0;
  let ed = 0;
  const rounds = opts.iterations ?? 50;
  for (let it = 0; it < rounds; it++) {
    for (const g of groups) for (const c of g.cols) colAlpha[c] = alphas[g.name]!;
    const a = new Float64Array(p * p);
    const b = new Float64Array(p);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) a[i * p + j] = beta * xtx[i * p + j]!;
      a[i * p + i] = a[i * p + i]! + colAlpha[i]!;
      b[i] = beta * xty[i]! + colAlpha[i]! * m0[i]!;
    }
    ({ factor, jitter } = cholesky(a, p));
    mean = solve(factor, p, b);
    varDiag = inverseDiagonal(factor, p);
    // weighted residual sum of squares: yᵀWy - 2 mᵀXᵀWy + mᵀXᵀWXm
    let mxty = 0;
    let mxtxm = 0;
    for (let i = 0; i < p; i++) {
      mxty += mean[i]! * xty[i]!;
      let s = 0;
      for (let j = 0; j < p; j++) s += xtx[i * p + j]! * mean[j]!;
      mxtxm += mean[i]! * s;
    }
    ed = Math.max(1e-12, yy - 2 * mxty + mxtxm);
    gamma = 0;
    let moved = 0;
    for (const g of groups) {
      const al = alphas[g.name]!;
      let gg = 0;
      let mm = 0;
      for (const c of g.cols) {
        gg += 1 - al * varDiag[c]!;
        mm += (mean[c]! - m0[c]!) ** 2;
      }
      gamma += gg;
      if (g.alpha === undefined) {
        const next = clamp(Math.max(gg, 1e-9) / Math.max(mm, 1e-12));
        moved = Math.max(moved, Math.abs(Math.log(next / al)));
        alphas[g.name] = next;
      }
    }
    if (opts.beta === undefined) {
      const next = clamp(Math.max(nEff - gamma, 1e-3) / ed);
      moved = Math.max(moved, Math.abs(Math.log(next / beta)));
      beta = next;
    }
    if (moved < 1e-4) break;
  }

  // log evidence (Bishop PRML 3.86 with row weights and per-column prior precisions)
  let priorTerm = 0;
  let logAlpha = 0;
  for (let i = 0; i < p; i++) {
    priorTerm += colAlpha[i]! * (mean[i]! - m0[i]!) ** 2;
    logAlpha += Math.log(colAlpha[i]!);
  }
  const logEvidence = 0.5 * (logAlpha + nEff * Math.log(beta) + logW - beta * ed - priorTerm - logDet(factor, p) - nEff * Math.log(2 * Math.PI));
  return { cols: p, mean, factor, varDiag, alphas, beta, logEvidence, jitter, gamma };
}

/** Predictive mean of the noise-free value and its variance (parameter uncertainty only; add 1/beta for a new rating). */
export function predict(fit: Fit, x: Float64Array): { mean: number; variance: number } {
  let mean = 0;
  for (let i = 0; i < fit.cols; i++) mean += fit.mean[i]! * x[i]!;
  const v = solve(fit.factor, fit.cols, x);
  let variance = 0;
  for (let i = 0; i < fit.cols; i++) variance += x[i]! * v[i]!;
  return { mean, variance: Math.max(0, variance) };
}

/** One draw of all weights from the posterior (Thompson sampling). */
export function sampleWeights(fit: Fit, normal: () => number): Float64Array {
  return sampleFromPrecision(fit.factor, fit.cols, fit.mean, normal);
}
