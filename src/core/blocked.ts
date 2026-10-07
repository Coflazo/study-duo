import { hostOf } from './sites';

/** The blocked page's fragment holds the address that was closed. Only http(s) under 2 KB is trusted, so "Open anyway" can only ever open a web page. */
export function parseBlockedHash(hash: string): { url: string; domain: string } | null {
  const url = hash.startsWith('#') ? hash.slice(1) : hash;
  if (url.length === 0 || url.length > 2048) return null;
  const domain = hostOf(url);
  return domain === null ? null : { url, domain };
}
