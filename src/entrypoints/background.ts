import { ALARM_PHASE_END, ALARM_REFRESH, applyEffects } from '@/background/effects';
import { createTimerService } from '@/background/timer-service';
import { allowedFromSender, isClockHello, isFromWebPage, isSiteHello, parseCounts, parseMessage, parseMove, parseSiteMessage, parseSound, resolveSiteRequest } from '@/core/messages';
import { embedReferer, playerCommands, trackPanel } from '@/background/player';
import { parsePlayer, soundToPlayer } from '@/core/player';
import { normalizeSettings } from '@/core/settings';
import { forgetListens, purgeOlderThan } from '@/core/log';
import { createSiteMenu, handleSiteRequest, onSiteMenuClick } from '@/background/site-requests';
import { loadSettings, loadState, musicSeededItem, settingsItem, sitesItem, timerItem } from '@/core/store';
import { hostOf, normalizeSites, seedMusicSites } from '@/core/sites';
import { unlockedItem } from '@/background/site-lock';
import { clockState, ensureOverlay, keepClocksOnOpenTabs, sendClocks } from '@/background/overlay-inject';
import { acceptCounts, trackActivity } from '@/background/activity';
import { hearTab, trackMusic } from '@/background/music';
import { isMusicHost, isMusicStop, isYouTubeVideoHost, parseNowPlaying } from '@/core/music';
import { inQueue, parseSyncRequest, syncConnection, syncDue, trackConnections } from '@/background/connections';
import { trackHelper } from '@/background/helper';
import { connectCalendar, disconnectCalendar, parseCalendarRequest } from '@/background/calendar';

export default defineBackground(() => {
  const timer = createTimerService({
    now: Date.now,
    loadSettings,
    loadState,
    saveState: (s) => timerItem.setValue(s),
    applyEffects,
  });
  const tick = () => void timer.dispatch({ type: 'tick' }).catch(console.error);

  // The install page notices Study Duo arrived: it is told the version, nothing more (wxt.config.ts limits who may ask).
  browser.runtime.onMessageExternal?.addListener((raw, sender, sendResponse) => {
    if (isSiteHello(raw, sender as { origin?: string; url?: string })) sendResponse({ app: 'study-duo', version: browser.runtime.getManifest().version });
  });

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    const base = browser.runtime.getURL('/');
    const msg = parseMessage(raw);
    if (msg && allowedFromSender(msg, isFromWebPage(sender.url, base))) void timer.dispatch(msg.event).catch(console.error);
    // Focus sound buttons and player commands, from Study Duo's own pages: one player decides what plays.
    const sound = parseSound(raw);
    if (sound && !isFromWebPage(sender.url, base) && (raw as { target?: unknown }).target !== 'offscreen') void playerCommands(soundToPlayer(sound)).catch(console.error);
    const player = parsePlayer(raw);
    if (player && !isFromWebPage(sender.url, base)) void playerCommands([player]).catch(console.error);
    const song = parseNowPlaying(raw);
    if ((song || isMusicStop(raw)) && sender.tab?.id !== undefined && isFromWebPage(sender.url, base)) {
      void hearTab(sender.tab.id, sender.url, song);
      // The card lists and controls music sites in tabs, whether or not Songs you play keeps them.
      const host = hostOf(sender.url);
      if (isMusicHost(host)) void playerCommands([song ? { op: 'tab-report', tabId: sender.tab.id, host: host!, title: song.title, artist: song.artist, playing: song.playing } : { op: 'tab-gone', tabId: sender.tab.id }]).catch(console.error);
    }
    const counts = parseCounts(raw);
    if (counts && sender.tab?.id !== undefined && isFromWebPage(sender.url, base)) void acceptCounts(sender.tab.id, sender.url, counts);
    if (isClockHello(raw) && isFromWebPage(sender.url, base)) {
      clockState().then(sendResponse, () => sendResponse(null));
      return true;
    }
    const pos = parseMove(raw);
    if (pos) void settingsItem.getValue().then((v) => settingsItem.setValue({ ...normalizeSettings(v), overlayPos: pos })).catch(console.error);
    // "Check now" from the Connections screen; web pages cannot trigger requests.
    const sync = parseSyncRequest(raw);
    if (sync && !isFromWebPage(sender.url, base)) {
      syncConnection(sync).then(() => sendResponse(true), () => sendResponse(false));
      return true;
    }
    // Connect / Disconnect for Google Calendar, from the Connections screen only; the page has already signed in.
    const calendar = parseCalendarRequest(raw);
    if (calendar && !isFromWebPage(sender.url, base)) {
      inQueue(calendar === 'connect' ? () => connectCalendar() : () => disconnectCalendar()).then(() => sendResponse(true), () => sendResponse(false));
      return true;
    }
    const site = parseSiteMessage(raw);
    const req = site && resolveSiteRequest(site, sender.url, base);
    if (!req) return;
    handleSiteRequest(req).then(sendResponse, () => sendResponse(null));
    return true; // answer arrives asynchronously
  });

  browser.contextMenus.onClicked.addListener((info, tab) => void onSiteMenuClick(info, tab).catch(console.error));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_PHASE_END || alarm.name === ALARM_REFRESH) tick();
  });
  browser.runtime.onStartup.addListener(tick);
  browser.runtime.onInstalled.addListener(tick);
  browser.runtime.onInstalled.addListener(() => void createSiteMenu().catch(console.error));
  browser.runtime.onInstalled.addListener(() => void afterInstall().catch(console.error));

  async function afterInstall() {
    // Before 0.2.3, videos on YouTube were kept as songs. Nobody asked for that: they go, and are no longer read.
    await forgetListens((l) => isYouTubeVideoHost(l.host)).catch(console.error);
    // Music players stay open during study blocks, once; a site the user removes later stays removed.
    if (!(await musicSeededItem.getValue())) {
      await sitesItem.setValue(seedMusicSites(normalizeSites(await sitesItem.getValue())));
      await musicSeededItem.setValue(true);
    }
    // Chrome adds content scripts only to pages loaded after an install or update; give open tabs the clock now.
    if (import.meta.env.BROWSER === 'firefox') return; // Firefox already does
    const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : ensureOverlay(t.id))));
  }
  keepClocksOnOpenTabs();
  // Web pages' scripts cannot read or write Study Duo's storage (Chrome); their clocks get the timer by message (#30).
  void (browser.storage.local as { setAccessLevel?: (o: { accessLevel: string }) => Promise<void> }).setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })?.catch(console.error);
  timerItem.watch(() => void sendClocks().catch(console.error));
  settingsItem.watch(() => void sendClocks().catch(console.error));
  trackPanel();
  void embedReferer().catch(console.error);
  trackActivity();
  trackMusic();
  trackConnections();
  trackHelper();
  void syncDue().catch(console.error);

  // Retention (Your data): drop history older than the kept period, at every worker start and when it changes.
  const purge = () => void loadSettings().then((s) => purgeOlderThan(s.retentionDays, Date.now())).catch(console.error);
  purge();
  settingsItem.watch((now, before) => {
    if (now?.retentionDays !== before?.retentionDays) purge();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-timer') void timer.dispatch({ type: 'toggle' }).catch(console.error);
    if (command === 'skip-phase') void timer.dispatch({ type: 'skip' }).catch(console.error);
  });

  async function syncIdle() {
    const { idlePauseMin } = await loadSettings();
    if (idlePauseMin > 0) browser.idle.setDetectionInterval(Math.max(15, Math.round(idlePauseMin * 60)));
  }
  void syncIdle();
  settingsItem.watch(() => void syncIdle());
  // Site lists, mode and unlocks change the rules; a tick re-runs the effects inside the timer queue.
  settingsItem.watch(tick);
  sitesItem.watch(tick);
  unlockedItem.watch(tick);

  // Every time the worker starts: rebuild badge, alarms and site rules from storage.
  tick();

  browser.idle.onStateChanged.addListener(async (idle) => {
    if (idle === 'active') return;
    const [settings, state] = await Promise.all([loadSettings(), loadState()]);
    if (settings.idlePauseMin > 0 && state.phase === 'focus' && state.status === 'running') {
      void timer.dispatch({ type: 'pause' }).catch(console.error);
    }
  });
});
