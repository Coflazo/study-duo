import { MUSIC_SITES } from '@/core/sites';

/**
 * On music sites only, in the page's own world and before the page runs: remembers the play, pause and skip handlers
 * the site gives the browser's media session, so Study Duo's card can press the same buttons the keyboard's media keys
 * do. Commands arrive from Study Duo's clock script as a DOM event; a page could send the same event, but only to
 * itself. Nothing is read or sent from here.
 */
export default defineContentScript({
  matches: MUSIC_SITES.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    if (!('mediaSession' in navigator)) return;
    const handlers = new Map<string, MediaSessionActionHandler>();
    const original = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function (action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
      return original.call(this, action, handler);
    };
    const ACTIONS: Record<string, MediaSessionAction> = { play: 'play', pause: 'pause', next: 'nexttrack', prev: 'previoustrack' };
    window.addEventListener('study-duo:media', (e) => {
      const action = ACTIONS[String((e as CustomEvent).detail)];
      if (!action) return;
      const handler = handlers.get(action);
      if (handler) return handler({ action });
      // A site without handlers: its media element, for play and pause only.
      const media = [...document.querySelectorAll<HTMLMediaElement>('audio, video')];
      const el = media.find((m) => !m.paused) ?? media[0];
      if (action === 'play') void el?.play().catch(() => undefined);
      if (action === 'pause') el?.pause();
    });
  },
});
