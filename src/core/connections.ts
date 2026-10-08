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
    /** An https calendar feed (Canvas: Calendar > Calendar feed). */
    url: string | null;
    /** UIDs of feed to-dos the user deleted, so a later check does not bring them back. */
    dismissed: string[];
  };
  listenbrainz: Status & { user: string | null };
  lastfm: Status & { user: string | null; key: string | null };
}

const status = (): Status => ({ lastSync: null, count: 0, error: null });

export const DEFAULT_CONNECTIONS: Connections = {
  deadlines: { ...status(), url: null, dismissed: [] },
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

/** ListenBrainz and Last.fm user names: letters, digits, dot, dash, underscore; up to 64. */
export function userName(raw: string): string | null {
  const s = raw.trim();
  return /^[\w.-]{1,64}$/.test(s) ? s : null;
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
      dismissed: Array.isArray(d.dismissed) ? d.dismissed.filter((x): x is string => typeof x === 'string').slice(-2000) : [],
    },
    listenbrainz: { ...statusOf(lb), user: str(lb.user, userName) },
    lastfm: { ...statusOf(fm), user: str(fm.user, userName), key: str(fm.key, lastfmKey) },
  };
}
