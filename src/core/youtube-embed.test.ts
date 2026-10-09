import { describe, expect, it } from 'vitest';
import { embedSrc, readYouTube, ytCommand, YT_ORIGIN } from './youtube-embed';

describe('the YouTube embed', () => {
  it('builds the privacy-enhanced address with the API on, for videos, playlists and start times', () => {
    const v = new URL(embedSrc({ kind: 'video', video: 'X0Cv0l-j86Y', list: null, start: 3420 }, 'chrome-extension://abc', true));
    expect(v.origin).toBe(YT_ORIGIN);
    expect(v.pathname).toBe('/embed/X0Cv0l-j86Y');
    expect(Object.fromEntries(v.searchParams)).toMatchObject({ enablejsapi: '1', origin: 'chrome-extension://abc', start: '3420', autoplay: '1', playsinline: '1', rel: '0' });
    const p = new URL(embedSrc({ kind: 'playlist', video: null, list: 'PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp', start: 0 }, 'chrome-extension://abc', false));
    expect(p.pathname).toBe('/embed/videoseries');
    expect(p.searchParams.get('list')).toBe('PL6NdkXsPL07LBOz-XhgCJJGlI4jarMKzp');
    expect(p.searchParams.get('autoplay')).toBe('0');
    expect(p.searchParams.has('start')).toBe(false);
  });

  it('speaks the player API message format', () => {
    expect(JSON.parse(ytCommand('seekTo', [57, true]))).toEqual({ event: 'command', func: 'seekTo', args: [57, true], id: 1, channel: 'widget' });
  });

  it("reads only YouTube's own messages, in seconds turned to ms", () => {
    const info = { currentTime: 12.5, duration: 3600, playerState: 1, videoData: { title: 'Deep Focus', author: 'Channel', video_id: 'X0Cv0l-j86Y' } };
    expect(readYouTube(YT_ORIGIN, JSON.stringify({ event: 'infoDelivery', info }))).toEqual({ position: 12_500, duration: 3_600_000, state: 'playing', title: 'Deep Focus', artist: 'Channel', video: 'X0Cv0l-j86Y' });
    expect(readYouTube(YT_ORIGIN, JSON.stringify({ event: 'infoDelivery', info: { playerState: 3 } }))).toEqual({ state: 'buffering' });
    expect(readYouTube(YT_ORIGIN, JSON.stringify({ event: 'onError', info: 150 }))).toEqual({ problem: 'embed' });
    expect(readYouTube(YT_ORIGIN, JSON.stringify({ event: 'onError', info: 100 }))).toEqual({ problem: 'gone' });
    expect(readYouTube('https://evil.test', JSON.stringify({ event: 'infoDelivery', info }))).toBeNull();
    expect(readYouTube(YT_ORIGIN, 'not json')).toBeNull();
    expect(readYouTube(YT_ORIGIN, JSON.stringify({ event: 'infoDelivery', info: { videoData: { title: 'x'.repeat(900) } } }))).toEqual({ title: 'x'.repeat(300) });
  });
});
