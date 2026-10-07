# S1 Timer Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Pomodoro/Flowtime timer in the extension: state machine, persistence, alarms, toolbar badge and progress icon, a synthesized bell, notifications, keyboard shortcuts, idle pause, and a bare popup to drive it.

**Architecture:** A pure reducer (`src/core/timer.ts`) owns all timer logic and is fed explicit `now` timestamps, so sleep and service-worker restarts cannot drift it. A thin background service serializes events through a promise queue, persists state with WXT storage, and applies side effects (alarms, badge, icon, bell, notification). The bell is Web Audio additive synthesis (no audio file, no license), played in an offscreen document on Chromium and directly in the background page on Firefox.

**Tech Stack:** WXT 0.21.4, TypeScript 5.9 (strict, `noUncheckedIndexedAccess`), Svelte 5 (popup), Vitest 5 with `WxtVitest()` + `@webext-core/fake-browser`.

**Spec:** `docs/superpowers/specs/2026-10-07-study-duo-design.md` (sections: Features v0.1 Timer + Toolbar icon, Architecture: Timer engine, Security & privacy).

## Global Constraints

- No network: extension CSP stays `connect-src 'self'`; no `fetch` anywhere in S1.
- No new runtime dependencies in S1 (only `idb`, already installed, and it is not used yet).
- $0: no paid services, assets or tools.
- User-facing strings: short, plain, zero em dashes or en dashes.
- Every message from another context is parsed by `parseMessage` and `sender.id` is checked before use.
- Default timings: focus 25 min, short break 5, long break 15, long break after every 4 completed focus blocks; auto-start breaks on, auto-start focus off; idle pause off.
- Permissions stay as in `wxt.config.ts` (`storage`, `unlimitedStorage`, `alarms`, `notifications`, `idle`, `offscreen` on Chromium). S1 adds `commands` (not a permission).
- Firefox build must compile (`npm run build:firefox`); Chrome is the priority target.

## Review Focus

1. **Laptop slept through a phase end** (alarm fires hours late with auto-start on): exactly one completed segment is logged at `endsAt`; the next phase waits stopped instead of fabricating sessions. Test in Task 2.
2. **Two ticks at once** (phase-end alarm and the popup hitting 00:00 together): one completed segment, not two. Test in Task 5.
3. **Settings edited mid-phase** (focus length changed while running): the running phase keeps its `endsAt`; the new length applies to the next phase. Test in Task 2.
4. **Browser restart with a running timer** (service worker cold start): alarms and badge are rebuilt from stored state. Test in Task 5.
5. **Pause, extend, resume, skip while paused**: remaining time stays consistent and paused time is excluded from active time. Tests in Tasks 1 and 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/settings.ts` | `TimerSettings` type, defaults, `normalizeSettings` (clamps untrusted input) |
| `src/core/timer.ts` | Timer state/types, pure `reduce`, `displayMs`, `remainingMs`, `elapsedMs`, `nextPhase` |
| `src/core/format.ts` | `formatClock(ms, countsUp)` for mm:ss / h:mm:ss |
| `src/core/badge.ts` | `badgeText`, `badgeColor` (pure) |
| `src/core/messages.ts` | Message types and `parseMessage` validator |
| `src/core/bell.ts` | Bell partials, `strikes`, `bellKindFor`, `playBell(ctx, kind, volume)` |
| `src/core/phase-copy.ts` | Notification titles per phase (S3 replaces with the phrase bank) |
| `src/core/store.ts` | WXT storage items `settingsItem`, `timerItem`, loaders |
| `src/background/effects.ts` | Alarms, badge, icon ring, bell, notification side effects |
| `src/background/timer-service.ts` | `createTimerService(deps)`: serialized dispatch |
| `src/entrypoints/background.ts` | Listener wiring |
| `src/entrypoints/offscreen/index.html`, `main.ts` | Chromium-only page that plays the bell |
| `src/entrypoints/popup/App.svelte` | Bare controls (styled in S5 after Figma) |
| `wxt.config.ts` | Add `commands` |
| Tests next to sources: `*.test.ts` | |

---

### Task 1: Settings and timer basics (start, pause, resume, extend, toggle, display)

**Files:**
- Create: `src/core/settings.ts`, `src/core/timer.ts`, `src/core/format.ts`
- Test: `src/core/settings.test.ts`, `src/core/timer.test.ts`, `src/core/format.test.ts`

**Interfaces:**
- Produces:
  - `type TimerMode = 'pomodoro' | 'flowtime'`; `interface TimerSettings { mode; focusMin; shortBreakMin; longBreakMin; longBreakEvery; autoStartBreaks; autoStartFocus; flowBreakRatio; idlePauseMin; bellVolume }`; `DEFAULT_SETTINGS`; `normalizeSettings(raw: unknown): TimerSettings`
  - `type Phase = 'focus' | 'shortBreak' | 'longBreak'`; `type Status = 'stopped' | 'running' | 'paused'`; `interface TimerState`; `interface Segment`; `type TimerEvent`; `interface ReduceResult { state: TimerState; segments: Segment[] }`
  - `initialState(): TimerState`, `reduce(state, event, settings, now): ReduceResult`, `phaseLengthMs(phase, settings, state): number | null`, `remainingMs(state, now): number | null`, `elapsedMs(state, now): number`, `displayMs(state, settings, now): { ms: number; countsUp: boolean }`, `nextPhase(state, settings, completedFocus: boolean): Phase`, `LATE_GRACE_MS = 120_000`
  - `formatClock(ms: number, countsUp: boolean): string`

- [ ] **Step 1: Write the failing tests**

`src/core/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

describe('normalizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps numbers and rejects non-finite values', () => {
    const s = normalizeSettings({ focusMin: 0, shortBreakMin: NaN, longBreakMin: 9999, longBreakEvery: 2.6, bellVolume: 3 });
    expect(s.focusMin).toBe(1);
    expect(s.shortBreakMin).toBe(DEFAULT_SETTINGS.shortBreakMin);
    expect(s.longBreakMin).toBe(120);
    expect(s.longBreakEvery).toBe(3);
    expect(s.bellVolume).toBe(1);
  });
  it('keeps valid values and only known modes', () => {
    const s = normalizeSettings({ mode: 'flowtime', focusMin: 50, autoStartFocus: true });
    expect(s).toMatchObject({ mode: 'flowtime', focusMin: 50, autoStartFocus: true });
    expect(normalizeSettings({ mode: 'evil' }).mode).toBe('pomodoro');
  });
});
```

`src/core/timer.test.ts` (Task 1 part):
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { displayMs, initialState, reduce, type TimerEvent, type TimerState } from './timer';

export const MIN = 60_000;
export const T0 = Date.UTC(2026, 9, 7, 9, 0, 0);
const S = DEFAULT_SETTINGS;

export function play(events: Array<[TimerEvent, number]>, settings = S, from: TimerState = initialState()) {
  let state = from;
  const segments = [];
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
    const s0 = initialState();
    expect(displayMs(s0, S, T0)).toEqual({ ms: 25 * MIN, countsUp: false });
    const run = play([[{ type: 'start' }, T0]]).state;
    expect(displayMs(run, S, T0 + MIN)).toEqual({ ms: 24 * MIN, countsUp: false });
    const paused = reduce(run, { type: 'pause' }, S, T0 + 2 * MIN).state;
    expect(displayMs(paused, S, T0 + 9 * MIN)).toEqual({ ms: 23 * MIN, countsUp: false });
    expect(displayMs(run, S, T0 + 99 * MIN)).toEqual({ ms: 0, countsUp: false });
  });
});
```

`src/core/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatClock } from './format';

describe('formatClock', () => {
  it('rounds countdowns up so 25:00 shows for the first second', () => {
    expect(formatClock(25 * 60_000, false)).toBe('25:00');
    expect(formatClock(25 * 60_000 - 500, false)).toBe('25:00');
    expect(formatClock(25 * 60_000 - 1000, false)).toBe('24:59');
    expect(formatClock(0, false)).toBe('00:00');
  });
  it('rounds count-ups down and adds hours past 60 minutes', () => {
    expect(formatClock(59_999, true)).toBe('00:59');
    expect(formatClock(65 * 60_000, true)).toBe('1:05:00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core`
Expected: FAIL, modules `./settings`, `./timer`, `./format` not found.

- [ ] **Step 3: Implement**

`src/core/settings.ts`:
```ts
export type TimerMode = 'pomodoro' | 'flowtime';

export interface TimerSettings {
  mode: TimerMode;
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Long break after this many completed focus blocks. */
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  /** Flowtime: break = focus time / this ratio. */
  flowBreakRatio: number;
  /** Pause focus after this many idle minutes. 0 = off. */
  idlePauseMin: number;
  /** 0..1 */
  bellVolume: number;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  mode: 'pomodoro',
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  flowBreakRatio: 5,
  idlePauseMin: 0,
  bellVolume: 0.6,
};

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Settings can come from storage or an import file, so treat them as untrusted. */
export function normalizeSettings(raw: unknown): TimerSettings {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    mode: r.mode === 'flowtime' ? 'flowtime' : 'pomodoro',
    focusMin: num(r.focusMin, 1, 180, d.focusMin),
    shortBreakMin: num(r.shortBreakMin, 1, 60, d.shortBreakMin),
    longBreakMin: num(r.longBreakMin, 1, 120, d.longBreakMin),
    longBreakEvery: Math.round(num(r.longBreakEvery, 1, 12, d.longBreakEvery)),
    autoStartBreaks: bool(r.autoStartBreaks, d.autoStartBreaks),
    autoStartFocus: bool(r.autoStartFocus, d.autoStartFocus),
    flowBreakRatio: num(r.flowBreakRatio, 2, 10, d.flowBreakRatio),
    idlePauseMin: num(r.idlePauseMin, 0, 60, d.idlePauseMin),
    bellVolume: num(r.bellVolume, 0, 1, d.bellVolume),
  };
}
```

`src/core/timer.ts` (full file; Task 2 tests exercise the completion half):
```ts
import type { TimerSettings } from './settings';

export type Phase = 'focus' | 'shortBreak' | 'longBreak';
export type Status = 'stopped' | 'running' | 'paused';

export interface TimerState {
  v: 1;
  phase: Phase;
  status: Status;
  /** When the current phase started. */
  startedAt: number | null;
  /** Countdown end while running. Null when stopped, paused or counting up. */
  endsAt: number | null;
  /** Countdown length including extensions. Null for a Flowtime focus (counts up). */
  plannedMs: number | null;
  /** Countdown time left while paused. */
  remainingMs: number | null;
  pausedAt: number | null;
  /** Paused time already closed off in this phase. */
  pausedMs: number;
  /** Completed focus blocks since the last long break. */
  cycle: number;
  /** Flowtime: break earned by the last focus block. */
  nextBreakMs: number | null;
  taskId: string | null;
}

export interface Segment {
  phase: Phase;
  startedAt: number;
  endedAt: number;
  plannedMs: number | null;
  activeMs: number;
  pausedMs: number;
  /** Ran to its planned end (or a Flowtime focus the user finished), not skipped or reset. */
  completed: boolean;
  taskId: string | null;
}

export type TimerEvent =
  | { type: 'start'; taskId?: string | null }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toggle' }
  | { type: 'skip' }
  | { type: 'reset' }
  | { type: 'extend'; ms: number }
  | { type: 'tick' }
  | { type: 'finish' };

export interface ReduceResult {
  state: TimerState;
  segments: Segment[];
}

/** A phase end noticed later than this (laptop asleep) does not auto-start the next phase. */
export const LATE_GRACE_MS = 120_000;
const MIN_FLOW_BREAK_MS = 60_000;

export function initialState(): TimerState {
  return {
    v: 1,
    phase: 'focus',
    status: 'stopped',
    startedAt: null,
    endsAt: null,
    plannedMs: null,
    remainingMs: null,
    pausedAt: null,
    pausedMs: 0,
    cycle: 0,
    nextBreakMs: null,
    taskId: null,
  };
}

export function isBreak(phase: Phase): boolean {
  return phase !== 'focus';
}

export function phaseLengthMs(phase: Phase, settings: TimerSettings, state: TimerState): number | null {
  if (phase === 'focus') return settings.mode === 'flowtime' ? null : settings.focusMin * 60_000;
  if (settings.mode === 'flowtime' && state.nextBreakMs !== null) return state.nextBreakMs;
  return (phase === 'shortBreak' ? settings.shortBreakMin : settings.longBreakMin) * 60_000;
}

export function remainingMs(state: TimerState, now: number): number | null {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.status === 'paused' && state.remainingMs !== null) return state.remainingMs;
  return null;
}

/** Active (unpaused) time spent in the current phase. */
export function elapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === null || state.status === 'stopped') return 0;
  const until = state.status === 'paused' && state.pausedAt !== null ? state.pausedAt : now;
  return Math.max(0, until - state.startedAt - state.pausedMs);
}

export function displayMs(state: TimerState, settings: TimerSettings, now: number): { ms: number; countsUp: boolean } {
  if (state.status === 'stopped') {
    const len = phaseLengthMs(state.phase, settings, state);
    return len === null ? { ms: 0, countsUp: true } : { ms: len, countsUp: false };
  }
  if (state.plannedMs === null) return { ms: elapsedMs(state, now), countsUp: true };
  return { ms: remainingMs(state, now) ?? 0, countsUp: false };
}

export function nextPhase(state: TimerState, settings: TimerSettings, completedFocus: boolean): Phase {
  if (state.phase !== 'focus') return 'focus';
  if (completedFocus && state.cycle + 1 >= settings.longBreakEvery) return 'longBreak';
  return 'shortBreak';
}

function begin(state: TimerState, phase: Phase, at: number, settings: TimerSettings): TimerState {
  const planned = phaseLengthMs(phase, settings, state);
  return {
    ...state,
    phase,
    status: 'running',
    startedAt: at,
    plannedMs: planned,
    endsAt: planned === null ? null : at + planned,
    remainingMs: null,
    pausedAt: null,
    pausedMs: 0,
  };
}

function stoppedAt(state: TimerState, phase: Phase): TimerState {
  return { ...state, phase, status: 'stopped', startedAt: null, endsAt: null, plannedMs: null, remainingMs: null, pausedAt: null, pausedMs: 0 };
}

function segmentOf(state: TimerState, endedAt: number, completed: boolean): Segment {
  const openPause = state.status === 'paused' && state.pausedAt !== null ? endedAt - state.pausedAt : 0;
  const paused = state.pausedMs + Math.max(0, openPause);
  const startedAt = state.startedAt ?? endedAt;
  return {
    phase: state.phase,
    startedAt,
    endedAt,
    plannedMs: state.plannedMs,
    activeMs: Math.max(0, endedAt - startedAt - paused),
    pausedMs: paused,
    completed,
    taskId: state.taskId,
  };
}

/** Close the current phase and move to the next one, auto-starting it when allowed. */
function endPhase(state: TimerState, endedAt: number, completed: boolean, settings: TimerSettings, now: number): ReduceResult {
  const segment = segmentOf(state, endedAt, completed);
  const completedFocus = state.phase === 'focus' && completed;
  const next = nextPhase(state, settings, completedFocus);

  let carried: TimerState = { ...state };
  if (completedFocus) carried.cycle = state.cycle + 1;
  if (state.phase === 'longBreak') carried.cycle = 0;
  if (state.phase === 'focus' && settings.mode === 'flowtime') {
    carried.nextBreakMs = Math.max(MIN_FLOW_BREAK_MS, Math.round(segment.activeMs / settings.flowBreakRatio));
  }
  if (state.phase !== 'focus') carried.nextBreakMs = null;

  const auto = isBreak(next) ? settings.autoStartBreaks : settings.autoStartFocus;
  const onTime = now - endedAt <= LATE_GRACE_MS;
  carried = auto && onTime ? begin(carried, next, endedAt, settings) : stoppedAt(carried, next);
  return { state: carried, segments: [segment] };
}

export function reduce(state: TimerState, event: TimerEvent, settings: TimerSettings, now: number): ReduceResult {
  const same: ReduceResult = { state, segments: [] };
  const countUp = state.plannedMs === null;

  switch (event.type) {
    case 'start':
      if (state.status !== 'stopped') return same;
      return { state: begin({ ...state, taskId: event.taskId ?? state.taskId }, state.phase, now, settings), segments: [] };

    case 'pause':
      if (state.status !== 'running') return same;
      return {
        state: { ...state, status: 'paused', pausedAt: now, endsAt: null, remainingMs: countUp ? null : Math.max(0, (state.endsAt ?? now) - now) },
        segments: [],
      };

    case 'resume': {
      if (state.status !== 'paused' || state.pausedAt === null) return same;
      const pausedMs = state.pausedMs + Math.max(0, now - state.pausedAt);
      return {
        state: { ...state, status: 'running', pausedAt: null, pausedMs, endsAt: countUp ? null : now + (state.remainingMs ?? 0), remainingMs: null },
        segments: [],
      };
    }

    case 'toggle':
      if (state.status === 'stopped') return reduce(state, { type: 'start' }, settings, now);
      return reduce(state, { type: state.status === 'running' ? 'pause' : 'resume' }, settings, now);

    case 'extend':
      if (state.status === 'stopped' || countUp || state.plannedMs === null) return same;
      return {
        state: {
          ...state,
          plannedMs: state.plannedMs + event.ms,
          endsAt: state.status === 'running' && state.endsAt !== null ? state.endsAt + event.ms : state.endsAt,
          remainingMs: state.status === 'paused' && state.remainingMs !== null ? state.remainingMs + event.ms : state.remainingMs,
        },
        segments: [],
      };

    case 'tick': {
      let current = state;
      const segments: Segment[] = [];
      for (let i = 0; i < 10 && current.status === 'running' && current.endsAt !== null && now >= current.endsAt; i++) {
        const r = endPhase(current, current.endsAt, true, settings, now);
        current = r.state;
        segments.push(...r.segments);
      }
      return segments.length === 0 ? same : { state: current, segments };
    }

    case 'finish':
      if (state.status === 'stopped' || state.phase !== 'focus' || !countUp) return same;
      return endPhase(state, now, true, settings, now);

    case 'skip': {
      if (state.status === 'stopped') {
        const next = nextPhase(state, settings, false);
        const cycle = state.phase === 'longBreak' ? 0 : state.cycle;
        return { state: { ...stoppedAt(state, next), cycle, nextBreakMs: null }, segments: [] };
      }
      const flowFocus = state.phase === 'focus' && countUp;
      return endPhase(state, now, flowFocus, settings, now);
    }

    case 'reset': {
      const segments = state.status === 'stopped' ? [] : [segmentOf(state, now, false)];
      return { state: { ...initialState(), taskId: state.taskId }, segments };
    }
  }
}
```

`src/core/format.ts`:
```ts
const pad = (n: number) => String(n).padStart(2, '0');

/** Countdowns round up (25:00 shows for the first second), count-ups round down. */
export function formatClock(ms: number, countsUp: boolean): string {
  const total = Math.max(0, countsUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core`
Expected: PASS (settings, timer Task 1 cases, format).

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts src/core/timer.ts src/core/format.ts src/core/*.test.ts
git commit -m "Timer core: settings, state machine basics, clock format"
```

---

### Task 2: Phase completion, cycles, sleep safety, skip, reset, Flowtime

**Files:**
- Modify: `src/core/timer.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 1 (`reduce`, `play` helper, `MIN`, `T0`).
- Produces: confidence that `reduce` handles `tick`, `skip`, `reset`, `finish` as specified; no new symbols.

- [ ] **Step 1: Write the failing tests** (append to `src/core/timer.test.ts`)

```ts
import { LATE_GRACE_MS } from './timer';

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
    const s = started();
    const r = reduce(s, { type: 'tick' }, { ...S, focusMin: 50 }, T0 + 25 * MIN);
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
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/core/timer.test.ts`
Expected: PASS if Task 1's `timer.ts` is complete. If any case fails, fix `timer.ts` (not the test) until all pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/timer.test.ts src/core/timer.ts
git commit -m "Timer core: completion, long breaks, sleep safety, Flowtime tests"
```

---

### Task 3: Badge text and colors

**Files:**
- Create: `src/core/badge.ts`
- Test: `src/core/badge.test.ts`

**Interfaces:**
- Consumes: `TimerState`, `remainingMs`, `elapsedMs` from `src/core/timer.ts`.
- Produces: `badgeText(state: TimerState, now: number): string`, `badgeColor(state: TimerState): string`, `PHASE_COLORS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { initialState, reduce } from './timer';
import { badgeColor, badgeText, PHASE_COLORS } from './badge';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const S = DEFAULT_SETTINGS;

describe('badge', () => {
  it('is empty when stopped', () => {
    expect(badgeText(initialState(), T0)).toBe('');
  });
  it('shows minutes left rounded up, then <1 in the last minute', () => {
    const s = reduce(initialState(), { type: 'start' }, S, T0).state;
    expect(badgeText(s, T0)).toBe('25');
    expect(badgeText(s, T0 + 30_000)).toBe('25');
    expect(badgeText(s, T0 + MIN)).toBe('24');
    expect(badgeText(s, T0 + 24 * MIN + 1)).toBe('<1');
  });
  it('shows +minutes for a Flowtime count-up', () => {
    const F = { ...S, mode: 'flowtime' as const };
    const s = reduce(initialState(), { type: 'start' }, F, T0).state;
    expect(badgeText(s, T0 + 12 * MIN + 5000)).toBe('+12');
  });
  it('uses the phase color, and gray while paused', () => {
    const run = reduce(initialState(), { type: 'start' }, S, T0).state;
    expect(badgeColor(run)).toBe(PHASE_COLORS.focus);
    expect(badgeColor(reduce(run, { type: 'pause' }, S, T0 + 1).state)).toBe(PHASE_COLORS.paused);
    expect(badgeColor({ ...run, phase: 'shortBreak' })).toBe(PHASE_COLORS.break);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/badge.test.ts`
Expected: FAIL, `./badge` not found.

- [ ] **Step 3: Implement**

```ts
import { elapsedMs, remainingMs, type TimerState } from './timer';

/** Provisional; S2 (Figma) finalizes the palette in src/ui/tokens.css. */
export const PHASE_COLORS = {
  focus: '#E3A13B',
  break: '#7FB38E',
  paused: '#8A8A84',
} as const;

export function badgeText(state: TimerState, now: number): string {
  if (state.status === 'stopped') return '';
  if (state.plannedMs === null) return `+${Math.floor(elapsedMs(state, now) / 60_000)}`;
  const left = remainingMs(state, now) ?? 0;
  return left < 60_000 ? '<1' : String(Math.ceil(left / 60_000));
}

export function badgeColor(state: TimerState): string {
  if (state.status === 'paused') return PHASE_COLORS.paused;
  return state.phase === 'focus' ? PHASE_COLORS.focus : PHASE_COLORS.break;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/core/badge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/badge.ts src/core/badge.test.ts
git commit -m "Badge text and phase colors"
```

---

### Task 4: Message validation

**Files:**
- Create: `src/core/messages.ts`
- Test: `src/core/messages.test.ts`

**Interfaces:**
- Consumes: `TimerEvent` from `src/core/timer.ts`; `BellKind` from Task 6 (type only; define `BellKind` here first if Task 6 is not done: `export type BellKind = 'focusStart' | 'breakStart'` lives in `src/core/bell.ts`, so implement Task 4 after creating that one-line type, or create `bell.ts` with just the type now).
- Produces:
  - `type TimerMessage = { kind: 'timer'; event: TimerEvent }`
  - `type OffscreenMessage = { target: 'offscreen'; kind: 'bell'; bell: BellKind; volume: number }`
  - `parseMessage(raw: unknown): TimerMessage | null`
  - `parseOffscreenMessage(raw: unknown): OffscreenMessage | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseMessage, parseOffscreenMessage } from './messages';

describe('parseMessage', () => {
  it('accepts every plain timer event', () => {
    for (const type of ['pause', 'resume', 'toggle', 'skip', 'reset', 'tick', 'finish'] as const) {
      expect(parseMessage({ kind: 'timer', event: { type } })).toEqual({ kind: 'timer', event: { type } });
    }
  });
  it('accepts start with an optional short task id', () => {
    expect(parseMessage({ kind: 'timer', event: { type: 'start' } })).toEqual({ kind: 'timer', event: { type: 'start', taskId: null } });
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 't-1' } })).toEqual({ kind: 'timer', event: { type: 'start', taskId: 't-1' } });
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 'x'.repeat(65) } })).toBeNull();
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 5 } })).toBeNull();
  });
  it('accepts extend only for whole minutes between 1 and 60', () => {
    expect(parseMessage({ kind: 'timer', event: { type: 'extend', ms: 300_000 } })).toEqual({ kind: 'timer', event: { type: 'extend', ms: 300_000 } });
    for (const ms of [0, 59_999, 3_600_001, 1.5, '300000', Infinity]) {
      expect(parseMessage({ kind: 'timer', event: { type: 'extend', ms } })).toBeNull();
    }
  });
  it('rejects anything else and drops unknown fields', () => {
    for (const raw of [null, 1, 'x', {}, { kind: 'timer' }, { kind: 'timer', event: { type: 'explode' } }, { kind: 'other', event: { type: 'pause' } }]) {
      expect(parseMessage(raw)).toBeNull();
    }
    expect(parseMessage({ kind: 'timer', event: { type: 'pause', extra: '<img>' } })).toEqual({ kind: 'timer', event: { type: 'pause' } });
  });
});

describe('parseOffscreenMessage', () => {
  it('accepts a bell request and clamps volume', () => {
    expect(parseOffscreenMessage({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: 2 })).toEqual({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: 1 });
  });
  it('rejects other targets and kinds', () => {
    expect(parseOffscreenMessage({ kind: 'timer', event: { type: 'pause' } })).toBeNull();
    expect(parseOffscreenMessage({ target: 'offscreen', kind: 'bell', bell: 'gong', volume: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/messages.test.ts`
Expected: FAIL, `./messages` not found.

- [ ] **Step 3: Implement** (create `src/core/bell.ts` containing only `export type BellKind = 'focusStart' | 'breakStart';` if Task 6 has not run yet)

```ts
import type { BellKind } from './bell';
import type { TimerEvent } from './timer';

export type TimerMessage = { kind: 'timer'; event: TimerEvent };
export type OffscreenMessage = { target: 'offscreen'; kind: 'bell'; bell: BellKind; volume: number };

const PLAIN = new Set(['pause', 'resume', 'toggle', 'skip', 'reset', 'tick', 'finish']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

/** Every message from another extension context passes through here. Rebuilds the event so unknown fields are dropped. */
export function parseMessage(raw: unknown): TimerMessage | null {
  if (!isObj(raw) || raw.kind !== 'timer' || !isObj(raw.event)) return null;
  const e = raw.event;
  if (typeof e.type !== 'string') return null;
  if (PLAIN.has(e.type)) return { kind: 'timer', event: { type: e.type } as TimerEvent };
  if (e.type === 'start') {
    const t = e.taskId;
    if (t === undefined || t === null) return { kind: 'timer', event: { type: 'start', taskId: null } };
    if (typeof t !== 'string' || t.length === 0 || t.length > 64) return null;
    return { kind: 'timer', event: { type: 'start', taskId: t } };
  }
  if (e.type === 'extend') {
    const ms = e.ms;
    if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 60_000 || ms > 3_600_000) return null;
    return { kind: 'timer', event: { type: 'extend', ms } };
  }
  return null;
}

export function parseOffscreenMessage(raw: unknown): OffscreenMessage | null {
  if (!isObj(raw) || raw.target !== 'offscreen' || raw.kind !== 'bell') return null;
  if (raw.bell !== 'focusStart' && raw.bell !== 'breakStart') return null;
  const v = typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : 0;
  return { target: 'offscreen', kind: 'bell', bell: raw.bell, volume: v };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/core/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/messages.ts src/core/messages.test.ts src/core/bell.ts
git commit -m "Validate messages between extension contexts"
```

---

### Task 5: Storage and the serialized timer service

**Files:**
- Create: `src/core/store.ts`, `src/background/timer-service.ts`
- Test: `src/background/timer-service.test.ts`

**Interfaces:**
- Consumes: `reduce`, `initialState`, `TimerState`, `Segment`, `TimerEvent` (Task 1); `normalizeSettings`, `DEFAULT_SETTINGS`, `TimerSettings`.
- Produces:
  - `settingsItem`, `timerItem` (WXT storage items), `loadSettings(): Promise<TimerSettings>`, `loadState(): Promise<TimerState>`
  - `interface TimerDeps { now(): number; loadSettings(): Promise<TimerSettings>; loadState(): Promise<TimerState>; saveState(s: TimerState): Promise<void>; applyEffects(e: EffectInput): Promise<void> }`
  - `interface EffectInput { event: TimerEvent; prev: TimerState; state: TimerState; settings: TimerSettings; segments: Segment[]; now: number }`
  - `createTimerService(deps: TimerDeps): { dispatch(event: TimerEvent): Promise<TimerState> }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { initialState, type TimerState } from '@/core/timer';
import { createTimerService, type EffectInput } from './timer-service';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

function harness(start: TimerState = initialState()) {
  let stored = start;
  let clock = T0;
  const effects: EffectInput[] = [];
  const service = createTimerService({
    now: () => clock,
    loadSettings: async () => DEFAULT_SETTINGS,
    loadState: async () => stored,
    saveState: async (s) => {
      await new Promise((r) => setTimeout(r, 1)); // make interleaving possible
      stored = s;
    },
    applyEffects: async (e) => {
      effects.push(e);
    },
  });
  return { service, effects, get stored() { return stored; }, setClock: (t: number) => { clock = t; } };
}

describe('timer service', () => {
  it('persists the reduced state and reports effects', async () => {
    const h = harness();
    await h.service.dispatch({ type: 'start' });
    expect(h.stored).toMatchObject({ status: 'running', endsAt: T0 + 25 * MIN });
    expect(h.effects).toHaveLength(1);
    expect(h.effects[0]?.prev.status).toBe('stopped');
  });

  it('two simultaneous ticks log the completed focus once', async () => {
    const h = harness();
    await h.service.dispatch({ type: 'start' });
    h.setClock(T0 + 25 * MIN);
    await Promise.all([h.service.dispatch({ type: 'tick' }), h.service.dispatch({ type: 'tick' })]);
    const logged = h.effects.flatMap((e) => e.segments);
    expect(logged).toHaveLength(1);
    expect(h.stored.phase).toBe('shortBreak');
  });

  it('runs effects even when the state did not change (restart restores alarms and badge)', async () => {
    const running: TimerState = { ...initialState(), status: 'running', startedAt: T0, endsAt: T0 + 25 * MIN, plannedMs: 25 * MIN };
    const h = harness(running);
    h.setClock(T0 + 5 * MIN);
    await h.service.dispatch({ type: 'tick' });
    expect(h.effects).toHaveLength(1);
    expect(h.effects[0]?.state).toBe(running);
  });

  it('a failing effect does not block later events', async () => {
    const h = harness();
    const bad = createTimerService({
      now: () => T0,
      loadSettings: async () => DEFAULT_SETTINGS,
      loadState: async () => initialState(),
      saveState: async () => {},
      applyEffects: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined),
    });
    await expect(bad.dispatch({ type: 'start' })).rejects.toThrow('boom');
    await expect(bad.dispatch({ type: 'start' })).resolves.toBeDefined();
    expect(h).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/background`
Expected: FAIL, `./timer-service` not found.

- [ ] **Step 3: Implement**

`src/core/store.ts`:
```ts
import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from './settings';
import { initialState, type TimerState } from './timer';

export const settingsItem = storage.defineItem<TimerSettings>('local:settings', { fallback: DEFAULT_SETTINGS });
export const timerItem = storage.defineItem<TimerState>('local:timer', { fallback: initialState() });

export async function loadSettings(): Promise<TimerSettings> {
  return normalizeSettings(await settingsItem.getValue());
}

export async function loadState(): Promise<TimerState> {
  const s = await timerItem.getValue();
  return s && s.v === 1 ? s : initialState();
}
```

`src/background/timer-service.ts`:
```ts
import type { TimerSettings } from '@/core/settings';
import { reduce, type Segment, type TimerEvent, type TimerState } from '@/core/timer';

export interface EffectInput {
  event: TimerEvent;
  prev: TimerState;
  state: TimerState;
  settings: TimerSettings;
  segments: Segment[];
  now: number;
}

export interface TimerDeps {
  now(): number;
  loadSettings(): Promise<TimerSettings>;
  loadState(): Promise<TimerState>;
  saveState(state: TimerState): Promise<void>;
  applyEffects(input: EffectInput): Promise<void>;
}

/** Events run one at a time, so an alarm and a popup tick can never both complete the same phase. */
export function createTimerService(deps: TimerDeps) {
  let queue: Promise<unknown> = Promise.resolve();

  async function run(event: TimerEvent): Promise<TimerState> {
    const [settings, prev] = await Promise.all([deps.loadSettings(), deps.loadState()]);
    const now = deps.now();
    const { state, segments } = reduce(prev, event, settings, now);
    if (state !== prev) await deps.saveState(state);
    await deps.applyEffects({ event, prev, state, settings, segments, now });
    return state;
  }

  return {
    dispatch(event: TimerEvent): Promise<TimerState> {
      const result = queue.then(() => run(event));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/background`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/background/timer-service.ts src/background/timer-service.test.ts
git commit -m "Serialized timer service with storage-backed state"
```

---

### Task 6: Bell synthesis and the offscreen page

**Files:**
- Modify: `src/core/bell.ts` (replace the one-line type from Task 4)
- Create: `src/entrypoints/offscreen/index.html`, `src/entrypoints/offscreen/main.ts`
- Test: `src/core/bell.test.ts`

**Interfaces:**
- Consumes: `parseOffscreenMessage` (Task 4); `Phase` (Task 1).
- Produces: `type BellKind = 'focusStart' | 'breakStart'`, `BOWL_PARTIALS`, `BELL_BASE_HZ`, `strikes(kind)`, `bellKindFor(next: Phase): BellKind`, `playBell(ctx: BaseAudioContext, kind: BellKind, volume: number, when?: number): number` (returns seconds until silent).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { BOWL_PARTIALS, bellKindFor, playBell, strikes } from './bell';

function fakeCtx() {
  const calls = { osc: 0, freqs: [] as number[] };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 });
  const node = () => ({ connect() { return node(); }, gain: param() });
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => node(),
    createOscillator: () => {
      calls.osc++;
      const o = { type: 'sine', frequency: { ...param(), set value(v: number) { calls.freqs.push(v); } }, connect: () => node(), start() {}, stop() {} };
      return o;
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, calls };
}

describe('bell', () => {
  it('focus start is one strike, break start is two', () => {
    expect(strikes('focusStart')).toHaveLength(1);
    expect(strikes('breakStart')).toHaveLength(2);
  });
  it('maps the next phase to a bell kind', () => {
    expect(bellKindFor('focus')).toBe('focusStart');
    expect(bellKindFor('shortBreak')).toBe('breakStart');
    expect(bellKindFor('longBreak')).toBe('breakStart');
  });
  it('builds two slightly detuned oscillators per partial per strike', () => {
    const { ctx, calls } = fakeCtx();
    const seconds = playBell(ctx, 'breakStart', 0.5);
    expect(calls.osc).toBe(2 * BOWL_PARTIALS.length * 2);
    expect(seconds).toBeGreaterThan(4);
  });
  it('plays nothing at volume 0', () => {
    const { ctx, calls } = fakeCtx();
    expect(playBell(ctx, 'focusStart', 0)).toBe(0);
    expect(calls.osc).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/bell.test.ts`
Expected: FAIL, `BOWL_PARTIALS` etc. not exported.

- [ ] **Step 3: Implement**

`src/core/bell.ts`:
```ts
import type { Phase } from './timer';

export type BellKind = 'focusStart' | 'breakStart';

/** Singing-bowl partials: frequency ratio, relative gain, decay in seconds. Higher partials fade faster. */
export const BOWL_PARTIALS = [
  { ratio: 1, gain: 1, decay: 5.2 },
  { ratio: 2.76, gain: 0.42, decay: 3.4 },
  { ratio: 5.4, gain: 0.18, decay: 1.9 },
  { ratio: 8.93, gain: 0.07, decay: 1.1 },
] as const;

export const BELL_BASE_HZ = 392;
const DETUNE_HZ = 1.3; // the slow beating that makes a bowl sound alive
const ATTACK_S = 0.008;
const MASTER = 0.25;

export function strikes(kind: BellKind): Array<{ at: number; baseHz: number; gain: number }> {
  return kind === 'focusStart'
    ? [{ at: 0, baseHz: BELL_BASE_HZ, gain: 1 }]
    : [
        { at: 0, baseHz: BELL_BASE_HZ * 1.5, gain: 0.75 },
        { at: 0.45, baseHz: BELL_BASE_HZ, gain: 0.9 },
      ];
}

export function bellKindFor(next: Phase): BellKind {
  return next === 'focus' ? 'focusStart' : 'breakStart';
}

/** Schedules the bell on ctx and returns how many seconds until it is silent. */
export function playBell(ctx: BaseAudioContext, kind: BellKind, volume: number, when = ctx.currentTime): number {
  if (volume <= 0) return 0;
  const master = ctx.createGain();
  master.gain.value = MASTER * volume;
  master.connect(ctx.destination);
  let end = 0;
  for (const strike of strikes(kind)) {
    for (const p of BOWL_PARTIALS) {
      for (const detune of [-DETUNE_HZ, DETUNE_HZ]) {
        const t0 = when + strike.at;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = strike.baseHz * p.ratio + detune;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(0.5 * p.gain * strike.gain, t0 + ATTACK_S);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);
        osc.connect(env).connect(master);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.05);
        end = Math.max(end, strike.at + p.decay + 0.05);
      }
    }
  }
  return end;
}
```

`src/entrypoints/offscreen/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Study Duo audio</title>
    <meta name="manifest.exclude" content="['firefox']" />
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/entrypoints/offscreen/main.ts`:
```ts
import { playBell } from '@/core/bell';
import { parseOffscreenMessage } from '@/core/messages';

let ctx: AudioContext | null = null;

browser.runtime.onMessage.addListener((raw, sender) => {
  if (sender.id !== browser.runtime.id) return;
  const msg = parseOffscreenMessage(raw);
  if (!msg) return;
  ctx ??= new AudioContext();
  void ctx.resume().then(() => playBell(ctx!, msg.bell, msg.volume));
});
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/core/bell.test.ts && npm run build`
Expected: PASS; `.output/chrome-mv3/offscreen.html` exists and is not listed in `manifest.json`.

- [ ] **Step 5: Commit**

```bash
git add src/core/bell.ts src/core/bell.test.ts src/entrypoints/offscreen
git commit -m "Synthesized singing-bowl bell and Chromium offscreen audio page"
```

---

### Task 7: Side effects and background wiring

**Files:**
- Create: `src/core/phase-copy.ts`, `src/background/effects.ts`
- Modify: `src/entrypoints/background.ts`, `wxt.config.ts`
- Test: `src/background/effects.test.ts`

**Interfaces:**
- Consumes: `EffectInput`, `createTimerService` (Task 5); `badgeText`, `badgeColor` (Task 3); `bellKindFor`, `playBell`, `BellKind` (Task 6); `parseMessage` (Task 4); `loadSettings`, `loadState`, `timerItem`, `settingsItem` (Task 5).
- Produces:
  - `ALARM_PHASE_END = 'phase-end'`, `ALARM_REFRESH = 'refresh'`
  - `syncAlarms(state: TimerState): Promise<void>`
  - `syncAction(state: TimerState, now: number): Promise<void>`
  - `applyEffects(input: EffectInput): Promise<void>`
  - `phaseTitle(next: Phase): string`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { initialState, reduce } from '@/core/timer';
import { ALARM_PHASE_END, ALARM_REFRESH, applyEffects, syncAlarms } from './effects';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

beforeEach(() => {
  fakeBrowser.reset();
  Object.assign(fakeBrowser.action, {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setIcon: vi.fn(async () => {}),
  });
  Object.assign(fakeBrowser.offscreen, { createDocument: vi.fn(async () => {}) });
  Object.assign(fakeBrowser.runtime, { getContexts: vi.fn(async () => []) });
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.notifications, 'create').mockResolvedValue('phase');
});

describe('alarms', () => {
  it('schedules phase end and refresh while running, clears both when stopped', async () => {
    const running = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    await syncAlarms(running);
    expect((await fakeBrowser.alarms.get(ALARM_PHASE_END))?.scheduledTime).toBe(T0 + 25 * MIN);
    expect(await fakeBrowser.alarms.get(ALARM_REFRESH)).toBeDefined();
    await syncAlarms(initialState());
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);
  });
});

describe('applyEffects', () => {
  it('sets the badge and rings only when a phase completes on its own', async () => {
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'tick' }, DEFAULT_SETTINGS, T0 + 25 * MIN);
    await applyEffects({ event: { type: 'tick' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + 25 * MIN });
    expect(fakeBrowser.action.setBadgeText).toHaveBeenLastCalledWith({ text: '5' });
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: DEFAULT_SETTINGS.bellVolume });
    expect(fakeBrowser.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the user skipped', async () => {
    const prev = reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, T0).state;
    const r = reduce(prev, { type: 'skip' }, DEFAULT_SETTINGS, T0 + MIN);
    await applyEffects({ event: { type: 'skip' }, prev, state: r.state, settings: DEFAULT_SETTINGS, segments: r.segments, now: T0 + MIN });
    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(fakeBrowser.notifications.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/background/effects.test.ts`
Expected: FAIL, `./effects` not found.

- [ ] **Step 3: Implement**

`src/core/phase-copy.ts`:
```ts
import type { Phase } from './timer';

/** Placeholder lines until S3 brings the phrase bank. */
export function phaseTitle(next: Phase): string {
  if (next === 'focus') return 'Break is over. Study time.';
  if (next === 'longBreak') return 'Long break. Go for a walk.';
  return 'Break time. Stand up for a bit.';
}
```

`src/background/effects.ts`:
```ts
import { badgeColor, badgeText } from '@/core/badge';
import { bellKindFor, playBell, type BellKind } from '@/core/bell';
import { phaseTitle } from '@/core/phase-copy';
import { remainingMs, type TimerState } from '@/core/timer';
import type { EffectInput } from './timer-service';

export const ALARM_PHASE_END = 'phase-end';
export const ALARM_REFRESH = 'refresh';

export async function syncAlarms(state: TimerState): Promise<void> {
  await Promise.all([browser.alarms.clear(ALARM_PHASE_END), browser.alarms.clear(ALARM_REFRESH)]);
  if (state.status !== 'running') return;
  if (state.endsAt !== null) await browser.alarms.create(ALARM_PHASE_END, { when: state.endsAt });
  await browser.alarms.create(ALARM_REFRESH, { periodInMinutes: 0.5 });
}

function ring(size: number, fraction: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const w = Math.max(2, Math.round(size * 0.16));
  const r = c - w / 2 - 0.5;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(138,138,132,0.35)';
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = color;
  g.beginPath();
  g.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, fraction));
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

export async function syncAction(state: TimerState, now: number): Promise<void> {
  await browser.action.setBadgeText({ text: badgeText(state, now) });
  if (state.status === 'stopped') {
    await browser.action.setIcon({ path: { 16: '/icon/16.png', 32: '/icon/32.png' } });
    return;
  }
  await browser.action.setBadgeBackgroundColor({ color: badgeColor(state) });
  if (typeof OffscreenCanvas === 'undefined') return;
  const left = remainingMs(state, now);
  const fraction = left === null || !state.plannedMs ? 1 : left / state.plannedMs;
  const color = badgeColor(state);
  await browser.action.setIcon({ imageData: { 16: ring(16, fraction, color), 32: ring(32, fraction, color) } });
}

let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = browser.runtime.getURL('/offscreen.html');
  const existing = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (existing.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({ url, reasons: ['AUDIO_PLAYBACK'], justification: 'Play the bell between study blocks.' })
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function ringBell(kind: BellKind, volume: number): Promise<void> {
  if (volume <= 0) return;
  if (import.meta.env.FIREFOX) {
    const ctx = new AudioContext();
    const seconds = playBell(ctx, kind, volume);
    setTimeout(() => void ctx.close(), (seconds + 1) * 1000);
    return;
  }
  await ensureOffscreen();
  await browser.runtime.sendMessage({ target: 'offscreen', kind: 'bell', bell: kind, volume });
}

export async function applyEffects({ event, state, settings, segments, now }: EffectInput): Promise<void> {
  await syncAlarms(state);
  await syncAction(state, now);
  const finishedOnItsOwn = event.type === 'tick' && segments.some((s) => s.completed);
  if (!finishedOnItsOwn) return;
  await ringBell(bellKindFor(state.phase), settings.bellVolume);
  await browser.notifications.create('phase', {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: phaseTitle(state.phase),
    message: state.status === 'running' ? 'Started on its own.' : 'Start it when you are ready.',
    ...(import.meta.env.FIREFOX ? {} : { silent: true }),
  });
}
```

`src/entrypoints/background.ts`:
```ts
import { applyEffects, ALARM_PHASE_END, ALARM_REFRESH } from '@/background/effects';
import { createTimerService } from '@/background/timer-service';
import { parseMessage } from '@/core/messages';
import { loadSettings, loadState, settingsItem, timerItem } from '@/core/store';

export default defineBackground(() => {
  const timer = createTimerService({
    now: Date.now,
    loadSettings,
    loadState,
    saveState: (s) => timerItem.setValue(s),
    applyEffects,
  });
  const tick = () => void timer.dispatch({ type: 'tick' }).catch(console.error);

  browser.runtime.onMessage.addListener((raw, sender) => {
    if (sender.id !== browser.runtime.id) return;
    const msg = parseMessage(raw);
    if (msg) void timer.dispatch(msg.event).catch(console.error);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_PHASE_END || alarm.name === ALARM_REFRESH) tick();
  });
  browser.runtime.onStartup.addListener(tick);
  browser.runtime.onInstalled.addListener(tick);

  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-timer') void timer.dispatch({ type: 'toggle' }).catch(console.error);
    if (command === 'skip-phase') void timer.dispatch({ type: 'skip' }).catch(console.error);
  });

  async function syncIdle() {
    const { idlePauseMin } = await loadSettings();
    if (idlePauseMin > 0) browser.idle.setDetectionInterval(Math.max(15, Math.round(idlePauseMin * 60)));
  }
  void syncIdle();
  settingsItem.watch(() => void syncIdle());

  browser.idle.onStateChanged.addListener(async (idle) => {
    if (idle === 'active') return;
    const [settings, state] = await Promise.all([loadSettings(), loadState()]);
    if (settings.idlePauseMin > 0 && state.phase === 'focus' && state.status === 'running') {
      void timer.dispatch({ type: 'pause' }).catch(console.error);
    }
  });
});
```

`wxt.config.ts`: inside the `manifest` object, after `content_security_policy`, add:
```ts
    commands: {
      'toggle-timer': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Start or pause the timer',
      },
      'skip-phase': {
        suggested_key: { default: 'Alt+Shift+K' },
        description: 'Skip to the next phase',
      },
    },
```

- [ ] **Step 4: Run tests, typecheck, both builds**

Run: `npm test && npm run typecheck && npm run build && npm run build:firefox`
Expected: all PASS; `.output/chrome-mv3/manifest.json` contains `commands`.

- [ ] **Step 5: Commit**

```bash
git add src/core/phase-copy.ts src/background/effects.ts src/background/effects.test.ts src/entrypoints/background.ts wxt.config.ts
git commit -m "Background wiring: alarms, badge, progress icon, bell, notification, shortcuts, idle pause"
```

---

### Task 8: Bare popup and a manual end-to-end check

**Files:**
- Modify: `src/entrypoints/popup/App.svelte`

**Interfaces:**
- Consumes: `timerItem`, `settingsItem` (Task 5); `displayMs` (Task 1); `formatClock` (Task 1); message shape `{ kind: 'timer', event }` (Task 4).
- Produces: a usable popup. Styling and layout come in S5 from the Figma screens; this is semantic HTML only.

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { formatClock } from '@/core/format';
  import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
  import { settingsItem, timerItem } from '@/core/store';
  import { displayMs, initialState, type TimerEvent } from '@/core/timer';

  const LABELS = { focus: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' } as const;

  let state = $state(initialState());
  let settings = $state(DEFAULT_SETTINGS);
  let now = $state(Date.now());

  const shown = $derived(displayMs(state, settings, now));
  const send = (event: TimerEvent) => browser.runtime.sendMessage({ kind: 'timer', event });

  let timer: ReturnType<typeof setInterval> | undefined;
  const unwatch: Array<() => void> = [];

  onMount(async () => {
    state = await timerItem.getValue();
    settings = normalizeSettings(await settingsItem.getValue());
    unwatch.push(timerItem.watch((v) => (state = v ?? initialState())));
    unwatch.push(settingsItem.watch((v) => (settings = normalizeSettings(v))));
    timer = setInterval(() => {
      now = Date.now();
      if (state.status === 'running' && state.endsAt !== null && now >= state.endsAt) void send({ type: 'tick' });
    }, 250);
  });

  onDestroy(() => {
    clearInterval(timer);
    unwatch.forEach((u) => u());
  });
</script>

<main>
  <p>{LABELS[state.phase]}{state.status === 'paused' ? ' (paused)' : ''}</p>
  <p role="timer" aria-live="off">{formatClock(shown.ms, shown.countsUp)}</p>
  <div>
    {#if state.status === 'stopped'}
      <button onclick={() => send({ type: 'start' })}>Start</button>
    {:else if state.status === 'running'}
      <button onclick={() => send({ type: 'pause' })}>Pause</button>
    {:else}
      <button onclick={() => send({ type: 'resume' })}>Resume</button>
    {/if}
    {#if state.status !== 'stopped' && state.plannedMs !== null}
      <button onclick={() => send({ type: 'extend', ms: 5 * 60_000 })}>+5 min</button>
    {/if}
    {#if state.plannedMs === null && state.status !== 'stopped'}
      <button onclick={() => send({ type: 'finish' })}>Finish</button>
    {/if}
    <button onclick={() => send({ type: 'skip' })}>Skip</button>
    <button onclick={() => send({ type: 'reset' })}>Reset</button>
  </div>
</main>
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Manual check in Chromium (headless first is not possible for audio and badge, so this one is headed and short)**

1. Temporarily set focus to 1 minute: in `chrome://extensions` load `.output/chrome-mv3` unpacked; open the service worker console; run `chrome.storage.local.set({ settings: { focusMin: 1, shortBreakMin: 1 } })`.
2. Open the popup, press Start. Expected: badge `1`, amber ring icon, popup counts down from `01:00`.
3. Wait for 00:00. Expected: two-strike bell, notification "Break time. Stand up for a bit.", badge turns green, break running.
4. Press Alt+Shift+S. Expected: paused (gray badge). Press again: resumes.
5. Close all windows of that test browser, reopen: badge and countdown are still correct.
6. Reset settings: `chrome.storage.local.remove('settings')`. Close the test browser.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/popup/App.svelte
git commit -m "Bare popup to drive the timer until the S5 design lands"
```

---

## Self-review notes

- Spec coverage (S1 scope): timer modes, presets via settings, start/pause/skip/+5/reset, auto-start toggles, idle pause, shortcuts, badge minutes + progress ring + default icon when idle, bell, notification fallback, sleep-safe timestamps, reconcile on wake, both alarms. Phrase bank, in-page announcement, overlay, logging to IndexedDB and DNR are later stages by design; `applyEffects` is the single place they hook in.
- Types used across tasks: `TimerState`, `Segment`, `TimerEvent`, `EffectInput`, `BellKind`, `TimerSettings` are each defined once (Tasks 1, 5, 6) and referenced by those names everywhere.
- Review Focus coverage: items 1, 3, 5 in Task 2; item 2 and 4 in Task 5.
