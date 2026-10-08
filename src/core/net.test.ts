import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONNECTIONS, type Connections } from './connections';
import { connectionOrigins, getText, LASTFM_ORIGIN, LISTENBRAINZ_ORIGIN, NetError } from './net';

const FEED = 'https://canvas.example.edu/feeds/calendars/user_abc.ics';
const on = (patch: Partial<{ url: string; lb: string; fm: [string, string] }> = {}): Connections => ({
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
