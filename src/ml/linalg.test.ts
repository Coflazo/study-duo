import { describe, expect, it } from 'vitest';
import { cholesky, inverseDiagonal, logDet, mulVec, sampleFromPrecision, solve } from './linalg';

/** A random symmetric positive definite matrix: B Bᵀ + n I, stored row-major. */
function spd(n: number, seed = 1): Float64Array {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  const b = Array.from({ length: n * n }, r);
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let v = i === j ? n : 0;
    for (let k = 0; k < n; k++) v += b[i * n + k]! * b[j * n + k]!;
    a[i * n + j] = v;
  }
  return a;
}

describe('cholesky and solves', () => {
  it('solves A x = b for a hand-checked 3 x 3 matrix', () => {
    const a = new Float64Array([4, 12, -16, 12, 37, -43, -16, -43, 98]);
    const { factor, jitter } = cholesky(a, 3);
    expect(jitter).toBe(0);
    expect([...factor]).toEqual([2, 0, 0, 6, 1, 0, -8, 5, 3]);
    const x = solve(factor, 3, new Float64Array([1, 2, 3]));
    const back = mulVec(a, 3, x);
    [1, 2, 3].forEach((v, i) => expect(back[i]).toBeCloseTo(v, 10));
    expect(logDet(factor, 3)).toBeCloseTo(Math.log(36), 10); // det = (2 * 1 * 3)^2
  });

  it('gives the inverse diagonal of a random 40 x 40 matrix', () => {
    const n = 40;
    const a = spd(n, 7);
    const { factor } = cholesky(a, n);
    const diag = inverseDiagonal(factor, n);
    for (const i of [0, 13, 39]) {
      const e = new Float64Array(n);
      e[i] = 1;
      expect(diag[i]).toBeCloseTo(solve(factor, n, e)[i]!, 10);
    }
  });

  it('adds just enough jitter to a singular matrix and never returns NaN', () => {
    const a = new Float64Array([1, 1, 1, 1]); // two identical columns
    const { factor, jitter } = cholesky(a, 2);
    expect(jitter).toBeGreaterThan(0);
    expect([...factor].every(Number.isFinite)).toBe(true);
  });
});

describe('sampleFromPrecision', () => {
  it('draws with the covariance the precision implies', () => {
    const prec = new Float64Array([2, 0.5, 0.5, 1]); // covariance = inverse
    const { factor } = cholesky(prec, 2);
    let s = 3;
    const normal = () => {
      const u = ((s = (s * 16807) % 2147483647) / 2147483647) || 1e-12;
      const v = (s = (s * 16807) % 2147483647) / 2147483647;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const n = 40_000;
    let xx = 0, yy = 0, xy = 0;
    for (let i = 0; i < n; i++) {
      const z = sampleFromPrecision(factor, 2, new Float64Array([0, 0]), normal);
      xx += z[0]! * z[0]!; yy += z[1]! * z[1]!; xy += z[0]! * z[1]!;
    }
    const det = 2 * 1 - 0.25;
    expect(xx / n).toBeCloseTo(1 / det, 1);
    expect(yy / n).toBeCloseTo(2 / det, 1);
    expect(xy / n).toBeCloseTo(-0.5 / det, 1);
  });
});
