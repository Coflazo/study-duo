import { withDb } from './db';

/** Opt-in connections. All off by default; nothing is fetched until the user turns one on. */

interface Status {
  /** When the last check finished, successful or not. */
  lastSync: number | null;
  /** What the last good check brought in (deadlines kept, or songs added). */
  count: number;
  /** A plain-language reason the last check failed, or null. */
  error: string | null;
}

export interface Connections {
  deadlines: Status & {
    /** An https calendar feed (Canvas: Calendar > Calendar feed). Kept in the extension database, never in storage. */
    url: string | null;
    /** The feed's host name, for display: what storage.local holds instead of the link. */
    host: string | null;
    /** UIDs of feed to-dos the user deleted, so a later check does not bring them back. */
    dismissed: string[];
  };
  listenbrainz: Status & { user: string | null };
  /** The key is kept in the extension database, never in storage. */
  lastfm: Status & { user: string | null; key: string | null };
}

const status = (): Status => ({ lastSync: null, count: 0, error: null });

export const DEFAULT_CONNECTIONS: Connections = {
  deadlines: { ...status(), url: null, host: null, dismissed: [] },
  listenbrainz: { ...status(), user: null },
  lastfm: { ...status(), user: null, key: null },
};

export const connectionsItem = storage.defineItem<Connections>('local:connections', { fallback: DEFAULT_CONNECTIONS });

/** A pasted feed link as an https URL: webcal:// becomes https://, anything else that is not https is refused. */
export function feedUrl(raw: string): string | null {
  const s = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

/** ListenBrainz and Last.fm user names: letters, digits, dot, dash, underscore; up to 64; not only dots. */
export function userName(raw: string): string | null {
  const s = raw.trim();
  return /^(?!\.+$)[\w.-]{1,64}$/.test(s) ? s : null;
}

/** A Last.fm API key is 32 hex characters. */
export function lastfmKey(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(s) ? s : null;
}

const str = (v: unknown, ok: (s: string) => string | null) => (typeof v === 'string' ? ok(v) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const statusOf = (v: Record<string, unknown>): Status => ({
  lastSync: num(v.lastSync),
  count: Math.max(0, Math.floor(num(v.count) ?? 0)),
  error: typeof v.error === 'string' ? v.error.slice(0, 200) : null,
});
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Whatever is stored, a well-formed Connections. */
export function normalizeConnections(raw: unknown): Connections {
  const r = obj(raw);
  const d = obj(r.deadlines);
  const lb = obj(r.listenbrainz);
  const fm = obj(r.lastfm);
  return {
    deadlines: {
      ...statusOf(d),
      url: str(d.url, feedUrl),
      host: str(d.host, (h) => (/^[a-z0-9.-]{1,253}$/i.test(h) ? h.toLowerCase() : null)),
      dismissed: Array.isArray(d.dismissed) ? d.dismissed.filter((x): x is string => typeof x === 'string').slice(-2000) : [],
    },
    listenbrainz: { ...statusOf(lb), user: str(lb.user, userName) },
    lastfm: { ...statusOf(fm), user: str(fm.user, userName), key: str(fm.key, lastfmKey) },
  };
}

/** Remembers (or, on undo, forgets) a deleted course deadline, so the next check does not add it again. */
export async function setDismissed(uid: string, dismissed: boolean): Promise<void> {
  const c = normalizeConnections(await connectionsItem.getValue());
  const rest = c.deadlines.dismissed.filter((x) => x !== uid);
  await connectionsItem.setValue({ ...c, deadlines: { ...c.deadlines, dismissed: dismissed ? [...rest, uid] : rest } });
}

const SECRET_FEED = 'feedUrl';
const SECRET_LASTFM = 'lastfmKey';

async function readSecret(id: string): Promise<string | null> {
  try {
    return (await withDb((db) => db.get('secrets', id)))?.value ?? null;
  } catch {
    return null;
  }
}

async function writeSecret(id: string, value: string | null): Promise<void> {
  await withDb((db) => (value === null ? db.delete('secrets', id) : db.put('secrets', { id, value }).then(() => undefined)));
}

/**
 * Connections as the background uses them: status and user names from storage, the feed link and the Last.fm key
 * from the extension database only. Whatever a page writes into storage cannot change what is fetched.
 */
export async function loadConnections(): Promise<Connections> {
  const c = normalizeConnections(await connectionsItem.getValue());
  const [url, key] = await Promise.all([readSecret(SECRET_FEED), readSecret(SECRET_LASTFM)]);
  return { ...c, deadlines: { ...c.deadlines, url: url === null ? null : feedUrl(url) }, lastfm: { ...c.lastfm, key: key === null ? null : lastfmKey(key) } };
}

/** Saves connections: secrets into the extension database, everything else (and the feed's host name) into storage. */
export async function saveConnections(c: Connections): Promise<void> {
  await writeSecret(SECRET_FEED, c.deadlines.url);
  await writeSecret(SECRET_LASTFM, c.lastfm.key);
  const host = c.deadlines.url ? new URL(c.deadlines.url).hostname : null;
  await connectionsItem.setValue({ ...c, deadlines: { ...c.deadlines, url: null, host }, lastfm: { ...c.lastfm, key: null } });
}
