import { describe, expect, it } from 'vitest';
import { CAPS, EMBED_ORIGIN, embedCommand, embedHello, readEmbed } from './embed-protocols';

describe('embedded players', () => {
  it('knows what each service lets the card do', () => {
    expect(CAPS.youtube).toEqual({ play: true, seek: true, skip: true, volume: true, title: true });
    expect(CAPS.soundcloud).toEqual({ play: true, seek: true, skip: true, volume: true, title: true });
    expect(CAPS.spotify).toEqual({ play: true, seek: true, skip: false, volume: false, title: false });
    expect(CAPS.apple).toEqual({ play: false, seek: false, skip: false, volume: false, title: false });
  });

  it('speaks each service\'s own message format', () => {
    expect(embedHello('soundcloud').map((m) => JSON.parse(m as string))).toEqual([
      { method: 'addEventListener', value: 'playProgress' },
      { method: 'addEventListener', value: 'play' },
      { method: 'addEventListener', value: 'pause' },
      { method: 'addEventListener', value: 'finish' },
      { method: 'getCurrentSound' },
    ]);
    expect(embedCommand('soundcloud', { op: 'seek', ms: 57_000 }, { list: false, here: 0 })).toEqual([JSON.stringify({ method: 'seekTo', value: 57_000 })]);
    expect(embedCommand('soundcloud', { op: 'volume', volume: 0.4 }, { list: false, here: 0 })).toEqual([JSON.stringify({ method: 'setVolume', value: 40 })]);
    expect(embedCommand('spotify', { op: 'play' }, { list: true, here: 0 })).toEqual([{ command: 'play' }]);
    expect(embedCommand('spotify', { op: 'play' }, { list: true, here: 12_000 })).toEqual([{ command: 'resume' }]);
    expect(embedCommand('spotify', { op: 'seek', ms: 57_000 }, { list: true, here: 0 })).toEqual([{ command: 'seek', timestamp: 57 }]);
    expect(embedCommand('spotify', { op: 'next' }, { list: true, here: 0 })).toEqual([]);
    expect(embedCommand('apple', { op: 'play' }, { list: true, here: 0 })).toEqual([]);
    // YouTube: through a playlist, or 30 s in one long video.
    expect(embedCommand('youtube', { op: 'next' }, { list: true, here: 5_000 }).map((m) => JSON.parse(m as string).func)).toEqual(['nextVideo']);
    expect(embedCommand('youtube', { op: 'next' }, { list: false, here: 5_000 }).map((m) => JSON.parse(m as string).args)).toEqual([[35, true]]);
  });

  it('reads replies only from the service itself', () => {
    const sc = (method: string, value: unknown) => JSON.stringify({ widgetId: 'widget_1', method, value });
    expect(readEmbed('soundcloud', EMBED_ORIGIN.soundcloud, sc('playProgress', { soundId: 293, currentPosition: 4210.5, relativePosition: 0.02 }))).toEqual({ position: 4211, state: 'playing' });
    expect(readEmbed('soundcloud', EMBED_ORIGIN.soundcloud, sc('getCurrentSound', { title: 'Flickermood', user: { username: 'Forss' }, duration: 213_000 }))).toEqual({ title: 'Flickermood', artist: 'Forss', duration: 213_000 });
    expect(readEmbed('soundcloud', EMBED_ORIGIN.soundcloud, sc('pause', null))).toEqual({ state: 'paused' });
    expect(readEmbed('soundcloud', EMBED_ORIGIN.soundcloud, sc('ready', null))).toEqual({ ready: true });
    expect(readEmbed('soundcloud', EMBED_ORIGIN.soundcloud, sc('play', null))).toEqual({ state: 'playing', newSound: true });
    const sp = (payload: unknown) => ({ type: 'playback_update', payload });
    expect(readEmbed('spotify', EMBED_ORIGIN.spotify, sp({ isPaused: false, isBuffering: false, duration: 200_000, position: 1_500 }))).toEqual({ state: 'playing', duration: 200_000, position: 1_500 });
    expect(readEmbed('spotify', EMBED_ORIGIN.spotify, sp({ isPaused: true, isBuffering: false, duration: 29_900, position: 0 }))).toEqual({ state: 'paused', duration: 29_900, position: 0, preview: true });
    expect(readEmbed('spotify', EMBED_ORIGIN.spotify, { type: 'ready' })).toEqual({ ready: true });
    expect(readEmbed('spotify', 'https://evil.test', { type: 'ready' })).toBeNull();
    expect(readEmbed('soundcloud', EMBED_ORIGIN.spotify, sc('pause', null))).toBeNull();
    expect(readEmbed('apple', EMBED_ORIGIN.apple, { anything: 1 })).toBeNull();
  });
});
