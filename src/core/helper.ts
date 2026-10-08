import type { NowPlaying } from './music';

/** The desktop helper (helper/): a native messaging host that says what desktop music apps play. */
export const HELPER_HOST = 'com.coflazo.study_duo';

const MAX_TEXT = 200;
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_TEXT) : null);

/** One message from the helper, or null for anything else. A song, or null when nothing plays. */
export function parseHelperMessage(raw: unknown): { app: string; song: NowPlaying | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'now' || typeof r.playing !== 'boolean') return null;
  const [title, artist, album, app] = [clean(r.title), clean(r.artist), clean(r.album), clean(r.app)];
  if (title === null || artist === null || album === null || app === null) return null;
  return { app, song: r.playing && title ? { title, artist, album, playing: true } : null };
}

/** Any Spotify client (the Mac app, the Microsoft Store app, spotifyd, ncspot, psst) files as app:spotify, kept out of insights. */
const SPOTIFY = /spotify|ncspot|psst/i;
/** Browsers publish every tab's audio to the system media controls; Study Duo reads music sites itself, so they are dropped. */
const BROWSER = /chrome|chromium|msedge|\bedge\b|firefox|brave|opera|vivaldi|\barc\b|safari|epiphany|browser/i;

/** Listens from desktop apps carry app:<name>, apart from the websites they might share a name with. */
export const appHost = (app: string) => (SPOTIFY.test(app) ? 'app:spotify' : `app:${app.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'}`);

/** Whether a report comes from a web browser rather than a desktop music player. */
export const isBrowserApp = (app: string) => BROWSER.test(app);

export type HelperError = 'missing' | 'forbidden' | 'stopped';

/** What went wrong, as a code: storage keeps codes, never text a page could have written. */
export function helperError(message: string | undefined): HelperError {
  if (message?.includes('not found')) return 'missing';
  if (message?.includes('forbidden')) return 'forbidden';
  return 'stopped';
}

/** A helper error in words a person can act on. */
export const helperErrorText = (e: HelperError): string =>
  e === 'missing' ? "The desktop helper isn't installed. Run the install line again with --helper (on Windows, -Helper)."
  : e === 'forbidden' ? "The desktop helper isn't installed for this browser. Run the install line again with --helper (on Windows, -Helper)."
  : 'The desktop helper stopped. Turn Desktop apps off and on to start it again.';

/** Desktop apps in Connections: whether the user turned it on, the last app heard, and what went wrong. */
export interface HelperState {
  on: boolean;
  app: string | null;
  error: HelperError | null;
}
export const helperItem = storage.defineItem<HelperState>('local:desktopHelper', { fallback: { on: false, app: null, error: null } });
