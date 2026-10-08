import { readCover, readTags, tagsOrName } from './tags';

/**
 * The music folder, as Study Duo knows it: one record per song (never the audio itself), found by walking the folder
 * the user picked. Works on the browser's FileSystemDirectoryHandle, or anything shaped like it (tests).
 */
export interface FileLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
export interface FolderLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileLike | FolderLike>;
}

export interface Track {
  /** Stable while the file is unchanged: its path, size and modification time. */
  id: string;
  /** Inside the picked folder, with "/" between folders. */
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  /** Whether a cover was found (its thumbnail is kept apart). */
  cover: boolean;
  /** The cover's main colour, for the popup's tint. */
  color: string | null;
  size: number;
  modified: number;
}

const AUDIO = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav)$/i;
/** Deep enough for Artist/Album/Disc folders, shallow enough that a link loop cannot hang the walk. */
const MAX_DEPTH = 6;
const MAX_SONGS = 10_000;
/** Tags and covers sit at the start of a file; the first megabyte holds them for almost every song. */
const HEAD_BYTES = 1_000_000;

/** Every audio file under the folder, with its path; hidden folders and files are skipped. */
export async function listSongs(dir: FolderLike, opts: { max?: number } = {}): Promise<{ path: string; file: FileLike }[]> {
  const max = opts.max ?? MAX_SONGS;
  const out: { path: string; file: FileLike }[] = [];
  async function walk(d: FolderLike, prefix: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    for await (const entry of d.values()) {
      if (out.length >= max) return;
      if (entry.name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') await walk(entry, path, depth + 1);
      else if (AUDIO.test(entry.name)) out.push({ path, file: entry });
    }
  }
  await walk(dir, '', 0);
  return out;
}

/** FNV-1a, enough to tell versions of a file apart. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

/** One song's record from its first megabyte: tags (or its file name as the title) and whether it has a cover. */
export async function indexSong(file: File, path: string): Promise<Track> {
  const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
  const tags = tagsOrName(readTags(head), file.name);
  return { id: `${hash(`${path}|${file.size}|${file.lastModified}`)}-${hash(path)}`, path, ...tags, cover: readCover(head) !== null, color: null, size: file.size, modified: file.lastModified };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Songs whose title, artist or album contain every word typed, ignoring case and accents. */
export function searchTracks(tracks: Track[], query: string): Track[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return tracks;
  return tracks.filter((t) => {
    const text = fold(`${t.title} ${t.artist} ${t.album}`);
    return words.every((w) => text.includes(w));
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Titles in the order people read them: accents ignored, numbers by value. */
export function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.path, b.path));
}

/** Songs by artist or by album, names sorted, songs sorted inside, the unknown group last. */
export function groupTracks(tracks: Track[], by: 'artist' | 'album'): { name: string; tracks: Track[] }[] {
  const unknown = by === 'artist' ? 'Unknown artist' : 'Unknown album';
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const name = t[by].trim() || unknown;
    groups.set(name, [...(groups.get(name) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === unknown ? 1 : b === unknown ? -1 : collator.compare(a, b)))
    .map(([name, ts]) => ({ name, tracks: sortTracks(ts) }));
}
