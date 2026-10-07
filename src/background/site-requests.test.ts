import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { promptDismissedItem, sitesItem, timerItem } from '@/core/store';
import { DEFAULT_SETTINGS as S } from '@/core/settings';
import { initialState, reduce } from '@/core/timer';
import { handleSiteRequest, menuCategory, onSiteMenuClick } from './site-requests';

beforeEach(() => fakeBrowser.reset());

describe('site requests from pages', () => {
  it('reports the page\'s category, whether it was asked about, and whether the lock is on', async () => {
    await sitesItem.setValue({ 'youtube.com': 'blocked' });
    await timerItem.setValue(reduce(initialState(), { type: 'start' }, S, 0).state);
    expect(await handleSiteRequest({ op: 'status', domain: 'm.youtube.com' })).toEqual({
      domain: 'm.youtube.com', category: 'blocked', dismissed: false, lockActive: true, mode: 'closeBlocked',
    });
  });

  it('files the page\'s own site and stops asking about it', async () => {
    await handleSiteRequest({ op: 'file', category: 'study', domain: 'khanacademy.org' });
    expect(await sitesItem.getValue()).toEqual({ 'khanacademy.org': 'study' });
    expect(await promptDismissedItem.getValue()).toEqual(['khanacademy.org']);
  });
});

describe('right-click menu', () => {
  it('maps menu items to categories and files the page under the cursor', async () => {
    expect(menuCategory('file-neutral')).toBe('neutral');
    expect(menuCategory('something-else')).toBeNull();
    await onSiteMenuClick({ menuItemId: 'file-blocked', pageUrl: 'https://www.reddit.com/r/all' }, undefined);
    await onSiteMenuClick({ menuItemId: 'file-study' }, { url: 'https://khanacademy.org/' });
    await onSiteMenuClick({ menuItemId: 'file-study', pageUrl: 'chrome://settings' }, undefined);
    expect(await sitesItem.getValue()).toEqual({ 'reddit.com': 'blocked', 'khanacademy.org': 'study' });
  });
});
