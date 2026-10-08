import { recordsBetween } from '@/core/log';
import { sessionsBetween, type SessionRecord } from '@/core/sessions';
import type { Measure } from '@/core/settings';
import { blockSignals } from '@/core/signals';
import { calibrate, shouldAskRating } from './focus-index';

const LOOK_BACK_MS = 120 * 86_400_000;

/**
 * Whether the popup should ask how focused a finished block felt: always until the focus index matches the user's
 * ratings, then only when the index is unsure about this block (spec: the prompt appears when the index is unsure).
 * Any failure asks, so a rating is never lost to an error.
 */
export async function askForRating(block: SessionRecord, measure: Measure, now = Date.now()): Promise<boolean> {
  try {
    const from = now - LOOK_BACK_MS;
    const [sessions, activity, blocks] = await Promise.all([sessionsBetween(from, now + 1), recordsBetween('activity', from, now + 1), recordsBetween('blocks', from, now + 1)]);
    const all = sessions.sort((a, b) => a.startedAt - b.startedAt);
    const withSignals = all.map((s, i) => ({ s, signals: blockSignals({ block: s, activity, blocks, previous: all[i - 1] ?? null, measure }) }));
    const index = calibrate(withSignals.filter(({ s }) => s.phase === 'focus' && s.id !== block.id).map(({ s, signals }) => ({ id: s.id, rating: s.rating, signals })));
    const mine = withSignals.find(({ s }) => s.id === block.id)?.signals ?? {};
    return shouldAskRating(index, mine);
  } catch (e) {
    console.error(e);
    return true;
  }
}
