import { describe, expect, it } from 'vitest';
import { fitBLR, predict, type Group } from './blr';

function rng(seed: number) {
  let s = seed;
  const u = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return { u, normal: () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()) };
}

/** rows x cols design with standard normal entries, and y = X w + noise. */
function data(rows: number, w: number[], noiseSd: number, seed = 1) {
  const r = rng(seed);
  const cols = w.length;
  const x = new Float64Array(rows * cols);
  const y = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    let t = 0;
    for (let j = 0; j < cols; j++) {
      const v = r.normal();
      x[i * cols + j] = v;
      t += v * w[j]!;
    }
    y[i] = t + noiseSd * r.normal();
  }
  return { rows, cols, x, y };
}

describe('fitBLR', () => {
  it('recovers known weights and the noise level', () => {
    const w = [0.8, -0.5, 0.3, 0, 1.2];
    const fit = fitBLR(data(400, w, 0.1), [{ name: 'all', cols: [0, 1, 2, 3, 4] }]);
    w.forEach((v, j) => expect(Math.abs(fit.mean[j]! - v)).toBeLessThan(4 * Math.sqrt(fit.varDiag[j]!) + 1e-3));
    expect(Math.sqrt(1 / fit.beta)).toBeCloseTo(0.1, 1);
  });

  it('shrinks a group that does not matter and leaves the one that does', () => {
    const fit = fitBLR(data(150, [0.9, -0.7, 0, 0, 0, 0], 0.3, 4), [
      { name: 'useful', cols: [0, 1] },
      { name: 'noise', cols: [2, 3, 4, 5] },
    ]);
    expect(fit.alphas.noise).toBeGreaterThan(20 * fit.alphas.useful!);
    for (const j of [2, 3, 4, 5]) expect(Math.abs(fit.mean[j]!)).toBeLessThan(0.08);
  });

  it('matches the closed form when the precisions are fixed', () => {
    const d = { rows: 3, cols: 2, x: new Float64Array([1, 0, 0, 1, 1, 1]), y: new Float64Array([1, 2, 4]) };
    const fit = fitBLR(d, [{ name: 'w', cols: [0, 1], alpha: 0.5 }], { beta: 2 });
    // A = 2 XᵀX + 0.5 I = [[4.5, 2], [2, 4.5]], b = 2 Xᵀy = [10, 12]
    const det = 4.5 * 4.5 - 4;
    expect(fit.mean[0]).toBeCloseTo((4.5 * 10 - 2 * 12) / det, 10);
    expect(fit.mean[1]).toBeCloseTo((4.5 * 12 - 2 * 10) / det, 10);
    expect(fit.varDiag[0]).toBeCloseTo(4.5 / det, 10);
  });

  it('treats a row weight like that many copies of the row', () => {
    const base = data(30, [0.5, -0.2], 0.2, 9);
    const twice = { rows: 60, cols: 2, x: new Float64Array([...base.x, ...base.x]), y: new Float64Array([...base.y, ...base.y]) };
    const weighted = { ...base, w: new Float64Array(30).fill(2) };
    const g: Group[] = [{ name: 'w', cols: [0, 1], alpha: 1 }];
    const a = fitBLR(twice, g, { beta: 4 });
    const b = fitBLR(weighted, g, { beta: 4 });
    expect(b.mean[0]).toBeCloseTo(a.mean[0]!, 10);
    expect(b.varDiag[1]).toBeCloseTo(a.varDiag[1]!, 10);
  });

  it('falls back to the prior mean where there is no data, and never returns NaN', () => {
    const d = { rows: 2, cols: 3, x: new Float64Array([1, 0, 0, 1, 0, 0]), y: new Float64Array([0.5, 0.7]) };
    const fit = fitBLR(d, [{ name: 'seen', cols: [0] }, { name: 'unseen', cols: [1, 2], priorMean: [0.3, -0.2] }]);
    expect(fit.mean[1]).toBeCloseTo(0.3, 3);
    expect(fit.mean[2]).toBeCloseTo(-0.2, 3);
    expect([...fit.mean, fit.beta, fit.logEvidence].every(Number.isFinite)).toBe(true);
    const p = predict(fit, new Float64Array([1, 0, 0]));
    expect(p.mean).toBeCloseTo(fit.mean[0]!, 10);
    expect(p.variance).toBeGreaterThan(0);
  });

  it('prefers the true model by evidence', () => {
    const d = data(120, [0.6, 0], 0.3, 11);
    const right = fitBLR({ ...d, cols: 1, x: d.x.filter((_, i) => i % 2 === 0) }, [{ name: 'w', cols: [0] }]);
    const wrong = fitBLR({ ...d, cols: 1, x: d.x.filter((_, i) => i % 2 === 1) }, [{ name: 'w', cols: [0] }]);
    expect(right.logEvidence).toBeGreaterThan(wrong.logEvidence + 10);
  });
});
