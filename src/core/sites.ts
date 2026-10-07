export type SiteCategory = 'blocked' | 'study' | 'neutral';
/** Filed sites, keyed by canonical domain (lowercase, punycode, no www.). */
export type Sites = Record<string, SiteCategory>;

const CATEGORIES = new Set<SiteCategory>(['blocked', 'study', 'neutral']);
const NOT_A_SITE = 'Only website names like khanacademy.org.';

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

/** The site of a web address, or null for anything that is not http(s). */
export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? canonicalHost(u.hostname) : null;
  } catch {
    return null;
  }
}

/** The site a page can be filed under, or null for pages that cannot be filed (localhost, IP addresses, intranet names, file:). */
export function siteOf(url: string | undefined): string | null {
  const host = hostOf(url);
  if (host === null) return null;
  const n = normalizeDomain(host);
  return 'domain' in n && n.domain === host ? host : null;
}

/** Turns whatever someone typed or pasted into a domain, or says plainly why it cannot. */
export function normalizeDomain(input: string): { domain: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: 'Type a website, like khanacademy.org.' };
  if (raw.includes('*')) return { error: 'Type the site without *, like reddit.com.' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return { error: NOT_A_SITE };
  let host: string;
  try {
    host = canonicalHost(new URL(hasScheme ? raw : `https://${raw}`).hostname);
  } catch {
    return { error: NOT_A_SITE };
  }
  const ip = /^\d+(\.\d+){3}$/.test(host) || host.includes('[') || host.includes(':');
  if (ip || host.length > 253 || !/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(host)) return { error: NOT_A_SITE };
  return { domain: host };
}

/** The most specific filed entry for a host: music.youtube.com beats youtube.com. Labels must match whole. */
export function categoryFor(host: string, sites: Sites): SiteCategory | null {
  for (let candidate = host; candidate.includes('.'); candidate = candidate.slice(candidate.indexOf('.') + 1)) {
    const found = sites[candidate];
    if (found) return found;
  }
  return null;
}

/** Site lists come from storage or an import file; keep only canonical domains with a known category. */
export function normalizeSites(raw: unknown): Sites {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Sites = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = normalizeDomain(key);
    if ('domain' in n && n.domain === key && CATEGORIES.has(value as SiteCategory)) out[key] = value as SiteCategory;
  }
  return out;
}

/** Music players stay open during study blocks unless the user files them otherwise, even when their parent site is Blocked. */
export const MUSIC_SITES = ['music.youtube.com', 'open.spotify.com', 'music.apple.com', 'soundcloud.com', 'listen.tidal.com', 'deezer.com', 'music.amazon.com'];

export function seedMusicSites(sites: Sites): Sites {
  const out = { ...sites };
  for (const d of MUSIC_SITES) out[d] ??= 'neutral';
  return out;
}
