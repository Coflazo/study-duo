import { badgeColor, badgeText } from '@/core/badge';
import { bellKindFor, playBell, type BellKind } from '@/core/bell';
import type { AnnounceMessage } from '@/core/messages';
import { phaseTitle } from '@/core/phase-copy';
import { drawLine, momentFor, subLine } from '@/core/phrases';
import { lastFocusDayItem, phraseBagItem } from '@/core/store';
import { remainingMs, type TimerState } from '@/core/timer';
import type { EffectInput } from './timer-service';

export const ALARM_PHASE_END = 'phase-end';
export const ALARM_REFRESH = 'refresh';

export async function syncAlarms(state: TimerState): Promise<void> {
  await Promise.all([browser.alarms.clear(ALARM_PHASE_END), browser.alarms.clear(ALARM_REFRESH)]);
  if (state.status !== 'running') return;
  if (state.endsAt !== null) await browser.alarms.create(ALARM_PHASE_END, { when: state.endsAt });
  await browser.alarms.create(ALARM_REFRESH, { periodInMinutes: 0.5 });
}

function ring(size: number, fraction: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const w = Math.max(2, Math.round(size * 0.16));
  const r = c - w / 2 - 0.5;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(138,138,132,0.35)';
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = color;
  g.beginPath();
  g.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, fraction));
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

export async function syncAction(state: TimerState, now: number): Promise<void> {
  await browser.action.setBadgeText({ text: badgeText(state, now) });
  if (state.status === 'stopped') {
    await browser.action.setIcon({ path: { 16: '/icon/16.png', 32: '/icon/32.png' } });
    return;
  }
  const color = badgeColor(state);
  await browser.action.setBadgeBackgroundColor({ color });
  if (typeof OffscreenCanvas === 'undefined') return;
  const left = remainingMs(state, now);
  const fraction = left === null || !state.plannedMs ? 1 : left / state.plannedMs;
  await browser.action.setIcon({ imageData: { 16: ring(16, fraction, color), 32: ring(32, fraction, color) } });
}

let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = browser.runtime.getURL('/offscreen.html');
  const existing = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (existing.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({ url, reasons: ['AUDIO_PLAYBACK'], justification: 'Play the bell between study blocks.' })
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function ringBell(kind: BellKind, volume: number): Promise<void> {
  if (volume <= 0) return;
  if (import.meta.env.BROWSER === 'firefox') {
    const ctx = new AudioContext();
    const seconds = playBell(ctx, kind, volume);
    setTimeout(() => void ctx.close(), (seconds + 1) * 1000);
    return;
  }
  await ensureOffscreen();
  await browser.runtime.sendMessage({ target: 'offscreen', kind: 'bell', bell: kind, volume });
}

/** Shows the phase words in the active tab of every window. Returns how many pages confirmed they showed them. */
export async function announce({ prev, state, settings, now }: EffectInput): Promise<number> {
  const next = state.phase;
  const today = new Date(now).toDateString();
  const firstOfDay = next === 'focus' && (await lastFocusDayItem.getValue()) !== today;
  if (next === 'focus') await lastFocusDayItem.setValue(today);
  const moment = momentFor(next, { hour: new Date(now).getHours(), firstOfDay, afterLong: prev.phase === 'longBreak' });
  const { line, bag } = drawLine(moment, await phraseBagItem.getValue());
  await phraseBagItem.setValue(bag);
  const message: AnnounceMessage = { kind: 'announce', line, sub: subLine(next, settings, state), phase: next };
  const tabs = await browser.tabs.query({ active: true, windowType: 'normal' });
  const delivered = await Promise.all(
    tabs.map((t) => (t.id === undefined ? 0 : browser.tabs.sendMessage(t.id, message).then((shown) => (shown === true ? 1 : 0), () => 0))),
  );
  return delivered.reduce<number>((a, b) => a + b, 0);
}

export async function applyEffects(input: EffectInput): Promise<void> {
  const { event, state, settings, segments, now } = input;
  await syncAlarms(state);
  await syncAction(state, now);
  const finishedOnItsOwn = event.type === 'tick' && segments.some((s) => s.completed);
  if (!finishedOnItsOwn) return;
  // A silent bell must not also hide the phase change.
  await ringBell(bellKindFor(state.phase), settings.bellVolume).catch(console.error);
  const shown = await announce(input).catch((e) => (console.error(e), 0));
  if (shown > 0) return;
  await browser.notifications.create('phase', {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: phaseTitle(state.phase),
    message: state.status === 'running' ? 'Started on its own.' : 'Start it when you are ready.',
    ...(import.meta.env.BROWSER === 'firefox' ? {} : { silent: true }),
  });
}
