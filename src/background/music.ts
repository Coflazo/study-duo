import { addRecords } from '@/core/log';
import { foldListen, isMusicHost, type NowPlaying, type OpenListen } from '@/core/music';
import { sessionId } from '@/core/sessions';
import { normalizeSettings } from '@/core/settings';
import { hostOf } from '@/core/sites';
import { settingsItem, timerItem } from '@/core/store';

/** Open listens by tab, for the session: what is playing now (the Music screen reads it too). */
export const listeningItem = storage.defineItem<Record<string, OpenListen>>('session:listening', { fallback: {} });

let queue: Promise<void> = Promise.resolve();
const lastReport = new Map<number, number>();

/** A now-playing report from a tab (null: nothing is playing there any more, or the tab closed). */
export function hearTab(tabId: number, url: string | undefined, now: NowPlaying | null, at = Date.now()): Promise<void> {
  queue = queue
    .then(async () => {
      const host = hostOf(url);
      if (now && !isMusicHost(host)) return; // only music sites may report songs
      if (now && at - (lastReport.get(tabId) ?? 0) < 2_000) return;
      lastReport.set(tabId, at);
      const [listening, timer, settings] = await Promise.all([listeningItem.getValue(), timerItem.getValue(), settingsItem.getValue().then(normalizeSettings)]);
      const key = String(tabId);
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
