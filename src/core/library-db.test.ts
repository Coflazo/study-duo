import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from './library';
import { forgetLibrary, loadFolder, loadThumb, loadTracks, saveLibrary, saveThumb } from './library-db';

const t = (id: string, title: string): Track => ({ id, path: `${title}.mp3`, title, artist: '', album: '', genre: '', cover: false, color: null, size: 1, modified: 1 });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('library database', () => {
  it('keeps the picked folder and its songs, and a new scan replaces the old list', async () => {
    await saveLibrary({ handle: { name: 'Music' }, name: 'Music', indexedAt: 1 }, [t('a', 'One'), t('b', 'Two')]);
    expect((await loadTracks()).map((x) => x.title).sort()).toEqual(['One', 'Two']);
    expect(await loadFolder()).toMatchObject({ name: 'Music', indexedAt: 1, count: 2 });
    await saveLibrary({ handle: { name: 'Music' }, name: 'Music', indexedAt: 2 }, [t('c', 'Three')]);
    expect((await loadTracks()).map((x) => x.title)).toEqual(['Three']);
    expect(await loadFolder()).toMatchObject({ indexedAt: 2, count: 1 });
  });

  it('keeps small cover thumbnails by song, and drops the ones whose song is gone', async () => {
    await saveLibrary({ handle: {}, name: 'Music', indexedAt: 1 }, [t('a', 'One'), t('b', 'Two')]);
    await saveThumb('a', new Blob(['x']));
    await saveThumb('b', new Blob(['y']));
    expect(await loadThumb('a')).toBeInstanceOf(Blob);
    await saveLibrary({ handle: {}, name: 'Music', indexedAt: 2 }, [t('a', 'One')]);
    expect(await loadThumb('a')).toBeInstanceOf(Blob);
    expect(await loadThumb('b')).toBeNull();
  });

  it('forgets everything on request', async () => {
    await saveLibrary({ handle: {}, name: 'Music', indexedAt: 1 }, [t('a', 'One')]);
    await saveThumb('a', new Blob(['x']));
    await forgetLibrary();
    expect(await loadTracks()).toEqual([]);
    expect(await loadFolder()).toBeNull();
    expect(await loadThumb('a')).toBeNull();
  });
});
