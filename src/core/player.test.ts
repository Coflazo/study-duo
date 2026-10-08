import { describe, expect, it } from 'vitest';
import { applyPlayer, INITIAL_PLAYER, parsePlayer, soundToPlayer, type PlayerState } from './player';

const NOW = 1_800_000_000_000;
const playingNoise: PlayerState = { ...INITIAL_PLAYER, active: 'noise', playing: true, noise: 'pink', volume: 0.5, startedAt: NOW - 60_000, at: NOW - 60_000 };

describe('parsePlayer', () => {
  it('accepts the player commands and clamps the volume', () => {
    expect(parsePlayer({ kind: 'player', op: 'toggle' })).toEqual({ op: 'toggle' });
    expect(parsePlayer({ kind: 'player', op: 'source', source: 'folder' })).toEqual({ op: 'source', source: 'folder' });
    expect(parsePlayer({ kind: 'player', op: 'noise', noise: 'brown' })).toEqual({ op: 'noise', noise: 'brown' });
    expect(parsePlayer({ kind: 'player', op: 'volume', volume: 7 })).toEqual({ op: 'volume', volume: 1 });
  });

  it('refuses anything else', () => {
    for (const raw of [null, 5, { kind: 'sound', op: 'play' }, { kind: 'player', op: 'explode' }, { kind: 'player', op: 'source', source: 'napster' }, { kind: 'player', op: 'noise', noise: 'blue' }, { kind: 'player', op: 'volume', volume: Number.NaN }]) {
      expect(parsePlayer(raw)).toBeNull();
    }
  });
});

describe('applyPlayer', () => {
  it('plays focus noise when nothing was chosen yet', () => {
    const { state, effects } = applyPlayer(INITIAL_PLAYER, { op: 'play' }, NOW);
    expect(state).toMatchObject({ active: 'noise', playing: true, startedAt: NOW });
    expect(effects).toEqual([{ type: 'noise-start', noise: INITIAL_PLAYER.noise, volume: INITIAL_PLAYER.volume }]);
  });

  it('pauses and plays again, and a second play changes nothing', () => {
    const paused = applyPlayer(playingNoise, { op: 'pause' }, NOW);
    expect(paused.state.playing).toBe(false);
    expect(paused.effects).toEqual([{ type: 'noise-stop' }]);
    expect(applyPlayer(paused.state, { op: 'toggle' }, NOW).effects).toEqual([{ type: 'noise-start', noise: 'pink', volume: 0.5 }]);
    expect(applyPlayer(playingNoise, { op: 'play' }, NOW).effects).toEqual([]);
  });

  it('changes the noise colour while it plays, crossfading old into new', () => {
    const { state, effects } = applyPlayer(playingNoise, { op: 'noise', noise: 'brown' }, NOW);
    expect(state.noise).toBe('brown');
    expect(effects).toEqual([{ type: 'noise-start', noise: 'brown', volume: 0.5 }]);
  });

  it('picking a colour while something else plays hands over to noise', () => {
    const folder: PlayerState = { ...playingNoise, active: 'folder' };
    const { state, effects } = applyPlayer(folder, { op: 'noise', noise: 'white' }, NOW);
    expect(state).toMatchObject({ active: 'noise', playing: true, noise: 'white' });
    expect(effects).toEqual([{ type: 'source-stop', source: 'folder' }, { type: 'noise-start', noise: 'white', volume: 0.5 }]);
  });

  it('hands over to another source by itself when something plays, and only changes the card when nothing does', () => {
    const live = applyPlayer(playingNoise, { op: 'source', source: 'folder' }, NOW);
    expect(live.state).toMatchObject({ active: 'folder', playing: true, startedAt: NOW });
    expect(live.effects).toEqual([{ type: 'noise-stop' }, { type: 'source-start', source: 'folder' }]);
    const quiet = applyPlayer({ ...playingNoise, playing: false }, { op: 'source', source: 'folder' }, NOW);
    expect(quiet.state).toMatchObject({ active: 'folder', playing: false });
    expect(quiet.effects).toEqual([]);
  });

  it('sets the volume, and tells the playing noise', () => {
    expect(applyPlayer(playingNoise, { op: 'volume', volume: 0.2 }, NOW)).toEqual({ state: { ...playingNoise, volume: 0.2 }, effects: [{ type: 'noise-volume', volume: 0.2 }] });
    expect(applyPlayer({ ...playingNoise, playing: false }, { op: 'volume', volume: 0.2 }, NOW).effects).toEqual([]);
  });
});

describe('soundToPlayer', () => {
  it('turns the Music page\'s focus sound buttons into player commands', () => {
    expect(soundToPlayer({ op: 'play', noise: 'brown', volume: 0.4 })).toEqual([{ op: 'volume', volume: 0.4 }, { op: 'noise', noise: 'brown' }, { op: 'play' }]);
    expect(soundToPlayer({ op: 'stop' })).toEqual([{ op: 'pause' }]);
    expect(soundToPlayer({ op: 'volume', volume: 0.3 })).toEqual([{ op: 'volume', volume: 0.3 }]);
  });
});
