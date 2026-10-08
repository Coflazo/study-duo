import { describe, expect, it } from 'vitest';
import { DEFAULT_CONNECTIONS, feedUrl, lastfmKey, normalizeConnections, userName } from './connections';

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
    expect(lastfmKey('0123456789ABCDEF0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
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
