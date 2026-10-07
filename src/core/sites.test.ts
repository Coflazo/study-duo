import { describe, expect, it } from 'vitest';
import { categoryFor, hostOf, MUSIC_SITES, normalizeDomain, normalizeSites, seedMusicSites, siteOf } from './sites';

describe('hostOf', () => {
  it('reads the site from web addresses only', () => {
    expect(hostOf('https://www.khanacademy.org/math?x=1')).toBe('khanacademy.org');
    expect(hostOf('http://Music.YouTube.com:8080/watch')).toBe('music.youtube.com');
    expect(hostOf('file:///Users/me/notes.pdf')).toBeNull();
    expect(hostOf('chrome://extensions')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

describe('normalizeDomain', () => {
  const ok = (input: string, domain: string) => expect(normalizeDomain(input)).toEqual({ domain });
  const bad = (input: string, error: string) => expect(normalizeDomain(input)).toEqual({ error });

  it('accepts what people paste or type', () => {
    ok('KhanAcademy.org', 'khanacademy.org');
    ok('  https://www.khanacademy.org/computing  ', 'khanacademy.org');
    ok('music.youtube.com', 'music.youtube.com');
    ok('bücher.de', 'xn--bcher-kva.de');
    ok('reddit.com.', 'reddit.com');
    ok('my_host.example.com', 'my_host.example.com');
  });

  it('rejects input that is not a website name, with a plain reason', () => {
    bad('', 'Type a website, like khanacademy.org.');
    bad('*.reddit.com', 'Type the site without *, like reddit.com.');
    bad('localhost', 'Only website names like khanacademy.org.');
    bad('192.168.1.10', 'Only website names like khanacademy.org.');
    bad('[::1]', 'Only website names like khanacademy.org.');
    bad('chrome://settings', 'Only website names like khanacademy.org.');
    bad('khan academy', 'Only website names like khanacademy.org.');
    bad('x'.repeat(260) + '.com', 'Only website names like khanacademy.org.');
  });
});

describe('categoryFor', () => {
  const sites = { 'youtube.com': 'blocked', 'music.youtube.com': 'neutral', 'google.com': 'study', 'mail.google.com': 'blocked' } as const;

  it('uses the most specific entry on label boundaries', () => {
    expect(categoryFor('youtube.com', sites)).toBe('blocked');
    expect(categoryFor('m.youtube.com', sites)).toBe('blocked');
    expect(categoryFor('music.youtube.com', sites)).toBe('neutral');
    expect(categoryFor('mail.google.com', sites)).toBe('blocked');
    expect(categoryFor('docs.google.com', sites)).toBe('study');
    expect(categoryFor('notyoutube.com', sites)).toBeNull();
    expect(categoryFor('khanacademy.org', sites)).toBeNull();
  });
});

describe('normalizeSites', () => {
  it('keeps valid entries and drops the rest', () => {
    expect(normalizeSites({ 'youtube.com': 'blocked', 'Bad Key': 'study', 'reddit.com': 'nope', 'khanacademy.org': 'study' })).toEqual({
      'youtube.com': 'blocked',
      'khanacademy.org': 'study',
    });
    expect(normalizeSites(null)).toEqual({});
    expect(normalizeSites(['youtube.com'])).toEqual({});
  });
});

describe('siteOf', () => {
  it('is the fileable site of a page, or null for pages that cannot be filed', () => {
    expect(siteOf('https://www.khanacademy.org/x')).toBe('khanacademy.org');
    expect(siteOf('http://my_host.example.com/')).toBe('my_host.example.com');
    for (const url of ['http://localhost:5173/', 'http://192.168.1.1/', 'http://[::1]/', 'http://intranet/', 'file:///a.html', undefined]) {
      expect(siteOf(url), String(url)).toBeNull();
    }
  });
});

describe('music sites stay open by default', () => {
  it('files the music players as Not blocked, without overriding anything the user filed', () => {
    const seeded = seedMusicSites({ 'youtube.com': 'blocked', 'open.spotify.com': 'blocked' });
    expect(seeded['music.youtube.com']).toBe('neutral');
    expect(seeded['open.spotify.com']).toBe('blocked');
    expect(seeded['youtube.com']).toBe('blocked');
    for (const d of MUSIC_SITES) expect(normalizeDomain(d)).toEqual({ domain: d });
    expect(categoryFor('music.youtube.com', seeded)).toBe('neutral');
  });
});
