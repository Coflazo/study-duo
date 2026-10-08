import type { ActivityRecord, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { addRow, emptyStats, fitStats, predict, type Group } from './blr';
import { buildFeatures } from './features';

/**
 * Walk-forward check of the insights model: each block's rating is predicted from blocks that ended before it started,
 * and compared with the plain average of those earlier ratings. One feature space for all blocks; the statistics grow
 * block by block, and the model is refitted every `step` blocks (with precisions held fixed when given: one
 * factorisation per refit).
 */
export function walkForward(
  input: { sessions: SessionRecord[]; listens: ListenRecord[]; activity: ActivityRecord[] },
  opts: { minTrain?: number; step?: number; alphas?: Record<string, number>; beta?: number } = {},
) {
  const minTrain = opts.minTrain ?? 15;
  const step = opts.step ?? 5;
  const f = buildFeatures(input);
  const { cols: p, x, y } = f.design;
  const groups: Group[] = opts.alphas ? f.groups.map((g) => ({ ...g, alpha: g.alpha ?? opts.alphas![g.name] ?? 1 })) : f.groups;
  const ended = f.blocks.map((b) => input.sessions.find((s) => s.id === b.id)!.endedAt);
  const stats = emptyStats(p);
  let added = 0;
  let modelErr = 0;
  let baseErr = 0;
  let n = 0;
  for (let i = minTrain; i < f.blocks.length; i += step) {
    const cutoff = f.blocks[i]!.startedAt;
    // Rows are in start order; add every block that ended before this one started.
    while (added < i && ended[added]! <= cutoff) {
      addRow(stats, x.subarray(added * p, (added + 1) * p), y[added]!);
      added++;
    }
    if (added < minTrain) continue;
    const fit = fitStats(stats, groups, opts.alphas ? { beta: opts.beta, iterations: 1 } : { iterations: 25 });
    const avg = stats.ySum / stats.nEff;
    for (let r = i; r < Math.min(i + step, f.blocks.length); r++) {
      const guess = predict(fit, x.subarray(r * p, (r + 1) * p)).mean;
      modelErr += Math.abs(guess - y[r]!);
      baseErr += Math.abs(avg - y[r]!);
      n++;
    }
  }
  return { modelMae: n ? modelErr / n : NaN, baselineMae: n ? baseErr / n : NaN, n };
}
