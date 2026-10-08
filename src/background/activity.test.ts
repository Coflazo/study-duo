import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { timerItem, trackerItem } from '@/core/store';
import { initialState, reduce } from '@/core/timer';
import { trackActivity } from './activity';

const flush = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  fakeBrowser.reset();
  Object.assign(fakeBrowser.tabs, { query: vi.fn(async () => [{ id: 1, active: true, url: 'https://khanacademy.org/x' }]) });
  Object.assign(fakeBrowser.idle, { onStateChanged: { addListener: vi.fn() } });
});

describe('trackActivity', () => {
  it('picks up a block that was already running when the worker started (browser restart, extension update)', async () => {
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, Date.now()).state);
    trackActivity();
    await flush();
    expect(await trackerItem.getValue()).toMatchObject({ phase: 'focus', host: 'khanacademy.org', open: { category: 'unfiled', domain: 'khanacademy.org' } });
  });
});
