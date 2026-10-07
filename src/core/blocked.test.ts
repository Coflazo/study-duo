import { describe, expect, it } from 'vitest';
import { parseBlockedHash } from './blocked';

describe('parseBlockedHash', () => {
  it('reads the closed address and its site', () => {
    expect(parseBlockedHash('#https://www.youtube.com/watch?v=1#t=30')).toEqual({ url: 'https://www.youtube.com/watch?v=1#t=30', domain: 'youtube.com' });
    expect(parseBlockedHash('#http://reddit.com/')).toEqual({ url: 'http://reddit.com/', domain: 'reddit.com' });
  });
  it('ignores anything that is not a web address, so "Open anyway" can never run code', () => {
    for (const bad of ['', '#', '#javascript:alert(1)', '#data:text/html,hi', '#chrome://settings', '#file:///etc/passwd', `#https://a.com/${'x'.repeat(2100)}`, '#not a url']) {
      expect(parseBlockedHash(bad), bad).toBeNull();
    }
  });
});
