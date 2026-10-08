import { describe, expect, it } from 'vitest';
import { canonicalYouTube, parseYouTubeLink } from './youtube';

const ok = (raw: string) => {
  const r = parseYouTubeLink(raw);
  if (!r.ok) throw new Error(`expected a link, got ${r.reason}`);
  return r.link;
};

describe('parseYouTubeLink', () => {
  it('reads a playlist', () => {
    expect(ok('https://www.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp')).toEqual({ kind: 'playlist', video: null, list: 'PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp', start: 0 });
  });

  it('reads a video inside a playlist, so the playlist starts there', () => {
    expect(ok('https://www.youtube.com/watch?v=lTRiuFIWV54&list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp&index=3')).toEqual({ kind: 'video', video: 'lTRiuFIWV54', list: 'PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp', start: 0 });
  });

  it('reads one video and drops sharing and tracking parts', () => {
    expect(ok('https://www.youtube.com/watch?v=X0Cv0l-j86Y&xstg=CAMSEBUJ_b-oH-PhF0yjBgb_zzE%3D&si=abc&pp=xyz&feature=share')).toEqual({ kind: 'video', video: 'X0Cv0l-j86Y', list: null, start: 0 });
  });

  it('reads short links, Shorts, live and embed addresses, and links without https', () => {
    for (const raw of ['https://youtu.be/X0Cv0l-j86Y?si=x', 'youtube.com/shorts/X0Cv0l-j86Y', 'https://www.youtube.com/live/X0Cv0l-j86Y?si=y', 'https://www.youtube-nocookie.com/embed/X0Cv0l-j86Y', '  m.youtube.com/watch?v=X0Cv0l-j86Y  ']) {
      expect(ok(raw).video).toBe('X0Cv0l-j86Y');
    }
  });

  it('reads YouTube Music playlists and songs, which play through the same player', () => {
    expect(ok('https://music.youtube.com/playlist?list=OLAK5uy_kxyz0123456789abcdefghijklmnopqrs').kind).toBe('playlist');
    expect(ok('https://music.youtube.com/watch?v=lTRiuFIWV54').video).toBe('lTRiuFIWV54');
  });

  it('reads a start time in seconds or in hours, minutes and seconds', () => {
    expect(ok('https://youtu.be/X0Cv0l-j86Y?t=3420').start).toBe(3420);
    expect(ok('https://youtu.be/X0Cv0l-j86Y?t=3420s').start).toBe(3420);
    expect(ok('https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=57m').start).toBe(3420);
    expect(ok('https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=1h2m3s').start).toBe(3723);
    expect(ok('https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=nonsense').start).toBe(0);
  });

  it('says why a link cannot play', () => {
    expect(parseYouTubeLink('https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6')).toEqual({ ok: false, reason: 'not-youtube' });
    expect(parseYouTubeLink('not a link at all')).toEqual({ ok: false, reason: 'not-youtube' });
    expect(parseYouTubeLink('https://notyoutube.com/watch?v=X0Cv0l-j86Y')).toEqual({ ok: false, reason: 'not-youtube' });
    expect(parseYouTubeLink('https://www.youtube.com/@LofiGirl')).toEqual({ ok: false, reason: 'no-video' });
    expect(parseYouTubeLink('https://www.youtube.com/watch?v=short')).toEqual({ ok: false, reason: 'no-video' });
    expect(parseYouTubeLink('https://www.youtube.com/playlist?list=WL')).toEqual({ ok: false, reason: 'private-list' });
    expect(parseYouTubeLink('https://www.youtube.com/playlist?list=LL')).toEqual({ ok: false, reason: 'private-list' });
    expect(parseYouTubeLink(`https://youtu.be/${'x'.repeat(3000)}`)).toEqual({ ok: false, reason: 'not-youtube' });
  });
});

describe('canonicalYouTube', () => {
  it('saves one clean address per link, with nothing that identifies who shared it', () => {
    expect(canonicalYouTube(ok('https://youtu.be/X0Cv0l-j86Y?si=x&t=3420'))).toBe('https://www.youtube.com/watch?v=X0Cv0l-j86Y&t=3420');
    expect(canonicalYouTube(ok('https://www.youtube.com/watch?v=lTRiuFIWV54&list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp&pp=1'))).toBe('https://www.youtube.com/watch?v=lTRiuFIWV54&list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp');
    expect(canonicalYouTube(ok('music.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp&si=z'))).toBe('https://www.youtube.com/playlist?list=PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp');
  });
});
