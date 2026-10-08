import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { eventId } from '@/core/calendar';
import { connectionsItem, DEFAULT_CONNECTIONS, normalizeConnections } from '@/core/connections';
import { withDb } from '@/core/db';
import { NetError } from '@/core/net';
import type { SessionRecord } from '@/core/sessions';
import { todosItem } from '@/core/todos';
import { connectCalendar, disconnectCalendar, syncCalendar, type CalendarDeps } from './calendar';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 8, 14);
const API = 'https://www.googleapis.com/calendar/v3';

/** Google Calendar as far as Study Duo uses it: one app calendar, events by id, deleted events, expiring tokens. */
class FakeGoogle {
  calendars = new Set<string>();
  events = new Map<string, Record<string, unknown>>();
  deleted = new Set<string>();
  revoked: string[] = [];
  expired = new Set<string>();
  down = false;
  /** A status for the GET of a known calendar, as when Google is busy. */
  busyGet: number | null = null;
  /** Every event insert answered with this error, Google's way: { error: { errors: [{ reason }] } }. */
  refuse: { status: number; reason: string } | null = null;
  calls: string[] = [];
  send: CalendarDeps['send'] = async (url, init) => {
    this.calls.push(`${init.method} ${url.replace(API, '')}`);
    if (this.down) throw new NetError('Could not reach www.googleapis.com.');
    if (url.endsWith('/revoke')) return this.revoked.push(String((init.body as URLSearchParams).get('token'))), { status: 200, data: null };
    if (init.token && this.expired.has(init.token)) return { status: 401, data: null };
    const cal = /\/calendars\/([^/]+)/.exec(url)?.[1];
    if (this.busyGet && /\/calendars\/[^/]+$/.test(url) && init.method === 'GET') return { status: this.busyGet, data: null };
    if (this.refuse && url.endsWith('/events')) return { status: this.refuse.status, data: { error: { errors: [{ reason: this.refuse.reason }] } } };
    if (url === `${API}/calendars` && init.method === 'POST') {
      this.calendars.add('cal1');
      return { status: 200, data: { id: 'cal1' } };
    }
    if (cal && !this.calendars.has(decodeURIComponent(cal))) return { status: 404, data: null };
    if (/\/calendars\/[^/]+$/.test(url) && init.method === 'GET') return { status: 200, data: { id: cal } };
    const body = init.body as Record<string, unknown>;
    if (url.endsWith('/events') && init.method === 'POST') {
      const id = String(body.id);
      if (this.events.has(id) || this.deleted.has(id)) return { status: 409, data: null };
      this.events.set(id, body);
      return { status: 200, data: body };
    }
    const ev = /\/events\/([^/]+)$/.exec(url)?.[1];
    if (ev && init.method === 'PATCH') {
      if (this.deleted.has(ev)) return { status: 404, data: null };
      this.events.set(ev, { ...this.events.get(ev), ...body });
      return { status: 200, data: null };
    }
    return { status: 400, data: null };
  };
}

let google: FakeGoogle;
let tokens: string[];
let deps: CalendarDeps;

async function block(over: Partial<SessionRecord>): Promise<SessionRecord> {
  const s: SessionRecord = {
    id: '',
    phase: 'focus',
    startedAt: NOW - 60 * MIN,
    endedAt: NOW - 35 * MIN,
    plannedMs: 25 * MIN,
    activeMs: 25 * MIN,
    pausedMs: 0,
    completed: true,
    taskId: null,
    rating: null,
    ratingSkipped: false,
    ...over,
  };
  s.id = `${s.startedAt}-${s.phase}`;
  await withDb((db) => db.put('sessions', s));
  return s;
}
const g = async () => normalizeConnections(await connectionsItem.getValue()).google;

beforeEach(() => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  google = new FakeGoogle();
  tokens = ['tok'];
  deps = { send: google.send, token: vi.fn(async () => tokens[0] ?? null), dropToken: vi.fn(async () => void tokens.shift()), timeZone: 'Europe/Amsterdam' };
});

describe('connectCalendar', () => {
  it('makes a "Study Duo" calendar and logs today\'s blocks into it at once', async () => {
    await todosItem.setValue([{ id: 't1', text: 'Problem set 5', course: 'LA', done: false, doneAt: null, ifThen: null }]);
    const s = await block({ taskId: 't1', rating: 4 });
    await connectCalendar(NOW, deps);
    expect((await g()).on).toBe(true);
    expect((await g()).calendarId).toBe('cal1');
    const ev = google.events.get(eventId(s.id))!;
    expect(ev.summary).toBe('Study: Problem set 5 (LA)');
    expect(String(ev.description)).toContain('Focus: 4 of 5');
    expect((await g()).error).toBeNull();
  });

  it('reuses the old calendar on reconnecting instead of making a second one', async () => {
    google.calendars.add('old');
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, calendarId: 'old' } });
    await connectCalendar(NOW, deps);
    expect((await g()).calendarId).toBe('old');
    expect(google.calls.filter((c) => c === 'POST /calendars')).toEqual([]);
  });

  it('keeps the old calendar when Google is busy on reconnect, and gives the sign-in back', async () => {
    google.calendars.add('old');
    google.busyGet = 503;
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, calendarId: 'old' } });
    await connectCalendar(NOW, deps);
    expect(google.calls.filter((c) => c === 'POST /calendars')).toEqual([]);
    expect((await g()).calendarId).toBe('old');
    expect((await g()).on).toBe(false);
    expect((await g()).error).toMatch(/busy/);
    expect(google.revoked).toEqual(['tok']);
  });

  it('stays off and says so when the sign-in did not finish', async () => {
    tokens = [];
    await connectCalendar(NOW, deps);
    expect((await g()).on).toBe(false);
    expect((await g()).error).toMatch(/sign-in/i);
  });
});

describe('syncCalendar', () => {
  beforeEach(async () => {
    google.calendars.add('cal1');
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, on: true, calendarId: 'cal1', lastOk: NOW - 120 * MIN } });
  });

  it('logs every finished block and break once; a second pass sends nothing', async () => {
    await block({});
    await block({ phase: 'shortBreak', startedAt: NOW - 35 * MIN, endedAt: NOW - 30 * MIN, plannedMs: 5 * MIN });
    await syncCalendar(NOW, deps);
    expect(google.events.size).toBe(2);
    const before = google.calls.length;
    await syncCalendar(NOW + MIN, deps);
    expect(google.calls.length).toBe(before);
    expect((await g()).count).toBe(2);
  });

  it('updates an event when its rating arrives later, without making a copy', async () => {
    const s = await block({});
    await syncCalendar(NOW, deps);
    await withDb((db) => db.put('sessions', { ...s, rating: 5 }));
    await syncCalendar(NOW + 5 * MIN, deps);
    expect(google.events.size).toBe(1);
    expect(String(google.events.get(eventId(s.id))!.description)).toContain('Focus: 5 of 5');
  });

  it('leaves an event the user deleted deleted', async () => {
    const s = await block({});
    google.deleted.add(eventId(s.id));
    await syncCalendar(NOW, deps);
    expect(google.events.size).toBe(0);
    expect((await g()).error).toBeNull();
    expect((await g()).sent[s.id]).toBeDefined(); // not tried again
  });

  it('asks for a fresh token once when Google says the old one expired', async () => {
    tokens = ['old', 'new'];
    google.expired.add('old');
    await block({});
    await syncCalendar(NOW, deps);
    expect(deps.dropToken).toHaveBeenCalledWith('old');
    expect(google.events.size).toBe(1);
  });

  it('keeps the blocks for the next pass while offline, and says why', async () => {
    await block({});
    google.down = true;
    await syncCalendar(NOW, deps);
    expect((await g()).error).toMatch(/Could not reach/);
    expect((await g()).lastOk).toBe(NOW - 120 * MIN);
    google.down = false;
    await syncCalendar(NOW + 30 * MIN, deps);
    expect(google.events.size).toBe(1);
    expect((await g()).error).toBeNull();
  });

  it('sends a block saved late, after a later pass already moved past its time', async () => {
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, on: true, calendarId: 'cal1', since: NOW - 20 * 60 * MIN, lastOk: NOW } });
    // The laptop slept through the end of this block; it is written ten hours late, after a pass at NOW found nothing.
    const s = await block({ startedAt: NOW - 10 * 60 * MIN, endedAt: NOW - 10 * 60 * MIN + 25 * MIN });
    await syncCalendar(NOW + MIN, deps);
    expect(google.events.has(eventId(s.id))).toBe(true);
  });

  it('never sends blocks from before Connect', async () => {
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, on: true, calendarId: 'cal1', since: NOW - 30 * MIN } });
    await block({});
    await syncCalendar(NOW, deps);
    expect(google.events.size).toBe(0);
  });

  it('names a lasting refusal instead of calling Google busy', async () => {
    google.refuse = { status: 403, reason: 'accessNotConfigured' };
    await block({});
    await syncCalendar(NOW, deps);
    expect((await g()).error).toMatch(/accessNotConfigured/);
    expect((await g()).error).not.toMatch(/busy/);
  });

  it('calls a rate limit busy and tries again later', async () => {
    google.refuse = { status: 403, reason: 'rateLimitExceeded' };
    const s = await block({});
    await syncCalendar(NOW, deps);
    expect((await g()).error).toMatch(/busy/);
    expect((await g()).sent[s.id]).toBeUndefined();
  });

  it('asks to connect again when the calendar itself was deleted', async () => {
    google.calendars.delete('cal1');
    await block({});
    await syncCalendar(NOW, deps);
    expect((await g()).calendarId).toBeNull();
    expect((await g()).error).toMatch(/Connect again/);
  });

  it('does nothing while switched off', async () => {
    await connectionsItem.setValue(DEFAULT_CONNECTIONS);
    await block({});
    await syncCalendar(NOW, deps);
    expect(google.calls).toEqual([]);
  });
});

describe('disconnectCalendar', () => {
  it('gives the sign-in back to Google, switches off and keeps the calendar for next time', async () => {
    await connectionsItem.setValue({ ...DEFAULT_CONNECTIONS, google: { ...DEFAULT_CONNECTIONS.google, on: true, calendarId: 'cal1', sent: { a: 'b' } } });
    await disconnectCalendar(deps);
    expect(google.revoked).toEqual(['tok']);
    expect(deps.dropToken).toHaveBeenCalledWith('tok');
    const after = await g();
    expect(after.on).toBe(false);
    expect(after.sent).toEqual({});
    expect(after.calendarId).toBe('cal1');
  });
});
