import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS as S } from '@/core/settings';
import { initialState, reduce } from '@/core/timer';
import { lockActive, syncLock, unlockedItem } from './site-lock';

const T0 = Date.UTC(2026, 9, 7, 9, 0);
const study = reduce(initialState(), { type: 'start' }, S, T0).state;
const brk = { ...study, phase: 'shortBreak' as const };
const sites = { 'youtube.com': 'blocked', 'khanacademy.org': 'study' } as const;
let session: Array<{ id: number }> = [];

beforeEach(() => {
  fakeBrowser.reset();
  session = [];
  Object.assign(fakeBrowser, {
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => session),
      updateSessionRules: vi.fn(async ({ removeRuleIds, addRules }: { removeRuleIds: number[]; addRules: Array<{ id: number }> }) => {
        session = [...session.filter((r) => !removeRuleIds.includes(r.id)), ...addRules];
      }),
    },
  });
  Object.assign(fakeBrowser.tabs, {
    query: vi.fn(async () => [
      { id: 1, url: 'https://www.youtube.com/watch?v=1' },
      { id: 2, url: 'https://www.khanacademy.org/math' },
    ]),
    update: vi.fn(async () => ({})),
  });
});

describe('site lock', () => {
  it('is on while a study block runs or is paused, off in breaks and when stopped', () => {
    expect(lockActive(study)).toBe(true);
    expect(lockActive(reduce(study, { type: 'pause' }, S, T0 + 1).state)).toBe(true);
    expect(lockActive(brk)).toBe(false);
    expect(lockActive(initialState())).toBe(false);
  });

  it('closes Blocked sites at the start of a block, including tabs already open', async () => {
    await syncLock(study, S, { ...sites }, []);
    expect(session.length).toBeGreaterThan(0);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(1, { url: expect.stringMatching(/blocked\.html#https:\/\/www\.youtube\.com\/watch\?v=1$/) });
  });

  it('does not sweep tabs again while the rules stay the same', async () => {
    await syncLock(study, S, { ...sites }, []);
    await syncLock(study, S, { ...sites }, []);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.declarativeNetRequest.updateSessionRules).toHaveBeenCalledTimes(1);
  });

  it('re-applies after a browser restart, when session rules are gone', async () => {
    await syncLock(study, S, { ...sites }, []);
    session = [];
    await fakeBrowser.storage.session.clear();
    await syncLock(study, S, { ...sites }, []);
    expect(session.length).toBeGreaterThan(0);
  });

  it('opens everything in the break and forgets unlocked sites', async () => {
    await unlockedItem.setValue(['youtube.com']);
    await syncLock(study, S, { ...sites }, ['youtube.com']);
    await syncLock(brk, S, { ...sites }, ['youtube.com']);
    expect(session).toEqual([]);
    expect(await unlockedItem.getValue()).toEqual([]);
  });
});
