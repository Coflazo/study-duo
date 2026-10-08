import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONNECTIONS, type Connections } from './connections';
import { connectionOrigins, getText, GOOGLE_API_ORIGIN, GOOGLE_OAUTH_ORIGIN, LASTFM_ORIGIN, LISTENBRAINZ_ORIGIN, NetError, sendJson } from './net';

const FEED = 'https://canvas.example.edu/feeds/calendars/user_abc.ics';
const on = (patch: Partial<{ url: string; lb: string; fm: [string, string]; google: boolean }> = {}): Connections => ({
  ...DEFAULT_CONNECTIONS,
  google: { ...DEFAULT_CONNECTIONS.google, on: patch.google ?? false },
  deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url: patch.url ?? null },
  listenbrainz: { ...DEFAULT_CONNECTIONS.listenbrainz, user: patch.lb ?? null },
  lastfm: { ...DEFAULT_CONNECTIONS.lastfm, user: patch.fm?.[0] ?? null, key: patch.fm?.[1] ?? null },
});
const ok = (body: string, headers: Record<string, string> = {}) => vi.fn(async () => new Response(body, { status: 200, headers }));

describe('connectionOrigins', () => {
  it('is empty while every connection is off', () => {
    expect(connectionOrigins(DEFAULT_CONNECTIONS).size).toBe(0);
  });

  it('holds exactly the origins of the connections that are on', () => {
    expect([...connectionOrigins(on({ url: FEED, lb: 'ana', fm: ['ana', 'k'] }))].sort()).toEqual(['https://canvas.example.edu', LASTFM_ORIGIN, LISTENBRAINZ_ORIGIN].sort());
    expect(connectionOrigins(on({ fm: ['ana', ''] })).size).toBe(0); // Last.fm needs both
    expect(connectionOrigins(on({ url: 'http://canvas.example.edu/feed.ics' })).size).toBe(0);
  });

  it('lets Google in only while Google Calendar is switched on', () => {
    expect([...connectionOrigins(on({ google: true }))].sort()).toEqual([GOOGLE_API_ORIGIN, GOOGLE_OAUTH_ORIGIN].sort());
    expect(connectionOrigins(on({ google: false })).size).toBe(0);
  });
});

describe('getText', () => {
  it('fetches an allowed address with no cookies, no referrer and no redirects', async () => {
    const fetch = ok('BEGIN:VCALENDAR');
    expect(await getText(FEED, on({ url: FEED }), { fetch })).toBe('BEGIN:VCALENDAR');
    expect(fetch).toHaveBeenCalledWith(FEED, expect.objectContaining({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' }));
  });

  it('refuses addresses no enabled connection owns, plain http, and everything while off', async () => {
    const fetch = ok('x');
    await expect(getText('https://evil.example/x', on({ url: FEED, lb: 'ana' }), { fetch })).rejects.toBeInstanceOf(NetError);
    await expect(getText('http://canvas.example.edu/feeds/calendars/user_abc.ics', on({ url: FEED }), { fetch })).rejects.toBeInstanceOf(NetError);
    await expect(getText(`${LISTENBRAINZ_ORIGIN}/1/user/ana/listens`, DEFAULT_CONNECTIONS, { fetch })).rejects.toBeInstanceOf(NetError);
    await expect(getText('not a url', on({ url: FEED }), { fetch })).rejects.toBeInstanceOf(NetError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns HTTP errors into a plain message', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(getText(FEED, on({ url: FEED }), { fetch })).rejects.toThrow('answered with error 404');
  });

  it('stops reading past the size cap, whatever the server claims', async () => {
    const big = 'x'.repeat(5000);
    await expect(getText(FEED, on({ url: FEED }), { fetch: ok(big), maxBytes: 1000 })).rejects.toThrow('too large');
    await expect(getText(FEED, on({ url: FEED }), { fetch: ok('small', { 'content-length': '999999' }), maxBytes: 1000 })).rejects.toThrow('too large');
  });

  it('gives up after the timeout', async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    await expect(getText(FEED, on({ url: FEED }), { fetch: fetch as unknown as typeof globalThis.fetch, timeoutMs: 20 })).rejects.toThrow('did not answer');
  });
});

describe('the gate is the only way out (security review)', () => {
  it('no other source file calls fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|svelte)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push(p);
      }
    };
    walk(path.resolve(__dirname, '..'));
    const using = (re: RegExp) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(path.resolve(__dirname, '..'), f)).sort();
    // UpdateNotice reads the extension's own /manifest.json (same origin, no network); nothing else calls out directly.
    expect(using(/\b(fetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon)/)).toEqual(['ui/UpdateNotice.svelte']);
    // The global fetch is reached only from the gate (as its default) and that same-origin read.
    expect(using(/(^|[^.\w])fetch\b/m)).toEqual(['core/net.ts', 'ui/UpdateNotice.svelte']);
  });
});

describe('sendJson', () => {
  const API = `${GOOGLE_API_ORIGIN}/calendar/v3/calendars/primary/events`;
  const reply = (status: number, body = '') => vi.fn(async () => new Response(body || null, { status }));

  it('sends JSON with the token as a bearer header, and no cookies, referrer or redirects', async () => {
    const fetch = reply(200, '{"id":"abc"}');
    const out = await sendJson(API, { method: 'POST', token: 'ya29.secret', body: { summary: 'Study' } }, on({ google: true }), { fetch });
    expect(out).toEqual({ status: 200, data: { id: 'abc' } });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toEqual(expect.objectContaining({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' }));
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer ya29.secret');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.body).toBe('{"summary":"Study"}');
  });

  it('hands back error statuses for the caller to act on (409 means the event already exists)', async () => {
    expect(await sendJson(API, { method: 'POST', body: {} }, on({ google: true }), { fetch: reply(409, '{"error":{"code":409}}') })).toEqual({ status: 409, data: { error: { code: 409 } } });
    expect(await sendJson(API, { method: 'DELETE' }, on({ google: true }), { fetch: reply(204) })).toEqual({ status: 204, data: null });
  });

  it('sends a form for the token revoke', async () => {
    const fetch = reply(200);
    await sendJson(`${GOOGLE_OAUTH_ORIGIN}/revoke`, { method: 'POST', body: new URLSearchParams({ token: 't' }) }, on({ google: true }), { fetch });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toBe('token=t');
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });

  it('refuses Google while it is switched off, and any other origin', async () => {
    const fetch = reply(200);
    await expect(sendJson(API, { method: 'POST', body: {} }, on({ google: false }), { fetch })).rejects.toBeInstanceOf(NetError);
    await expect(sendJson('https://evil.example/x', { method: 'POST', body: {} }, on({ google: true }), { fetch })).rejects.toBeInstanceOf(NetError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the size cap and turns a dead network into a plain message', async () => {
    await expect(sendJson(API, { method: 'GET' }, on({ google: true }), { fetch: reply(200, 'x'.repeat(5000)), maxBytes: 1000 })).rejects.toThrow('too large');
    await expect(sendJson(API, { method: 'GET' }, on({ google: true }), { fetch: vi.fn(async () => { throw new TypeError('offline'); }) })).rejects.toThrow('Could not reach');
  });
});
