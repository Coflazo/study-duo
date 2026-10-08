import type { Connections } from './connections';

export const LISTENBRAINZ_ORIGIN = 'https://api.listenbrainz.org';
export const LASTFM_ORIGIN = 'https://ws.audioscrobbler.com';

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
  return out;
}

/**
 * The one way connections reach the network. GET over https to an enabled connection's origin only, with no cookies,
 * no referrer and no redirects, a timeout and a size cap read as it streams (a server can lie about its length).
 */
export async function getText(url: string, c: Connections, opts: { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
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
      res = await doFetch(u.href, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: abort.signal });
    } catch {
      throw new NetError(abort.signal.aborted ? `${u.hostname} did not answer in time.` : `Could not reach ${u.hostname}.`);
    }
    if (!res.ok) throw new NetError(`${u.hostname} answered with error ${res.status}.`);
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new NetError(`The answer from ${u.hostname} is too large.`);
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
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
    return new TextDecoder().decode(all);
  } catch (e) {
    if (e instanceof NetError) throw e;
    throw new NetError(abort.signal.aborted ? `${u.hostname} did not answer in time.` : `Could not read the answer from ${u.hostname}.`);
  } finally {
    clearTimeout(timer);
  }
}
