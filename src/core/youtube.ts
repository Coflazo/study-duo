/**
 * A pasted YouTube link: a playlist, a video (perhaps inside a playlist), with a start time. Everything else in the
 * address, such as who shared it (si, is, pp, xstg, feature), is dropped and never kept.
 */
export interface YouTubeLink {
  kind: 'playlist' | 'video';
  video: string | null;
  list: string | null;
  /** Seconds into the video. */
  start: number;
}
export type YouTubeParse = { ok: true; link: YouTubeLink } | { ok: false; reason: 'not-youtube' | 'no-video' | 'private-list' };

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIDEO = /^[\w-]{11}$/;
const LIST = /^[\w-]{2,64}$/;
/** Watch later, Liked videos, Liked music: only their owner can see them, and an embedded player cannot. */
const PRIVATE_LISTS = new Set(['WL', 'LL', 'LM']);
const no = (reason: 'not-youtube' | 'no-video' | 'private-list'): YouTubeParse => ({ ok: false, reason });

/** "3420", "3420s", "57m", "1h2m3s" to seconds; anything else is 0. */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function parseYouTubeLink(raw: string): YouTubeParse {
  const text = raw.trim();
  if (!text || text.length > 2000) return no('not-youtube');
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return no('not-youtube');
  }
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return no('not-youtube');
  const parts = u.pathname.split('/').filter(Boolean);
  let video: string | null = null;
  if (host === 'youtu.be') video = parts[0] ?? null;
  else if (parts[0] === 'watch') video = u.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(parts[0] ?? '')) video = parts[1] ?? null;
  if (video !== null && !VIDEO.test(video)) video = null;
  const listParam = u.searchParams.get('list');
  if (listParam && PRIVATE_LISTS.has(listParam)) return no('private-list');
  const list = listParam && LIST.test(listParam) ? listParam : null;
  if (!video && !list) return no('no-video');
  return { ok: true, link: { kind: video ? 'video' : 'playlist', video, list, start: video ? seconds(u.searchParams.get('t') ?? u.searchParams.get('start')) : 0 } };
}

/** The one address Study Duo keeps for a link: www.youtube.com, the video, the playlist and the start, nothing else. */
export function canonicalYouTube(l: YouTubeLink): string {
  if (!l.video) return `https://www.youtube.com/playlist?list=${l.list}`;
  const q = new URLSearchParams({ v: l.video });
  if (l.list) q.set('list', l.list);
  if (l.start) q.set('t', String(l.start));
  return `https://www.youtube.com/watch?${q}`;
}
