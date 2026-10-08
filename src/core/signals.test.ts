import { describe, expect, it } from 'vitest';
import type { ActivityRecord, BlockedAttempt } from './db';
import type { SessionRecord } from './sessions';
import { DEFAULT_SETTINGS } from './settings';
import { blockSignals } from './signals';

const MIN = 60_000;
const T = 1_800_000_000_000;
const block: SessionRecord = { id: 'b', phase: 'focus', startedAt: T, endedAt: T + 30 * MIN, plannedMs: 30 * MIN, activeMs: 28 * MIN, pausedMs: 2 * MIN, extendedMs: 5 * MIN, completed: true, taskId: null, rating: null, ratingSkipped: false };
const breakBefore: SessionRecord = { ...block, id: 'p', phase: 'shortBreak', startedAt: T - 10 * MIN, endedAt: T - 3 * MIN, extendedMs: 0 };
const a = (from: number, to: number, category: ActivityRecord['category'], domain: string | null): ActivityRecord => ({ id: `${from}`, startedAt: T + from * MIN, endedAt: T + to * MIN, category, domain, phase: 'focus' });
const activity = [
  a(-5, 0, 'study', 'khanacademy.org'), // before the block: clipped away
  a(0, 8, 'study', 'khanacademy.org'),
  a(8, 12, 'study', 'docs.python.org'), // still studying: one stretch of 12 min
  a(12, 14, 'blocked', 'youtube.com'),
  a(14, 18, 'unobserved', null),
  a(18, 20, 'unfiled', 'news.example'),
  a(20, 30, 'study', 'khanacademy.org'),
];
const blocks: BlockedAttempt[] = [
  { id: '1', at: T + 12 * MIN, domain: 'youtube.com', unlocked: true, reasonGiven: true },
  { id: '2', at: T + 19 * MIN, domain: 'reddit.com', unlocked: false, reasonGiven: false },
  { id: '3', at: T + 40 * MIN, domain: 'reddit.com', unlocked: false, reasonGiven: false }, // after the block
];

describe('blockSignals', () => {
  it('works out every signal from one block', () => {
    expect(blockSignals({ block, activity, blocks, previous: breakBefore, measure: DEFAULT_SETTINGS.measure })).toEqual({
      studyShare: 22 / 26, // study minutes over observed minutes (unobserved time left out)
      offSwitchesPerHour: 2 / (28 / 60),
      blockedAttempts: 2,
      unlocks: 1,
      longestStudyMin: 12,
      unobservedMin: 4,
      pausedMin: 2,
      extendedMin: 5,
      completed: 1,
      startDelayMin: 3,
    });
  });

  it('leaves out what the user switched off', () => {
    const measure = { ...DEFAULT_SETTINGS.measure, sites: false, blocked: false, away: false, outcome: false };
    expect(blockSignals({ block, activity, blocks, previous: breakBefore, measure })).toEqual({});
  });

  it('claims nothing it has too little data for', () => {
    const short = { ...block, endedAt: T + 30_000, activeMs: 30_000 };
    const s = blockSignals({ block: short, activity: [], blocks: [], previous: null, measure: DEFAULT_SETTINGS.measure });
    expect(s.studyShare).toBeUndefined();
    expect(s.offSwitchesPerHour).toBeUndefined();
    expect(s.startDelayMin).toBeUndefined();
    expect(s).toMatchObject({ blockedAttempts: 0, unlocks: 0, completed: 1 });
  });

  it('only counts a start delay after a recent break', () => {
    const longAgo = { ...breakBefore, endedAt: T - 3 * 60 * MIN };
    expect(blockSignals({ block, activity, blocks, previous: longAgo, measure: DEFAULT_SETTINGS.measure }).startDelayMin).toBeUndefined();
    const lastFocus = { ...breakBefore, phase: 'focus' as const };
    expect(blockSignals({ block, activity, blocks, previous: lastFocus, measure: DEFAULT_SETTINGS.measure }).startDelayMin).toBeUndefined();
  });
});

describe('input share', () => {
  it('is the share of active minutes with any input, only when counting was on', () => {
    const withInput = activity.map((r) => (r.category === 'study' && r.startedAt >= T ? { ...r, keys: 10, clicks: 1, scrolls: 0, inputMinutes: 7 } : r));
    const on = { ...DEFAULT_SETTINGS.measure, input: true };
    expect(blockSignals({ block, activity: withInput, blocks, previous: null, measure: on }).inputShare).toBe(21 / 28);
    expect(blockSignals({ block, activity, blocks, previous: null, measure: on }).inputShare).toBeUndefined();
    expect(blockSignals({ block, activity: withInput, blocks, previous: null, measure: DEFAULT_SETTINGS.measure }).inputShare).toBeUndefined();
  });
});

describe('switches', () => {
  it('counts a switch to an off-task site once, not again after a pause or time away on it', () => {
    const steps = [
      a(0, 10, 'study', 'khanacademy.org'),
      a(10, 12, 'blocked', 'youtube.com'),
      a(12, 14, 'unobserved', null),
      a(14, 16, 'blocked', 'youtube.com'), // back on the same site after time away: not a new switch
      a(16, 20, 'study', 'khanacademy.org'),
      a(20, 22, 'unfiled', 'news.example'),
      a(22, 30, 'study', 'khanacademy.org'),
    ];
    expect(blockSignals({ block, activity: steps, blocks: [], previous: null, measure: DEFAULT_SETTINGS.measure }).offSwitchesPerHour).toBeCloseTo(2 / (28 / 60));
  });
});

