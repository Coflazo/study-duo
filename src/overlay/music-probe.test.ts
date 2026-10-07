import { describe, expect, it } from 'vitest';
import { changes, readNowPlaying } from './music-probe';

const media = (title: string | null, state: string, playingElement = false) => ({
  mediaSession: { metadata: title === null ? null : { title, artist: 'Nils Frahm', album: 'Spaces' }, playbackState: state },
  playingMedia: () => playingElement,
});

describe('readNowPlaying', () => {
  it('reads the page media session, and trusts a playing element when the site never sets the state', () => {
    expect(readNowPlaying(media('Says', 'playing'))).toEqual({ title: 'Says', artist: 'Nils Frahm', album: 'Spaces', playing: true });
    expect(readNowPlaying(media('Says', 'none', true))).toMatchObject({ playing: true });
    expect(readNowPlaying(media('Says', 'none', false))).toMatchObject({ playing: false });
    expect(readNowPlaying(media('Says', 'paused', true))).toMatchObject({ playing: false });
    expect(readNowPlaying(media(null, 'playing'))).toBeNull();
    expect(readNowPlaying(media('', 'playing'))).toBeNull();
  });
});

describe('changes', () => {
  it('passes on only what changed', () => {
    const next = changes();
    const a = { title: 'Says', artist: 'N', album: 'S', playing: true };
    expect(next(a)).toEqual(a);
    expect(next({ ...a })).toBeUndefined();
    expect(next({ ...a, playing: false })).toEqual({ ...a, playing: false });
    expect(next(null)).toBeNull();
    expect(next(null)).toBeUndefined();
  });
});
