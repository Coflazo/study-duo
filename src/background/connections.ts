import { connectionsItem, loadConnections, normalizeConnections, type Connections } from '@/core/connections';
import { addRecords, recordsBetween } from '@/core/log';
import { getText, NetError } from '@/core/net';
import { sessionsBetween } from '@/core/sessions';
import { loadSettings } from '@/core/store';
import { updateTodos } from '@/core/todos';
import { mergeDeadlines } from '@/integrations/deadlines';
import { parseFeed } from '@/integrations/ics-feed';
import { attachToSessions, fromLastfm, fromListenBrainz, lastfmPages, lastfmUrl, listenBrainzUrl, mergeImported } from '@/integrations/listens-import';
import { syncCalendar } from './calendar';

export type ConnectionKind = keyof Connections;
type FetchText = (url: string, c: Connections) => Promise<string>;

const MIN = 60_000;
export const ALARM_CONNECTIONS = 'connections';
const EVERY: Record<ConnectionKind, number> = { deadlines: 6 * 60 * MIN, listenbrainz: 30 * MIN, lastfm: 30 * MIN, google: 30 * MIN };
/** First check after connecting looks back two weeks; later ones overlap the last by 6 hours, for phones that send late. */
const FIRST_LOOK_BACK = 14 * 24 * 60 * MIN;
const OVERLAP = 6 * 60 * MIN;

const isOn = (c: Connections, kind: ConnectionKind) =>
  kind === 'deadlines' ? !!c.deadlines.url : kind === 'listenbrainz' ? !!c.listenbrainz.user : kind === 'lastfm' ? !!(c.lastfm.user && c.lastfm.key) : c.google.on && !!c.google.calendarId;

/** The connections that are on and due for a check. */
export function dueNow(c: Connections, now: number): ConnectionKind[] {
  return (['deadlines', 'listenbrainz', 'lastfm', 'google'] as const).filter((k) => isOn(c, k) && now - (c[k].lastSync ?? 0) >= EVERY[k]);
}

async function patch<K extends ConnectionKind>(kind: K, fields: Partial<Connections[K]>): Promise<void> {
  const c = normalizeConnections(await connectionsItem.getValue());
  await connectionsItem.setValue({ ...c, [kind]: { ...c[kind], ...fields } });
}

const reason = (e: unknown, service: string) => (e instanceof NetError ? e.message : `${service} sent something Study Duo could not read.`);

async function syncDeadlines(c: Connections, now: number, fetchText: FetchText): Promise<void> {
  const text = await fetchText(c.deadlines.url!, c);
  const events = parseFeed(text);
  if (events.length === 0 && !/BEGIN:VCALENDAR/i.test(text)) throw new NetError('That link did not return a calendar.');
  if (!isOn(await loadConnections(), 'deadlines')) return; // disconnected while the answer was on its way
  let count = 0;
  await updateTodos((list) => {
    const r = mergeDeadlines(list, events, c.deadlines.dismissed, now);
    count = r.count;
    return r.todos;
  });
  await patch('deadlines', { lastSync: now, count, error: null });
}

async function syncListens(kind: 'listenbrainz' | 'lastfm', c: Connections, now: number, fetchText: FetchText): Promise<void> {
  const since = Math.max(now - FIRST_LOOK_BACK, (c[kind].lastSync ?? 0) - OVERLAP);
  let imported;
  if (kind === 'listenbrainz') {
    imported = fromListenBrainz(JSON.parse(await fetchText(listenBrainzUrl(c.listenbrainz.user!, since), c)));
  } else {
    const first = JSON.parse(await fetchText(lastfmUrl(c.lastfm.user!, c.lastfm.key!, since, 1), c));
    imported = fromLastfm(first);
    for (let page = 2; page <= lastfmPages(first); page++) imported.push(...fromLastfm(JSON.parse(await fetchText(lastfmUrl(c.lastfm.user!, c.lastfm.key!, since, page), c))));
  }
  // Disconnected, or Songs you play switched off, while the answer was on its way: keep nothing from it.
  if (!isOn(await loadConnections(), kind) || !(await loadSettings()).measure.music) return;
  const [sessions, existing] = await Promise.all([sessionsBetween(since - OVERLAP, now + 1), recordsBetween('listens', since - OVERLAP, now + 1)]);
  const fresh = mergeImported(existing, attachToSessions(imported, sessions));
  await addRecords('listens', fresh);
  await patch(kind, { lastSync: now, count: c[kind].count + fresh.length, error: null });
}

let queue: Promise<unknown> = Promise.resolve();

/** Each request re-reads the connections, so Disconnect stops the very next one, even in the middle of a check. */
const fetchCurrent: FetchText = async (url) => getText(url, await loadConnections());

/** Checks one connection now, if it is on (and, for listening history, if Songs you play is on). One check at a time. */
export function syncConnection(kind: ConnectionKind, now = Date.now(), fetchText: FetchText = fetchCurrent): Promise<void> {
  const run = queue.then(async () => {
    const c = await loadConnections();
    if (!isOn(c, kind)) return;
    // Calendar sync keeps its own errors and is not part of "Songs you play".
    if (kind === 'google') return syncCalendar(now);
    if (kind !== 'deadlines' && !(await loadSettings()).measure.music) return;
    const service = kind === 'deadlines' ? 'The calendar link' : kind === 'listenbrainz' ? 'ListenBrainz' : 'Last.fm';
    try {
      if (kind === 'deadlines') await syncDeadlines(c, now, fetchText);
      else await syncListens(kind, c, now, fetchText);
    } catch (e) {
      await patch(kind, { lastSync: now, error: reason(e, service) });
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Every connection that is due, one after another. */
export async function syncDue(now = Date.now()): Promise<void> {
  for (const kind of dueNow(await loadConnections(), now)) await syncConnection(kind, now);
}

/** A "check now" request from an extension page: { kind: 'connections', op: 'sync', which }. */
export function parseSyncRequest(raw: unknown): ConnectionKind | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return r.kind === 'connections' && r.op === 'sync' && (r.which === 'deadlines' || r.which === 'listenbrainz' || r.which === 'lastfm' || r.which === 'google') ? r.which : null;
}

/** One alarm every 30 minutes; each connection runs on its own schedule inside it. */
export function trackConnections(): void {
  void browser.alarms.create(ALARM_CONNECTIONS, { periodInMinutes: 30, delayInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_CONNECTIONS) void syncDue().catch(console.error);
  });
}
