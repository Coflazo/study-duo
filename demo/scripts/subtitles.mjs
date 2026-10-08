// Subtitles from public/narration/timing.json: the same phrases the film burns in, at the same times.
//   node scripts/subtitles.mjs [out-dir]    (default ../docs/media) -> study-duo.srt and study-duo.vtt
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] ?? path.join(DEMO, "../docs/media"));
const { captions } = JSON.parse(readFileSync(path.join(DEMO, "public/narration/timing.json"), "utf8"));

// Each phrase stays up until the next one starts when the gap is short, as on screen (Captions in Film.tsx).
const cues = captions.map((c, i) => {
  const next = captions[i + 1];
  return { text: c.text, start: c.start, end: next && next.start - c.end < 0.6 ? next.start : c.end + 0.33 };
});
const stamp = (s, sep) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
writeFileSync(path.join(OUT, "study-duo.srt"), cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n"));
writeFileSync(path.join(OUT, "study-duo.vtt"), `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`);
console.log(`${cues.length} cues -> ${OUT}`);
