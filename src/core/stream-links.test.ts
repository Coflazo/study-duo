import { describe, expect, it } from 'vitest';
import { forgetLink, nameLink, rememberLink, type SavedLink } from './stream-links';

const yt = (url: string, addedAt: number): SavedLink => ({ source: 'youtube', url, title: null, artist: null, addedAt });

describe('saved links', () => {
  it('keeps the newest first, once per address, at most 20', () => {
    let list: SavedLink[] = [];
    for (let i = 0; i < 25; i++) list = rememberLink(list, { source: 'youtube', url: `https://www.youtube.com/watch?v=${String(i).padStart(11, 'a')}` }, i);
    expect(list).toHaveLength(20);
    expect(list[0]!.addedAt).toBe(24);
    const again = rememberLink(list, { source: 'youtube', url: list[5]!.url }, 99);
    expect(again).toHaveLength(20);
    expect(again[0]).toMatchObject({ url: list[5]!.url, addedAt: 99 });
  });

  it('takes the title the player reports, and forgets a link', () => {
    const list = [yt('https://www.youtube.com/watch?v=X0Cv0l-j86Y', 1)];
    const named = nameLink(list, 'https://www.youtube.com/watch?v=X0Cv0l-j86Y', 'Deep Focus', 'Quiet Quest');
    expect(named[0]).toMatchObject({ title: 'Deep Focus', artist: 'Quiet Quest' });
    expect(nameLink(named, 'https://www.youtube.com/watch?v=X0Cv0l-j86Y', 'Deep Focus', 'Quiet Quest')).toBe(named);
    expect(forgetLink(named, named[0]!.url)).toEqual([]);
  });
});
