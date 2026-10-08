import { describe, expect, it } from 'vitest';
import { foldListen, isMusicHost, parseNowPlaying, type OpenListen } from './music';

const T = 1_800_000_000_000;
const song = { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', playing: true };

describe('isMusicHost', () => {
  it('knows the music players and YouTube, by whole labels', () => {
    for (const h of ['music.youtube.com', 'open.spotify.com', 'music.apple.com', 'soundcloud.com', 'www.youtube.com', 'youtube.com', 'm.youtube.com']) expect(isMusicHost(h)).toBe(true);
    for (const h of ['notyoutube.com', 'spotify.com.evil.example', 'github.com', null]) expect(isMusicHost(h)).toBe(false);
  });
});

describe('parseNowPlaying', () => {
  it('accepts a now-playing report with short text, trimmed and capped', () => {
    expect(parseNowPlaying({ kind: 'music', op: 'now', ...song })).toEqual(song);
    expect(parseNowPlaying({ kind: 'music', op: 'now', title: `  ${'x'.repeat(500)} `, artist: '', album: '', playing: false })).toEqual({ title: 'x'.repeat(200), artist: '', album: '', playing: false });
  });

  it('rejects anything else', () => {
    expect(parseNowPlaying({ kind: 'music', op: 'now', ...song, title: '' })).toBeNull();
    expect(parseNowPlaying({ kind: 'music', op: 'now', ...song, playing: 'yes' })).toBeNull();
    expect(parseNowPlaying({ kind: 'music', op: 'now', ...song, artist: 3 })).toBeNull();
    expect(parseNowPlaying({ kind: 'music', op: 'gone' })).toBeNull();
  });
});

describe('foldListen', () => {
  it('opens a listen when a song plays and keeps it while the same song plays on', () => {
    const a = foldListen(null, song, T, 'music.youtube.com', 'block-1');
    expect(a.closed).toBeNull();
    expect(a.open).toEqual<OpenListen>({ host: 'music.youtube.com', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', startedAt: T, sessionId: 'block-1' });
    expect(foldListen(a.open, song, T + 60_000, 'music.youtube.com', 'block-1').open).toBe(a.open);
  });

  it('closes it at a pause, a new song or a closed tab', () => {
    const open = foldListen(null, song, T, 'music.youtube.com', null).open!;
    expect(foldListen(open, { ...song, playing: false }, T + 90_000, 'music.youtube.com', null)).toEqual({ open: null, closed: { id: `${T}-music.youtube.com`, ...open, endedAt: T + 90_000 } });
    const next = foldListen(open, { ...song, title: 'Hammers' }, T + 90_000, 'music.youtube.com', null);
    expect(next.closed).toMatchObject({ title: 'Says', endedAt: T + 90_000 });
    expect(next.open).toMatchObject({ title: 'Hammers', startedAt: T + 90_000 });
    expect(foldListen(open, null, T + 30_000, 'music.youtube.com', null).closed).toMatchObject({ endedAt: T + 30_000 });
  });

  it('drops listens shorter than 5 seconds (skipping through a playlist)', () => {
    const open = foldListen(null, song, T, 'music.youtube.com', null).open!;
    expect(foldListen(open, { ...song, title: 'Next' }, T + 3000, 'music.youtube.com', null).closed).toBeNull();
  });
});

describe('parseNowPlaying with hostile titles (security review L1)', () => {
  it('turns control characters into spaces', () => {
    const now = parseNowPlaying({ kind: 'music', op: 'now', title: 'x\rURL:evil\nBEGIN', artist: 'a\u0000b', album: '', playing: true });
    expect(now).toEqual({ title: 'x URL:evil BEGIN', artist: 'a b', album: '', playing: true });
  });
});
