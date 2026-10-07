import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dismissPrompt, fileSite, removeSite } from './site-store';
import { promptDismissedItem, sitesItem } from './store';

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
