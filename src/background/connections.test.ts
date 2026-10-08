import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { connectionsItem, DEFAULT_CONNECTIONS, loadConnections, normalizeConnections, saveConnections } from '@/core/connections';
import { recordsBetween } from '@/core/log';
import { NetError } from '@/core/net';
import { addSessions } from '@/core/sessions';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { settingsItem } from '@/core/store';
import { todosItem } from '@/core/todos';
import { dueNow, syncConnection } from './connections';

/** A made-up Last.fm key: 32 hex characters, uniform so no scanner mistakes it for a real one. */
const KEY = 'a'.repeat(32);

const NOW = Date.UTC(2026, 9, 8, 10);
const MIN = 60_000;
const FEED = 'https://canvas.example.edu/feeds/calendars/user_x.ics';
const ics = (uid: string, dueUtc: string) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${dueUtc}\r\nDTEND:${dueUtc}\r\nSUMMARY:HW ${uid} [Linear Algebra]\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const conn = () => loadConnections();

beforeEach(() => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
});

describe('syncConnection: deadlines', () => {
  it('adds the feed deadlines to the to-dos and records when and how many', async () => {
    await saveConnections({ ...DEFAULT_CONNECTIONS, deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url: FEED } });
    const fetchText = vi.fn(async () => ics('event-assignment-1', '20261010T215900Z'));
    await syncConnection('deadlines', NOW, fetchText);
    expect(fetchText).toHaveBeenCalledWith(FEED, expect.anything());
    expect((await todosItem.getValue()).map((t) => [t.text, t.course, t.feedUid])).toEqual([['HW event-assignment-1', 'LA', 'event-assignment-1']]);
    expect((await conn()).deadlines).toMatchObject({ lastSync: NOW, count: 1, error: null });
  });

  it('keeps the to-dos and shows a plain reason when the check fails', async () => {
    await saveConnections({ ...DEFAULT_CONNECTIONS, deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url: FEED, count: 3 } });
    await syncConnection('deadlines', NOW, async () => {
      throw new NetError('canvas.example.edu answered with error 404.');
    });
    expect((await conn()).deadlines).toMatchObject({ lastSync: NOW, count: 3, error: 'canvas.example.edu answered with error 404.' });
    await syncConnection('deadlines', NOW, async () => '<html>Log in</html>');
    expect((await conn()).deadlines.error).toBe('That link did not return a calendar.');
  });

  it('does nothing while off', async () => {
    const fetchText = vi.fn();
    await syncConnection('deadlines', NOW, fetchText);
    await syncConnection('listenbrainz', NOW, fetchText);
    await syncConnection('lastfm', NOW, fetchText);
    expect(fetchText).not.toHaveBeenCalled();
  });
});

describe('syncConnection: listening history', () => {
  const block = { phase: 'focus' as const, startedAt: NOW - 60 * MIN, endedAt: NOW - 35 * MIN, plannedMs: 25 * MIN, activeMs: 25 * MIN, pausedMs: 0, completed: true, taskId: null };
  const lb = (at: number, track: string) => ({ listened_at: Math.floor(at / 1000), track_metadata: { artist_name: 'Nils Frahm', track_name: track } });

  it('adds the plays that fell inside a block, once', async () => {
    await addSessions([block]);
    await saveConnections({ ...DEFAULT_CONNECTIONS, listenbrainz: { ...DEFAULT_CONNECTIONS.listenbrainz, user: 'ana' } });
    const body = JSON.stringify({ payload: { listens: [lb(NOW - 50 * MIN, 'Says'), lb(NOW - 10 * MIN, 'Outside')] } });
    const fetchText = vi.fn(async (_url: string) => body);
    await syncConnection('listenbrainz', NOW, fetchText);
    await syncConnection('listenbrainz', NOW + 30 * MIN, fetchText);
    expect(fetchText.mock.calls[0]![0]).toMatch(/^https:\/\/api\.listenbrainz\.org\/1\/user\/ana\/listens\?min_ts=/);
    const stored = await recordsBetween('listens', 0, NOW + DAY);
    expect(stored.map((l) => [l.title, l.sessionId])).toEqual([['Says', `${block.startedAt}-focus`]]);
    expect((await conn()).listenbrainz).toMatchObject({ lastSync: NOW + 30 * MIN, count: 1, error: null });
  });

  it('imports nothing while Songs you play is off in Your data', async () => {
    await addSessions([block]);
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, measure: { ...DEFAULT_SETTINGS.measure, music: false } });
    await saveConnections({ ...DEFAULT_CONNECTIONS, listenbrainz: { ...DEFAULT_CONNECTIONS.listenbrainz, user: 'ana' } });
    const fetchText = vi.fn();
    await syncConnection('listenbrainz', NOW, fetchText);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('reads every Last.fm page, up to five', async () => {
    await addSessions([block]);
    await saveConnections({ ...DEFAULT_CONNECTIONS, lastfm: { ...DEFAULT_CONNECTIONS.lastfm, user: 'ana', key: KEY } });
    const page = (n: number) => JSON.stringify({ recenttracks: { '@attr': { totalPages: '9' }, track: [{ name: `Song ${n}`, artist: { '#text': 'A' }, date: { uts: String(Math.floor((NOW - 55 * MIN + n * MIN) / 1000)) } }] } });
    const fetchText = vi.fn(async (url: string) => page(Number(new URL(url).searchParams.get('page'))));
    await syncConnection('lastfm', NOW, fetchText);
    expect(fetchText).toHaveBeenCalledTimes(5);
    expect((await recordsBetween('listens', 0, NOW + DAY)).length).toBe(5);
  });
});

describe('dueNow', () => {
  it('checks deadlines every 6 hours and listening history every 30 minutes, only while on', () => {
    const c = normalizeConnections({ deadlines: { url: FEED, lastSync: NOW - 5 * 60 * MIN }, listenbrainz: { user: 'ana', lastSync: NOW - 31 * MIN }, lastfm: { user: 'ana', key: null } });
    expect(dueNow(c, NOW)).toEqual(['listenbrainz']);
    expect(dueNow(c, NOW + 60 * MIN)).toEqual(['deadlines', 'listenbrainz']);
    expect(dueNow(DEFAULT_CONNECTIONS, NOW)).toEqual([]);
  });
});

const DAY = 86_400_000;

describe('Disconnect (security review)', () => {
  it('stops the very next request, even in the middle of a check', async () => {
    await saveConnections({ ...DEFAULT_CONNECTIONS, lastfm: { ...DEFAULT_CONNECTIONS.lastfm, user: 'ana', key: KEY } });
    const page = JSON.stringify({ recenttracks: { '@attr': { totalPages: '5' }, track: [] } });
    const fetch = vi.fn(async () => {
      await saveConnections({ ...(await loadConnections()), lastfm: { ...DEFAULT_CONNECTIONS.lastfm } });
      return new Response(page, { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await syncConnection('lastfm', NOW);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
