import { localDayRange, sessionsBetween, type SessionRecord } from '@/core/sessions';
import { DEFAULT_SETTINGS, normalizeSettings, type TimerSettings } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
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
      timerItem.watch((v) => {
        live.timer = v ?? initialState();
        setTimeout(loadToday, 300); // the background logs a finished block right after saving the timer
      }),
      settingsItem.watch((v) => (live.settings = normalizeSettings(v))),
      todosItem.watch((v) => (live.todos = normalizeTodos(v))),
    ];
    [live.timer, live.settings, live.todos] = await Promise.all([
      timerItem.getValue(), settingsItem.getValue().then(normalizeSettings), todosItem.getValue().then(normalizeTodos),
    ]);
    await loadToday();
    live.ready = true;
    const ticker = setInterval(() => {
      live.now = Date.now();
      const t = live.timer;
      if (t.status === 'running' && t.endsAt !== null && live.now >= t.endsAt) void send({ type: 'tick' });
    }, 250);
    const refresher = setInterval(loadToday, 5_000);
    return () => {
      clearInterval(ticker);
      clearInterval(refresher);
      unwatch.forEach((u) => u());
    };
  }

  return { live, start, loadToday, shown: () => displayMs(live.timer, live.settings, live.now) };
}

export const send = (event: TimerEvent) => browser.runtime.sendMessage({ kind: 'timer', event });
