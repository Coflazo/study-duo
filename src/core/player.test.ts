import { describe, expect, it } from 'vitest';
import { applyPlayer, INITIAL_PLAYER, nextTitle, parsePlayer, positionAt, soundToPlayer, type PlayerState, type PlayerTrack } from './player';

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
    const yt: PlayerState = { ...playingNoise, active: 'youtube' };
    const { state, effects } = applyPlayer(yt, { op: 'noise', noise: 'white' }, NOW);
    expect(state).toMatchObject({ active: 'noise', playing: true, noise: 'white' });
    expect(effects).toEqual([{ type: 'source-stop', source: 'youtube' }, { type: 'noise-start', noise: 'white', volume: 0.5 }]);
  });

  it('hands over to another source by itself when something plays, and only changes the card when nothing does', () => {
    const live = applyPlayer(playingNoise, { op: 'source', source: 'youtube' }, NOW);
    expect(live.state).toMatchObject({ active: 'youtube', playing: true, startedAt: NOW });
    expect(live.effects).toEqual([{ type: 'noise-stop' }, { type: 'source-start', source: 'youtube' }]);
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

const song = (id: string): PlayerTrack => ({ id, path: `Chopin/${id}.mp3`, title: `Song ${id}`, artist: 'Chopin', album: 'Nocturnes', genre: 'Classical', color: '#1e2f5c', cover: true });
const songs = [song('a'), song('b'), song('c')];
const play = (s: PlayerState, cmds: Parameters<typeof applyPlayer>[1][], t = NOW) => cmds.reduce((acc, c) => applyPlayer(acc.state, c, t), { state: s, effects: [] as ReturnType<typeof applyPlayer>['effects'] });

describe('the music folder', () => {
  it('plays a list from the song picked, handing over from noise', () => {
    const { state, effects } = applyPlayer(playingNoise, { op: 'folder', tracks: songs, start: 1, shuffle: false }, NOW);
    expect(state).toMatchObject({ active: 'folder', playing: true, position: 0, problem: null });
    expect(effects).toEqual([{ type: 'noise-stop' }, { type: 'file-play', track: songs[1], at: 0, volume: 0.5 }]);
  });

  it('runs its position forward while playing and keeps it when paused', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    expect(positionAt(on, NOW + 30_000)).toBe(30_000);
    const off = applyPlayer(on, { op: 'pause' }, NOW + 30_000);
    expect(off.effects).toEqual([{ type: 'file-pause' }]);
    expect(positionAt(off.state, NOW + 99_000)).toBe(30_000);
    expect(applyPlayer(off.state, { op: 'play' }, NOW + 99_000).effects).toEqual([{ type: 'file-play', track: songs[0], at: 30_000, volume: 0.6 }]);
  });

  it('goes to the next song, stops after the last, and goes round with repeat all', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 2, shuffle: false }, NOW).state;
    expect(applyPlayer(on, { op: 'ended' }, NOW).state.playing).toBe(false);
    const round = play(on, [{ op: 'repeat', repeat: 'all' }, { op: 'next' }]);
    expect(round.effects).toEqual([{ type: 'file-play', track: songs[0], at: 0, volume: 0.6 }]);
  });

  it('previous goes to the start of the song first, then to the one before', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 1, shuffle: false }, NOW).state;
    expect(applyPlayer(on, { op: 'prev' }, NOW + 10_000).effects).toEqual([{ type: 'file-seek', at: 0, path: songs[1]!.path }]);
    expect(applyPlayer(on, { op: 'prev' }, NOW + 1_000).effects).toEqual([{ type: 'file-play', track: songs[0], at: 0, volume: 0.6 }]);
  });

  it('seeks inside the song, never past its end once its length is known', () => {
    const on = play(INITIAL_PLAYER, [{ op: 'folder', tracks: songs, start: 0, shuffle: false }, { op: 'loaded', duration: 245_000 }]).state;
    expect(applyPlayer(on, { op: 'seek', ms: 57_000 }, NOW)).toMatchObject({ state: { position: 57_000 }, effects: [{ type: 'file-seek', at: 57_000, path: songs[0]!.path }] });
    expect(applyPlayer(on, { op: 'seek', ms: 999_000 }, NOW).state.position).toBe(245_000);
  });

  it('switching to noise and back picks the song up where it was', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    const toNoise = applyPlayer(on, { op: 'source', source: 'noise' }, NOW + 40_000);
    expect(toNoise.effects[0]).toEqual({ type: 'file-pause' });
    const back = applyPlayer(toNoise.state, { op: 'source', source: 'folder' }, NOW + 90_000);
    expect(back.effects).toEqual([{ type: 'noise-stop' }, { type: 'file-play', track: songs[0], at: 40_000, volume: 0.6 }]);
  });

  it('picking the folder with nothing queued stops what plays and waits', () => {
    const { state, effects } = applyPlayer(playingNoise, { op: 'source', source: 'folder' }, NOW);
    expect(state).toMatchObject({ active: 'folder', playing: false });
    expect(effects).toEqual([{ type: 'noise-stop' }]);
  });

  it('stops and says why when Chrome needs the folder again', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    expect(applyPlayer(on, { op: 'problem', problem: 'reconnect' }, NOW).state).toMatchObject({ playing: false, problem: 'reconnect' });
  });

  it('accepts a folder list only when every song is well formed', () => {
    expect(parsePlayer({ kind: 'player', op: 'folder', tracks: songs, start: 9 })).toEqual({ op: 'folder', tracks: songs, start: 2, shuffle: false });
    expect(parsePlayer({ kind: 'player', op: 'folder', tracks: [{ id: 'x' }], start: 0 })).toBeNull();
    expect(parsePlayer({ kind: 'player', op: 'folder', tracks: [], start: 0 })).toBeNull();
    expect(parsePlayer({ kind: 'player', op: 'folder', tracks: [{ ...songs[0], color: 'red; background:url(x)' }], start: 0 })).toEqual({ op: 'folder', tracks: [{ ...songs[0], color: null }], start: 0, shuffle: false });
  });
});

describe('reports from the page playing the file', () => {
  const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;

  it('count only for the song that is playing now', () => {
    expect(applyPlayer(on, { op: 'ended', path: songs[2]!.path }, NOW).state).toBe(on);
    expect(applyPlayer(on, { op: 'loaded', duration: 9, path: songs[1]!.path }, NOW).state.duration).toBeNull();
    expect(applyPlayer(on, { op: 'ended', path: songs[0]!.path }, NOW).effects).toEqual([{ type: 'file-play', track: songs[1], at: 0, volume: 0.6 }]);
  });

  it('never stop noise or another source', () => {
    expect(applyPlayer(playingNoise, { op: 'problem', problem: 'missing' }, NOW).state).toBe(playingNoise);
    expect(applyPlayer(playingNoise, { op: 'ended' }, NOW).state).toBe(playingNoise);
  });

  it('repeat one plays the song again when it ends, but Next still moves on', () => {
    const one = applyPlayer(on, { op: 'repeat', repeat: 'one' }, NOW).state;
    expect(applyPlayer(one, { op: 'ended', path: songs[0]!.path }, NOW).effects).toEqual([{ type: 'file-play', track: songs[0], at: 0, volume: 0.6 }]);
    const next = applyPlayer(one, { op: 'next' }, NOW);
    expect(next.effects).toEqual([{ type: 'file-play', track: songs[1], at: 0, volume: 0.6 }]);
    expect(next.state.queue?.repeat).toBe('one');
  });

  it('names the song after this one', () => {
    expect(nextTitle(on)).toBe('Song b');
  });
});

describe('jump', () => {
  it('plays a later song in the queue straight away', () => {
    const on = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    const { state, effects } = applyPlayer(on, { op: 'jump', at: 2 }, NOW);
    expect(state.queue?.at).toBe(2);
    expect(effects).toEqual([{ type: 'file-play', track: songs[2], at: 0, volume: 0.6 }]);
    expect(parsePlayer({ kind: 'player', op: 'jump', at: 1 })).toEqual({ op: 'jump', at: 1 });
    expect(applyPlayer(on, { op: 'jump', at: 9 }, NOW).state).toBe(on);
  });
});
