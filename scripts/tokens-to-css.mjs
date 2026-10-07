#!/usr/bin/env node
// Turns the Figma variable export (design/tokens.json) into src/ui/tokens.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssName = (n) => n.replace(/\//g, '-');
const unit = (name, v) => (typeof v !== 'number' ? v : name.startsWith('motion/duration') ? `${v}ms` : `${v}px`);
const value = (name, v) => (typeof v === 'string' && v.startsWith('@') ? `var(--${cssName(v.slice(1))})` : unit(name, v));
const FONT_FALLBACK = {
  'font/family/ui': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'font/family/mono': "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

export function toCss(tokens) {
  const light = [];
  const dark = [];
  for (const [collection, vars] of Object.entries(tokens)) {
    for (const [name, modes] of Object.entries(vars)) {
      if (collection === 'Type') {
        light.push(`  --${cssName(name)}: '${modes.Value}', ${FONT_FALLBACK[name]};`);
      } else if (collection === 'Color') {
        light.push(`  --${cssName(name)}: ${value(name, modes.Light)};`);
        dark.push(`    --${cssName(name)}: ${value(name, modes.Dark)};`);
      } else {
        light.push(`  --${cssName(name)}: ${value(name, modes.Value)};`);
      }
    }
  }
  const darkBlock = dark.join('\n');
  return [
    '/* Generated from design/tokens.json by scripts/tokens-to-css.mjs. Do not edit by hand. */',
    ':root {',
    ...light,
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    darkBlock,
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    darkBlock.replace(/^ {4}/gm, '  '),
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync('src/ui/tokens.css', toCss(JSON.parse(readFileSync('design/tokens.json', 'utf8'))));
}
