import { ALARM_PHASE_END, ALARM_REFRESH, applyEffects } from '@/background/effects';
import { createTimerService } from '@/background/timer-service';
import { allowedFromSender, isFromWebPage, parseMessage, parseSiteMessage, resolveSiteRequest } from '@/core/messages';
import { createSiteMenu, handleSiteRequest, onSiteMenuClick } from '@/background/site-requests';
import { loadSettings, loadState, musicSeededItem, settingsItem, sitesItem, timerItem } from '@/core/store';
import { normalizeSites, seedMusicSites } from '@/core/sites';
import { unlockedItem } from '@/background/site-lock';

export default defineBackground(() => {
  const timer = createTimerService({
    now: Date.now,
    loadSettings,
    loadState,
    saveState: (s) => timerItem.setValue(s),
    applyEffects,
  });
  const tick = () => void timer.dispatch({ type: 'tick' }).catch(console.error);

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    const base = browser.runtime.getURL('/');
    const msg = parseMessage(raw);
    if (msg && allowedFromSender(msg, isFromWebPage(sender.url, base))) void timer.dispatch(msg.event).catch(console.error);
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
    // Music players stay open during study blocks, once; a site the user removes later stays removed.
    if (!(await musicSeededItem.getValue())) {
      await sitesItem.setValue(seedMusicSites(normalizeSites(await sitesItem.getValue())));
      await musicSeededItem.setValue(true);
    }
    // Chrome adds content scripts only to pages loaded after an install or update; give open tabs the clock now.
    if (import.meta.env.BROWSER === 'firefox') return; // Firefox already does
    const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.all(
      tabs.map((t) => t.id === undefined ? undefined : browser.scripting.executeScript({ target: { tabId: t.id }, files: ['/content-scripts/overlay.js'] }).catch(() => undefined)),
    );
  }

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
