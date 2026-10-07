import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
import { initialState, reduce } from '@/core/timer';
import { ensureOverlay, keepClocksOnOpenTabs } from './overlay-inject';

const sendMessage = vi.fn();
const executeScript = vi.fn(async () => []);
const get = vi.fn(async (id: number) => ({ id, status: 'complete' }));
const query = vi.fn(async () => [{ id: 7, active: true }]);
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
  Object.assign(fakeBrowser.tabs, { sendMessage, get, query });
  Object.assign(fakeBrowser, { scripting: { executeScript } });
});

describe('ensureOverlay', () => {
  it('adds the clock to a page where no clock answers', async () => {
    await ensureOverlay(3);
    expect(sendMessage).toHaveBeenCalledWith(3, { kind: 'overlay', op: 'ping' });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ['/content-scripts/overlay.js'] });
  });

  it('leaves a page alone when its clock answers', async () => {
    sendMessage.mockResolvedValue(true);
    await ensureOverlay(3);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('leaves a loading page alone, since Chrome adds the clock when it finishes', async () => {
    get.mockResolvedValueOnce({ id: 3, status: 'loading' });
    await ensureOverlay(3);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('adds one clock when asked twice at once', async () => {
    await Promise.all([ensureOverlay(3), ensureOverlay(3)]);
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it('shrugs off pages it may not touch (chrome:// pages, the Web Store, closed tabs)', async () => {
    executeScript.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
    await expect(ensureOverlay(3)).resolves.toBeUndefined();
    get.mockRejectedValueOnce(new Error('No tab with id: 3'));
    await expect(ensureOverlay(3)).resolves.toBeUndefined();
  });
});

describe('keepClocksOnOpenTabs', () => {
  it('checks the tab you switch to during a block, and leaves tabs alone while the timer is stopped', async () => {
    keepClocksOnOpenTabs();
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    await flush();
    expect(sendMessage).not.toHaveBeenCalled();

    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, Date.now()).state);
    await flush();
    sendMessage.mockClear();
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(4, { kind: 'overlay', op: 'ping' });
  });

  it('checks the tab in front of every window when a block starts', async () => {
    keepClocksOnOpenTabs();
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, Date.now()).state);
    await flush();
    expect(query).toHaveBeenCalledWith({ active: true });
    expect(sendMessage).toHaveBeenCalledWith(7, { kind: 'overlay', op: 'ping' });
  });

  it('adds nothing when the corner clock is switched off', async () => {
    keepClocksOnOpenTabs();
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, overlayEnabled: false });
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, Date.now()).state);
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    await flush();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
