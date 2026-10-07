import { describe, expect, it } from 'vitest';
import { IDLE_TRACKER, track, type TrackerEvent, type TrackerState } from './activity';
import type { ActivityRecord } from './db';
import type { Sites } from './sites';

const SITES: Sites = { 'khanacademy.org': 'study', 'youtube.com': 'blocked', 'music.youtube.com': 'neutral' };
const MIN = 60_000;

/** Runs events at the given minutes and returns every closed record as [category, domain, phase, minutes]. */
function run(events: Array<[number, TrackerEvent]>, sites: Sites = SITES): Array<[string, string | null, string, number]> {
  let state: TrackerState = IDLE_TRACKER;
  const out: ActivityRecord[] = [];
  for (const [min, e] of events) {
    const r = track(state, e, min * MIN, sites);
    state = r.state;
    out.push(...r.closed);
  }
  return out.map((r) => [r.category, r.domain, r.phase, (r.endedAt - r.startedAt) / MIN]);
}

describe('track', () => {
  it('records nothing while the timer is stopped or paused', () => {
    expect(run([[0, { type: 'focus', host: 'youtube.com' }], [5, { type: 'away' }], [6, { type: 'back' }], [9, { type: 'focus', host: 'khanacademy.org' }]])).toEqual([]);
  });

  it('splits a block by the kind of site in front, using the most specific filed entry', () => {
    expect(run([
      [0, { type: 'focus', host: 'khanacademy.org' }],
      [0, { type: 'timer', phase: 'focus' }],
      [10, { type: 'focus', host: 'youtube.com' }],
      [12, { type: 'focus', host: 'music.youtube.com' }],
      [15, { type: 'focus', host: 'news.example' }],
      [16, { type: 'timer', phase: null }],
    ])).toEqual([
      ['study', 'khanacademy.org', 'focus', 10],
      ['blocked', 'youtube.com', 'focus', 2],
      ['neutral', 'music.youtube.com', 'focus', 3],
      ['unfiled', 'news.example', 'focus', 1],
    ]);
  });

  it('counts time away from the browser as unobserved, never as distraction', () => {
    expect(run([
      [0, { type: 'focus', host: 'khanacademy.org' }],
      [0, { type: 'timer', phase: 'focus' }],
      [5, { type: 'away' }],
      [9, { type: 'back' }],
      [25, { type: 'timer', phase: 'shortBreak' }],
    ])).toEqual([
      ['study', 'khanacademy.org', 'focus', 5],
      ['unobserved', null, 'focus', 4],
      ['study', 'khanacademy.org', 'focus', 16],
    ]);
  });

  it('keeps one record for one site, and splits at a phase change', () => {
    expect(run([
      [0, { type: 'focus', host: 'khanacademy.org' }],
      [0, { type: 'timer', phase: 'focus' }],
      [3, { type: 'focus', host: 'khanacademy.org' }], // another page on the same site
      [25, { type: 'timer', phase: 'shortBreak' }],
      [30, { type: 'timer', phase: null }],
    ])).toEqual([
      ['study', 'khanacademy.org', 'focus', 25],
      ['study', 'khanacademy.org', 'shortBreak', 5],
    ]);
  });

  it('files pages without a web address (new tab, settings, PDF viewer) as neutral with no site', () => {
    expect(run([[0, { type: 'timer', phase: 'focus' }], [0, { type: 'focus', host: null }], [2, { type: 'timer', phase: null }]])).toEqual([['neutral', null, 'focus', 2]]);
  });

  it('starts a new record when the site is filed mid-visit', () => {
    let state = track(IDLE_TRACKER, { type: 'focus', host: 'news.example' }, 0, SITES).state;
    state = track(state, { type: 'timer', phase: 'focus' }, 0, SITES).state;
    const filed = { ...SITES, 'news.example': 'study' as const };
    const r = track(state, { type: 'sites' }, 4 * MIN, filed);
    expect(r.closed.map((c) => [c.category, c.domain])).toEqual([['unfiled', 'news.example']]);
    expect(r.state.open).toMatchObject({ category: 'study', domain: 'news.example', startedAt: 4 * MIN });
  });

  it('drops empty records and gives each record a stable id', () => {
    let state = track(IDLE_TRACKER, { type: 'timer', phase: 'focus' }, 0, SITES).state;
    const r = track(state, { type: 'focus', host: 'youtube.com' }, 0, SITES); // switched at the same instant
    expect(r.closed).toEqual([]);
    state = r.state;
    const done = track(state, { type: 'timer', phase: null }, MIN, SITES).closed[0]!;
    expect(done.id).toBe('0-focus-youtube.com');
  });
});

describe('input counts', () => {
  it('adds counts to the open study record, one active minute per report with input', () => {
    let s = track(IDLE_TRACKER, { type: 'focus', host: 'khanacademy.org' }, 0, SITES).state;
    s = track(s, { type: 'timer', phase: 'focus' }, 0, SITES).state;
    s = track(s, { type: 'input', host: 'khanacademy.org', keys: 40, clicks: 2, scrolls: 0 }, MIN, SITES).state;
    s = track(s, { type: 'input', host: 'khanacademy.org', keys: 10, clicks: 0, scrolls: 5 }, 2 * MIN, SITES).state;
    const [r] = track(s, { type: 'timer', phase: null }, 3 * MIN, SITES).closed;
    expect(r).toMatchObject({ keys: 50, clicks: 2, scrolls: 5, inputMinutes: 2 });
  });

  it('ignores counts outside study blocks', () => {
    let s = track(IDLE_TRACKER, { type: 'timer', phase: 'shortBreak' }, 0, SITES).state;
    s = track(s, { type: 'input', host: null, keys: 40, clicks: 2, scrolls: 0 }, MIN, SITES).state;
    const [r] = track(s, { type: 'timer', phase: null }, 2 * MIN, SITES).closed;
    expect(r!.keys).toBeUndefined();
    expect(track(IDLE_TRACKER, { type: 'input', host: 'khanacademy.org', keys: 1, clicks: 0, scrolls: 0 }, 0, SITES).state).toEqual(IDLE_TRACKER);
  });
});

describe('late input counts', () => {
  it('adds counts that arrive just after leaving a page to the record of that page, and saves it again', () => {
    let s = track(IDLE_TRACKER, { type: 'focus', host: 'khanacademy.org' }, 0, SITES).state;
    s = track(s, { type: 'timer', phase: 'focus' }, 0, SITES).state;
    const left = track(s, { type: 'focus', host: 'news.example' }, 5 * MIN, SITES);
    expect(left.closed).toHaveLength(1);
    const late = track(left.state, { type: 'input', host: 'khanacademy.org', keys: 5, clicks: 2, scrolls: 1 }, 5 * MIN + 800, SITES);
    expect(late.closed).toEqual([{ ...left.closed[0], keys: 5, clicks: 2, scrolls: 1, inputMinutes: 1 }]);
    expect(late.state.open).toMatchObject({ domain: 'news.example' }); // the open record is untouched
    expect(track(left.state, { type: 'input', host: 'khanacademy.org', keys: 5, clicks: 0, scrolls: 0 }, 5 * MIN + 30_000, SITES).closed).toEqual([]); // too late
    expect(track(left.state, { type: 'input', host: 'reddit.com', keys: 5, clicks: 0, scrolls: 0 }, 5 * MIN + 800, SITES).closed).toEqual([]); // another site
  });
});

