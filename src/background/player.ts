import { addRecords } from '@/core/log';
import { foldListen } from '@/core/music';
import { applyPlayer, INITIAL_PLAYER, nextTitle, playingTrack, type PlayerCommand, type PlayerEffect, type PlayerState, type PlayerTrack } from '@/core/player';
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
    // A state saved by an older version lacks the newer fields: the defaults fill them.
    const before: PlayerState = { ...INITIAL_PLAYER, ...(await playerItem.getValue()), tracks: tracksCache };
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
    case 'tab':
      // The music page's own play, pause and skip, through its media session (see media-keys.content.ts).
      return browser.tabs.sendMessage(e.tabId, { kind: 'tab-media', op: e.op }).then(() => undefined, () => undefined);
    case 'panel-load':
    case 'panel':
    case 'panel-seek':
    case 'panel-volume':
      // Links play in the side panel, in the service's own player; with the panel closed nothing listens.
      return browser.runtime.sendMessage({ target: 'panel', ...e }).then(() => undefined, () => undefined);
    default:
      return;
  }
}

/** The side panel holds a port open while it is there: when it closes, a link it played has stopped. */
export function trackPanel(): void {
  let open = 0; // side panels in several windows each hold a port
  browser.runtime.onConnect.addListener((port) => {
    // Study Duo's own pages only: a web page's script could connect under the same name.
    if (port.name !== 'player-panel' || port.sender?.id !== browser.runtime.id || !port.sender.url?.startsWith(browser.runtime.getURL('/'))) return;
    if (++open === 1) void playerCommands([{ op: 'panel', open: true }]).catch(console.error);
    port.onDisconnect.addListener(() => {
      if (--open === 0) void playerCommands([{ op: 'panel', open: false }]).catch(console.error);
    });
  });
  // The worker slept while a panel closed: ask the browser whether any panel is still open.
  const contexts = (browser.runtime as unknown as { getContexts?: (f: { contextTypes: string[] }) => Promise<unknown[]> }).getContexts;
  if (contexts)
    void Promise.all([contexts({ contextTypes: ['SIDE_PANEL'] }), playerItem.getValue()])
      .then(([panels, state]) => (panels.length === 0 && state?.panel ? playerCommands([{ op: 'panel', open: false }]) : undefined))
      .catch(console.error);
}

const REFERER_RULE = 7_701;
/**
 * YouTube's embedded player refuses to start without a Referer (error 153), and extension pages send none. One rule
 * adds Study Duo's site as the Referer, only for embeds that Study Duo's own pages open.
 */
export async function embedReferer(): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  await dnr.updateDynamicRules({
    removeRuleIds: [REFERER_RULE],
    addRules: [
      {
        id: REFERER_RULE,
        priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://coflazo.github.io/' }] },
        // The extension's own origin: its id in Chrome, a random per-install host in Firefox.
        condition: { requestDomains: ['youtube-nocookie.com', 'youtube.com'], resourceTypes: ['sub_frame'], initiatorDomains: [new URL(browser.runtime.getURL('/')).host] },
      },
    ] as Parameters<typeof dnr.updateDynamicRules>[0]['addRules'],
  });
}
