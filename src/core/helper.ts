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

/** Listens from desktop apps carry app:<name>, apart from the websites they might share a name with. */
export const appHost = (app: string) => `app:${app.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'}`;

/** What went wrong with the helper, in words a person can act on. */
export function helperError(message: string | undefined): string {
  if (message?.includes('not found')) return "The desktop helper isn't installed. Run the install line again with --helper (on Windows, -Helper).";
  if (message?.includes('forbidden')) return "The desktop helper isn't installed for this browser. Run the install line again with --helper (on Windows, -Helper).";
  return 'The desktop helper stopped. Turn Desktop apps off and on to start it again.';
}

/** Desktop apps in Connections: whether the user turned it on, the last app heard, and what went wrong. */
export interface HelperState {
  on: boolean;
  app: string | null;
  error: string | null;
}
export const helperItem = storage.defineItem<HelperState>('local:desktopHelper', { fallback: { on: false, app: null, error: null } });
