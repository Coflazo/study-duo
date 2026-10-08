import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONNECTIONS, feedUrl, lastfmKey, normalizeConnections, userName } from './connections';

/** A made-up Last.fm key: 32 hex characters, uniform so no scanner mistakes it for a real one. */
const KEY = 'a'.repeat(32);

describe('cleaning what the user types', () => {
  it('accepts https and webcal feed links, nothing else', () => {
    expect(feedUrl(' webcal://canvas.uva.nl/feeds/calendars/user_x.ics ')).toBe('https://canvas.uva.nl/feeds/calendars/user_x.ics');
    expect(feedUrl('https://canvas.uva.nl/feeds/calendars/user_x.ics')).toBe('https://canvas.uva.nl/feeds/calendars/user_x.ics');
    expect(feedUrl('http://canvas.uva.nl/x.ics')).toBeNull();
    expect(feedUrl('javascript:alert(1)')).toBeNull();
    expect(feedUrl('https://localhost/x.ics')).toBeNull();
    expect(feedUrl('nonsense')).toBeNull();
  });

  it('accepts plain user names and 32-character hex Last.fm keys', () => {
    expect(userName(' ana_b.92 ')).toBe('ana_b.92');
    expect(userName('ana b')).toBeNull();
    expect(userName('a/../b')).toBeNull();
    expect(lastfmKey(KEY.toUpperCase())).toBe(KEY);
    expect(lastfmKey('xyz')).toBeNull();
  });

  it('turns anything stored into well-formed connections', () => {
    expect(normalizeConnections(undefined)).toEqual(DEFAULT_CONNECTIONS);
    expect(normalizeConnections({ deadlines: { url: 'http://x.example/a.ics', dismissed: ['a', 3] }, listenbrainz: { user: 'ok', count: -4 }, lastfm: { user: 'x', key: 'short' } })).toEqual({
      deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url: null, dismissed: ['a'] },
      listenbrainz: { ...DEFAULT_CONNECTIONS.listenbrainz, user: 'ok', count: 0 },
      lastfm: { ...DEFAULT_CONNECTIONS.lastfm, user: 'x', key: null },
    });
  });
});

describe('setDismissed', () => {
  it('remembers a deleted deadline and forgets it again on undo', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { connectionsItem, setDismissed } = await import('./connections');
    fakeBrowser.reset();
    await setDismissed('event-assignment-1', true);
    await setDismissed('event-assignment-1', true);
    expect(normalizeConnections(await connectionsItem.getValue()).deadlines.dismissed).toEqual(['event-assignment-1']);
    await setDismissed('event-assignment-1', false);
    expect(normalizeConnections(await connectionsItem.getValue()).deadlines.dismissed).toEqual([]);
  });
});

describe('secrets stay out of storage pages can read (security review)', () => {
  it('keeps the feed link and the Last.fm key in the extension database, and only the host in storage', async () => {
    globalThis.indexedDB = new IDBFactory();
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    fakeBrowser.reset();
    const { connectionsItem, loadConnections, saveConnections } = await import('./connections');
    const url = 'https://canvas.example.edu/feeds/calendars/user_SECRETTOKEN.ics';
    await saveConnections({ ...DEFAULT_CONNECTIONS, deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url }, lastfm: { ...DEFAULT_CONNECTIONS.lastfm, user: 'ana', key: KEY } });
    const stored = JSON.stringify(await connectionsItem.getValue());
    expect(stored).not.toContain('SECRETTOKEN');
    expect(stored).not.toContain(KEY);
    expect(normalizeConnections(await connectionsItem.getValue()).deadlines.host).toBe('canvas.example.edu');
    const loaded = await loadConnections();
    expect([loaded.deadlines.url, loaded.lastfm.key, loaded.lastfm.user]).toEqual([url, KEY, 'ana']);
    // A page that writes a different link into storage changes nothing the extension fetches.
    await connectionsItem.setValue({ ...(await connectionsItem.getValue()), deadlines: { ...DEFAULT_CONNECTIONS.deadlines, url: 'https://evil.example/x.ics', host: 'evil.example' } });
    expect((await loadConnections()).deadlines.url).toBe(url);
    await saveConnections({ ...loaded, deadlines: { ...loaded.deadlines, url: null }, lastfm: { ...loaded.lastfm, user: null, key: null } });
    expect((await loadConnections()).deadlines.url).toBeNull();
    expect((await loadConnections()).lastfm.key).toBeNull();
  });

  it('refuses user names made only of dots', () => {
    expect(userName('..')).toBeNull();
    expect(userName('.')).toBeNull();
    expect(userName('a.b')).toBe('a.b');
  });
});
