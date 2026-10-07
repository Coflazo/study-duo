import { capsuleText } from '@/core/capsule';
import { parseAnnounce } from '@/core/messages';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
import { displayMs, initialState, isBreak } from '@/core/timer';
import { createAnnouncer } from '@/overlay/announce';
import { createClock } from '@/overlay/clock';
import { isNear } from '@/overlay/proximity';
import { CSS } from '@/overlay/styles';

/** Inline !important beats any page rule, including `* { all: unset !important }`. */
const HOST_STYLE: Array<[string, string]> = [
  ['all', 'initial'],
  ['position', 'fixed'],
  ['top', '0'],
  ['left', '0'],
  ['width', '0'],
  ['height', '0'],
  ['display', 'block'],
  ['overflow', 'visible'],
  ['pointer-events', 'none'],
  ['z-index', '2147483647'],
];

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    const host = document.createElement('study-duo-overlay');
    for (const [k, v] of HOST_STYLE) host.style.setProperty(k, v, 'important');
    const root = host.attachShadow({ mode: 'closed' });
    try {
      // Constructed sheets are not subject to the page's style-src CSP.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = CSS;
      root.append(style);
    }
    const clock = createClock();
    const words = createAnnouncer();
    root.append(clock.el, words.el);
    document.documentElement.append(host);
    ctx.onInvalidated(() => host.remove());

    let state = await timerItem.getValue();
    let settings = normalizeSettings(await settingsItem.getValue());
    let closed = false;
    let near = false;
    let next: number | undefined;
    let tickedFor: number | null = null;

    const showing = () => !closed && settings.overlayEnabled && state.status !== 'stopped' && !document.fullscreenElement;

    function render() {
      clearTimeout(next);
      clock.el.hidden = !showing();
      if (clock.el.hidden) return;
      clock.el.dataset.phase = isBreak(state.phase) ? 'break' : 'focus';
      clock.el.dataset.status = state.status;
      clock.el.dataset.corner = settings.overlayCorner;
      const now = Date.now();
      const { ms, countsUp } = displayMs(state, settings, now);
      clock.show(capsuleText(ms, countsUp));
      if (state.status !== 'running' || document.visibilityState !== 'visible') return;
      if (state.endsAt !== null && now >= state.endsAt) {
        // Alarms can fire late; the visible page ends the phase on time. One tick per phase end.
        if (tickedFor !== state.endsAt) {
          tickedFor = state.endsAt;
          browser.runtime.sendMessage({ kind: 'timer', event: { type: 'tick' } }).catch(() => undefined);
        }
        return;
      }
      // Wake once per displayed second, right after the digits change.
      const wait = countsUp ? 1000 - (ms % 1000) : ms % 1000 || 1000;
      next = ctx.setTimeout(render, wait + 20);
    }

    function setNear(value: boolean) {
      if (value === near) return;
      near = value;
      clock.el.toggleAttribute('data-near', near);
    }

    let pointer: PointerEvent | undefined;
    let frame = 0;
    ctx.addEventListener(document, 'pointermove', (e) => {
      pointer = e;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (pointer && !clock.el.hidden) setNear(isNear(clock.el.getBoundingClientRect(), pointer.clientX, pointer.clientY));
      });
    }, { capture: true, passive: true });
    ctx.addEventListener(document, 'pointerout', (e) => {
      if (!e.relatedTarget) setNear(false);
    }, { capture: true, passive: true });

    clock.close.addEventListener('click', (e) => {
      e.stopPropagation();
      closed = true;
      setNear(false);
      render();
    });

    ctx.addEventListener(document, 'visibilitychange', render);
    ctx.addEventListener(document, 'fullscreenchange', render);
    const unwatch = [
      timerItem.watch((v) => {
        state = v ?? initialState();
        render();
      }),
      settingsItem.watch((v) => {
        settings = normalizeSettings(v ?? DEFAULT_SETTINGS);
        render();
      }),
    ];
    ctx.onInvalidated(() => unwatch.forEach((u) => u()));

    browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return;
      const msg = parseAnnounce(raw);
      if (!msg) return;
      const canShow = document.visibilityState === 'visible' && !document.fullscreenElement;
      if (canShow) words.show(msg);
      sendResponse(canShow);
    });

    render();
  },
});
