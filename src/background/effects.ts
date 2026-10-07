import { badgeColor, badgeText } from '@/core/badge';
import { bellKindFor, playBell, type BellKind } from '@/core/bell';
import { actionTitle, dial } from '@/core/dial';
import { drawDial } from './dial-canvas';
import { syncLockFromStorage } from './site-lock';
import type { AnnounceMessage } from '@/core/messages';
import { phaseTitle } from '@/core/phase-copy';
import { drawLine, momentFor, subLine } from '@/core/phrases';
import { addSessions } from '@/core/sessions';
import { lastFocusDayItem, phraseBagItem } from '@/core/store';
import type { TimerSettings } from '@/core/settings';
import type { TimerState } from '@/core/timer';
import type { EffectInput } from './timer-service';

export const ALARM_PHASE_END = 'phase-end';
export const ALARM_REFRESH = 'refresh';

export async function syncAlarms(state: TimerState): Promise<void> {
  await Promise.all([browser.alarms.clear(ALARM_PHASE_END), browser.alarms.clear(ALARM_REFRESH)]);
  if (state.status !== 'running') return;
  if (state.endsAt !== null) await browser.alarms.create(ALARM_PHASE_END, { when: state.endsAt });
  await browser.alarms.create(ALARM_REFRESH, { periodInMinutes: 0.5 });
}

export async function syncAction(state: TimerState, settings: TimerSettings, now: number): Promise<void> {
  await browser.action.setBadgeText({ text: badgeText(state, now) });
  await browser.action.setTitle({ title: actionTitle(state, settings, now) });
  const d = dial(state, settings, now);
  if (d === null) {
    await browser.action.setIcon({ path: { 16: '/icon/16.png', 32: '/icon/32.png' } });
    return;
  }
  await browser.action.setBadgeBackgroundColor({ color: badgeColor(state) });
  await browser.action.setBadgeTextColor?.({ color: '#FFFFFF' });
  if (typeof OffscreenCanvas === 'undefined') return;
  await browser.action.setIcon({ imageData: { 16: drawDial(16, d), 32: drawDial(32, d) } });
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

/** A tab frozen by alert() or print() never answers; the timer queue must not wait on it. */
const ANNOUNCE_WAIT_MS = 1_500;
const SESSION_WRITE_MS = 3_000;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);
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
    tabs.map((t) => (t.id === undefined ? 0 : withTimeout(browser.tabs.sendMessage(t.id, message), ANNOUNCE_WAIT_MS).then((shown) => (shown === true ? 1 : 0), () => 0))),
  );
  return delivered.reduce<number>((a, b) => a + b, 0);
}

export async function applyEffects(input: EffectInput): Promise<void> {
  const { event, state, settings, segments, now } = input;
  await syncAlarms(state);
  await syncAction(state, settings, now);
  // A rule failure must not stop the bell or the phase words, and the other way round.
  await syncLockFromStorage(state, settings).catch(console.error);
  // The log comes after everything that keeps the timer running, and a database that never answers is abandoned.
  await withTimeout(addSessions(segments), SESSION_WRITE_MS).catch(console.error);
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
