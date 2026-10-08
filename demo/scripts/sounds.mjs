// The film's sounds, made by the product's own code: the break bell from src/core/bell.ts (rendered in headless Chrome
// with an OfflineAudioContext, the same Web Audio graph the extension plays) and white, pink and brown noise from
// src/core/noise.ts (samples straight to WAV). Writes public/sounds/*.wav (git-ignored). Run from demo/:
//   node scripts/sounds.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DEMO, "..");
const OUT = path.join(DEMO, "public/sounds");
const RATE = 48000;
mkdirSync(OUT, { recursive: true });

function wav(channels) {
  const n = channels[0].length;
  const c = channels.length;
  const b = Buffer.alloc(44 + n * c * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < c; k++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[k][i])) * 32767), 44 + (i * c + k) * 2);
  return b;
}

// Noise: the extension loops 6 seconds of it; the film needs a few seconds of each kind. Seeded so renders repeat.
const { noiseSamples, NOISES } = await import(path.join(ROOT, "src/core/noise.ts"));
const { seeded } = await import(path.join(ROOT, "src/ml/random.ts"));
for (const kind of NOISES) {
  const r = seeded(11);
  writeFileSync(path.join(OUT, `noise-${kind}.wav`), wav([noiseSamples(kind, RATE * 8, () => r.u())]));
  console.log("noise", kind);
}

// The bell: bell.ts in the page, as plain JS (it imports only a type).
const source = stripTypeScriptTypes(readFileSync(path.join(ROOT, "src/core/bell.ts"), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/^export /gm, "");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
for (const kind of ["breakStart", "focusStart"]) {
  const samples = await page.evaluate(
    async ({ source, kind, rate }) => {
      const playBell = new Function(`${source}; return playBell;`)();
      const ctx = new OfflineAudioContext(1, rate * 6, rate);
      playBell(ctx, kind, 1); // volume 1: the extension's default bell volume is a user setting; the mix sets the level
      const buf = await ctx.startRendering();
      return Array.from(buf.getChannelData(0));
    },
    { source, kind, rate: RATE },
  );
  writeFileSync(path.join(OUT, `bell-${kind}.wav`), wav([Float32Array.from(samples)]));
  console.log("bell", kind);
}
await browser.close();
