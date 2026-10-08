import { describe, expect, it } from 'vitest';
import { appHost, helperError, helperErrorText, isBrowserApp, parseHelperMessage } from './helper';

describe('parseHelperMessage', () => {
  it('reads what the helper sends, as a song or as nothing playing', () => {
    expect(parseHelperMessage({ kind: 'now', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', app: 'Music', playing: true })).toEqual({ app: 'Music', song: { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', playing: true } });
    expect(parseHelperMessage({ kind: 'now', title: '', artist: '', album: '', app: '', playing: false })).toEqual({ app: '', song: null });
  });

  it('refuses anything else, and cleans and caps the text', () => {
    expect(parseHelperMessage(null)).toBeNull();
    expect(parseHelperMessage({ kind: 'other' })).toBeNull();
    expect(parseHelperMessage({ kind: 'now', title: 5, artist: '', album: '', app: 'x', playing: true })).toBeNull();
    const m = parseHelperMessage({ kind: 'now', title: `a\u0000b${'x'.repeat(400)}`, artist: '', album: '', app: 'V\u0007LC', playing: true })!;
    expect(m.song!.title.startsWith('a b')).toBe(true);
    expect(m.song!.title.length).toBeLessThanOrEqual(200);
    expect(m.app).toBe('V LC');
  });
});

describe('appHost', () => {
  it('names desktop apps apart from websites', () => {
    expect(appHost('Music')).toBe('app:music');
    expect(appHost('Apple Music')).toBe('app:apple-music');
    expect(appHost('')).toBe('app:unknown');
  });

  it('files every Spotify client as app:spotify, which insights leave out (security review)', () => {
    for (const app of ['Spotify', 'SpotifyMusic', 'spotifyd', 'ncspot', 'psst']) expect(appHost(app)).toBe('app:spotify');
  });

  it('knows browsers, whose tabs the helper must not report (security review)', () => {
    for (const app of ['Chrome', 'chromium', 'MSEdge', 'firefox', 'Brave', 'Vivaldi', 'opera']) expect(isBrowserApp(app)).toBe(true);
    for (const app of ['Music', 'VLC', 'foobar2000', 'Spotify']) expect(isBrowserApp(app)).toBe(false);
  });
});

describe('helperError', () => {
  it('turns the browser messages into codes, and codes into plain advice', () => {
    expect(helperError('Specified native messaging host not found.')).toBe('missing');
    expect(helperError('Access to the specified native messaging host is forbidden.')).toBe('forbidden');
    expect(helperError('Native host has exited.')).toBe('stopped');
    expect(helperError(undefined)).toBe('stopped');
    expect(helperErrorText('missing')).toMatch(/isn't installed\. Run the install line again with --helper/);
    expect(helperErrorText('forbidden')).toMatch(/isn't installed for this browser/);
  });
});
