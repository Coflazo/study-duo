import { describe, expect, it } from 'vitest';
import { parseStreamLink } from './stream-links-parse';

const ok = (raw: string) => {
  const r = parseStreamLink(raw);
  if (!r.ok) throw new Error(r.reason);
  return r.link;
};

describe('parseStreamLink', () => {
  it('reads Spotify links and URIs, dropping who shared them', () => {
    expect(ok('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ?si=abc123')).toEqual({ source: 'spotify', kind: 'playlist', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', embed: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ', start: 0 });
    expect(ok('https://open.spotify.com/intl-de/track/2i6veFyjDIodH3hgpkwxK6').url).toBe('https://open.spotify.com/track/2i6veFyjDIodH3hgpkwxK6');
    expect(ok('spotify:album:4aawyAB9vmqN3uQ7FjRGTy').embed).toBe('https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy');
  });

  it('reads SoundCloud tracks and sets, and refuses short links it cannot open', () => {
    expect(ok('https://soundcloud.com/forss/flickermood?in=x&si=y')).toMatchObject({ source: 'soundcloud', kind: 'track', url: 'https://soundcloud.com/forss/flickermood' });
    expect(ok('soundcloud.com/lofi-girl/sets/study-session').kind).toBe('playlist');
    expect(ok('https://soundcloud.com/forss/flickermood').embed).toBe('https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&visual=false&show_comments=false');
    expect(parseStreamLink('https://on.soundcloud.com/abc123')).toEqual({ ok: false, reason: 'short-link' });
  });

  it('reads Apple Music and Tidal links into their embeds', () => {
    expect(ok('https://music.apple.com/us/album/random-access-memories/617154241?i=617154366')).toMatchObject({ source: 'apple', kind: 'album', embed: 'https://embed.music.apple.com/us/album/random-access-memories/617154241?i=617154366' });
    expect(ok('https://music.apple.com/nl/playlist/pure-focus/pl.u-abc123').embed).toBe('https://embed.music.apple.com/nl/playlist/pure-focus/pl.u-abc123');
    expect(ok('https://tidal.com/browse/track/77646168?u')).toEqual({ source: 'tidal', kind: 'track', url: 'https://tidal.com/browse/track/77646168', embed: 'https://embed.tidal.com/tracks/77646168', start: 0 });
    expect(ok('https://listen.tidal.com/playlist/0b1e7a4c-6b5a-4c1c-9d3e-2f5a6b7c8d9e').embed).toBe('https://embed.tidal.com/playlists/0b1e7a4c-6b5a-4c1c-9d3e-2f5a6b7c8d9e');
  });

  it('keeps YouTube as before, and names what it cannot play', () => {
    expect(ok('https://youtu.be/X0Cv0l-j86Y?t=60&si=s')).toMatchObject({ source: 'youtube', kind: 'video', url: 'https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=60', start: 60 });
    expect(parseStreamLink('https://example.com/song')).toEqual({ ok: false, reason: 'unknown' });
    expect(parseStreamLink('https://open.spotify.com/user/someone')).toEqual({ ok: false, reason: 'unknown' });
    expect(parseStreamLink('javascript:alert(1)')).toEqual({ ok: false, reason: 'unknown' });
  });
});
