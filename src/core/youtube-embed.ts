import type { YouTubeLink } from './youtube';

/**
 * YouTube's embedded player in the side panel, driven through its documented postMessage API (enablejsapi=1), so no
 * YouTube script runs in Study Duo's pages. The privacy-enhanced host sets no cookies until a video plays.
 */
export const YT_ORIGIN = 'https://www.youtube-nocookie.com';

export function embedSrc(link: YouTubeLink, origin: string, autoplay: boolean): string {
  const q = new URLSearchParams({ enablejsapi: '1', origin, playsinline: '1', rel: '0', autoplay: autoplay ? '1' : '0' });
  if (link.list) q.set('list', link.list);
  if (link.start) q.set('start', String(link.start));
  return `${YT_ORIGIN}/embed/${link.video ?? 'videoseries'}?${q}`;
}

export const ytCommand = (func: string, args: unknown[] = []) => JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' });

export interface YouTubeNews {
  position?: number;
  duration?: number;
  state?: 'playing' | 'paused' | 'buffering' | 'ended' | 'cued' | 'unstarted';
  title?: string;
  artist?: string;
  video?: string;
  problem?: 'embed' | 'gone';
}
const STATES: Record<number, YouTubeNews['state']> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
/** 101 and 150: the owner turned embedding off; 153: the player could not tell where it was embedded. */
const EMBED_OFF = new Set([101, 150, 153]);
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const str = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 300) : undefined);

/** What a message from the player says, or null for anything that is not YouTube's player talking. */
export function readYouTube(origin: string, data: unknown): YouTubeNews | null {
  if (origin !== YT_ORIGIN || typeof data !== 'string' || data.length > 100_000) return null;
  let msg: { event?: unknown; info?: unknown };
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (msg.event === 'onError') return typeof msg.info === 'number' ? { problem: EMBED_OFF.has(msg.info) ? 'embed' : 'gone' } : null;
  if ((msg.event !== 'infoDelivery' && msg.event !== 'initialDelivery') || !msg.info || typeof msg.info !== 'object') return null;
  const i = msg.info as Record<string, unknown>;
  const v = (i.videoData && typeof i.videoData === 'object' ? i.videoData : {}) as Record<string, unknown>;
  const out: YouTubeNews = {};
  if (fin(i.currentTime)) out.position = Math.round((i.currentTime as number) * 1000);
  if (fin(i.duration) && (i.duration as number) > 0) out.duration = Math.round((i.duration as number) * 1000);
  if (typeof i.playerState === 'number' && STATES[i.playerState]) out.state = STATES[i.playerState];
  const title = str(v.title);
  const artist = str(v.author);
  const video = typeof v.video_id === 'string' && /^[\w-]{11}$/.test(v.video_id) ? v.video_id : undefined;
  if (title) out.title = title;
  if (artist) out.artist = artist;
  if (video) out.video = video;
  return out;
}
