import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { addSessions, sessionsBetween } from '@/core/sessions';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { askForRating } from './ask';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('askForRating', () => {
  it('asks while the focus index has too few rated blocks to go on', async () => {
    const now = Date.now();
    await addSessions([{ phase: 'focus', startedAt: now - 30 * 60_000, endedAt: now - 5 * 60_000, plannedMs: 25 * 60_000, activeMs: 25 * 60_000, pausedMs: 0, completed: true, taskId: null }]);
    const [block] = await sessionsBetween(0, now + 1);
    expect(await askForRating(block!, DEFAULT_SETTINGS.measure, now)).toBe(true);
  });

  it('asks when anything goes wrong, so a rating is never lost', async () => {
    globalThis.indexedDB = undefined as never;
    expect(await askForRating({ id: 'x', phase: 'focus', startedAt: 0, endedAt: 1, plannedMs: 1, activeMs: 1, pausedMs: 0, completed: true, taskId: null, rating: null, ratingSkipped: false }, DEFAULT_SETTINGS.measure)).toBe(true);
  });
});
