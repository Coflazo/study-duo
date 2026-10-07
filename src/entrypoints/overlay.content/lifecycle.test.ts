import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('overlay content script lifecycle', () => {
  it("does not use WXT's ctx helpers: any page can invalidate ctx with one DOM event, and ctx.setTimeout leaks a listener per call", () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bctx\./);
  });
});
