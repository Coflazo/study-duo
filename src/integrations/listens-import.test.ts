import { describe, expect, it } from 'vitest';
import type { ListenRecord } from '@/core/db';
import type { SessionRecord } from '@/core/sessions';
import { attachToSessions, fromLastfm, fromListenBrainz, lastfmUrl, listenBrainzUrl, mergeImported } from './listens-import';

/** A made-up Last.fm key: 32 hex characters, uniform so no scanner mistakes it for a real one. */
const KEY = 'a'.repeat(32);

const T = Date.UTC(2026, 9, 8, 9, 0);
const MIN = 60_000;
const s = (id: string, start: number, mins: number, phase: SessionRecord['phase'] = 'focus'): SessionRecord => ({ id, phase, startedAt: start, endedAt: start + mins * MIN, plannedMs: mins * MIN, activeMs: mins * MIN, pausedMs: 0, completed: true, taskId: null, rating: null, ratingSkipped: false });

describe('fromListenBrainz', () => {
  it('maps listens, with the duration when given and 3.5 minutes otherwise', () => {
    const json = { payload: { count: 2, listens: [
      { listened_at: T / 1000, track_metadata: { artist_name: 'Nils Frahm', track_name: 'Says', release_name: 'Spaces', additional_info: { duration_ms: 522_000 } } },
      { listened_at: T / 1000 + 600, track_metadata: { artist_name: 'Ólafur Arnalds', track_name: 'Near Light' } },
    ] } };
    expect(fromListenBrainz(json)).toEqual([
      { id: expect.stringMatching(/^lb-/), host: 'listenbrainz', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', startedAt: T, endedAt: T + 522_000, sessionId: null },
      { id: expect.stringMatching(/^lb-/), host: 'listenbrainz', title: 'Near Light', artist: 'Ólafur Arnalds', album: '', startedAt: T + 600_000, endedAt: T + 600_000 + 210_000, sessionId: null },
    ]);
  });

  it('ignores anything malformed and caps text', () => {
    expect(fromListenBrainz(null)).toEqual([]);
    expect(fromListenBrainz({ payload: { listens: [{ listened_at: 'x' }, { listened_at: T / 1000, track_metadata: { track_name: '' } }, 5] } })).toEqual([]);
    const [l] = fromListenBrainz({ payload: { listens: [{ listened_at: T / 1000, track_metadata: { artist_name: 'a\u0000b', track_name: 'x'.repeat(500) } }] } });
    expect(l!.title).toHaveLength(200);
    expect(l!.artist).toBe('a b');
  });
});

describe('fromLastfm', () => {
  it('maps recent tracks and skips the one playing now', () => {
    const json = { recenttracks: { track: [
      { name: 'Says', artist: { '#text': 'Nils Frahm' }, album: { '#text': 'Spaces' }, '@attr': { nowplaying: 'true' } },
      { name: 'Hammers', artist: { '#text': 'Nils Frahm' }, album: { '#text': 'Spaces' }, date: { uts: String(T / 1000) } },
    ] } };
    expect(fromLastfm(json)).toEqual([{ id: expect.stringMatching(/^fm-/), host: 'last.fm', title: 'Hammers', artist: 'Nils Frahm', album: 'Spaces', startedAt: T, endedAt: T + 210_000, sessionId: null }]);
  });

  it('accepts a single track that Last.fm sends as an object', () => {
    expect(fromLastfm({ recenttracks: { track: { name: 'Re', artist: { '#text': 'Nils Frahm' }, date: { uts: String(T / 1000) } } } })).toHaveLength(1);
  });
});

describe('attachToSessions', () => {
  it('keeps plays inside a block or break, tied to it, and drops the rest', () => {
    const sessions = [s('b1', T, 25), s('br', T + 25 * MIN, 5, 'shortBreak')];
    const at = (mins: number): ListenRecord => ({ id: `l${mins}`, host: 'listenbrainz', title: 't', artist: 'a', album: '', startedAt: T + mins * MIN, endedAt: T + (mins + 3) * MIN, sessionId: null });
    expect(attachToSessions([at(-5), at(3), at(27), at(40)], sessions).map((l) => [l.id, l.sessionId])).toEqual([['l3', 'b1'], ['l27', 'br']]);
  });
});

describe('mergeImported', () => {
  it('drops plays the browser already caught (same song within 3 minutes) and repeats of earlier imports', () => {
    const browser: ListenRecord = { id: 'tab', host: 'music.youtube.com', title: 'Says ', artist: 'nils frahm', album: '', startedAt: T + 60_000, endedAt: T + 500_000, sessionId: 'b1' };
    const imported: ListenRecord[] = [
      { id: 'lb-1', host: 'listenbrainz', title: 'Says', artist: 'Nils Frahm', album: '', startedAt: T, endedAt: T + 522_000, sessionId: 'b1' },
      { id: 'lb-2', host: 'listenbrainz', title: 'Hammers', artist: 'Nils Frahm', album: '', startedAt: T + 600_000, endedAt: T + 800_000, sessionId: 'b1' },
      { id: 'lb-3', host: 'listenbrainz', title: 'Re', artist: 'Nils Frahm', album: '', startedAt: T + 900_000, endedAt: T + 1_000_000, sessionId: 'b1' },
    ];
    expect(mergeImported([browser, { ...imported[2]! }], imported).map((l) => l.id)).toEqual(['lb-2']);
  });
});

describe('request addresses', () => {
  it('builds them from validated parts only', () => {
    expect(listenBrainzUrl('ana_b', T)).toBe(`https://api.listenbrainz.org/1/user/ana_b/listens?min_ts=${T / 1000}&count=1000`);
    expect(lastfmUrl('ana_b', KEY, T, 2)).toBe(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=ana_b&api_key=${KEY}&from=${T / 1000}&limit=200&page=2&format=json`);
  });
});
