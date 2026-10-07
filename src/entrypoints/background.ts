import { ALARM_PHASE_END, ALARM_REFRESH, applyEffects } from '@/background/effects';
import { createTimerService } from '@/background/timer-service';
import { allowedFromSender, parseMessage } from '@/core/messages';
import { loadSettings, loadState, settingsItem, timerItem } from '@/core/store';

export default defineBackground(() => {
  const timer = createTimerService({
    now: Date.now,
    loadSettings,
    loadState,
    saveState: (s) => timerItem.setValue(s),
    applyEffects,
  });
  const tick = () => void timer.dispatch({ type: 'tick' }).catch(console.error);

  browser.runtime.onMessage.addListener((raw, sender) => {
    if (sender.id !== browser.runtime.id) return;
    const msg = parseMessage(raw);
    if (msg && allowedFromSender(msg, sender.tab !== undefined)) void timer.dispatch(msg.event).catch(console.error);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_PHASE_END || alarm.name === ALARM_REFRESH) tick();
  });
  browser.runtime.onStartup.addListener(tick);
  browser.runtime.onInstalled.addListener(tick);

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

  browser.idle.onStateChanged.addListener(async (idle) => {
    if (idle === 'active') return;
    const [settings, state] = await Promise.all([loadSettings(), loadState()]);
    if (settings.idlePauseMin > 0 && state.phase === 'focus' && state.status === 'running') {
      void timer.dispatch({ type: 'pause' }).catch(console.error);
    }
  });
});
