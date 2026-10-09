import { describe, expect, it } from 'vitest';
import { applyPlayer, INITIAL_PLAYER, nextTitle, parsePlayer, positionAt, soundToPlayer, streamAt, type PlayerState, type PlayerTrack } from './player';

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
    expect(effects).toEqual([{ type: 'panel', op: 'pause' }, { type: 'noise-start', noise: 'white', volume: 0.5 }]);
  });

  it('hands over to another source by itself when something plays, and only changes the card when nothing does', () => {
    const link = { source: 'youtube' as const, url: 'https://www.youtube.com/watch?v=X0Cv0l-j86Y', title: null, artist: null, position: 0, at: 0, duration: null, problem: null };
    const live = applyPlayer({ ...playingNoise, stream: link, panel: true }, { op: 'source', source: 'youtube' }, NOW);
    expect(live.state).toMatchObject({ active: 'youtube', playing: true, startedAt: NOW });
    expect(live.effects).toEqual([{ type: 'noise-stop' }, { type: 'panel', op: 'play' }]);
    // No link yet: the noise stops and the card waits for one.
    const empty = applyPlayer(playingNoise, { op: 'source', source: 'youtube' }, NOW);
    expect(empty.state).toMatchObject({ active: 'youtube', playing: false });
    expect(empty.effects).toEqual([{ type: 'noise-stop' }]);
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
    expect(soundToPlayer({ op: 'play', noise: 'brown', volume: 0.4 })).toEqual([{ op: 'volume', volume: 0.4 }, { op: 'noise', noise: 'brown' }, { op: 'source', source: 'noise' }, { op: 'play' }]);
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

  it('starts from a pause and clears the last song\'s problem', () => {
    let s = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    s = applyPlayer(s, { op: 'problem', problem: 'missing', path: songs[0]!.path }, NOW).state;
    s = applyPlayer(s, { op: 'pause' }, NOW + 1_000).state;
    const { state, effects } = applyPlayer(s, { op: 'jump', at: 1 }, NOW + 2_000);
    expect(state).toMatchObject({ playing: true, problem: null, startedAt: NOW + 2_000 });
    expect(effects).toEqual([{ type: 'file-play', track: songs[1], at: 0, volume: 0.6 }]);
  });
});

describe('streaming in the side panel', () => {
  const URL1 = 'https://www.youtube.com/watch?v=X0Cv0l-j86Y';
  const report = (over: Record<string, unknown> = {}) => ({ op: 'stream-report' as const, url: URL1, title: 'Deep Focus', artist: 'Some channel', position: 0, duration: 3_600_000, playing: true, problem: null, ...over });
  const loaded = () => applyPlayer({ ...INITIAL_PLAYER, panel: true }, { op: 'stream', source: 'youtube', url: URL1 }, NOW).state;

  it('parses links and reports, and nothing else', () => {
    expect(parsePlayer({ kind: 'player', op: 'stream', source: 'youtube', url: URL1 })).toEqual({ op: 'stream', source: 'youtube', url: URL1 });
    expect(parsePlayer({ kind: 'player', op: 'stream', source: 'youtube', url: 'javascript:alert(1)' })).toBeNull();
    expect(parsePlayer({ kind: 'player', op: 'stream', source: 'folder', url: URL1 })).toBeNull();
    expect(parsePlayer({ kind: 'player', ...report({ title: 'x'.repeat(500), position: -5 }) })).toMatchObject({ op: 'stream-report', title: 'x'.repeat(300), position: 0 });
    expect(parsePlayer({ kind: 'player', op: 'stream-report', url: URL1, position: 'soon' })).toBeNull();
  });

  it('a link stops what played, and the panel loads it from the start', () => {
    const { state, effects } = applyPlayer({ ...playingNoise, panel: true }, { op: 'stream', source: 'youtube', url: URL1 }, NOW);
    expect(state).toMatchObject({ active: 'youtube', playing: true, stream: { source: 'youtube', url: URL1, position: 0, title: null } });
    expect(effects).toEqual([{ type: 'noise-stop' }, { type: 'panel-load', source: 'youtube', url: URL1, at: 0, play: true, volume: 0.5 }]);
  });

  it('play, pause, next, previous, seek and volume go to the panel', () => {
    const on = loaded();
    expect(applyPlayer(on, { op: 'pause' }, NOW + 10_000).effects).toEqual([{ type: 'panel', op: 'pause' }]);
    expect(applyPlayer(on, { op: 'next' }, NOW).effects).toEqual([{ type: 'panel', op: 'next' }]);
    expect(applyPlayer(on, { op: 'prev' }, NOW).effects).toEqual([{ type: 'panel', op: 'prev' }]);
    expect(applyPlayer(on, { op: 'seek', ms: 57_000 }, NOW).effects).toEqual([{ type: 'panel-seek', at: 57_000 }]);
    expect(applyPlayer(on, { op: 'volume', volume: 0.2 }, NOW).effects).toEqual([{ type: 'panel-volume', volume: 0.2 }]);
    const paused = applyPlayer(on, { op: 'pause' }, NOW + 10_000).state;
    expect(streamAt(paused, NOW + 99_000)).toBe(10_000);
    expect(applyPlayer(paused, { op: 'play' }, NOW + 20_000).effects).toEqual([{ type: 'panel', op: 'play' }]);
  });

  it('keeps the folder in its place while a stream plays', () => {
    let s = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    s = applyPlayer({ ...s, panel: true }, { op: 'stream', source: 'youtube', url: URL1 }, NOW + 30_000).state;
    expect(s.position).toBe(30_000);
    expect(positionAt(s, NOW + 90_000)).toBe(30_000);
  });

  it("takes the panel's word for the title, the place and whether it plays", () => {
    let s = applyPlayer(loaded(), report({ position: 12_000 }), NOW + 15_000).state;
    expect(s.stream).toMatchObject({ title: 'Deep Focus', artist: 'Some channel', duration: 3_600_000, position: 12_000, at: NOW + 15_000 });
    expect(streamAt(s, NOW + 20_000)).toBe(17_000);
    // Paused inside YouTube's own player.
    s = applyPlayer(s, report({ position: 13_000, playing: false }), NOW + 16_000).state;
    expect(s.playing).toBe(false);
    // A report about another link is ignored.
    expect(applyPlayer(s, report({ url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', playing: true }), NOW).state).toBe(s);
  });

  it('play pressed inside the embed while noise plays hands over to the stream', () => {
    const s = applyPlayer(loaded(), { op: 'source', source: 'noise' }, NOW + 1_000).state;
    const { state, effects } = applyPlayer(s, report({ playing: true }), NOW + 2_000);
    expect(state).toMatchObject({ active: 'youtube', playing: true });
    expect(effects).toEqual([{ type: 'noise-stop' }]);
  });

  it('picks up where it stopped after noise played for a long while', () => {
    let s = applyPlayer(loaded(), { op: 'source', source: 'noise' }, NOW + 60_000).state;
    expect(streamAt(s, NOW + 60_000)).toBe(60_000);
    s = applyPlayer(s, { op: 'source', source: 'youtube' }, NOW + 20 * 60_000).state;
    expect(streamAt(s, NOW + 20 * 60_000)).toBe(60_000);
    expect(streamAt(s, NOW + 20 * 60_000 + 5_000)).toBe(65_000);
  });

  it('a seek or volume change while paused reaches the panel, so play resumes there', () => {
    const paused = applyPlayer(loaded(), { op: 'pause' }, NOW + 10_000).state;
    expect(applyPlayer(paused, { op: 'seek', ms: 57_000 }, NOW + 11_000).effects).toEqual([{ type: 'panel-seek', at: 57_000 }]);
    expect(applyPlayer(paused, { op: 'volume', volume: 0.3 }, NOW + 11_000).effects).toEqual([{ type: 'panel-volume', volume: 0.3 }]);
  });

  it("starts a link at its own start time (t=)", () => {
    expect(parsePlayer({ kind: 'player', op: 'stream', source: 'youtube', url: URL1, at: 3_420_000 })).toEqual({ op: 'stream', source: 'youtube', url: URL1, at: 3_420_000 });
    const { state, effects } = applyPlayer({ ...INITIAL_PLAYER, panel: true }, { op: 'stream', source: 'youtube', url: URL1, at: 3_420_000 }, NOW);
    expect(state.stream?.position).toBe(3_420_000);
    expect(effects).toEqual([{ type: 'panel-load', source: 'youtube', url: URL1, at: 3_420_000, play: true, volume: 0.6 }]);
  });

  it('a closed panel stops the stream; play waits for the panel to open', () => {
    const closed = applyPlayer(loaded(), { op: 'panel', open: false }, NOW + 5_000);
    expect(closed.state).toMatchObject({ playing: false, panel: false, stream: { position: 5_000 } });
    const again = applyPlayer(closed.state, { op: 'play' }, NOW + 6_000);
    expect(again.state.playing).toBe(true);
    expect(again.effects).toEqual([]);
    expect(applyPlayer(again.state, { op: 'panel', open: true }, NOW + 7_000).effects).toEqual([{ type: 'panel', op: 'play' }]);
    // Picked from the popup while the panel is closed: what played stops, and the link plays once the panel is there.
    const picked = applyPlayer({ ...playingNoise, stream: closed.state.stream }, { op: 'source', source: 'youtube' }, NOW);
    expect(picked.state).toMatchObject({ active: 'youtube', playing: true });
    expect(picked.effects).toEqual([{ type: 'noise-stop' }]);
  });
});

describe('music in your tabs', () => {
  const yt = { tabId: 7, host: 'music.youtube.com', title: 'Weightless', artist: 'Marconi Union', playing: true };
  const sp = { tabId: 9, host: 'open.spotify.com', title: 'Deep Focus', artist: 'Spotify', playing: false };
  const report = (t: typeof yt) => ({ op: 'tab-report' as const, ...t });

  it('lists music tabs, newest first, and drops a tab that closes', () => {
    let s = applyPlayer(INITIAL_PLAYER, report(sp), NOW).state;
    s = applyPlayer(s, report(yt), NOW + 1).state;
    expect(s.tabs.map((t) => t.tabId)).toEqual([7, 9]);
    s = applyPlayer(s, report({ ...yt, title: 'Electra' }), NOW + 2).state;
    expect(s.tabs).toHaveLength(2);
    expect(s.tabs[0]!.title).toBe('Electra');
    s = applyPlayer(s, { op: 'tab-gone', tabId: 9 }, NOW + 3).state;
    expect(s.tabs.map((t) => t.tabId)).toEqual([7]);
  });

  it('music started in a tab keeps the folder in its place', () => {
    let s = applyPlayer(INITIAL_PLAYER, { op: 'folder', tracks: songs, start: 0, shuffle: false }, NOW).state;
    s = applyPlayer(s, report(yt), NOW + 60_000).state;
    expect(s.position).toBe(60_000);
    const back = applyPlayer(s, { op: 'source', source: 'folder' }, NOW + 90_000);
    expect(back.effects).toContainEqual({ type: 'file-play', track: songs[0], at: 60_000, volume: 0.6 });
  });

  it('never drops the tab the card controls from a long list, and lets it go when it closes', () => {
    let s = applyPlayer(INITIAL_PLAYER, report(yt), NOW).state;
    for (let id = 100; id < 110; id++) s = applyPlayer(s, report({ ...sp, tabId: id }), NOW + id).state;
    expect(s.tabs).toHaveLength(8);
    expect(s.tabs.some((t) => t.tabId === 7)).toBe(true);
    s = applyPlayer(s, { op: 'tab-gone', tabId: 7 }, NOW + 200).state;
    expect(s).toMatchObject({ tab: null, active: null, playing: false });
  });

  it("closing the card's tab hands the card back, so Play plays noise again", () => {
    let s = applyPlayer(INITIAL_PLAYER, report(yt), NOW).state;
    s = applyPlayer(s, { op: 'tab-gone', tabId: 7 }, NOW + 1).state;
    expect(s).toMatchObject({ active: null, tab: null, playing: false, tabs: [] });
    expect(applyPlayer(s, { op: 'play' }, NOW + 2).effects).toEqual([{ type: 'noise-start', noise: 'pink', volume: 0.6 }]);
  });

  it("the Music page's noise button plays noise whatever the card showed", () => {
    let s = applyPlayer(INITIAL_PLAYER, report({ ...yt, playing: false }), NOW).state;
    s = applyPlayer(s, { op: 'tab', tabId: 7, action: 'pick' }, NOW).state;
    let effects: unknown[] = [];
    for (const cmd of soundToPlayer({ op: 'play', noise: 'brown', volume: 0.4 })) {
      const r = applyPlayer(s, cmd, NOW + 1);
      s = r.state;
      effects = [...effects, ...r.effects];
    }
    expect(s).toMatchObject({ active: 'noise', playing: true, noise: 'brown' });
    expect(effects).toEqual([{ type: 'noise-start', noise: 'brown', volume: 0.4 }]);
  });

  it('music started in a tab takes over: what Study Duo played stops', () => {
    const { state, effects } = applyPlayer(playingNoise, report(yt), NOW);
    expect(state).toMatchObject({ active: 'tab', tab: 7, playing: true });
    expect(effects).toEqual([{ type: 'noise-stop' }]);
  });

  it('controls a tab from the card: pause, play, next, and the tab hands back when noise starts', () => {
    let s = applyPlayer(INITIAL_PLAYER, report(yt), NOW).state;
    let r = applyPlayer(s, { op: 'pause' }, NOW + 1);
    expect(r.effects).toEqual([{ type: 'tab', op: 'pause', tabId: 7 }]);
    s = r.state;
    expect(applyPlayer(s, { op: 'play' }, NOW + 2).effects).toEqual([{ type: 'tab', op: 'play', tabId: 7 }]);
    expect(applyPlayer(s, { op: 'next' }, NOW + 2).effects).toEqual([{ type: 'tab', op: 'next', tabId: 7 }]);
    s = applyPlayer(s, { op: 'play' }, NOW + 2).state;
    r = applyPlayer(s, { op: 'source', source: 'noise' }, NOW + 3);
    expect(r.effects).toEqual([{ type: 'tab', op: 'pause', tabId: 7 }, { type: 'noise-start', noise: 'pink', volume: 0.6 }]);
  });

  it('plays another listed tab from the panel, pausing the one that played', () => {
    let s = applyPlayer(INITIAL_PLAYER, report(sp), NOW).state;
    s = applyPlayer(s, report(yt), NOW + 1).state;
    const r = applyPlayer(s, { op: 'tab', tabId: 9, action: 'play' }, NOW + 2);
    expect(r.state).toMatchObject({ active: 'tab', tab: 9, playing: true });
    expect(r.effects).toEqual([{ type: 'tab', op: 'pause', tabId: 7 }, { type: 'tab', op: 'play', tabId: 9 }]);
    expect(applyPlayer(s, { op: 'tab', tabId: 99, action: 'play' }, NOW).state).toBe(s);
    // Picked in the list while nothing plays: the card shows it, nothing starts.
    const quiet = applyPlayer({ ...s, playing: false }, { op: 'tab', tabId: 9, action: 'pick' }, NOW);
    expect(quiet.state).toMatchObject({ active: 'tab', tab: 9, playing: false });
    expect(quiet.effects).toEqual([]);
  });

  it('pages may ask for a tab action but never report one', () => {
    expect(parsePlayer({ kind: 'player', op: 'tab', tabId: 9, action: 'next' })).toEqual({ op: 'tab', tabId: 9, action: 'next' });
    expect(parsePlayer({ kind: 'player', op: 'tab', tabId: 9, action: 'close' })).toBeNull();
    expect(parsePlayer({ kind: 'player', op: 'tab-report', tabId: 9, host: 'x', title: 'y', artist: '', playing: true })).toBeNull();
    expect(parsePlayer({ kind: 'player', op: 'tab-gone', tabId: 9 })).toBeNull();
  });
});
