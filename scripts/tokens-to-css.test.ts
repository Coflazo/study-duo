import { describe, expect, it } from 'vitest';
import tokens from '../design/tokens.json';
import { toCss } from './tokens-to-css.mjs';

describe('tokens-to-css', () => {
  const css = toCss(tokens);
  it('writes primitives once and semantic colors as var() aliases', () => {
    expect(css).toContain('--neutral-50: #F3F3F0;');
    expect(css).toContain('--color-bg-canvas: var(--neutral-50);');
    expect(css).toContain('--amber-ghost: #FFB0001F;');
  });
  it('switches semantic colors in dark mode only', () => {
    const dark = css.slice(css.indexOf('prefers-color-scheme: dark'));
    expect(dark).toContain('--color-bg-canvas: var(--neutral-950);');
    expect(dark).not.toContain('--neutral-50: #');
  });
  it('adds px to spacing and radius, ms to durations, and keeps strings', () => {
    expect(css).toContain('--space-16: 16px;');
    expect(css).toContain('--radius-md: 4px;');
    expect(css).toContain('--motion-duration-enter: 400ms;');
    expect(css).toContain('--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
    expect(css).toContain("--font-family-ui: 'Atkinson Hyperlegible Next'");
  });
});
