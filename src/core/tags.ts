export interface Tags {
  title: string;
  artist: string;
  album: string;
  genre: string;
}

const EMPTY: Tags = { title: '', artist: '', album: '', genre: '' };
const MAX_TEXT = 200;
const FRAMES: Record<string, keyof Tags> = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TCON: 'genre' };
const VORBIS: Record<string, keyof Tags> = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', GENRE: 'genre' };

const clean = (s: string) => s.replace(/\0+$/, '').replace(/[\0\r\n\t]+/g, ' ').trim().slice(0, MAX_TEXT);
/** ID3 genres can be "(52)Electronic" or just "(52)"; keep the words. */
const genreText = (s: string) => s.replace(/^\(\d+\)/, '').trim();

function decode(bytes: Uint8Array, encoding: number): string {
  try {
    if (encoding === 0) return String.fromCharCode(...bytes);
    if (encoding === 1) return new TextDecoder(bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-16le').decode(bytes.subarray(2));
    if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function syncsafe(b: Uint8Array, at: number): number {
  return ((b[at]! & 127) << 21) | ((b[at + 1]! & 127) << 14) | ((b[at + 2]! & 127) << 7) | (b[at + 3]! & 127);
}

function id3(b: Uint8Array): Tags | null {
  const version = b[3]!;
  if (version !== 3 && version !== 4) return null;
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let at = 10;
  if (b[5]! & 0x40) at += version === 4 ? syncsafe(b, 10) : 4 + ((b[10]! << 24) | (b[11]! << 16) | (b[12]! << 8) | b[13]!); // extended header
  const out = { ...EMPTY };
  let found = false;
  while (at + 10 <= end) {
    const id = String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding or garbage
    const size = version === 4 ? syncsafe(b, at + 4) : ((b[at + 4]! << 24) | (b[at + 5]! << 16) | (b[at + 6]! << 8) | b[at + 7]!) >>> 0;
    const start = at + 10;
    if (size < 1 || start + size > end) break; // never read past the tag
    const field = FRAMES[id];
    if (field) {
      const text = clean(decode(b.subarray(start + 1, start + size), b[start]!));
      out[field] = field === 'genre' ? genreText(text) : text;
      found = true;
    }
    at = start + size;
  }
  return found ? out : null;
}

function flac(b: Uint8Array): Tags | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 4;
  while (at + 4 <= b.length) {
    const header = b[at]!;
    const size = (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!;
    const start = at + 4;
    if (start + size > b.length) return null;
    if ((header & 0x7f) === 4) {
      const out = { ...EMPTY };
      let p = start + 4 + view.getUint32(start, true); // skip the vendor string
      const count = view.getUint32(p, true);
      p += 4;
      for (let i = 0; i < count && p + 4 <= start + size; i++) {
        const len = view.getUint32(p, true);
        if (p + 4 + len > start + size) break;
        const comment = new TextDecoder().decode(b.subarray(p + 4, p + 4 + len));
        const eq = comment.indexOf('=');
        const field = VORBIS[comment.slice(0, eq).toUpperCase()];
        if (eq > 0 && field) out[field] = clean(comment.slice(eq + 1));
        p += 4 + len;
      }
      return out;
    }
    if (header & 0x80) return null; // last block, no comments
    at = start + size;
  }
  return null;
}

/** Title, artist, album and genre from an MP3 (ID3v2.3 or 2.4) or a FLAC file's start; null when there are no tags. */
export function readTags(buffer: ArrayBuffer): Tags | null {
  const b = new Uint8Array(buffer);
  try {
    if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return id3(b);
    if (b.length >= 8 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return flac(b);
  } catch {
    // a truncated or odd file: no tags
  }
  return null;
}

/** Tags, with the file name standing in for a missing title (minus extension and a leading track number). */
export function tagsOrName(tags: Tags | null, fileName: string): Tags {
  const name = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^\d{1,3}\s*[-._ ]\s*/, '').trim().slice(0, MAX_TEXT);
  return { ...EMPTY, ...tags, title: tags?.title || name };
}
