import type { BellKind } from './bell';
import type { Phase, TimerEvent } from './timer';

export type TimerMessage = { kind: 'timer'; event: TimerEvent };
export type AnnounceMessage = { kind: 'announce'; line: string; sub: string; phase: Phase };
export type OffscreenMessage = { target: 'offscreen'; kind: 'bell'; bell: BellKind; volume: number };

const PLAIN = new Set(['pause', 'resume', 'toggle', 'skip', 'reset', 'tick', 'finish']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

/** Every message from another extension context passes through here. Rebuilds the event so unknown fields are dropped. */
export function parseMessage(raw: unknown): TimerMessage | null {
  if (!isObj(raw) || raw.kind !== 'timer' || !isObj(raw.event)) return null;
  const e = raw.event;
  if (typeof e.type !== 'string') return null;
  if (PLAIN.has(e.type)) return { kind: 'timer', event: { type: e.type } as TimerEvent };
  if (e.type === 'start') {
    const t = e.taskId;
    if (t === undefined || t === null) return { kind: 'timer', event: { type: 'start', taskId: null } };
    if (typeof t !== 'string' || t.length === 0 || t.length > 64) return null;
    return { kind: 'timer', event: { type: 'start', taskId: t } };
  }
  if (e.type === 'extend') {
    const ms = e.ms;
    if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 60_000 || ms > 3_600_000) return null;
    return { kind: 'timer', event: { type: 'extend', ms } };
  }
  return null;
}

export function parseOffscreenMessage(raw: unknown): OffscreenMessage | null {
  if (!isObj(raw) || raw.target !== 'offscreen' || raw.kind !== 'bell') return null;
  if (raw.bell !== 'focusStart' && raw.bell !== 'breakStart') return null;
  const v = typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : 0;
  return { target: 'offscreen', kind: 'bell', bell: raw.bell, volume: v };
}

const PHASES = new Set(['focus', 'shortBreak', 'longBreak']);
const shortText = (v: unknown, allowEmpty: boolean): v is string => typeof v === 'string' && v.length <= 120 && (allowEmpty || v.length > 0);

/** Announcements arrive in page content scripts from the background; they are still checked before any text reaches the page. */
export function parseAnnounce(raw: unknown): AnnounceMessage | null {
  if (!isObj(raw) || raw.kind !== 'announce') return null;
  if (!shortText(raw.line, false) || !shortText(raw.sub, true) || typeof raw.phase !== 'string' || !PHASES.has(raw.phase)) return null;
  return { kind: 'announce', line: raw.line, sub: raw.sub, phase: raw.phase as Phase };
}

/** A content script runs inside web pages, so it may only report that the clock reached zero; real commands come from extension pages. */
export function allowedFromSender(msg: TimerMessage, fromTab: boolean): boolean {
  return !fromTab || msg.event.type === 'tick';
}
