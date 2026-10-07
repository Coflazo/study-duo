import { describe, expect, it } from 'vitest';
import { toHostCss } from './styles';

describe('toHostCss', () => {
  it('moves token rules onto the shadow host, with or without quotes left by the minifier', () => {
    for (const q of ['"', '']) {
      const css = `:root{--a:1}@media (prefers-color-scheme: dark){:root:not([data-theme=${q}light${q}]){--a:2}}:root[data-theme=${q}dark${q}]{--a:2}`;
      expect(toHostCss(css)).toBe(':host{--a:1}@media (prefers-color-scheme: dark){:host{--a:2}}:host([data-theme="dark"]){--a:2}');
    }
  });
});
