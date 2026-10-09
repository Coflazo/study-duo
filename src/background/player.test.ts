import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { recordsBetween } from '@/core/log';
import { INITIAL_PLAYER, type PlayerTrack } from '@/core/player';
import { playerItem, playerTracksItem } from '@/core/session-store';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
import { initialState, reduce } from '@/core/timer';

const played: unknown[] = [];
vi.mock('./sound', () => ({ focusSound: vi.fn(async (cmd: unknown) => void played.push(cmd)) }));
vi.mock('./effects', () => ({ ensureOffscreen: vi.fn(async () => undefined) }));
const { playerCommands } = await import('./player');

const song = (id: string): PlayerTrack => ({ id, path: `Chopin/${id}.mp3`, title: `Song ${id}`, artist: 'Chopin', album: 'Nocturnes', genre: 'Classical', color: null, cover: false });
const songs = [song('a'), song('b')];
const sent: unknown[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  globalThis.indexedDB = new IDBFactory();
  played.length = 0;
  sent.length = 0;
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(async (m: unknown) => void sent.push(m));
});

describe('playerCommands', () => {
  it('keeps one state and plays what it decides, in order', async () => {
    await playerCommands([{ op: 'volume', volume: 0.4 }, { op: 'noise', noise: 'brown' }, { op: 'play' }], 1_000);
    expect(await playerItem.getValue()).toMatchObject({ active: 'noise', playing: true, noise: 'brown', volume: 0.4, startedAt: 1_000 });
    expect(played).toEqual([{ op: 'play', noise: 'brown', volume: 0.4 }]);
    await playerCommands([{ op: 'toggle' }], 2_000);
    expect(played.at(-1)).toEqual({ op: 'stop' });
    expect((await playerItem.getValue()).playing).toBe(false);
  });

  it('runs commands from two pages one after the other, never interleaved', async () => {
    await Promise.all([playerCommands([{ op: 'play' }], 1_000), playerCommands([{ op: 'pause' }], 1_001), playerCommands([{ op: 'play' }], 1_002)]);
    expect(played.map((c) => (c as { op: string }).op)).toEqual(['play', 'stop', 'play']);
  });
});

describe('the folder in the background', () => {
  it('stores the song list apart: pages get the song on the card and the next title', async () => {
    await playerCommands([{ op: 'folder', tracks: songs, start: 0, shuffle: false }], 1_000);
    const page = await playerItem.getValue();
    expect(page.tracks).toEqual({});
    expect(page.now).toEqual(songs[0]);
    expect(page.upNext).toBe('Song b');
    expect(Object.keys(await playerTracksItem.getValue())).toEqual(['a', 'b']);
    expect(sent.at(-1)).toEqual({ target: 'offscreen', kind: 'file', op: 'play', path: 'Chopin/a.mp3', at: 0, volume: INITIAL_PLAYER.volume });
  });

  it('does not rewrite the song list for a volume change', async () => {
    await playerCommands([{ op: 'folder', tracks: songs, start: 0, shuffle: false }], 1_000);
    const set = vi.spyOn(playerTracksItem, 'setValue');
    await playerCommands([{ op: 'volume', volume: 0.3 }], 2_000);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps a folder song as a listen when it stops, if the timer ran', async () => {
    await settingsItem.setValue(DEFAULT_SETTINGS);
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, 1_000).state);
    await playerCommands([{ op: 'folder', tracks: songs, start: 0, shuffle: false }], 1_000);
    await playerCommands([{ op: 'next' }], 61_000);
    await playerCommands([{ op: 'pause' }], 121_000);
    const listens = await recordsBetween('listens', 0, Number.MAX_SAFE_INTEGER);
    expect(listens.map((l) => [l.title, l.host, l.genre, l.endedAt - l.startedAt])).toEqual([['Song a', 'file', 'Classical', 60_000], ['Song b', 'file', 'Classical', 60_000]]);
    expect(listens.every((l) => l.sessionId?.endsWith('-focus'))).toBe(true);
  });

  it('keeps nothing when the timer is not running', async () => {
    await settingsItem.setValue(DEFAULT_SETTINGS);
    await playerCommands([{ op: 'folder', tracks: songs, start: 0, shuffle: false }], 1_000);
    await playerCommands([{ op: 'pause' }], 61_000);
    expect(await recordsBetween('listens', 0, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });
});
