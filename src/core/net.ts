import type { Connections } from './connections';

export const LISTENBRAINZ_ORIGIN = 'https://api.listenbrainz.org';
export const LASTFM_ORIGIN = 'https://ws.audioscrobbler.com';
export const GOOGLE_API_ORIGIN = 'https://www.googleapis.com';
/** Only for giving the sign-in back to Google on Disconnect. */
export const GOOGLE_OAUTH_ORIGIN = 'https://oauth2.googleapis.com';

/** A request the gate refused or that failed, with a message fit to show the user. */
export class NetError extends Error {}

/** The only origins Study Duo may contact: those of the connections that are switched on. Empty while all are off. */
export function connectionOrigins(c: Connections): Set<string> {
  const out = new Set<string>();
  if (c.deadlines.url) {
    try {
      const u = new URL(c.deadlines.url);
      if (u.protocol === 'https:') out.add(u.origin);
    } catch {
      // not a URL: nothing allowed
    }
  }
  if (c.listenbrainz.user) out.add(LISTENBRAINZ_ORIGIN);
  if (c.lastfm.user && c.lastfm.key) out.add(LASTFM_ORIGIN);
  if (c.google.on) {
    out.add(GOOGLE_API_ORIGIN);
    out.add(GOOGLE_OAUTH_ORIGIN);
  }
  return out;
}

type Opts = { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number };

/**
 * The one way connections reach the network: https to an enabled connection's origin only, with no cookies, no
 * referrer and no redirects, a timeout and a size cap read as it streams (a server can lie about its length).
 */
async function request(url: string, init: RequestInit, c: Connections, opts: Opts): Promise<{ status: number; ok: boolean; host: string; text: string }> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new NetError('That is not a web address.');
  }
  if (u.protocol !== 'https:' || !connectionOrigins(c).has(u.origin)) throw new NetError('Study Duo only contacts the connections you switched on.');

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(u.href, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: abort.signal });
    } catch {
      throw new NetError(abort.signal.aborted ? `${u.hostname} did not answer in time.` : `Could not reach ${u.hostname}.`);
    }
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new NetError(`The answer from ${u.hostname} is too large.`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      if (!reader) break;
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new NetError(`The answer from ${u.hostname} is too large.`);
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const ch of chunks) {
      all.set(ch, at);
      at += ch.byteLength;
    }
    return { status: res.status, ok: res.ok, host: u.hostname, text: new TextDecoder().decode(all) };
  } catch (e) {
    if (e instanceof NetError) throw e;
    throw new NetError(abort.signal.aborted ? `${u.hostname} did not answer in time.` : `Could not read the answer from ${u.hostname}.`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET a connection's text (a calendar feed, listening history); an HTTP error becomes a plain message. */
export async function getText(url: string, c: Connections, opts: Opts = {}): Promise<string> {
  const r = await request(url, { method: 'GET' }, c, opts);
  if (!r.ok) throw new NetError(`${r.host} answered with error ${r.status}.`);
  return r.text;
}

/**
 * Calls a JSON API (Google Calendar) under the same rules. The token goes only into the Authorization header and is
 * never logged or kept. Returns the status and parsed body, error statuses included, for the caller to act on.
 */
export async function sendJson(
  url: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; token?: string; body?: Record<string, unknown> | URLSearchParams },
  c: Connections,
  opts: Opts = {},
): Promise<{ status: number; data: unknown }> {
  const headers = new Headers();
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  let body: BodyInit | undefined;
  if (init.body instanceof URLSearchParams) body = init.body;
  else if (init.body) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.body);
  }
  const r = await request(url, { method: init.method, headers, ...(body === undefined ? {} : { body }) }, c, opts);
  let data: unknown = null;
  if (r.text) {
    try {
      data = JSON.parse(r.text);
    } catch {
      data = null;
    }
  }
  return { status: r.status, data };
}
