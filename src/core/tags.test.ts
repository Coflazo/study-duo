import { describe, expect, it } from 'vitest';
import { dominantColor, readCover, readTags, tagsOrName } from './tags';

const latin1 = (s: string) => [...s].map((c) => c.charCodeAt(0));
const utf16 = (s: string) => [0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])];
const utf8 = (s: string) => [...new TextEncoder().encode(s)];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const syncsafe = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function id3(version: 3 | 4, frames: Array<[string, number, number[]]>): ArrayBuffer {
  const body = frames.flatMap(([id, enc, text]) => {
    const data = [enc, ...text];
    return [...latin1(id), ...(version === 4 ? syncsafe(data.length) : be32(data.length)), 0, 0, ...data];
  });
  return new Uint8Array([...latin1('ID3'), version, 0, 0, ...syncsafe(body.length), ...body, 0xff, 0xfb, 0x90]).buffer;
}

describe('readTags', () => {
  it('reads ID3v2.3 text frames in Latin-1 and UTF-16', () => {
    const file = id3(3, [['TIT2', 0, latin1('Says')], ['TPE1', 1, utf16('Nils Frahm')], ['TALB', 0, latin1('Spaces')], ['TCON', 0, latin1('(52)Electronic')]]);
    expect(readTags(file)).toEqual({ title: 'Says', artist: 'Nils Frahm', album: 'Spaces', genre: 'Electronic' });
  });

  it('reads ID3v2.4 with UTF-8 and sync-safe frame sizes', () => {
    const file = id3(4, [['TIT2', 3, utf8('Ólafur’s Étude')], ['TPE1', 3, utf8('Ólafur Arnalds')]]);
    expect(readTags(file)).toEqual({ title: 'Ólafur’s Étude', artist: 'Ólafur Arnalds', album: '', genre: '' });
  });

  it('reads FLAC Vorbis comments', () => {
    const comments = ['TITLE=Hammers', 'artist=Nils Frahm', 'GENRE=Ambient'].map(utf8);
    const vendor = utf8('reference libFLAC');
    const block = [...le32(vendor.length), ...vendor, ...le32(comments.length), ...comments.flatMap((c) => [...le32(c.length), ...c])];
    const streaminfo = new Array(34).fill(0);
    const file = new Uint8Array([...latin1('fLaC'), 0, 0, 0, 34, ...streaminfo, 0x84, (block.length >> 16) & 255, (block.length >> 8) & 255, block.length & 255, ...block]).buffer;
    expect(readTags(file)).toEqual({ title: 'Hammers', artist: 'Nils Frahm', album: '', genre: 'Ambient' });
  });

  it('gives nothing for untagged or broken files, and never reads past the end', () => {
    expect(readTags(new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer)).toBeNull();
    const broken = new Uint8Array([...latin1('ID3'), 3, 0, 0, 0, 0, 0x7f, 0x7f, ...latin1('TIT2'), 0x7f, 0xff, 0xff, 0xff, 0, 0, 0]).buffer;
    expect(readTags(broken)).toBeNull();
  });
});

describe('tagsOrName', () => {
  it('falls back to the file name, without the extension or a leading track number', () => {
    expect(tagsOrName(null, '03 - Says.mp3')).toEqual({ title: 'Says', artist: '', album: '', genre: '' });
    expect(tagsOrName(null, 'lecture-notes.flac')).toMatchObject({ title: 'lecture-notes' });
    expect(tagsOrName({ title: '', artist: 'A', album: '', genre: '' }, 'x.mp3')).toMatchObject({ title: 'x', artist: 'A' });
  });
});

describe('readCover', () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
  const apic = (type: number, mime: string, desc: number[], data: number[], enc = 0) => [enc, ...latin1(mime), 0, type, ...desc, ...data];

  it('reads the front cover from an ID3 APIC frame', () => {
    const file = id3(3, [['TIT2', 0, latin1('Says')], ['APIC', 0, apic(3, 'image/png', [0], png).slice(1)]]);
    expect(readCover(file)).toEqual({ mime: 'image/png', bytes: new Uint8Array(png) });
  });

  it('prefers the front cover when a file has several pictures', () => {
    const back = [0xff, 0xd8, 0xff, 9];
    const file = id3(4, [['APIC', 0, apic(4, 'image/jpeg', [0], back).slice(1)], ['APIC', 0, apic(3, 'image/png', [0], png).slice(1)]]);
    expect(readCover(file)?.mime).toBe('image/png');
  });

  it('skips a UTF-16 description, which ends in two zero bytes', () => {
    const file = id3(3, [['APIC', 1, apic(3, 'image/png', [0xff, 0xfe, 0x41, 0, 0, 0], png, 1).slice(1)]]);
    expect(readCover(file)?.bytes).toEqual(new Uint8Array(png));
  });

  it('reads the front cover from a FLAC PICTURE block', () => {
    const mime = latin1('image/png');
    const pic = [...be32(3), ...be32(mime.length), ...mime, ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(png.length), ...png];
    const file = new Uint8Array([...latin1('fLaC'), 0x86, (pic.length >> 16) & 255, (pic.length >> 8) & 255, pic.length & 255, ...pic]).buffer;
    expect(readCover(file)).toEqual({ mime: 'image/png', bytes: new Uint8Array(png) });
  });

  it('refuses anything that is not a picture, and files with no cover', () => {
    const file = id3(3, [['APIC', 0, apic(3, 'text/html', [0], latin1('<script>')).slice(1)]]);
    expect(readCover(file)).toBeNull();
    expect(readCover(id3(3, [['TIT2', 0, latin1('Says')]]))).toBeNull();
    expect(readCover(new ArrayBuffer(4))).toBeNull();
  });
});

describe('dominantColor', () => {
  it('finds the colour most of a cover is, ignoring near-white and near-black edges', () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
    const rgba = new Uint8ClampedArray([...px(30, 47, 92, 60), ...px(250, 250, 250, 30), ...px(5, 5, 5, 10)]);
    expect(dominantColor(rgba)).toBe('#1e2f5c');
  });

  it('falls back to a neutral grey for an empty or blank picture', () => {
    expect(dominantColor(new Uint8ClampedArray([]))).toBe('#8a8f96');
    expect(dominantColor(new Uint8ClampedArray([255, 255, 255, 255]))).toBe('#8a8f96');
  });
});
