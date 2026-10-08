import { capsuleText } from '@/core/capsule';
import { isPing, parseAnnounce } from '@/core/messages';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
import { settingsItem, timerItem } from '@/core/store';
import { displayMs, initialState, isBreak } from '@/core/timer';
import { createAnnouncer } from '@/overlay/announce';
import { createClock } from '@/overlay/clock';
import { createSitePrompt } from '@/overlay/site-prompt';
import type { SiteStatus } from '@/background/site-requests';
import { isNear } from '@/overlay/proximity';
import { dropPos, placement } from '@/overlay/position';
import { createInputCounter } from '@/overlay/input-counter';
import { changes, pageMedia, readNowPlaying } from '@/overlay/music-probe';
import { isMusicHost } from '@/core/music';
import { hostOf } from '@/core/sites';
import { CSS, ensureFont } from '@/overlay/styles';

const FRESH_MS = 4_000;
/** The site prompt sits this far from the clock's edge: clock height plus an 8 px gap. */
const PROMPT_GAP = 53;

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
  // WXT's content script context is not used: any page can invalidate it with one DOM event, and its setTimeout wrapper leaks a listener per call.
  async main() {
    if (!(document.documentElement instanceof HTMLElement)) return; // raw SVG or XML documents
    const host = document.createElement('study-duo-overlay');
    for (const [k, v] of HOST_STYLE) host.style.setProperty(k, v, 'important');
    // A manual popover lives in the browser's top layer, the only place above page dialogs and popovers (no z-index
    // reaches there). Its inline styles above override the browser's popover look.
    host.setAttribute('popover', 'manual');
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
    const prompt = createSitePrompt((category) => {
      promptDone = true;
      prompt.hide();
      setNear(false);
      browser.runtime.sendMessage(category ? { kind: 'site', op: 'file', category } : { kind: 'site', op: 'dismiss' }).catch(() => undefined);
    });
    root.append(clock.el, prompt.el, words.el);
    // A copy left from before an extension reload or update can no longer hear the extension and would show a
    // stale time under this one. The background adds this copy only when no clock answered, so the old one goes.
    document.querySelectorAll('study-duo-overlay').forEach((old) => old.remove());
    /** Attached, and on top of the top layer: shown again after anything the page put there since. */
    function raise() {
      if (!host.isConnected) document.documentElement.append(host);
      if (typeof host.showPopover !== 'function') return; // an older browser: the z-index still applies
      try {
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } catch {
        // a page that blocks popovers: the z-index still applies
      }
    }
    raise();

    const life = new AbortController();
    const on = { capture: true, passive: true, signal: life.signal };
    let next: ReturnType<typeof setTimeout> | undefined;
    let freshTimer: ReturnType<typeof setTimeout> | undefined;
    /** After an extension reload or update this copy is orphaned: runtime.id disappears. */
    const alive = () => !life.signal.aborted && browser.runtime?.id !== undefined;
    function teardown() {
      life.abort();
      clearTimeout(next);
      clearTimeout(freshTimer);
      host.remove();
    }

    // Answer "is there a working clock here?" before anything slow, so the background never adds a second one.
    const onMessage = (raw: unknown, sender: { id?: string }, sendResponse: (answer: boolean) => void) => {
      if (sender.id !== browser.runtime.id) return;
      if (isPing(raw)) return void sendResponse(alive());
      const msg = parseAnnounce(raw);
      if (!msg) return;
      if (!alive()) return teardown();
      if (!host.isConnected) raise();
      const canShow = document.visibilityState === 'visible' && !document.fullscreenElement;
      if (canShow) words.show(msg);
      sendResponse(canShow);
    };
    browser.runtime.onMessage.addListener(onMessage);
    life.signal.addEventListener('abort', () => browser.runtime.onMessage?.removeListener(onMessage));

    // Filled in after the watchers below are in place, so no change between reading and watching is lost.
    let state = initialState();
    let settings = DEFAULT_SETTINGS;
    let heardTimer = false;
    let heardSettings = false;
    let closed = false;
    let near = false;
    let tickedFor: number | null = null;
    // The site prompt: asked once per page load, shown for unfiled sites during a running block.
    let site: SiteStatus | null = null;
    let asked = false;
    let promptDone = false;

    const showing = () => !closed && settings.overlayEnabled && state.status !== 'stopped' && !document.fullscreenElement;

    function render() {
      clearTimeout(next);
      if (!alive()) return teardown();
      // Pages that rebuild <html> (hydration, document.open) drop unknown nodes; put the clock back.
      if (!host.isConnected) raise();
      clock.el.hidden = !showing();
      renderPrompt();
      if (clock.el.hidden) return;
      clock.el.dataset.phase = isBreak(state.phase) ? 'break' : 'focus';
      clock.el.dataset.status = state.status;
      if (!dragging) Object.assign(clock.el.style, placement(settings.overlayPos));
      clock.el.dataset.idle = settings.overlayIdle;
      // Full brightness for the first seconds of a block so it gets noticed, then as quiet as the user asked.
      clock.el.toggleAttribute('data-fresh', state.status === 'running' && state.startedAt !== null && Date.now() - state.startedAt < FRESH_MS);
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
      next = setTimeout(render, wait + 20);
    }

    function renderPrompt() {
      const running = !clock.el.hidden && state.phase === 'focus' && state.status === 'running';
      if (running && !asked && !promptDone) {
        asked = true;
        browser.runtime.sendMessage({ kind: 'site', op: 'status' }).then((s: SiteStatus | null | undefined) => {
          site = s ?? null; // pages that cannot be filed get no answer at all
          render();
        }, () => undefined);
      }
      const ask = running && !promptDone && site !== null && site.category === null && !site.dismissed && site.mode === 'closeBlocked';
      if (!ask) return prompt.hide();
      const pos = settings.overlayPos;
      Object.assign(prompt.el.style, placement({ ...pos, y: pos.y + PROMPT_GAP })); // below the clock, or above it near the bottom
      if (prompt.el.hidden) {
        ensureFont();
        prompt.show(site!.domain);
        // Bright for a moment so it gets noticed, then as quiet as the clock.
        prompt.el.toggleAttribute('data-fresh', true);
        freshTimer = setTimeout(() => prompt.el.toggleAttribute('data-fresh', false), 8_000);
      }
    }

    function setNear(value: boolean) {
      if (value === near || (dragging && !value)) return;
      near = value;
      clock.el.toggleAttribute('data-near', near);
      prompt.el.toggleAttribute('data-near', near);
    }

    let pointer: PointerEvent | undefined;
    let frame = 0;
    document.addEventListener('pointermove', (e) => {
      pointer = e;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (!pointer || clock.el.hidden) return;
        const { clientX: x, clientY: y } = pointer;
        setNear(isNear(clock.el.getBoundingClientRect(), x, y) || (!prompt.el.hidden && isNear(prompt.el.getBoundingClientRect(), x, y)));
      });
    }, on);
    document.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget) setNear(false);
    }, on);

    // Drag: the clock follows the pointer from where it was grabbed. On drop the spot is saved for every tab,
    // measured from the nearest window edges. Only reachable when near, since the body is click-through otherwise.
    let dragging = false;
    let grab: { id: number; dx: number; dy: number; moved: boolean } | null = null;
    clock.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || clock.close.contains(e.target as Node)) return;
      const r = clock.el.getBoundingClientRect();
      grab = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      clock.el.setPointerCapture(e.pointerId);
      e.preventDefault(); // no text selection or page drag under the clock
    }, { signal: life.signal });
    clock.el.addEventListener('pointermove', (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      grab.moved = dragging = true;
      clock.el.toggleAttribute('data-dragging', true);
      const left = Math.min(Math.max(e.clientX - grab.dx, 0), innerWidth - clock.el.offsetWidth);
      const top = Math.min(Math.max(e.clientY - grab.dy, 0), innerHeight - clock.el.offsetHeight);
      Object.assign(clock.el.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    }, { signal: life.signal });
    const drop = (e: PointerEvent) => {
      if (!grab || e.pointerId !== grab.id) return;
      const moved = grab.moved;
      grab = null;
      dragging = false;
      clock.el.removeAttribute('data-dragging');
      if (!moved) return;
      const pos = dropPos(clock.el.getBoundingClientRect(), innerWidth, innerHeight);
      settings = { ...settings, overlayPos: pos }; // this tab at once; the others when the background saves it
      render();
      browser.runtime.sendMessage({ kind: 'overlay', op: 'move', pos }).catch(() => undefined);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) clock.el.addEventListener(type, drop, { signal: life.signal });

    clock.close.addEventListener('click', (e) => {
      e.stopPropagation();
      closed = true;
      setNear(false);
      render();
    }, { signal: life.signal });

    document.addEventListener('visibilitychange', render, { signal: life.signal });
    document.addEventListener('fullscreenchange', render, { signal: life.signal });
    // A dialog or popover the page opens joins the top layer above the clock; step back on top of it. A copy left
    // behind by an extension reload must not: it would bring back a stale clock over the new one, so it leaves.
    const raiseIfAlive = () => (alive() ? raise() : teardown());
    document.addEventListener('toggle', (e) => e.target !== host && (e as ToggleEvent).newState === 'open' && raiseIfAlive(), on);
    const dialogs = new MutationObserver((changes) => {
      if (changes.some((c) => c.target !== host && (c.target as Element).hasAttribute?.('open'))) raiseIfAlive();
    });
    dialogs.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
    life.signal.addEventListener('abort', () => dialogs.disconnect());
    const unwatch = [
      timerItem.watch((v) => {
        heardTimer = true;
        state = v ?? initialState();
        asked = false; // the lock or the mode may have changed with the phase
        render();
      }),
      settingsItem.watch((v) => {
        heardSettings = true;
        settings = normalizeSettings(v ?? DEFAULT_SETTINGS);
        render();
      }),
    ];
    life.signal.addEventListener('abort', () => unwatch.forEach((u) => u()));
    const [storedTimer, storedSettings] = await Promise.all([timerItem.getValue(), settingsItem.getValue()]);
    if (!heardTimer) state = storedTimer;
    if (!heardSettings) settings = normalizeSettings(storedSettings);

    // Opt-in input counts (off by default): during running study blocks only, sent once a minute and when the page goes.
    const counter = createInputCounter();
    const counting = () => settings.measure.input && state.phase === 'focus' && state.status === 'running';
    const send = () => {
      const c = counter.take();
      if (c && alive()) browser.runtime.sendMessage({ kind: 'activity', op: 'counts', ...c }).catch(() => undefined);
    };
    const onInput = (e: Event) => {
      if (counting()) counter.count(e);
    };
    for (const type of ['keydown', 'pointerdown', 'wheel']) document.addEventListener(type, onInput, on);
    let minute: ReturnType<typeof setInterval> | undefined;
    const syncCounting = () => {
      if (counting() && minute === undefined) minute = setInterval(send, 60_000);
      if (!counting() && minute !== undefined) {
        clearInterval(minute);
        minute = undefined;
        send();
      }
    };
    window.addEventListener('pagehide', send, { signal: life.signal });
    // Switching tabs hides the page: hand over the partial minute while its site's record is still the open one.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && send(), { signal: life.signal });
    life.signal.addEventListener('abort', () => clearInterval(minute));
    unwatch.push(timerItem.watch(() => syncCounting()), settingsItem.watch(() => syncCounting()));
    syncCounting();

    // Now playing, on music sites only: read on media events and on a slow beat, report only changes.
    if (isMusicHost(hostOf(location.href))) {
      const media = pageMedia();
      const changed = changes();
      let beat: ReturnType<typeof setTimeout> | undefined;
      let sentAt = 0;
      const read = () => {
        clearTimeout(beat);
        if (!alive()) return;
        if (!settings.measure.music) return void (beat = setTimeout(read, 60_000));
        // The background takes one song report per 2 s; wait rather than send one it would drop.
        const wait = sentAt + 2_100 - Date.now();
        if (wait > 0) return void (beat = setTimeout(read, wait));
        const now = readNowPlaying(media);
        const news = changed(now);
        if (news !== undefined) {
          if (news) sentAt = Date.now();
          browser.runtime.sendMessage(news ? { kind: 'music', op: 'now', ...news } : { kind: 'music', op: 'none' }).catch(() => undefined);
        }
        beat = setTimeout(read, now?.playing ? 15_000 : 60_000);
      };
      let soon: ReturnType<typeof setTimeout> | undefined;
      const readSoon = () => {
        clearTimeout(soon);
        soon = setTimeout(read, 500); // let the page update its metadata first
      };
      for (const type of ['play', 'pause', 'ended', 'loadedmetadata']) document.addEventListener(type, readSoon, { capture: true, signal: life.signal });
      window.addEventListener('pagehide', () => browser.runtime.sendMessage({ kind: 'music', op: 'none' }).catch(() => undefined), { signal: life.signal });
      life.signal.addEventListener('abort', () => (clearTimeout(beat), clearTimeout(soon)));
      readSoon();
    }

    render();
  },
});
