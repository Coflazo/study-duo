import type { NowPlaying } from '@/core/music';

/** What reading needs from the page: its media session and whether any media element plays. Testable without a DOM. */
export interface MediaSource {
  mediaSession: { metadata: { title: string; artist: string; album: string } | null; playbackState: string } | undefined;
  playingMedia(): boolean;
}

/**
 * Now playing, as the page itself tells the browser's media controls (navigator.mediaSession). Sites that never set
 * the playback state count as playing while one of their audio or video elements plays.
 */
export function readNowPlaying(src: MediaSource): NowPlaying | null {
  const m = src.mediaSession?.metadata;
  if (!m || typeof m.title !== 'string' || !m.title.trim()) return null;
  const state = src.mediaSession!.playbackState;
  const playing = state === 'playing' || (state !== 'paused' && src.playingMedia());
  return { title: m.title, artist: String(m.artist ?? ''), album: String(m.album ?? ''), playing };
}

/** Passes a reading on only when it differs from the last one (undefined = nothing new). */
export function changes(): (n: NowPlaying | null) => NowPlaying | null | undefined {
  let last: string | undefined;
  return (n) => {
    const key = JSON.stringify(n);
    if (key === last) return undefined;
    last = key;
    return n;
  };
}

export function pageMedia(): MediaSource {
  return {
    mediaSession: navigator.mediaSession as MediaSource['mediaSession'],
    playingMedia: () => [...document.querySelectorAll('audio, video')].some((el) => !(el as HTMLMediaElement).paused && !(el as HTMLMediaElement).ended),
  };
}
