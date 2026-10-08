import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { googleToken } from './google-auth';

const REDIRECT = 'https://bcggiingdefmehpjcalkfpdnehpcieon.chromiumapp.org/';
let identity: { getAuthToken: ReturnType<typeof vi.fn>; launchWebAuthFlow: ReturnType<typeof vi.fn>; getRedirectURL: () => string; removeCachedAuthToken: ReturnType<typeof vi.fn> };

/** Google's account chooser answering with a token, echoing the state it was sent unless told otherwise. */
const chooser = (token: string, state?: string) =>
  vi.fn(async ({ url }: { url: string }) => `${REDIRECT}#access_token=${token}&expires_in=3600&state=${state ?? new URL(url).searchParams.get('state')}`);

beforeEach(() => {
  fakeBrowser.reset();
  identity = { getAuthToken: vi.fn(async () => ({ token: 'chrome-profile-token' })), launchWebAuthFlow: chooser('web-token'), getRedirectURL: () => REDIRECT, removeCachedAuthToken: vi.fn() };
  (fakeBrowser as unknown as { identity: typeof identity }).identity = identity;
});

describe('googleToken', () => {
  it('signs in through the account chooser, and the background then renews that account, not the profile\'s', async () => {
    expect(await googleToken(true)).toBe('web-token');
    expect(await googleToken(false)).toBe('web-token');
    expect(identity.getAuthToken).not.toHaveBeenCalled();
  });

  it('refuses an answer that does not carry back the state it was sent', async () => {
    identity.launchWebAuthFlow = chooser('planted-token', 'someone-else');
    identity.getAuthToken = vi.fn(async () => undefined);
    expect(await googleToken(true)).toBeNull();
  });

  it('falls back to Chrome\'s own sign-in and keeps using it', async () => {
    identity.launchWebAuthFlow = vi.fn(async () => {
      throw new Error('closed');
    });
    expect(await googleToken(true)).toBe('chrome-profile-token');
    identity.launchWebAuthFlow = chooser('web-token');
    expect(await googleToken(false)).toBe('chrome-profile-token');
  });
});
