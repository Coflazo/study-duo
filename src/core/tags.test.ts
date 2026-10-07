import { describe, expect, it } from 'vitest';
import { readTags, tagsOrName } from './tags';

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
