import { describe, expect, it } from 'vitest';
import type { ActivityRecord, ListenRecord } from './db';
import type { SessionRecord } from './sessions';
import { calendarEvent, eventContext, eventHash, eventId } from './calendar';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 7, 0); // 09:00 in Amsterdam

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `${T0}-focus`,
    phase: 'focus',
    startedAt: T0,
    endedAt: T0 + 25 * MIN,
    plannedMs: 25 * MIN,
    activeMs: 25 * MIN,
    pausedMs: 0,
    completed: true,
    taskId: 't1',
    rating: null,
    ratingSkipped: false,
    ...over,
  };
}

describe('eventId', () => {
  it('turns a session id into a Google event id (lowercase base32hex letters, 5 to 1024 long)', () => {
    const id = eventId('1791480375569-shortBreak');
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(eventId('1791480375569-shortBreak')).toBe(id); // same session, same event: retries never duplicate
    expect(eventId('1791480375569-longBreak')).not.toBe(id);
  });
});

describe('calendarEvent', () => {
  const tz = 'Europe/Amsterdam';

  it('names a study block after its task and course, in red, with the details in the description', () => {
    const e = calendarEvent(session({ rating: 4 }), {
      timeZone: tz,
      task: { text: 'Problem set 5', course: 'LA' },
      block: { n: 3, goal: 8 },
      sites: [{ domain: 'canvas.uva.nl', minutes: 18 }, { domain: 'overleaf.com', minutes: 5 }],
      songs: [{ title: 'Nocturne in F major, Op. 15 No. 1', artist: 'Chopin' }],
    });
    expect(e.id).toBe(eventId(`${T0}-focus`));
    expect(e.summary).toBe('Study: Problem set 5 (LA)');
    expect(e.start).toEqual({ dateTime: new Date(T0).toISOString(), timeZone: tz });
    expect(e.end).toEqual({ dateTime: new Date(T0 + 25 * MIN).toISOString(), timeZone: tz });
    expect(e.colorId).toBe('11');
    expect(e.description.split('\n')).toEqual([
      'Focus: 4 of 5',
      'Block 3 of 8 today',
      'Sites: canvas.uva.nl 18 min · overleaf.com 5 min',
      'Music: Nocturne in F major, Op. 15 No. 1 (Chopin)',
      '',
      'Logged by Study Duo',
    ]);
    expect(e.transparency).toBe('transparent');
    expect(e.reminders).toEqual({ useDefault: false, overrides: [] });
  });

  it('names a block without a task after the study site used most, and says when it ended early', () => {
    const e = calendarEvent(session({ taskId: null, completed: false, endedAt: T0 + 12 * MIN, activeMs: 12 * MIN }), {
      timeZone: tz,
      sites: [{ domain: 'overleaf.com', minutes: 9 }],
    });
    expect(e.summary).toBe('Study: overleaf.com (ended early)');
    expect(e.description).toContain('Ended early: 12 of 25 minutes');
    expect(e.summary).not.toContain('undefined');
  });

  it('calls a block with nothing to go on just "Study"', () => {
    expect(calendarEvent(session({ taskId: null }), { timeZone: tz }).summary).toBe('Study');
  });

  it('names breaks, in green, and says what they followed', () => {
    const e = calendarEvent(session({ id: `${T0}-shortBreak`, phase: 'shortBreak', taskId: null, plannedMs: 5 * MIN, endedAt: T0 + 5 * MIN }), {
      timeZone: tz,
      after: 'Problem set 5',
    });
    expect(e.summary).toBe('Short break');
    expect(e.colorId).toBe('10');
    expect(e.description.split('\n')[0]).toBe('After Problem set 5');
    expect(calendarEvent(session({ phase: 'longBreak', taskId: null }), { timeZone: tz }).summary).toBe('Long break');
  });
});

describe('eventHash', () => {
  it('changes when what the event says changes, not otherwise', () => {
    const a = calendarEvent(session(), { timeZone: 'UTC' });
    expect(eventHash(a)).toBe(eventHash(calendarEvent(session(), { timeZone: 'UTC' })));
    expect(eventHash(a)).not.toBe(eventHash(calendarEvent(session({ rating: 5 }), { timeZone: 'UTC' })));
  });
});

describe('eventContext', () => {
  const s = session();
  const act = (domain: string | null, category: ActivityRecord['category'], from: number, to: number): ActivityRecord => ({
    id: `${from}`,
    startedAt: from,
    endedAt: to,
    category,
    domain,
    phase: 'focus',
  });
  const listen = (title: string, host: string, sessionId: string | null = s.id): ListenRecord => ({
    id: title,
    host,
    title,
    artist: 'Chopin',
    album: '',
    startedAt: T0,
    endedAt: T0 + MIN,
    sessionId,
  });

  it('gathers the task, the block number, the study sites by time and the songs, leaving Spotify out', () => {
    const ctx = eventContext(s, {
      timeZone: 'UTC',
      todos: [{ id: 't1', text: 'Problem set 5', course: 'LA' }],
      dayFocus: [session({ id: 'a', startedAt: T0 - 120 * MIN }), session({ id: 'b', startedAt: T0 - 60 * MIN }), s],
      goal: 8,
      activity: [
        act('canvas.uva.nl', 'study', T0, T0 + 10 * MIN),
        act('canvas.uva.nl', 'study', T0 + 15 * MIN, T0 + 23 * MIN),
        act('overleaf.com', 'study', T0 + 10 * MIN, T0 + 15 * MIN),
        act('youtube.com', 'unfiled', T0 + 23 * MIN, T0 + 25 * MIN),
        act(null, 'unobserved', T0 + 25 * MIN, T0 + 30 * MIN),
        act('overleaf.com', 'study', T0 - 30 * MIN, T0 - 5 * MIN), // before the block
      ],
      listens: [listen('Nocturne', 'file'), listen('A Spotify song', 'open.spotify.com'), listen('A phone Spotify song', 'app:spotify'), listen('A scrobble from who knows', 'last.fm'), listen('Nocturne', 'file'), listen('Other', 'file', 'x')],
      details: true,
    });
    expect(ctx.task).toEqual({ text: 'Problem set 5', course: 'LA' });
    expect(ctx.block).toEqual({ n: 3, goal: 8 });
    expect(ctx.sites).toEqual([{ domain: 'canvas.uva.nl', minutes: 18 }, { domain: 'overleaf.com', minutes: 5 }]);
    expect(ctx.songs).toEqual([{ title: 'Nocturne', artist: 'Chopin' }]);
  });

  it('leaves sites and songs out when the user turned details off', () => {
    const ctx = eventContext(s, {
      timeZone: 'UTC',
      todos: [],
      dayFocus: [s],
      goal: 8,
      activity: [act('canvas.uva.nl', 'study', T0, T0 + 10 * MIN)],
      listens: [listen('Nocturne', 'file')],
      details: false,
    });
    expect(ctx.sites).toBeUndefined();
    expect(ctx.songs).toBeUndefined();
    expect(ctx.block).toEqual({ n: 1, goal: 8 });
  });
});
