import { addRecords } from '@/core/log';
import { foldListen } from '@/core/music';
import { applyPlayer, nextTitle, playingTrack, type PlayerCommand, type PlayerEffect, type PlayerState, type PlayerTrack } from '@/core/player';
import { playerItem, playerTracksItem } from '@/core/session-store';
import { sessionId } from '@/core/sessions';
import { normalizeSettings } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
import { ensureOffscreen } from './effects';
import { focusSound } from './sound';

let queue: Promise<unknown> = Promise.resolve();
/** The folder's songs, kept in memory while the worker lives and in session storage for when it wakes. */
let tracksCache: Record<string, PlayerTrack> | null = null;

/**
 * Runs player commands one at a time against the stored state, then carries out what they decided. The popup card,
 * the side panel, the Music page and the media keys all come through here, so there is one player.
 */
export function playerCommands(cmds: PlayerCommand[], now = Date.now()): Promise<void> {
  const run = queue.then(async () => {
    tracksCache ??= await playerTracksItem.getValue();
    const before: PlayerState = { ...(await playerItem.getValue()), tracks: tracksCache };
    let state = before;
    const effects: PlayerEffect[] = [];
    for (const cmd of cmds) {
      const next = applyPlayer(state, cmd, now);
      state = next.state;
      effects.push(...next.effects);
    }
    state = await logFolder(before, state, now);
    if (state.tracks !== tracksCache) {
      tracksCache = state.tracks;
      await playerTracksItem.setValue(state.tracks);
    }
    // Pages get the song on the card and the next title, not the whole list.
    await playerItem.setValue({ ...state, tracks: {}, now: playingTrack(state), upNext: nextTitle(state) });
    for (const e of effects) await carryOut(e);
  });
  queue = run.catch(() => undefined);
  return run;
}

const folderSong = (s: PlayerState) => (s.playing && s.active === 'folder' ? playingTrack(s) : null);

/**
 * A folder song is a listen, like a song in a tab: kept when it stops or changes, only if it played while the timer
 * ran and Songs you play is on. Returns the state with the new listen's study block noted.
 */
async function logFolder(before: PlayerState, after: PlayerState, now: number): Promise<PlayerState> {
  const was = folderSong(before);
  const is = folderSong(after);
  const changed = was?.id !== is?.id || before.startedAt !== after.startedAt;
  if (!changed) return after;
  const [timer, settings] = await Promise.all([timerItem.getValue(), settingsItem.getValue().then(normalizeSettings)]);
  if (was && before.startedAt !== null && settings.measure.music && (before.sessionId !== null || timer.status !== 'stopped')) {
    const open = { host: 'file', title: was.title, artist: was.artist, album: was.album, startedAt: before.startedAt, sessionId: before.sessionId };
    const { closed } = foldListen(open, null, now, 'file', null);
    if (closed) await addRecords('listens', [{ ...closed, ...(was.genre ? { genre: was.genre } : {}) }]);
  }
  const inSession = timer.status !== 'stopped' && timer.startedAt !== null ? sessionId({ phase: timer.phase, startedAt: timer.startedAt }) : null;
  return { ...after, sessionId: is ? inSession : null };
}

/** Folder songs play in the offscreen page, where audio keeps going with every Study Duo page closed (Chrome only). */
async function toFile(message: Record<string, unknown>): Promise<void> {
  if (import.meta.env.BROWSER === 'firefox') return; // Firefox has no folder picker; its own files play on the Music page
  await ensureOffscreen();
  await browser.runtime.sendMessage({ target: 'offscreen', kind: 'file', ...message });
}

async function carryOut(e: PlayerEffect): Promise<void> {
  switch (e.type) {
    case 'noise-start':
      return focusSound({ op: 'play', noise: e.noise, volume: e.volume });
    case 'noise-stop':
      return focusSound({ op: 'stop' });
    case 'noise-volume':
      return focusSound({ op: 'volume', volume: e.volume });
    case 'file-play':
      return toFile({ op: 'play', path: e.track.path, at: e.at, volume: e.volume });
    case 'file-pause':
      return toFile({ op: 'pause' });
    case 'file-seek':
      return toFile({ op: 'seek', at: e.at, path: e.path });
    case 'file-volume':
      return toFile({ op: 'volume', volume: e.volume });
    default:
      // Streaming and tabs arrive in the next steps of #51.
      return;
  }
}
