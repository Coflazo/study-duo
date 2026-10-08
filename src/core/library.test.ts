import { describe, expect, it } from 'vitest';
import { groupTracks, indexSong, listSongs, searchTracks, sortTracks, type FolderLike, type Track } from './library';

/** A folder in memory, shaped like the browser's FileSystemDirectoryHandle as far as the library uses it. */
function folder(name: string, tree: Record<string, Uint8Array | Record<string, unknown>>): FolderLike {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [n, v] of Object.entries(tree)) {
        if (v instanceof Uint8Array) yield { kind: 'file' as const, name: n, getFile: async () => new File([v], n, { lastModified: 1_700_000_000_000 }) };
        else yield folder(n, v as Record<string, Uint8Array | Record<string, unknown>>);
      }
    },
  };
}

const latin1 = (s: string) => [...s].map((c) => c.charCodeAt(0));
const syncsafe = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
function mp3(title: string, artist: string, album: string): Uint8Array {
  const frames = ([['TIT2', title], ['TPE1', artist], ['TALB', album]] as const).flatMap(([id, text]) => {
    const data = [0, ...latin1(text)];
    return [...latin1(id), 0, 0, 0, data.length, 0, 0, ...data];
  });
  return new Uint8Array([...latin1('ID3'), 3, 0, 0, ...syncsafe(frames.length), ...frames, 0xff, 0xfb, 0x90]);
}

const t = (title: string, artist = '', album = '', path = `${title}.mp3`): Track => ({ id: path, path, title, artist, album, genre: '', cover: false, color: null, size: 1, modified: 1 });

describe('listSongs', () => {
  it('finds audio files in the folder and its subfolders, with their paths, and nothing else', async () => {
    const music = folder('Music', {
      'Nocturne.mp3': mp3('a', 'b', 'c'),
      'cover.jpg': new Uint8Array([1]),
      Chopin: { 'Waltz.flac': new Uint8Array([1]), Notes: { 'readme.txt': new Uint8Array([1]) } },
      '.hidden': { 'secret.mp3': new Uint8Array([1]) },
    });
    const found = (await listSongs(music)).map((s) => s.path).sort();
    expect(found).toEqual(['Chopin/Waltz.flac', 'Nocturne.mp3']);
  });

  it('stops at a depth and a count, so a huge or looping folder cannot hang it', async () => {
    let deep: Record<string, unknown> = { 'bottom.mp3': new Uint8Array([1]) };
    for (let i = 0; i < 12; i++) deep = { [`d${i}`]: deep };
    expect(await listSongs(folder('Music', deep as Record<string, Uint8Array>))).toEqual([]);
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`${i}.mp3`, new Uint8Array([1])]));
    expect(await listSongs(folder('Music', many), { max: 10 })).toHaveLength(10);
  });
});

describe('indexSong', () => {
  it('reads the tags, and falls back to the file name for a title', async () => {
    const tagged = await indexSong(new File([mp3('Nocturne in F major', 'Chopin', 'Nocturnes')], 'x.mp3', { lastModified: 5 }), 'Chopin/x.mp3');
    expect(tagged).toMatchObject({ path: 'Chopin/x.mp3', title: 'Nocturne in F major', artist: 'Chopin', album: 'Nocturnes', cover: false, size: expect.any(Number), modified: 5 });
    const bare = await indexSong(new File([new Uint8Array([1, 2])], '03 - Clair de lune.mp3'), 'Debussy/03 - Clair de lune.mp3');
    expect(bare.title).toBe('Clair de lune');
  });

  it('gives the same id to the same file and a new one when it changes', async () => {
    const f = (m: number) => new File([mp3('a', 'b', 'c')], 'a.mp3', { lastModified: m });
    expect((await indexSong(f(1), 'a.mp3')).id).toBe((await indexSong(f(1), 'a.mp3')).id);
    expect((await indexSong(f(1), 'a.mp3')).id).not.toBe((await indexSong(f(2), 'a.mp3')).id);
  });
});

describe('searchTracks', () => {
  const lib = [t('Gymnopédie No. 1', 'Satie', 'Gymnopédies'), t('Clair de lune', 'Debussy', 'Suite bergamasque'), t('Nocturne in F major', 'Chopin', 'Nocturnes')];

  it('finds by any word in title, artist or album, ignoring case and accents', () => {
    expect(searchTracks(lib, 'gymnopedie').map((x) => x.title)).toEqual(['Gymnopédie No. 1']);
    expect(searchTracks(lib, 'CHOPIN noct').map((x) => x.title)).toEqual(['Nocturne in F major']);
    expect(searchTracks(lib, 'bergamasque').map((x) => x.artist)).toEqual(['Debussy']);
    expect(searchTracks(lib, '  ')).toHaveLength(3);
    expect(searchTracks(lib, 'mozart')).toEqual([]);
  });
});

describe('sortTracks and groupTracks', () => {
  it('sorts titles as people read them, numbers by value', () => {
    expect(sortTracks([t('Track 10'), t('track 2'), t('Étude')]).map((x) => x.title)).toEqual(['Étude', 'track 2', 'Track 10']);
  });

  it('groups by artist or album, with unknowns last', () => {
    const groups = groupTracks([t('a', 'Satie'), t('b', ''), t('c', 'Chopin'), t('d', 'Chopin')], 'artist');
    expect(groups.map((g) => [g.name, g.tracks.length])).toEqual([['Chopin', 2], ['Satie', 1], ['Unknown artist', 1]]);
    expect(groupTracks([t('a', 'x', '')], 'album')[0]!.name).toBe('Unknown album');
  });
});
