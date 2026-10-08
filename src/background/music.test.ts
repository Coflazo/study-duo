import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { recordsBetween } from '@/core/log';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { listeningItem, timerItem } from '@/core/store';
import { initialState, reduce } from '@/core/timer';
import { hearTab } from './music';

const song = { title: 'lofi hip hop radio', artist: 'Lofi Girl', album: '', playing: true };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  fakeBrowser.reset();
});

describe('hearTab', () => {
  it('records songs only while the timer runs, so a music tab never becomes a watch history', async () => {
    const t0 = Date.now();
    await hearTab(1, 'https://www.youtube.com/watch?v=jfKfPfyJRdk', song, t0);
    expect(await listeningItem.getValue()).toEqual({});
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, t0).state);
    await hearTab(1, 'https://www.youtube.com/watch?v=jfKfPfyJRdk', song, t0 + 3_000);
    await hearTab(1, 'https://www.youtube.com/watch?v=jfKfPfyJRdk', { ...song, playing: false }, t0 + 60_000);
    expect((await recordsBetween('listens', 0, Infinity)).map((l) => l.title)).toEqual(['lofi hip hop radio']);
  });

  it('never lets a stop message eat the next song report (reloading a playing tab)', async () => {
    const t0 = Date.now();
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, t0).state);
    await hearTab(2, 'https://music.youtube.com/watch', song, t0);
    await hearTab(2, 'https://music.youtube.com/watch', null, t0 + 10_000); // page closes on reload
    await hearTab(2, 'https://music.youtube.com/watch', song, t0 + 10_500); // the reloaded page reports at once
    expect(Object.values(await listeningItem.getValue())).toHaveLength(1);
  });
});
