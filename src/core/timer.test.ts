import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { displayMs, initialState, reduce, type Segment, type TimerEvent, type TimerState } from './timer';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 7, 9, 0, 0);
const S = DEFAULT_SETTINGS;

function play(events: Array<[TimerEvent, number]>, settings = S, from: TimerState = initialState()) {
  let state = from;
  const segments: Segment[] = [];
  for (const [event, now] of events) {
    const r = reduce(state, event, settings, now);
    state = r.state;
    segments.push(...r.segments);
  }
  return { state, segments };
}

describe('start, pause, resume, extend', () => {
  it('start runs a 25 minute focus', () => {
    const { state } = play([[{ type: 'start' }, T0]]);
    expect(state).toMatchObject({ phase: 'focus', status: 'running', startedAt: T0, endsAt: T0 + 25 * MIN, plannedMs: 25 * MIN, pausedMs: 0 });
  });

  it('pause stores the remaining time and resume moves endsAt', () => {
    const { state } = play([
      [{ type: 'start' }, T0],
      [{ type: 'pause' }, T0 + 10 * MIN],
      [{ type: 'resume' }, T0 + 13 * MIN],
    ]);
    expect(state).toMatchObject({ status: 'running', endsAt: T0 + 28 * MIN, pausedMs: 3 * MIN, remainingMs: null, pausedAt: null });
  });

  it('extend adds time while running and while paused', () => {
    const running = play([[{ type: 'start' }, T0], [{ type: 'extend', ms: 5 * MIN }, T0 + MIN]]).state;
    expect(running).toMatchObject({ endsAt: T0 + 30 * MIN, plannedMs: 30 * MIN });
    const paused = play([[{ type: 'start' }, T0], [{ type: 'pause' }, T0 + MIN], [{ type: 'extend', ms: 5 * MIN }, T0 + 2 * MIN]]).state;
    expect(paused).toMatchObject({ remainingMs: 29 * MIN, plannedMs: 30 * MIN });
  });

  it('ignores events that do not apply and returns the same object', () => {
    const s = initialState();
    expect(reduce(s, { type: 'pause' }, S, T0).state).toBe(s);
    const running = reduce(s, { type: 'start' }, S, T0).state;
    expect(reduce(running, { type: 'start' }, S, T0 + 1).state).toBe(running);
  });

  it('toggle starts, pauses and resumes', () => {
    const a = play([[{ type: 'toggle' }, T0]]).state;
    expect(a.status).toBe('running');
    const b = reduce(a, { type: 'toggle' }, S, T0 + MIN).state;
    expect(b.status).toBe('paused');
    const c = reduce(b, { type: 'toggle' }, S, T0 + 2 * MIN).state;
    expect(c.status).toBe('running');
  });

  it('start keeps a task id', () => {
    expect(play([[{ type: 'start', taskId: 't1' }, T0]]).state.taskId).toBe('t1');
  });
});

describe('displayMs', () => {
  it('shows the full length when stopped, remaining when running, frozen when paused', () => {
    expect(displayMs(initialState(), S, T0)).toEqual({ ms: 25 * MIN, countsUp: false });
    const run = play([[{ type: 'start' }, T0]]).state;
    expect(displayMs(run, S, T0 + MIN)).toEqual({ ms: 24 * MIN, countsUp: false });
    const paused = reduce(run, { type: 'pause' }, S, T0 + 2 * MIN).state;
    expect(displayMs(paused, S, T0 + 9 * MIN)).toEqual({ ms: 23 * MIN, countsUp: false });
    expect(displayMs(run, S, T0 + 99 * MIN)).toEqual({ ms: 0, countsUp: false });
  });
});
