// Many stills through one browser: node scripts/stills.mjs <frame> [frame ...]  (absolute frames, title included).
// COMP=film (or loop) picks another composition; the default is the demo.
// Writes out/stills/<comp>-f<frame>.png from the bundle in out/bundle (npx remotion bundle src/index.ts --out-dir out/bundle).
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const serveUrl = path.resolve("out/bundle");
const browser = await openBrowser("chrome", process.env.CHROME_PATH ? { browserExecutable: process.env.CHROME_PATH, chromeMode: "chrome-for-testing" } : {});
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? "demo", puppeteerInstance: browser });
for (const f of process.argv.slice(2).map(Number)) {
  await renderStill({ composition, serveUrl, frame: f, output: path.resolve(`out/stills/${process.env.COMP ?? "demo"}-f${String(f).padStart(4, "0")}.png`), puppeteerInstance: browser });
  console.log("frame", f);
}
await browser.close({ silent: true });
