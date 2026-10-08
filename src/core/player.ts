import type { SoundCommand } from './messages';
import { NOISES, type NoiseKind } from './noise';
import { handoff } from './queue';

/** Every source the player can hand over between. Only one plays at a time. */
export const PLAYER_SOURCES = ['folder', 'noise', 'youtube', 'spotify', 'apple', 'soundcloud', 'tidal', 'tab'] as const;
export type PlayerSource = (typeof PLAYER_SOURCES)[number];

/**
 * The one player, owned by the background. The position is a timestamp, not a stream: `position` ms at time `at`,
 * which pages run forward while it plays, so nothing is written every second.
 */
export interface PlayerState {
  active: PlayerSource | null;
  playing: boolean;
  noise: NoiseKind;
  volume: number;
  position: number;
  at: number;
  /** When the current source started playing, for its listen. */
  startedAt: number | null;
}

export const INITIAL_PLAYER: PlayerState = { active: null, playing: false, noise: 'pink', volume: 0.6, position: 0, at: 0, startedAt: null };

export type PlayerCommand =
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'toggle' }
  | { op: 'source'; source: PlayerSource }
  | { op: 'noise'; noise: NoiseKind }
  | { op: 'volume'; volume: number };

/** What the background has to carry out after a command. Sources other than noise arrive in later steps (#51). */
export type PlayerEffect =
  | { type: 'noise-start'; noise: NoiseKind; volume: number }
  | { type: 'noise-stop' }
  | { type: 'noise-volume'; volume: number }
  | { type: 'source-start'; source: PlayerSource }
  | { type: 'source-stop'; source: PlayerSource };

/** Player commands, from the extension's own pages only (the background checks the sender). */
export function parsePlayer(raw: unknown): PlayerCommand | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'player') return null;
  if (r.op === 'play' || r.op === 'pause' || r.op === 'toggle') return { op: r.op };
  if (r.op === 'source' && (PLAYER_SOURCES as readonly unknown[]).includes(r.source)) return { op: 'source', source: r.source as PlayerSource };
  if (r.op === 'noise' && (NOISES as readonly unknown[]).includes(r.noise)) return { op: 'noise', noise: r.noise as NoiseKind };
  if (r.op === 'volume' && typeof r.volume === 'number' && Number.isFinite(r.volume)) return { op: 'volume', volume: Math.min(1, Math.max(0, r.volume)) };
  return null;
}

const start = (s: PlayerState): PlayerEffect => (s.active === 'noise' || s.active === null ? { type: 'noise-start', noise: s.noise, volume: s.volume } : { type: 'source-start', source: s.active });
const stop = (source: PlayerSource): PlayerEffect => (source === 'noise' ? { type: 'noise-stop' } : { type: 'source-stop', source });

export function applyPlayer(s: PlayerState, cmd: PlayerCommand, now: number): { state: PlayerState; effects: PlayerEffect[] } {
  switch (cmd.op) {
    case 'play': {
      if (s.playing) return { state: s, effects: [] };
      const state: PlayerState = { ...s, active: s.active ?? 'noise', playing: true, startedAt: now, at: now };
      return { state, effects: [start(state)] };
    }
    case 'pause':
      if (!s.playing || !s.active) return { state: s, effects: [] };
      return { state: { ...s, playing: false, startedAt: null, at: now }, effects: [stop(s.active)] };
    case 'toggle':
      return applyPlayer(s, { op: s.playing ? 'pause' : 'play' }, now);
    case 'source': {
      const h = handoff({ active: s.active, playing: s.playing }, cmd.source);
      const state: PlayerState = { ...s, active: h.active, ...(h.start ? { startedAt: now, at: now, position: 0 } : {}) };
      return { state, effects: h.start ? [stop(h.fadeOut!), start(state)] : [] };
    }
    case 'noise': {
      const coloured = { ...s, noise: cmd.noise };
      // Picking a colour while something else plays means "play this noise": hand over to it.
      if (s.playing && s.active !== 'noise') return applyPlayer(coloured, { op: 'source', source: 'noise' }, now);
      return { state: coloured, effects: s.playing ? [start(coloured)] : [] };
    }
    case 'volume':
      return { state: { ...s, volume: cmd.volume }, effects: s.playing && s.active === 'noise' ? [{ type: 'noise-volume', volume: cmd.volume }] : [] };
  }
}

/** The Music page's focus sound buttons, as player commands, so there is one player and one state. */
export function soundToPlayer(cmd: SoundCommand): PlayerCommand[] {
  if (cmd.op === 'play') return [{ op: 'volume', volume: cmd.volume }, { op: 'noise', noise: cmd.noise }, { op: 'play' }];
  if (cmd.op === 'stop') return [{ op: 'pause' }];
  return [{ op: 'volume', volume: cmd.volume }];
}
