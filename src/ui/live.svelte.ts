import { localDayRange, sessionsBetween, type SessionRecord } from '@/core/sessions';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from '@/core/settings';
import { logVersionItem, settingsItem, timerItem } from '@/core/store';
import { displayMs, initialState, type TimerEvent, type TimerState } from '@/core/timer';
import { normalizeTodos, todosItem, type Todo } from '@/core/todos';

/**
 * What the popup and the dashboard both show: the timer, settings, to-dos, today's sessions and a clock that ticks.
 * Watches first, then reads, so nothing changes unseen in between. The open page ends a block on time if the alarm is late.
 */
export function createLive() {
  const live = $state({
    timer: initialState() as TimerState,
    settings: DEFAULT_SETTINGS as TimerSettings,
    todos: [] as Todo[],
    today: [] as SessionRecord[],
    now: Date.now(),
    ready: false,
  });

  async function loadToday() {
    const [from, to] = localDayRange(Date.now());
    live.today = await sessionsBetween(from, to).catch(() => live.today);
  }

  async function start(): Promise<() => void> {
    const unwatch = [
      timerItem.watch((v) => (live.timer = v ?? initialState())),
      logVersionItem.watch(() => void loadToday()), // the background wrote sessions
      settingsItem.watch((v) => (live.settings = normalizeSettings(v))),
      todosItem.watch((v) => (live.todos = normalizeTodos(v))),
    ];
    [live.timer, live.settings, live.todos] = await Promise.all([
      timerItem.getValue(), settingsItem.getValue().then(normalizeSettings), todosItem.getValue().then(normalizeTodos),
    ]);
    await loadToday();
    live.ready = true;
    let tickedFor: number | null = null;
    const ticker = setInterval(() => {
      live.now = Date.now();
      const t = live.timer;
      // An open page ends a late phase on time, once per phase end (the storage update follows a moment later).
      if (t.status === 'running' && t.endsAt !== null && live.now >= t.endsAt && tickedFor !== t.endsAt) {
        tickedFor = t.endsAt;
        send({ type: 'tick' }).catch(() => undefined);
      }
    }, 250);
    return () => {
      clearInterval(ticker);
      unwatch.forEach((u) => u());
    };
  }

  return { live, start, loadToday, shown: () => displayMs(live.timer, live.settings, live.now) };
}

export const send = (event: TimerEvent) => browser.runtime.sendMessage({ kind: 'timer', event });
