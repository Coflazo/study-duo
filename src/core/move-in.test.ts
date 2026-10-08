import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import type { Sites } from './sites';
import { HardLockError, moveIn } from './site-store';
import { settingsItem, sitesItem, timerItem } from './store';
import { initialState } from './timer';
import { todosItem } from './todos';
import { buildBundle, parseBundle } from './transfer';

const bundle = (patch: Partial<typeof DEFAULT_SETTINGS> = {}, sites: Sites = { 'youtube.com': 'blocked' }) =>
  buildBundle({ settings: { ...DEFAULT_SETTINGS, focusMin: 50, ...patch }, sites, todos: [{ id: 'm1', text: 'Moved task', course: null, done: false, doneAt: null, ifThen: null }] }, 1);

beforeEach(() => fakeBrowser.reset());

describe('moveIn (security review)', () => {
  it('is refused during a hard-locked study block when it would loosen the lock, and changes nothing', async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, hardLock: true });
    await sitesItem.setValue({ 'youtube.com': 'blocked', 'reddit.com': 'blocked' });
    await timerItem.setValue({ ...initialState(), phase: 'focus', status: 'running', startedAt: 1, endsAt: Date.now() + 600_000 });
    await expect(moveIn(bundle({ hardLock: false }, {}))).rejects.toBeInstanceOf(HardLockError);
    await expect(moveIn(bundle({ hardLock: true }, {}))).rejects.toBeInstanceOf(HardLockError); // fewer blocked sites loosens it too
    expect(normalizeSettings(await settingsItem.getValue()).focusMin).toBe(25);
    expect(await sitesItem.getValue()).toEqual({ 'youtube.com': 'blocked', 'reddit.com': 'blocked' });
    expect(await todosItem.getValue()).toEqual([]);
  });

  it("keeps this computer's history settings and measurement switches, which belong with the history here", async () => {
    await settingsItem.setValue({ ...DEFAULT_SETTINGS, retentionDays: 365, measure: { ...DEFAULT_SETTINGS.measure, input: false, music: false } });
    const added = await moveIn(bundle({ retentionDays: 30, measure: { ...DEFAULT_SETTINGS.measure, input: true, music: true } }));
    const s = normalizeSettings(await settingsItem.getValue());
    expect([s.focusMin, s.retentionDays, s.measure.input, s.measure.music]).toEqual([50, 365, false, false]);
    expect(added).toBe(1);
    expect(await sitesItem.getValue()).toEqual({ 'youtube.com': 'blocked' });
  });
});

describe('parseBundle limits (security review)', () => {
  it('refuses more blocked sites than the browser can enforce, which would switch blocking off', () => {
    const many = Object.fromEntries(Array.from({ length: 901 }, (_, i) => [`site${i}.example`, 'blocked']));
    expect(parseBundle({ ...bundle(), sites: many })).toBeNull();
    const ok = Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`site${i}.example`, 'blocked']));
    expect(parseBundle({ ...bundle(), sites: ok })).not.toBeNull();
  });
});
