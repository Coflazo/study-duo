export type TimerMode = 'pomodoro' | 'flowtime';
export type OverlayCorner = 'top-right' | 'bottom-right';
/** Where the corner clock sits: distances in px from the nearest window edges, so it keeps its place when the window resizes. */
export interface OverlayPos {
  h: 'left' | 'right';
  v: 'top' | 'bottom';
  x: number;
  y: number;
}
export const CORNER_POS: Record<OverlayCorner, OverlayPos> = {
  'top-right': { h: 'right', v: 'top', x: 16, y: 16 },
  'bottom-right': { h: 'right', v: 'bottom', x: 16, y: 16 },
};
const MAX_OFFSET = 10_000;
/** How visible the corner clock is while the mouse is away: 15%, 40% or fully. */
export type OverlayIdle = 'faint' | 'soft' | 'full';
/** During study blocks: close Blocked sites, or close everything except Study and Not blocked sites. */
export type SiteMode = 'closeBlocked' | 'allowOnlyStudy';
export type Appearance = 'system' | 'light' | 'dark';

export interface TimerSettings {
  mode: TimerMode;
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Long break after this many completed focus blocks. */
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  /** Flowtime: break = focus time / this ratio. */
  flowBreakRatio: number;
  /** Pause focus after this many idle minutes. 0 = off. */
  idlePauseMin: number;
  /** 0..1 */
  bellVolume: number;
  /** The clock in the corner of every page. */
  overlayEnabled: boolean;
  /** Set by dragging the clock on any page, or by the corner presets in Settings; shared by every tab. */
  overlayPos: OverlayPos;
  overlayIdle: OverlayIdle;
  siteMode: SiteMode;
  /** No "Open anyway" on the blocked page. */
  hardLock: boolean;
  /** Extension pages only; the corner clock always stays dark. */
  appearance: Appearance;
  /** Study blocks per day, shown as "3 of 8 blocks". Never a streak. */
  dailyGoal: number;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  mode: 'pomodoro',
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  flowBreakRatio: 5,
  idlePauseMin: 0,
  bellVolume: 0.6,
  overlayEnabled: true,
  overlayPos: CORNER_POS['top-right'],
  overlayIdle: 'soft',
  siteMode: 'closeBlocked',
  hardLock: false,
  appearance: 'system',
  dailyGoal: 8,
};

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

const offset = (v: number) => Math.round(Math.min(MAX_OFFSET, Math.max(0, v)));

/** A stored position, repaired where it can be: unknown edges fall back to top right, distances are clamped. */
function repairPos(v: unknown): OverlayPos | null {
  if (v === null || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? offset(x) : 16);
  return { h: r.h === 'left' ? 'left' : 'right', v: r.v === 'bottom' ? 'bottom' : 'top', x: n(r.x), y: n(r.y) };
}

/** A position sent by a page's clock after a drag: exact shape or nothing. */
export function strictPos(v: unknown): OverlayPos | null {
  if (v === null || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if ((r.h !== 'left' && r.h !== 'right') || (r.v !== 'top' && r.v !== 'bottom')) return null;
  if (typeof r.x !== 'number' || typeof r.y !== 'number' || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  return { h: r.h, v: r.v, x: offset(r.x), y: offset(r.y) };
}

/** Settings can come from storage or an import file, so treat them as untrusted. */
export function normalizeSettings(raw: unknown): TimerSettings {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    mode: r.mode === 'flowtime' ? 'flowtime' : 'pomodoro',
    focusMin: num(r.focusMin, 1, 180, d.focusMin),
    shortBreakMin: num(r.shortBreakMin, 1, 60, d.shortBreakMin),
    longBreakMin: num(r.longBreakMin, 1, 120, d.longBreakMin),
    longBreakEvery: Math.round(num(r.longBreakEvery, 1, 12, d.longBreakEvery)),
    autoStartBreaks: bool(r.autoStartBreaks, d.autoStartBreaks),
    autoStartFocus: bool(r.autoStartFocus, d.autoStartFocus),
    flowBreakRatio: num(r.flowBreakRatio, 2, 10, d.flowBreakRatio),
    idlePauseMin: num(r.idlePauseMin, 0, 60, d.idlePauseMin),
    bellVolume: num(r.bellVolume, 0, 1, d.bellVolume),
    overlayEnabled: bool(r.overlayEnabled, d.overlayEnabled),
    // overlayCorner is the setting from before the clock could be dragged.
    overlayPos: repairPos(r.overlayPos) ?? CORNER_POS[r.overlayCorner === 'bottom-right' ? 'bottom-right' : 'top-right'],
    overlayIdle: r.overlayIdle === 'faint' || r.overlayIdle === 'full' ? r.overlayIdle : 'soft',
    siteMode: r.siteMode === 'allowOnlyStudy' ? 'allowOnlyStudy' : 'closeBlocked',
    hardLock: bool(r.hardLock, d.hardLock),
    appearance: r.appearance === 'light' || r.appearance === 'dark' ? r.appearance : 'system',
    dailyGoal: Math.round(num(r.dailyGoal, 1, 24, d.dailyGoal)),
  };
}
