import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from './settings';
import { dismissPrompt, fileSite, HardLockError, removeSite, updateSiteSettings } from './site-store';
import { promptDismissedItem, settingsItem, sitesItem, timerItem } from './store';
import { initialState, reduce } from './timer';

beforeEach(() => fakeBrowser.reset());

describe('site store', () => {
  it('files, moves and removes sites', async () => {
    await fileSite('youtube.com', 'blocked');
    await fileSite('khanacademy.org', 'study');
    await fileSite('youtube.com', 'neutral');
    expect(await sitesItem.getValue()).toEqual({ 'youtube.com': 'neutral', 'khanacademy.org': 'study' });
    await removeSite('youtube.com');
    expect(await sitesItem.getValue()).toEqual({ 'khanacademy.org': 'study' });
  });
  it('refuses anything that is not a canonical domain', async () => {
    await expect(fileSite('https://www.reddit.com/r/x', 'blocked')).rejects.toThrow();
    expect(await sitesItem.getValue()).toEqual({});
  });
  it('filing a site also stops the prompt for it, once', async () => {
    await fileSite('khanacademy.org', 'study');
    await dismissPrompt('khanacademy.org');
    expect(await promptDismissedItem.getValue()).toEqual(['khanacademy.org']);
  });
});

describe('hard lock during a block', () => {
  const lockedBlock = async () => {
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, DEFAULT_SETTINGS, Date.now()).state);
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, hardLock: true });
    await sitesItem.setValue({ 'youtube.com': 'blocked' });
  };

  it('refuses changes that would open a closed site, and allows closing more', async () => {
    await lockedBlock();
    await expect(fileSite('youtube.com', 'study')).rejects.toThrow(HardLockError);
    await expect(removeSite('youtube.com')).rejects.toThrow(HardLockError);
    await expect(updateSiteSettings({ hardLock: false })).rejects.toThrow(HardLockError);
    await fileSite('reddit.com', 'blocked');
    await updateSiteSettings({ siteMode: 'allowOnlyStudy' });
    await expect(updateSiteSettings({ siteMode: 'closeBlocked' })).rejects.toThrow(HardLockError);
    expect(await sitesItem.getValue()).toEqual({ 'youtube.com': 'blocked', 'reddit.com': 'blocked' });
    expect((await settingsItem.getValue()).hardLock).toBe(true);
  });

  it('allows anything in a break or without hard lock', async () => {
    await lockedBlock();
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, hardLock: false });
    await removeSite('youtube.com');
    await sitesItem.setValue({ 'youtube.com': 'blocked' });
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, hardLock: true });
    await timerItem.setValue(initialState());
    await removeSite('youtube.com');
    expect(await sitesItem.getValue()).toEqual({});
  });
});
