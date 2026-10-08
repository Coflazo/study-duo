import { describe, expect, it } from 'vitest';
import { appHost, helperError, parseHelperMessage } from './helper';

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
});

describe('helperError', () => {
  it('turns the browser messages into plain advice', () => {
    expect(helperError('Specified native messaging host not found.')).toMatch(/isn't installed/);
    expect(helperError('Access to the specified native messaging host is forbidden.')).toMatch(/isn't installed for this browser/);
    expect(helperError('Native host has exited.')).toMatch(/stopped/);
    expect(helperError(undefined)).toMatch(/stopped/);
  });
});
