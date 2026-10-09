import type { StreamSource } from './player';
import { canonicalYouTube, parseYouTubeLink } from './youtube';

/**
 * A pasted link to something a streaming service plays in its own embedded player: the one address Study Duo keeps
 * (without the parts that say who shared it) and the service's embed address. Only these hosts; anything else is
 * named as not playable here.
 */
export interface StreamLink {
  source: StreamSource;
  kind: 'video' | 'playlist' | 'track' | 'album' | 'artist' | 'episode' | 'show' | 'station';
  url: string;
  embed: string;
  /** Seconds into it (YouTube t=). */
  start: number;
}
export type StreamParse = { ok: true; link: StreamLink } | { ok: false; reason: 'unknown' | 'short-link' | 'no-video' | 'private-list' };

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);
const SLUG = /^[\w.-]{1,200}$/;

function url(text: string): URL | null {
  try {
    return new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

export function parseStreamLink(raw: string): StreamParse {
  const text = raw.trim();
  if (!text || text.length > 2000) return { ok: false, reason: 'unknown' };
  const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return spotify(uri[1]!, uri[2]!);
  const u = url(text);
  if (!u || u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'unknown' };
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'open.spotify.com') {
    const p = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    return p.length === 2 && SPOTIFY_KINDS.has(p[0]!) && SPOTIFY_ID.test(p[1]!) ? spotify(p[0]!, p[1]!) : { ok: false, reason: 'unknown' };
  }
  if (host === 'on.soundcloud.com') return { ok: false, reason: 'short-link' };
  if (host === 'soundcloud.com' || host === 'www.soundcloud.com' || host === 'm.soundcloud.com') {
    const set = parts.length === 3 && parts[1] === 'sets';
    if (!(parts.length === 2 || set) || !parts.every((x) => SLUG.test(x))) return { ok: false, reason: 'unknown' };
    const canonical = `https://soundcloud.com/${parts.join('/')}`;
    const q = new URLSearchParams({ url: canonical, visual: 'false', show_comments: 'false' });
    return { ok: true, link: { source: 'soundcloud', kind: set ? 'playlist' : 'track', url: canonical, embed: `https://w.soundcloud.com/player/?${q}`, start: 0 } };
  }
  if (host === 'music.apple.com') {
    // /{country}/{album|playlist|song|station}/{name}/{id}, a track inside an album as ?i=
    const [cc, kind, name, id] = parts;
    if (parts.length !== 4 || !/^[a-z]{2}$/.test(cc!) || !['album', 'playlist', 'song', 'station'].includes(kind!) || !SLUG.test(name!) || !/^[\w.-]{1,80}$/.test(id!)) return { ok: false, reason: 'unknown' };
    const i = u.searchParams.get('i');
    const tail = `${cc}/${kind}/${name}/${id}${i && /^\d{1,20}$/.test(i) ? `?i=${i}` : ''}`;
    return { ok: true, link: { source: 'apple', kind: kind === 'song' ? 'track' : (kind as StreamLink['kind']), url: `https://music.apple.com/${tail}`, embed: `https://embed.music.apple.com/${tail}`, start: 0 } };
  }
  if (host === 'tidal.com' || host === 'www.tidal.com' || host === 'listen.tidal.com') {
    let p = parts[0] === 'browse' ? parts.slice(1) : parts;
    if (p.length === 3 && p[2] === 'u') p = p.slice(0, 2); // share links end in /u
    const kind = p[0];
    if (p.length !== 2 || !['track', 'album', 'playlist'].includes(kind!) || !/^[\w-]{1,60}$/.test(p[1]!)) return { ok: false, reason: 'unknown' };
    return { ok: true, link: { source: 'tidal', kind: kind as StreamLink['kind'], url: `https://tidal.com/browse/${kind}/${p[1]}`, embed: `https://embed.tidal.com/${kind}s/${p[1]}`, start: 0 } };
  }
  const yt = parseYouTubeLink(text);
  if (yt.ok) return { ok: true, link: { source: 'youtube', kind: yt.link.kind, url: canonicalYouTube(yt.link), embed: '', start: yt.link.start } };
  return { ok: false, reason: yt.reason === 'not-youtube' ? 'unknown' : yt.reason };
}

function spotify(kind: string, id: string): StreamParse {
  return { ok: true, link: { source: 'spotify', kind: kind as StreamLink['kind'], url: `https://open.spotify.com/${kind}/${id}`, embed: `https://open.spotify.com/embed/${kind}/${id}`, start: 0 } };
}
