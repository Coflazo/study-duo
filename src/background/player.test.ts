import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { INITIAL_PLAYER } from '@/core/player';
import { playerItem } from '@/core/session-store';

const played: unknown[] = [];
vi.mock('./sound', () => ({ focusSound: vi.fn(async (cmd: unknown) => void played.push(cmd)) }));
const { playerCommands } = await import('./player');

beforeEach(() => {
  fakeBrowser.reset();
  played.length = 0;
});

describe('playerCommands', () => {
  it('keeps one state and plays what it decides, in order', async () => {
    await playerCommands([{ op: 'volume', volume: 0.4 }, { op: 'noise', noise: 'brown' }, { op: 'play' }], 1_000);
    expect(await playerItem.getValue()).toEqual({ ...INITIAL_PLAYER, active: 'noise', playing: true, noise: 'brown', volume: 0.4, startedAt: 1_000, at: 1_000 });
    expect(played).toEqual([{ op: 'play', noise: 'brown', volume: 0.4 }]);
    await playerCommands([{ op: 'toggle' }], 2_000);
    expect(played.at(-1)).toEqual({ op: 'stop' });
    expect((await playerItem.getValue()).playing).toBe(false);
  });

  it('runs commands from two pages one after the other, never interleaved', async () => {
    await Promise.all([playerCommands([{ op: 'play' }], 1_000), playerCommands([{ op: 'pause' }], 1_001), playerCommands([{ op: 'play' }], 1_002)]);
    expect(played.map((c) => (c as { op: string }).op)).toEqual(['play', 'stop', 'play']);
  });
});
