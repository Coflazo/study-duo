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

/** The frames of an ID3v2.3 or 2.4 tag, never reading past the tag. */
function* id3Frames(b: Uint8Array): Generator<{ id: string; start: number; size: number }> {
  const version = b[3]!;
  if (version !== 3 && version !== 4) return;
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let at = 10;
  if (b[5]! & 0x40) at += version === 4 ? syncsafe(b, 10) : 4 + ((b[10]! << 24) | (b[11]! << 16) | (b[12]! << 8) | b[13]!); // extended header
  while (at + 10 <= end) {
    const id = String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
    if (!/^[A-Z0-9]{4}$/.test(id)) return; // padding or garbage
    const size = version === 4 ? syncsafe(b, at + 4) : ((b[at + 4]! << 24) | (b[at + 5]! << 16) | (b[at + 6]! << 8) | b[at + 7]!) >>> 0;
    const start = at + 10;
    if (size < 1 || start + size > end) return;
    yield { id, start, size };
    at = start + size;
  }
}

function id3(b: Uint8Array): Tags | null {
  const out = { ...EMPTY };
  let found = false;
  for (const { id, start, size } of id3Frames(b)) {
    const field = FRAMES[id];
    if (!field) continue;
    const text = clean(decode(b.subarray(start + 1, start + size), b[start]!));
    out[field] = field === 'genre' ? genreText(text) : text;
    found = true;
  }
  return found ? out : null;
}

/** The metadata blocks of a FLAC file, up to the last one. */
function* flacBlocks(b: Uint8Array): Generator<{ type: number; start: number; size: number }> {
  let at = 4;
  while (at + 4 <= b.length) {
    const header = b[at]!;
    const size = (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!;
    const start = at + 4;
    if (start + size > b.length) return;
    yield { type: header & 0x7f, start, size };
    if (header & 0x80) return; // the last block
    at = start + size;
  }
}

function flac(b: Uint8Array): Tags | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (const { type, start, size } of flacBlocks(b)) {
    if (type !== 4) continue;
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
  return null;
}

/** A picture embedded in a song file. Only images, and only up to 5 MB. */
export interface Cover {
  mime: string;
  bytes: Uint8Array;
}
const IMAGE = /^image\/(jpeg|jpg|png|webp|gif)$/;
const MAX_COVER = 5_000_000;
/** ID3 and FLAC both number pictures; 3 is the front cover. */
const FRONT = 3;
const picture = (mime: string, bytes: Uint8Array): Cover | null => (IMAGE.test(mime) && bytes.length > 0 && bytes.length <= MAX_COVER ? { mime: mime === 'image/jpg' ? 'image/jpeg' : mime, bytes } : null);

/** An APIC frame: encoding, MIME type, picture type, description, then the picture. */
function apic(b: Uint8Array, start: number, size: number): { type: number; cover: Cover | null } | null {
  const end = start + size;
  const encoding = b[start]!;
  let p = start + 1;
  const mimeEnd = b.indexOf(0, p);
  if (mimeEnd < 0 || mimeEnd + 2 > end) return null;
  const mime = String.fromCharCode(...b.subarray(p, mimeEnd)).toLowerCase();
  p = mimeEnd + 1;
  const type = b[p]!;
  p += 1;
  if (encoding === 1 || encoding === 2) {
    while (p + 1 < end && !(b[p] === 0 && b[p + 1] === 0)) p += 2; // UTF-16 ends in two zero bytes
    p += 2;
  } else {
    while (p < end && b[p] !== 0) p++;
    p += 1;
  }
  return p < end ? { type, cover: picture(mime, b.slice(p, end)) } : null;
}

/** A FLAC PICTURE block, all numbers big-endian. */
function flacPicture(b: Uint8Array, start: number, size: number): { type: number; cover: Cover | null } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const end = start + size;
  let p = start;
  const type = view.getUint32(p);
  const mimeLength = view.getUint32(p + 4);
  p += 8;
  if (p + mimeLength + 4 > end) return null;
  const mime = String.fromCharCode(...b.subarray(p, p + mimeLength)).toLowerCase();
  p += mimeLength;
  p += 4 + view.getUint32(p); // description
  p += 16; // width, height, colour depth, palette size
  if (p + 4 > end) return null;
  const length = view.getUint32(p);
  p += 4;
  return p + length <= end ? { type, cover: picture(mime, b.slice(p, p + length)) } : null;
}

/** The front cover of an MP3 (ID3v2.3 or 2.4) or a FLAC file, or the first picture if none is marked front; null if none. */
export function readCover(buffer: ArrayBuffer): Cover | null {
  const b = new Uint8Array(buffer);
  const found: { type: number; cover: Cover | null }[] = [];
  try {
    if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
      for (const f of id3Frames(b)) if (f.id === 'APIC') found.push(apic(b, f.start, f.size) ?? { type: -1, cover: null });
    } else if (b.length >= 8 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) {
      for (const f of flacBlocks(b)) if (f.type === 6) found.push(flacPicture(b, f.start, f.size) ?? { type: -1, cover: null });
    }
  } catch {
    // a truncated or odd file: no cover
  }
  const pictures = found.filter((f) => f.cover);
  return (pictures.find((f) => f.type === FRONT) ?? pictures[0])?.cover ?? null;
}

/**
 * The colour most of a cover is, as #rrggbb, for the popup's tint: pixels in coarse buckets, near-white and
 * near-black left out (borders and text), the fullest bucket averaged. Grey when nothing is left.
 */
export function dominantColor(rgba: Uint8ClampedArray): string {
  const buckets = new Map<number, [number, number, number, number]>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
    if (rgba[i + 3]! < 128 || (r > 235 && g > 235 && b > 235) || (r < 20 && g < 20 && b < 20)) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const sum = buckets.get(key) ?? [0, 0, 0, 0];
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    sum[3] += 1;
    buckets.set(key, sum);
  }
  let best: [number, number, number, number] | null = null;
  for (const sum of buckets.values()) if (!best || sum[3] > best[3]) best = sum;
  if (!best) return '#8a8f96';
  const hex = (n: number) => Math.round(n / best![3]).toString(16).padStart(2, '0');
  return `#${hex(best[0])}${hex(best[1])}${hex(best[2])}`;
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
