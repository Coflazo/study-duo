import { addRecords } from '@/core/log';
import { foldListen, isMusicHost, type NowPlaying } from '@/core/music';
import { sessionId } from '@/core/sessions';
import { normalizeSettings } from '@/core/settings';
import { hostOf } from '@/core/sites';
import { settingsItem, timerItem } from '@/core/store';
import { listeningItem } from '@/core/session-store';


let queue: Promise<void> = Promise.resolve();
const lastReport = new Map<string, number>();

/** A now-playing report from a tab (null: nothing is playing there any more, or the tab closed). */
export function hearTab(tabId: number, url: string | undefined, now: NowPlaying | null, at = Date.now()): Promise<void> {
  const host = hostOf(url);
  if (now && !isMusicHost(host)) return queue; // only music sites may report songs
  return hearSource(String(tabId), host, now, at);
}

/**
 * A now-playing report from one source: a tab (keyed by its id) or the desktop helper ('helper', host app:<name>).
 * Songs count only while the timer runs and only while Songs you play is on, whatever the source.
 */
export function hearSource(key: string, host: string | null, now: NowPlaying | null, at = Date.now()): Promise<void> {
  queue = queue
    .then(async () => {
      if (now) {
        if (at - (lastReport.get(key) ?? 0) < 2_000) return; // a stop never blocks the next song
        lastReport.set(key, at);
      }
      const [listening, timer, settings] = await Promise.all([listeningItem.getValue(), timerItem.getValue(), settingsItem.getValue().then(normalizeSettings)]);
      // Songs count only while the timer runs (a block or a break): a music tab never becomes a watch history.
      if (timer.status === 'stopped') now = null;
      const open = listening[key] ?? null;
      const inSession = timer.status !== 'stopped' && timer.startedAt !== null ? sessionId({ phase: timer.phase, startedAt: timer.startedAt }) : null;
      const r = foldListen(open, settings.measure.music ? now : null, at, host ?? open?.host ?? '', inSession);
      const next = { ...listening };
      if (r.open) next[key] = r.open;
      else delete next[key];
      await listeningItem.setValue(next);
      if (r.closed && settings.measure.music) await addRecords('listens', [r.closed]);
    })
    .catch(console.error);
  return queue;
}

export function trackMusic(): void {
  browser.tabs.onRemoved.addListener((tabId) => void hearTab(tabId, undefined, null));
}
