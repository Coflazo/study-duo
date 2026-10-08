import { recordsBetween } from '@/core/log';
import { sessionsBetween, type SessionRecord } from '@/core/sessions';
import type { Measure } from '@/core/settings';
import { calibrate, shouldAskRating } from './focus-index';
import { indexBlocks } from './insights';

/**
 * Whether the popup should ask how focused a finished block felt: always until the focus index matches the user's
 * ratings, then only when the index is unsure about this block (spec: the prompt appears when the index is unsure).
 * Same data window as the Insights screen, so the two never disagree about whether the index is ready. Any failure
 * asks, so a rating is never lost to an error.
 */
export async function askForRating(block: SessionRecord, measure: Measure, now = Date.now()): Promise<boolean> {
  try {
    const [sessions, activity, blocks] = await Promise.all([sessionsBetween(0, now + 1), recordsBetween('activity', 0, now + 1), recordsBetween('blocks', 0, now + 1)]);
    const all = indexBlocks(sessions, activity, blocks, measure);
    const index = calibrate(all.filter((b) => b.id !== block.id));
    return shouldAskRating(index, all.find((b) => b.id === block.id)?.signals ?? {});
  } catch (e) {
    console.error(e);
    return true;
  }
}
