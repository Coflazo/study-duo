import tokens from '@/ui/tokens.css?inline';

/**
 * The shared tokens, moved onto the shadow host so they apply inside it (page :root rules never reach it).
 * Light and dark follow the system theme live. Quotes are optional because the minifier drops them.
 */
export function toHostCss(css: string): string {
  return css
    .replace(/:root:not\(\[data-theme=["']?light["']?\]\)/g, ':host')
    .replace(/:root\[data-theme=["']?dark["']?\]/g, ':host([data-theme="dark"])')
    .replaceAll(':root', ':host');
}
const hostTokens = toHostCss(tokens);

/** A family name of our own, so a page that ships Atkinson under the same name cannot swap our files. */
export const FONT_FAMILY = 'Study Duo Sans';
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';

let fontAdded = false;
/** Shadow roots ignore @font-face, so the font goes into the page's font set, once, and only when phase words first show. */
export function ensureFont(): void {
  if (fontAdded) return;
  fontAdded = true;
  for (const [file, range] of [['atkinson-next-latin', LATIN], ['atkinson-next-latin-ext', LATIN_EXT]] as const) {
    const url = browser.runtime.getURL(`/fonts/${file}.woff2`);
    const face = new FontFace(FONT_FAMILY, `url("${url}") format("woff2")`, { weight: '200 800', unicodeRange: range, display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => undefined); // falls back to the system font
  }
}

export const CSS = `${hostTokens}
.clock {
  position: fixed; top: 16px; right: 16px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  background: var(--color-bg-board); border-radius: 4px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  direction: ltr; opacity: 0.15; pointer-events: none; transition: opacity 180ms ease;
}
.clock[hidden] { display: none; }
.clock[data-corner="bottom-right"] { top: auto; bottom: 16px; }
.clock[data-near] { opacity: 1; padding-right: 6px; }
.lamp { flex: none; width: 6px; height: 6px; background: var(--color-bg-plate-focus); }
.clock[data-phase="break"] .lamp { background: var(--color-bg-plate-break); }
.digits { display: block; flex: none; width: 86px; height: 29px; }
.seg { fill: var(--color-text-led-ghost); }
.seg.on, .colon { fill: var(--color-text-led); }
.clock[data-status="paused"] .colon { animation: blink 2s steps(1, end) infinite; }
@keyframes blink { 50% { fill: var(--color-text-led-ghost); } }
.close {
  display: none; place-items: center; width: 24px; height: 24px; margin: 0; padding: 0;
  border: 0; border-radius: 2px; background: none; color: var(--color-text-led); cursor: pointer;
}
/* Only the close button ever takes clicks; the clock body lets them through to the page, near or not. */
.clock[data-near] .close { display: grid; pointer-events: auto; }
.close:hover { background: rgb(255 255 255 / 0.08); }
.close:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
.close svg { width: 14px; height: 14px; fill: currentColor; }

.words {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none; opacity: 0;
}
.words-inner {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  max-width: 90vw; text-align: center; color: var(--color-text-focus);
  font-family: '${FONT_FAMILY}', var(--font-family-ui);
}
.words[data-phase="break"] .words-inner { color: var(--color-text-break); }
.words svg { width: 40px; height: 40px; fill: currentColor; filter: drop-shadow(0 0 8px var(--color-bg-canvas)); }
.line {
  margin: 0; font-weight: 800; font-size: clamp(32px, 6vw, 64px); line-height: 1.0625; letter-spacing: -0.01em;
  text-wrap: balance; overflow-wrap: anywhere;
  text-shadow: 0 0 16px var(--color-bg-canvas), 0 0 4px var(--color-bg-canvas);
}
.sub {
  margin: 0; font-size: 14px; line-height: 20px; color: var(--color-text-primary);
  text-shadow: 0 0 16px var(--color-bg-canvas), 0 0 4px var(--color-bg-canvas);
}
@media (prefers-reduced-motion: reduce) {
  .clock { transition: none; }
  .clock[data-status="paused"] .colon { animation: none; }
}
`;
