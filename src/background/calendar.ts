import { calendarEvent, eventContext, eventHash } from '@/core/calendar';
import { connectionsItem, loadConnections, normalizeConnections, type Connections } from '@/core/connections';
import { recordsBetween } from '@/core/log';
import { GOOGLE_API_ORIGIN, GOOGLE_OAUTH_ORIGIN, NetError, sendJson } from '@/core/net';
import { localDayRange, sessionsBetween } from '@/core/sessions';
import { loadSettings } from '@/core/store';
import { todosItem } from '@/core/todos';
import { dropToken, googleToken } from './google-auth';

const MIN = 60_000;
const API = `${GOOGLE_API_ORIGIN}/calendar/v3`;
/** A block that ended this recently is rebuilt on every pass, so a rating given later updates its event. */
const RATING_WINDOW = 3 * 60 * MIN;
/**
 * Each pass looks at every block of the last three days that is not in the calendar yet, whenever it was written: a
 * block can be saved hours after it ended (a laptop that slept through its end), after a later pass already ran.
 */
const KEEP = 3 * 24 * 60 * MIN;
/** Google's 403 reasons that mean "slow down", not "never". */
const RATE_LIMITS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

type Send = (url: string, init: Parameters<typeof sendJson>[1]) => Promise<{ status: number; data: unknown }>;
export interface CalendarDeps {
  send: Send;
  token: (interactive: boolean) => Promise<string | null>;
  dropToken: (token: string) => Promise<void>;
  timeZone?: string;
}

/** Every request re-reads the connections, so Disconnect stops the very next one. */
const real: CalendarDeps = { send: async (url, init) => sendJson(url, init, await loadConnections()), token: googleToken, dropToken };

async function patch(fields: Partial<Connections['google']>): Promise<Connections['google']> {
  const c = normalizeConnections(await connectionsItem.getValue());
  const google = { ...c.google, ...fields };
  await connectionsItem.setValue({ ...c, google });
  return google;
}

const SIGN_IN_AGAIN = 'Google asks you to sign in again: Disconnect, then Connect.';
const reasonOf = (data: unknown) => {
  const r = (data as { error?: { errors?: { reason?: unknown }[] } } | null)?.error?.errors?.[0]?.reason;
  return typeof r === 'string' && /^\w{1,64}$/.test(r) ? r : null;
};
/** What a refused request means: try again later, or a refusal that will not change by itself. */
function refusal(r: { status: number; data: unknown }): { later: boolean; message: string } {
  const reason = reasonOf(r.data);
  if (r.status === 429 || r.status >= 500 || (r.status === 403 && reason !== null && RATE_LIMITS.has(reason))) return { later: true, message: busy(r.status) };
  return { later: false, message: `Google refused the calendar (${reason ?? `error ${r.status}`}).` };
}
/** Hands a sign-in back to Google; called while the connection is still on, since the gate closes with it. */
async function giveBack(token: string, deps: CalendarDeps): Promise<void> {
  await deps.send(`${GOOGLE_OAUTH_ORIGIN}/revoke`, { method: 'POST', body: new URLSearchParams({ token }) }).catch(() => undefined);
  await deps.dropToken(token);
}
const gone = 'The Study Duo calendar was deleted in Google Calendar. Connect again to make a new one.';
const zone = (deps: CalendarDeps) => deps.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * After the page got the user's consent: switch on, find the old "Study Duo" calendar or make one, and log today's
 * blocks at once. The interactive sign-in happens on the page (a click), never here.
 */
export async function connectCalendar(now = Date.now(), deps: CalendarDeps = real): Promise<void> {
  const before = await patch({ on: true, error: null });
  const token = await deps.token(false);
  if (!token) return void (await patch({ on: false, lastSync: now, error: 'The Google sign-in did not finish. Try Connect again.' }));
  const fail = async (error: string) => {
    await giveBack(token, deps);
    await patch({ on: false, lastSync: now, error });
  };
  try {
    let id = before.calendarId;
    if (id) {
      const old = await deps.send(`${API}/calendars/${encodeURIComponent(id)}`, { method: 'GET', token });
      // Only "gone" makes a new calendar; a busy Google must not leave the user with two "Study Duo" calendars.
      if (old.status === 404 || old.status === 410) id = null;
      else if (old.status !== 200) return void (await fail(refusal(old).message));
    }
    if (!id) {
      const made = await deps.send(`${API}/calendars`, {
        method: 'POST',
        token,
        body: { summary: 'Study Duo', description: 'Study blocks and breaks, logged by Study Duo when each one ends.', timeZone: zone(deps) },
      });
      id = made.status === 200 ? ((made.data as { id?: unknown } | null)?.id as string | undefined) ?? null : null;
      if (!id) return void (await fail(`Google did not make the calendar (error ${made.status}).`));
    }
    // A new calendar starts empty: forget what an older one held. Today's earlier blocks go in on the first pass.
    await patch({ calendarId: id, since: localDayRange(now)[0], ...(id === before.calendarId ? {} : { sent: {} }) });
  } catch (e) {
    return void (await fail(e instanceof NetError ? e.message : 'Google sent something Study Duo could not read.'));
  }
  await syncCalendar(now, deps);
}

/** Sends every finished block and break whose event is new or changed. Safe to run any time; it is idempotent. */
export async function syncCalendar(now = Date.now(), deps: CalendarDeps = real): Promise<void> {
  const g = normalizeConnections(await connectionsItem.getValue()).google;
  if (!g.on || !g.calendarId) return;
  let token = await deps.token(false);
  if (!token) return void (await patch({ lastSync: now, error: SIGN_IN_AGAIN }));

  const from = Math.max(g.since ?? 0, now - KEEP);
  const blocks = (await sessionsBetween(from, now + 1))
    .filter((s) => s.startedAt >= from && s.endedAt <= now && (g.sent[s.id] === undefined || s.endedAt > now - RATING_WINDOW))
    .sort((a, b) => a.startedAt - b.startedAt);
  const dayStart = localDayRange(Math.min(now, ...blocks.map((b) => b.startedAt)))[0];
  const [todos, settings, focus, activity, listens] = await Promise.all([
    todosItem.getValue(),
    loadSettings(),
    sessionsBetween(dayStart, now + 1).then((all) => all.filter((s) => s.phase === 'focus')),
    g.details ? recordsBetween('activity', dayStart, now + 1) : Promise.resolve([]),
    g.details ? recordsBetween('listens', dayStart, now + 1) : Promise.resolve([]),
  ]);

  const events = `${API}/calendars/${encodeURIComponent(g.calendarId)}/events`;
  /** One request, with one fresh token if Google says the old one expired. */
  const call = async (url: string, init: Omit<Parameters<Send>[1], 'token'>) => {
    let r = await deps.send(url, { ...init, token: token! });
    if (r.status === 401) {
      await deps.dropToken(token!);
      token = await deps.token(false);
      if (!token) return null;
      r = await deps.send(url, { ...init, token });
      if (r.status === 401) return null;
    }
    return r;
  };

  const sent = { ...g.sent };
  let added = 0;
  let error: string | null = null;
  try {
    for (const s of blocks) {
      const day = localDayRange(s.startedAt);
      const event = calendarEvent(
        s,
        eventContext(s, {
          timeZone: zone(deps),
          todos,
          dayFocus: focus.filter((f) => f.startedAt >= day[0] && f.startedAt < day[1]),
          goal: settings.dailyGoal,
          activity,
          listens,
          details: g.details,
        }),
      );
      const hash = eventHash(event);
      if (sent[s.id] === hash) continue;
      let r = await call(events, { method: 'POST', body: event as unknown as Record<string, unknown> });
      if (r === null) {
        error = SIGN_IN_AGAIN;
        break;
      }
      if (r.status === 404) return void (await patch({ calendarId: null, lastSync: now, error: gone, sent }));
      if (r.status === 409) {
        // It is there already (a retry), or the user deleted it: update it, and leave a deleted one deleted.
        const { id, ...body } = event;
        r = await call(`${events}/${id}`, { method: 'PATCH', body });
        if (r === null) {
          error = SIGN_IN_AGAIN;
          break;
        }
        if (r.status !== 200 && r.status !== 404 && r.status !== 410) {
          const why = refusal(r);
          if (why.later || r.status === 403) {
            error = why.message;
            break;
          }
          error = `Google refused one block (error ${r.status}); the others are in.`; // not retried: it would fail again
        }
      } else if (r.status === 200 || r.status === 201) added++;
      else {
        const why = refusal(r);
        // Busy, or a refusal of the whole calendar (the API switched off, no permission): stop and keep the rest.
        if (why.later || r.status === 403) {
          error = why.message;
          break;
        }
        error = `Google refused one block (error ${r.status}); the others are in.`; // not retried: it would fail again
      }
      sent[s.id] = hash;
    }
  } catch (e) {
    error = e instanceof NetError ? `${e.message} Trying again later.` : 'Google sent something Study Duo could not read.';
  }
  const fresh = Object.fromEntries(Object.entries(sent).filter(([id]) => Number(id.split('-')[0]) > now - KEEP));
  const done = error === null || error.startsWith('Google refused one block');
  await patch({ sent: fresh, lastSync: now, count: g.count + added, error, ...(done ? { lastOk: now } : {}) });
}

const busy = (status: number) => `Google is busy (error ${status}). Trying again later.`;

/** Gives the sign-in back to Google and switches off. The calendar stays in Google Calendar, kept for a reconnect. */
export async function disconnectCalendar(deps: CalendarDeps = real): Promise<void> {
  const token = await deps.token(false);
  // Revoked while still switched on: the network gate only lets Google in while the connection is on.
  if (token) await giveBack(token, deps);
  await patch({ on: false, sent: {}, lastOk: null, since: null, error: null });
}

/** A Connect or Disconnect request from an extension page: { kind: 'calendar', op: 'connect' | 'disconnect' }. */
export function parseCalendarRequest(raw: unknown): 'connect' | 'disconnect' | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return r.kind === 'calendar' && (r.op === 'connect' || r.op === 'disconnect') ? r.op : null;
}
