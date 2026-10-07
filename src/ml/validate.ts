import type { ActivityRecord, ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { fitBLR, predict } from './blr';
import { buildFeatures } from './features';

/**
 * Walk-forward check of the insights model: each block's rating is predicted from blocks that ended before it started,
 * and compared with the plain average of those earlier ratings. Refits every `step` blocks to keep it quick.
 */
export function walkForward(input: { sessions: SessionRecord[]; listens: ListenRecord[]; activity: ActivityRecord[] }, opts: { minTrain?: number; step?: number } = {}) {
  const minTrain = opts.minTrain ?? 15;
  const step = opts.step ?? 5;
  const rated = input.sessions.filter((s) => s.phase === 'focus' && s.rating !== null).sort((a, b) => a.startedAt - b.startedAt);
  let modelErr = 0;
  let baseErr = 0;
  let n = 0;
  for (let i = minTrain; i < rated.length; i += step) {
    const cutoff = rated[i]!.startedAt;
    const past = rated.filter((s) => s.endedAt <= cutoff);
    const ahead = rated.slice(i, i + step);
    // One feature space for past and ahead blocks, fitted on the past only.
    const all = buildFeatures({ ...input, sessions: [...past, ...ahead] });
    const train = { ...all.design, rows: past.length, x: all.design.x.subarray(0, past.length * all.design.cols), y: all.design.y.subarray(0, past.length), w: all.design.w!.subarray(0, past.length) };
    const fit = fitBLR(train, all.groups, { iterations: 25 });
    const avg = train.y.reduce((s, v) => s + v, 0) / past.length;
    for (let k = 0; k < ahead.length; k++) {
      const r = past.length + k;
      const truth = all.design.y[r]!;
      const guess = predict(fit, all.design.x.subarray(r * all.design.cols, (r + 1) * all.design.cols)).mean;
      modelErr += Math.abs(guess - truth);
      baseErr += Math.abs(avg - truth);
      n++;
    }
  }
  return { modelMae: n ? modelErr / n : NaN, baselineMae: n ? baseErr / n : NaN, n };
}
