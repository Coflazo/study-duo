// Puts the install page's screenshots in place from a run of .github/workflows/shots.yml:
//   gh run download <run id> -D /tmp/shots && node scripts/shots/collect.mjs /tmp/shots
// "pages" holds each browser's extensions page, shot headless at 2x (webp and marks already). "windows" holds the
// Windows desktop at 1x (png and one json of marks per shot). The Mac and Linux terminal and folder window are drawings
// from Figma (Website section), kept in site/shots as they are. Needs cwebp (brew install webp, apt install webp).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const from = process.argv[2];
if (!from) throw new Error('usage: node scripts/shots/collect.mjs <downloaded artifacts folder>');
const OUT = path.resolve('site/shots');
const marksFile = path.join(OUT, 'marks.json');
const marks = fs.existsSync(marksFile) ? JSON.parse(fs.readFileSync(marksFile, 'utf8')) : {};

// Headless 2x shots of each browser's extensions page: copied as they are.
const pages = path.join(from, 'pages');
if (fs.existsSync(path.join(pages, 'marks.json'))) {
  const m = JSON.parse(fs.readFileSync(path.join(pages, 'marks.json'), 'utf8'));
  for (const [key, mark] of Object.entries(m)) {
    // A downloaded file names the picture: only a plain name in this folder, never a path elsewhere.
    if (!/^[a-z-]+\.webp$/.test(mark.file) || !/^[a-z-]+$/.test(key)) throw new Error(`unexpected shot ${key}: ${mark.file}`);
    fs.copyFileSync(path.join(pages, mark.file), path.join(OUT, mark.file));
    marks[key] = mark;
  }
}

// Windows desktop shots. A page shot from Windows is used only where the headless one is missing (Edge's Load unpacked,
// Opera), since it is 1x.
const win = path.join(from, 'windows');
const NAME = { 'windows-terminal': 'windows-terminal', 'windows-folder': 'windows-folder' };
for (const f of fs.existsSync(win) ? fs.readdirSync(win) : []) {
  if (!f.endsWith('.json')) continue;
  const base = f.replace(/\.json$/, '');
  if (!/^[a-z-]+$/.test(base)) continue;
  const key = NAME[base] ?? (base.endsWith('-pin') ? base : base.endsWith('-win') ? base.replace(/-win$/, '') : null);
  if (!key || (base.endsWith('-win') && marks[key])) continue;
  const mark = JSON.parse(fs.readFileSync(path.join(win, f), 'utf8'));
  // The terminal: its title bar and the pasted line, not the empty screen below them.
  const crop = key === 'windows-terminal' ? ['-crop', '0', '0', String(mark.w), String(Math.min(mark.h, 170))] : [];
  execFileSync('cwebp', ['-quiet', '-q', '86', ...crop, path.join(win, `${base}.png`), '-o', path.join(OUT, `${key}.webp`)]);
  marks[key] = { ...mark, file: `${key}.webp`, ...(crop.length ? { h: Math.min(mark.h, 170) } : {}), ...(key.endsWith('terminal') || key.endsWith('folder') ? { box: true } : {}) };
}

// Vivaldi and Arc open Chrome's own extensions page: the same shots, under their names.
for (const b of ['vivaldi', 'arc'])
  for (const s of ['devmode', 'unpacked'])
    if (marks[`chrome-${s}`] && !marks[`${b}-${s}`]) marks[`${b}-${s}`] = { ...marks[`chrome-${s}`], alt: marks[`chrome-${s}`].alt.replace(/^Chrome's/, `${b === 'arc' ? 'Arc' : 'Vivaldi'}'s`) };

const sorted = Object.fromEntries(Object.keys(marks).sort().map((k) => [k, marks[k]]));
fs.writeFileSync(marksFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(Object.keys(sorted).join('\n'));
