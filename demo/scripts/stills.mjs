// Many stills through one browser: node scripts/stills.mjs <frame> [frame ...]  (absolute frames, title included)
// Writes out/stills/f<frame>.png from the bundle in out/bundle (npx remotion bundle src/index.ts --out-dir out/bundle).
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const serveUrl = path.resolve("out/bundle");
const browser = await openBrowser("chrome");
const composition = await selectComposition({ serveUrl, id: "demo", puppeteerInstance: browser });
for (const f of process.argv.slice(2).map(Number)) {
  await renderStill({ composition, serveUrl, frame: f, output: path.resolve(`out/stills/f${String(f).padStart(4, "0")}.png`), puppeteerInstance: browser });
  console.log("frame", f);
}
await browser.close({ silent: true });
