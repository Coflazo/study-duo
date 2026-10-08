import { appHost, HELPER_HOST, helperError, helperItem, parseHelperMessage } from '@/core/helper';
import { hearSource } from './music';

/**
 * The desktop helper's port: open while Desktop apps is on and the nativeMessaging permission is granted, closed
 * otherwise. Chrome starts the helper when we connect and stops it when we let go.
 */
let port: ReturnType<typeof browser.runtime.connectNative> | null = null;
let host: string | null = null;

async function patch(fields: Partial<Awaited<ReturnType<typeof helperItem.getValue>>>) {
  await helperItem.setValue({ ...(await helperItem.getValue()), ...fields });
}

function stop() {
  port?.disconnect();
  port = null;
  void hearSource('helper', host, null); // the song that was playing ends now
  host = null;
}

export async function syncHelper(): Promise<void> {
  const state = await helperItem.getValue();
  const allowed = await browser.permissions.contains({ permissions: ['nativeMessaging'] }).catch(() => false);
  if (!state.on || !allowed) return stop();
  if (port) return;
  const p = browser.runtime.connectNative(HELPER_HOST);
  port = p;
  p.onMessage.addListener((raw: unknown) => {
    const m = parseHelperMessage(raw);
    if (!m) return;
    if (m.song) host = appHost(m.app);
    void hearSource('helper', host, m.song);
    void patch({ error: null, ...(m.app ? { app: m.app } : {}) });
  });
  p.onDisconnect.addListener(() => {
    if (port !== p) return; // we let go on purpose
    const reason = browser.runtime.lastError?.message ?? (p as { error?: { message?: string } }).error?.message;
    port = null;
    void hearSource('helper', host, null);
    host = null;
    void patch({ error: helperError(reason) });
  });
}

export function trackHelper(): void {
  helperItem.watch(() => void syncHelper().catch(console.error));
  browser.permissions.onAdded.addListener(() => void syncHelper().catch(console.error));
  browser.permissions.onRemoved.addListener(() => void syncHelper().catch(console.error));
  void syncHelper().catch(console.error);
}
