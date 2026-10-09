import type { StreamSource } from './player';

/** Links the user played in the side panel, newest first, so one click plays them again. Kept on this computer. */
export interface SavedLink {
  source: StreamSource;
  url: string;
  title: string | null;
  artist: string | null;
  addedAt: number;
}

const MAX = 20;

export const streamLinksItem = storage.defineItem<SavedLink[]>('local:streamLinks', { fallback: [] });

export function rememberLink(list: SavedLink[], link: { source: StreamSource; url: string }, now: number): SavedLink[] {
  const old = list.find((l) => l.url === link.url);
  return [{ title: null, artist: null, ...old, ...link, addedAt: now }, ...list.filter((l) => l.url !== link.url)].slice(0, MAX);
}

/** The title and channel or artist, once the service's player says them. Unchanged lists are returned as they are. */
export function nameLink(list: SavedLink[], url: string, title: string | null, artist: string | null): SavedLink[] {
  const i = list.findIndex((l) => l.url === url);
  if (i < 0 || !title || (list[i]!.title === title && list[i]!.artist === artist)) return list;
  return list.map((l, j) => (j === i ? { ...l, title, artist } : l));
}

export const forgetLink = (list: SavedLink[], url: string): SavedLink[] => list.filter((l) => l.url !== url);
