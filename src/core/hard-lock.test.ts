import { describe, expect, it } from 'vitest';
import { loosens } from './hard-lock';
import type { Sites } from './sites';

const sites: Sites = { 'youtube.com': 'blocked', 'google.com': 'study', 'mail.google.com': 'blocked', 'khanacademy.org': 'study' };
const close = { sites, mode: 'closeBlocked' as const };
const only = { sites, mode: 'allowOnlyStudy' as const };

describe('loosens', () => {
  it('flags any change that would open a site the rules close now', () => {
    expect(loosens(close, { ...close, sites: { ...sites, 'youtube.com': 'study' } })).toBe(true);
    const { 'mail.google.com': _, ...withoutMail } = sites;
    expect(loosens(close, { ...close, sites: withoutMail })).toBe(true);
    expect(loosens(close, { ...close, sites: { ...sites, 'music.youtube.com': 'neutral' } })).toBe(true);
    expect(loosens(only, { ...only, mode: 'closeBlocked' })).toBe(true);
    expect(loosens(only, { ...only, sites: { ...sites, 'reddit.com': 'study' } })).toBe(true);
  });

  it('lets people close more, or change what is already open', () => {
    expect(loosens(close, { ...close, sites: { ...sites, 'reddit.com': 'blocked' } })).toBe(false);
    expect(loosens(close, { ...close, mode: 'allowOnlyStudy' })).toBe(false);
    expect(loosens(close, { ...close, sites: { ...sites, 'khanacademy.org': 'neutral' } })).toBe(false);
    expect(loosens(only, { ...only, sites: { ...sites, 'khanacademy.org': 'blocked' } })).toBe(false);
  });
});
