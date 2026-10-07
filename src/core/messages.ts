import type { BellKind } from './bell';
import type { TimerEvent } from './timer';

export type TimerMessage = { kind: 'timer'; event: TimerEvent };
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
