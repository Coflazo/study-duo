import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { displayMs, initialState, LATE_GRACE_MS, reduce, type Segment, type TimerEvent, type TimerState } from './timer';

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

describe('completion', () => {
  const started = () => play([[{ type: 'start', taskId: 'read' }, T0]]).state;

  it('tick before endsAt changes nothing', () => {
    const s = started();
    expect(reduce(s, { type: 'tick' }, S, T0 + 24 * MIN).state).toBe(s);
  });

  it('tick at endsAt logs a completed focus and starts the short break at endsAt', () => {
    const r = reduce(started(), { type: 'tick' }, S, T0 + 25 * MIN + 2000);
    expect(r.segments).toEqual([
      { phase: 'focus', startedAt: T0, endedAt: T0 + 25 * MIN, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0, completed: true, taskId: 'read' },
    ]);
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'running', startedAt: T0 + 25 * MIN, endsAt: T0 + 30 * MIN, cycle: 1, taskId: 'read' });
  });

  it('after a break, focus waits for the user by default', () => {
    const r = play([[{ type: 'start' }, T0], [{ type: 'tick' }, T0 + 25 * MIN], [{ type: 'tick' }, T0 + 30 * MIN]]);
    expect(r.state).toMatchObject({ phase: 'focus', status: 'stopped', cycle: 1 });
    expect(r.segments.map((s) => s.phase)).toEqual(['focus', 'shortBreak']);
  });

  it('the fourth completed focus leads to a long break, after which the cycle resets', () => {
    const events: Array<[TimerEvent, number]> = [];
    let t = T0;
    for (let i = 0; i < 4; i++) {
      events.push([{ type: 'start' }, t], [{ type: 'tick' }, t + 25 * MIN]);
      t += 25 * MIN;
      if (i < 3) {
        events.push([{ type: 'tick' }, t + 5 * MIN]);
        t += 5 * MIN;
      }
    }
    const afterFour = play(events).state;
    expect(afterFour).toMatchObject({ phase: 'longBreak', status: 'running', cycle: 4, endsAt: t + 15 * MIN });
    const afterLong = reduce(afterFour, { type: 'tick' }, S, t + 15 * MIN).state;
    expect(afterLong).toMatchObject({ phase: 'focus', status: 'stopped', cycle: 0 });
  });

  it('a phase end noticed after the grace window logs once and does not invent sessions (laptop slept)', () => {
    const all = { ...S, autoStartBreaks: true, autoStartFocus: true };
    const s = play([[{ type: 'start' }, T0]], all).state;
    const r = reduce(s, { type: 'tick' }, all, T0 + 25 * MIN + 3 * 60 * MIN);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ phase: 'focus', endedAt: T0 + 25 * MIN, completed: true });
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'stopped' });
  });

  it('a phase end noticed inside the grace window still auto-starts on schedule', () => {
    const r = reduce(started(), { type: 'tick' }, S, T0 + 25 * MIN + LATE_GRACE_MS);
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'running', startedAt: T0 + 25 * MIN });
  });

  it('editing settings mid-phase does not move the running end time', () => {
    const r = reduce(started(), { type: 'tick' }, { ...S, focusMin: 50 }, T0 + 25 * MIN);
    expect(r.segments[0]).toMatchObject({ endedAt: T0 + 25 * MIN, plannedMs: 25 * MIN });
  });

  it('skip while paused counts the open pause and marks the focus incomplete', () => {
    const r = play([
      [{ type: 'start' }, T0],
      [{ type: 'pause' }, T0 + 10 * MIN],
      [{ type: 'skip' }, T0 + 14 * MIN],
    ]);
    expect(r.segments[0]).toMatchObject({ completed: false, activeMs: 10 * MIN, pausedMs: 4 * MIN, endedAt: T0 + 14 * MIN });
    expect(r.state).toMatchObject({ phase: 'shortBreak', cycle: 0 });
  });

  it('reset logs an incomplete segment and returns to a stopped focus, keeping the task', () => {
    const r = play([[{ type: 'start', taskId: 'math' }, T0], [{ type: 'reset' }, T0 + 7 * MIN]]);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ completed: false, activeMs: 7 * MIN });
    expect(r.state).toMatchObject({ phase: 'focus', status: 'stopped', cycle: 0, taskId: 'math' });
  });

  it('skip while stopped moves to the next phase without a segment', () => {
    const r = reduce(initialState(), { type: 'skip' }, S, T0);
    expect(r.segments).toEqual([]);
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'stopped' });
  });
});

describe('flowtime', () => {
  const F = { ...DEFAULT_SETTINGS, mode: 'flowtime' as const };

  it('focus counts up and finishing earns a break of focus / ratio', () => {
    const r = play([[{ type: 'start' }, T0], [{ type: 'finish' }, T0 + 50 * MIN]], F);
    expect(r.segments[0]).toMatchObject({ phase: 'focus', plannedMs: null, activeMs: 50 * MIN, completed: true });
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'running', endsAt: T0 + 60 * MIN, nextBreakMs: 10 * MIN });
    expect(displayMs(play([[{ type: 'start' }, T0]], F).state, F, T0 + 3 * MIN)).toEqual({ ms: 3 * MIN, countsUp: true });
  });

  it('the earned break has a one minute floor and is cleared after the break', () => {
    const r = play([[{ type: 'start' }, T0], [{ type: 'finish' }, T0 + 2 * MIN], [{ type: 'tick' }, T0 + 3 * MIN]], F);
    expect(r.segments[1]).toMatchObject({ phase: 'shortBreak', plannedMs: MIN });
    expect(r.state).toMatchObject({ phase: 'focus', status: 'stopped', nextBreakMs: null });
  });
});
