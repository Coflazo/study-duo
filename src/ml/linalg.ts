/**
 * Small dense linear algebra for the on-device model: row-major Float64Array, no dependency. The posterior precision is
 * symmetric positive definite, so everything goes through its Cholesky factor (Deisenroth et al., MML, ch. 4.3).
 */

function tryCholesky(a: Float64Array, n: number, jitter: number): Float64Array | null {
  const l = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]! + jitter;
    for (let k = 0; k < j; k++) d -= l[j * n + k]! ** 2;
    if (!(d > 0)) return null;
    const ljj = Math.sqrt(d);
    l[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= l[i * n + k]! * l[j * n + k]!;
      l[i * n + j] = s / ljj;
    }
  }
  return l;
}

/**
 * Lower factor L with A = L Lᵀ. A matrix that is singular or only just positive definite (duplicated features, an
 * empty group) gets a little diagonal jitter, tenfold more per try, and the jitter used is reported.
 */
export function cholesky(a: Float64Array, n: number): { factor: Float64Array; jitter: number } {
  let mean = 0;
  for (let i = 0; i < n; i++) mean += Math.abs(a[i * n + i]!) / n;
  const base = (mean || 1) * 1e-10;
  for (let tries = 0, jitter = 0; tries < 14; tries++, jitter = jitter ? jitter * 10 : base) {
    const factor = tryCholesky(a, n, jitter);
    if (factor) return { factor, jitter };
  }
  throw new Error('matrix is not positive definite even with jitter');
}

/** Solves L y = b. */
export function forward(l: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l[i * n + k]! * y[k]!;
    y[i] = s / l[i * n + i]!;
  }
  return y;
}

/** Solves Lᵀ x = y. */
export function backward(l: Float64Array, n: number, y: Float64Array): Float64Array {
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * x[k]!;
    x[i] = s / l[i * n + i]!;
  }
  return x;
}

/** Solves A x = b given A's factor. */
export function solve(l: Float64Array, n: number, b: Float64Array): Float64Array {
  return backward(l, n, forward(l, n, b));
}

/** Diagonal of A⁻¹ = L⁻ᵀ L⁻¹: the posterior variances. O(n³/3) through L⁻¹. */
export function inverseDiagonal(l: Float64Array, n: number): Float64Array {
  const inv = new Float64Array(n * n); // lower triangular L⁻¹
  for (let j = 0; j < n; j++) {
    inv[j * n + j] = 1 / l[j * n + j]!;
    for (let i = j + 1; i < n; i++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= l[i * n + k]! * inv[k * n + j]!;
      inv[i * n + j] = s / l[i * n + i]!;
    }
  }
  const diag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i; k < n; k++) s += inv[k * n + i]! ** 2;
    diag[i] = s;
  }
  return diag;
}

/** log det A = 2 Σ log Lᵢᵢ. */
export function logDet(l: Float64Array, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.log(l[i * n + i]!);
  return 2 * s;
}

export function mulVec(a: Float64Array, n: number, x: Float64Array): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += a[i * n + j]! * x[j]!;
    out[i] = s;
  }
  return out;
}

/** One draw from N(mean, A⁻¹) given A's factor: mean + L⁻ᵀ z with z standard normal (Thompson sampling). */
export function sampleFromPrecision(l: Float64Array, n: number, mean: Float64Array, normal: () => number): Float64Array {
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = normal();
  const d = backward(l, n, z);
  for (let i = 0; i < n; i++) d[i] = d[i]! + mean[i]!;
  return d;
}
