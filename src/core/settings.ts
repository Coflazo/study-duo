export type TimerMode = 'pomodoro' | 'flowtime';
export type OverlayCorner = 'top-right' | 'bottom-right';
/** During study blocks: close Blocked sites, or close everything except Study and Not blocked sites. */
export type SiteMode = 'closeBlocked' | 'allowOnlyStudy';
export type Appearance = 'system' | 'light' | 'dark';
/** One switch per thing Study Duo measures (Settings > What Study Duo measures). Input counting is off until turned on. */
export interface Measure {
  sites: boolean;
  blocked: boolean;
  outcome: boolean;
  away: boolean;
  music: boolean;
  input: boolean;
}

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
  overlayCorner: OverlayCorner;
  siteMode: SiteMode;
  /** No "Open anyway" on the blocked page. */
  hardLock: boolean;
  /** Extension pages only; the corner clock always stays dark. */
  appearance: Appearance;
  /** Study blocks per day, shown as "3 of 8 blocks". Never a streak. */
  dailyGoal: number;
  measure: Measure;
  /** Days of history kept before it is deleted. */
  retentionDays: number;
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
  overlayCorner: 'top-right',
  siteMode: 'closeBlocked',
  hardLock: false,
  appearance: 'system',
  dailyGoal: 8,
  measure: { sites: true, blocked: true, outcome: true, away: true, music: true, input: false },
  retentionDays: 365,
};

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function measure(v: unknown, d: Measure): Measure {
  const r = (v !== null && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { sites: bool(r.sites, d.sites), blocked: bool(r.blocked, d.blocked), outcome: bool(r.outcome, d.outcome), away: bool(r.away, d.away), music: bool(r.music, d.music), input: bool(r.input, d.input) };
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
    overlayCorner: r.overlayCorner === 'bottom-right' ? 'bottom-right' : 'top-right',
    siteMode: r.siteMode === 'allowOnlyStudy' ? 'allowOnlyStudy' : 'closeBlocked',
    hardLock: bool(r.hardLock, d.hardLock),
    appearance: r.appearance === 'light' || r.appearance === 'dark' ? r.appearance : 'system',
    dailyGoal: Math.round(num(r.dailyGoal, 1, 24, d.dailyGoal)),
    measure: measure(r.measure, d.measure),
    retentionDays: Math.round(num(r.retentionDays, 30, 3650, d.retentionDays)),
  };
}
