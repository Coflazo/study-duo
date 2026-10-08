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
