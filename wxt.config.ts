import { execSync } from 'node:child_process';
import { defineConfig } from 'wxt';

/**
 * Which build this is (manifest version_name), so a running copy can tell newer files are on disk (UpdateNotice).
 * Clean builds stay reproducible; builds of an edited tree add the build time.
 */
function buildStamp(): string {
  try {
    const rev = execSync('git describe --always --dirty', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return rev.endsWith('-dirty') ? `${rev}.${Date.now().toString(36)}` : rev;
  } catch {
    return 'source';
  }
}
const BUILD = buildStamp();

// Public half of the key that pins the Chromium extension ID to
// bcggiingdefmehpjcalkfpdnehpcieon (needed for a stable Google OAuth client).
// The private key is not in this repo.
const CHROMIUM_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu9hwGNxXcB3MKlkX7mQf6wxzWc7z+7tLudqBBi9saDIqzvlBnahuMB6dj0pKmM0OPUDYjPT3mPgYuYKFy2HNXQUk9DqlibGZxo780odACxxQW5AvQF27ifIVa8oKaKHNHFyWK0ReAQr800GBWYg+b4Qr/nMuVeclAd7NTX1AfwHBavvS0MbyhbVoULY3XWjM/KQm7G1V4qEPzIiZ0R4XB7GcDEakxgWlAZyj/Ihq/gza2E6lsIz5Zzo45o7EuweeHRoIT/BTsRD3P8z2nwhphXCHnzawZWu+8ApEtWL2pbkVlgWw9fYWGcE6esfpEJnq7dMmjxCN0gz9VdxaYyBoqQIDAQAB';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // A visible folder: Finder and Chrome's Load unpacked window hide dot-folders like the default .output.
  // Tests build into .test-build, so work in progress never lands in the folder Chrome loads.
  outDir: process.env.STUDY_DUO_OUT ?? 'build',
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Study Duo',
    version_name: `${process.env.npm_package_version ?? '0.0.0'} ${BUILD}`,
    description: 'Pomodoro timer, focus clock, tab locker and private study insights. Runs offline.',
    // Private windows stay private: Study Duo never runs there, so nothing from them reaches the log.
    incognito: 'not_allowed',
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            // Nothing leaves the browser, so Firefox's data-collection declaration is "none".
            gecko: { id: 'study-duo@coflazo.github.io', data_collection_permissions: { required: ['none'] } },
          },
        }
      : { key: CHROMIUM_PUBLIC_KEY }),
    permissions: [
      'storage',
      'unlimitedStorage',
      'alarms',
      'notifications',
      'idle',
      'declarativeNetRequestWithHostAccess',
      'contextMenus',
      'scripting',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    // Redirects and reading an open tab's address need host access; the corner clock already asks for every site.
    host_permissions: ['<all_urls>'],
    // Only the phase-word font, behind a per-session URL so pages cannot fetch it by a fixed address.
    web_accessible_resources: [
      {
        resources: ['fonts/atkinson-next-latin.woff2', 'fonts/atkinson-next-latin-ext.woff2'],
        matches: ['<all_urls>'],
        ...(browser === 'firefox' ? {} : { use_dynamic_url: true }),
      },
      // Closed sites redirect here, so the address must be fixed; the corner clock already shows pages the extension is there.
      { resources: ['blocked.html'], matches: ['<all_urls>'] },
    ],
    // Right-click the toolbar button > Options opens Settings in a tab.
    options_ui: { page: 'dashboard.html', open_in_tab: true },
    content_security_policy: {
      // Course calendars live on any school's host, so https: is open here; src/core/net.ts is the allowlist (only the
      // connections the user switched on) and nothing else in the extension fetches.
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https:;",
    },
    commands: {
      'toggle-timer': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Start or pause the timer',
      },
      'skip-phase': {
        suggested_key: { default: 'Alt+Shift+K' },
        description: 'Skip to the next phase',
      },
    },
  }),
});
