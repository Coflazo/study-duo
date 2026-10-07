import { describe, expect, it } from 'vitest';
import { buildRules, wouldClose, type DnrRule } from './blocking';
import type { Sites } from './sites';

const PAGE = 'chrome-extension://bcggiingdefmehpjcalkfpdnehpcieon/blocked.html';

const winner = (rules: DnrRule[], host: string) => (wouldClose(rules, host) ? 'closed' : 'open');

const sites: Sites = { 'youtube.com': 'blocked', 'music.youtube.com': 'neutral', 'google.com': 'study', 'mail.google.com': 'blocked', 'khanacademy.org': 'study' };

describe('buildRules', () => {
  it('closes Blocked sites and keeps more specific exceptions open', () => {
    const rules = buildRules({ sites, mode: 'closeBlocked', unlocked: [], blockedPage: PAGE });
    expect(winner(rules, 'youtube.com')).toBe('closed');
    expect(winner(rules, 'www.youtube.com')).toBe('closed');
    expect(winner(rules, 'music.youtube.com')).toBe('open');
    expect(winner(rules, 'mail.google.com')).toBe('closed');
    expect(winner(rules, 'docs.google.com')).toBe('open');
    expect(winner(rules, 'unfiled.example')).toBe('open');
  });

  it('in Allow only Study, also closes unfiled sites', () => {
    const rules = buildRules({ sites, mode: 'allowOnlyStudy', unlocked: [], blockedPage: PAGE });
    expect(winner(rules, 'unfiled.example')).toBe('closed');
    expect(winner(rules, 'khanacademy.org')).toBe('open');
    expect(winner(rules, 'music.youtube.com')).toBe('open');
    expect(winner(rules, 'youtube.com')).toBe('closed');
  });

  it('lets an unlocked site through until the block ends', () => {
    const rules = buildRules({ sites, mode: 'closeBlocked', unlocked: ['youtube.com'], blockedPage: PAGE });
    expect(winner(rules, 'youtube.com')).toBe('open');
    expect(winner(rules, 'mail.google.com')).toBe('closed');
  });

  it('redirects only top-level http(s) pages, carrying the address in the fragment', () => {
    const rules = buildRules({ sites, mode: 'closeBlocked', unlocked: [], blockedPage: PAGE });
    for (const r of rules) expect(r.condition.resourceTypes).toEqual(['main_frame']);
    const redirect = rules.find((r) => r.action.type === 'redirect')!;
    expect(redirect.condition.regexFilter).toBe('^https?://.*');
    expect(redirect.action).toEqual({ type: 'redirect', redirect: { regexSubstitution: `${PAGE}#\\0` } });
  });

  it('adds nothing when nothing would close, and numbers rules stably', () => {
    expect(buildRules({ sites: { 'khanacademy.org': 'study' }, mode: 'closeBlocked', unlocked: [], blockedPage: PAGE })).toEqual([]);
    const a = buildRules({ sites, mode: 'allowOnlyStudy', unlocked: ['x.org'], blockedPage: PAGE });
    const b = buildRules({ sites: Object.fromEntries(Object.entries(sites).reverse()), mode: 'allowOnlyStudy', unlocked: ['x.org'], blockedPage: PAGE });
    expect(a).toEqual(b);
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
  });
});
