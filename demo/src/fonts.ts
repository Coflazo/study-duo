/* Study Duo's own faces, loaded from public/fonts (copies of the extension's bundled woff2, SIL OFL).
 * Each FontFace holds the render open until it is ready, so no frame is captured in a fallback face. */

import { continueRender, delayRender, staticFile } from "remotion";

const UI = "Atkinson Hyperlegible Next";
const MONO_FACE = "Atkinson Hyperlegible Mono";

const faces = [
  new FontFace(UI, `url(${staticFile("fonts/atkinson-next-latin.woff2")}) format("woff2")`, { weight: "200 800" }),
  new FontFace(MONO_FACE, `url(${staticFile("fonts/atkinson-mono-latin.woff2")}) format("woff2")`, { weight: "200 800" }),
];
const hold = delayRender("Loading Atkinson Hyperlegible");
Promise.all(faces.map((f) => f.load()))
  .then((loaded) => {
    loaded.forEach((f) => document.fonts.add(f));
    continueRender(hold);
  })
  .catch((err) => {
    throw err;
  });

export const TYPE = `"${UI}", system-ui, sans-serif`;
export const MONO = `"${MONO_FACE}", ui-monospace, monospace`;
