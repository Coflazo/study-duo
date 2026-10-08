/**
 * Google sign-in for Calendar sync. Two routes, one click either way:
 * - Chrome's own sign-in (identity.getAuthToken), when this browser already holds a grant;
 * - Google's account chooser in a small window (identity.launchWebAuthFlow), which works in every Chromium browser
 *   and in Chrome without a signed-in profile. Its one-hour token is renewed silently while the Google session lasts.
 * Tokens live in session storage (memory, extension pages only) and are never written to disk by Study Duo.
 */

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
/** OAuth client of type "Web application" for the account-chooser route; null until it exists. */
export const WEB_CLIENT_ID: string | null = '1073365254472-hk755es3u4871q9nam8i5dsp8ttup6kg.apps.googleusercontent.com';

const webTokenItem = storage.defineItem<{ token: string; expiresAt: number } | null>('session:googleWebToken', { fallback: null });

async function chromeToken(interactive: boolean): Promise<string | null> {
  if (!browser.identity?.getAuthToken) return null;
  try {
    const r = (await browser.identity.getAuthToken({ interactive })) as unknown;
    return typeof r === 'string' ? r : ((r as { token?: string } | undefined)?.token ?? null);
  } catch {
    return null;
  }
}

async function webToken(interactive: boolean): Promise<string | null> {
  if (!WEB_CLIENT_ID || !browser.identity?.launchWebAuthFlow) return null;
  const kept = await webTokenItem.getValue();
  if (kept && kept.expiresAt > Date.now() + 60_000) return kept.token;
  const q = new URLSearchParams({ client_id: WEB_CLIENT_ID, response_type: 'token', redirect_uri: browser.identity.getRedirectURL(), scope: CALENDAR_SCOPE });
  if (!interactive) q.set('prompt', 'none');
  try {
    const back = await browser.identity.launchWebAuthFlow({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, interactive });
    const p = new URLSearchParams(new URL(back ?? '').hash.slice(1));
    const token = p.get('access_token');
    if (!token) return null;
    await webTokenItem.setValue({ token, expiresAt: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000 });
    return token;
  } catch {
    return null;
  }
}

/**
 * A Calendar token. Interactive (from a click on an extension page) tries Google's account chooser first, the route
 * that works for everyone; silent (the background) uses whichever route already holds a grant.
 */
export async function googleToken(interactive: boolean): Promise<string | null> {
  if (interactive) return (await webToken(true)) ?? (await chromeToken(true));
  return (await chromeToken(false)) ?? (await webToken(false));
}

/** Forgets a token the API refused, so the next request asks for a fresh one. */
export async function dropToken(token: string): Promise<void> {
  try {
    await browser.identity?.removeCachedAuthToken?.({ token });
  } catch {
    // not a Chrome-route token
  }
  if ((await webTokenItem.getValue())?.token === token) await webTokenItem.setValue(null);
}
