import { describe, expect, it } from 'vitest';
import { isNear } from './proximity';

const rect = { left: 100, top: 20, right: 228, bottom: 64 } as DOMRectReadOnly;

describe('isNear', () => {
  it('is true inside the clock and within the margin', () => {
    expect(isNear(rect, 150, 40)).toBe(true);
    expect(isNear(rect, 90, 40)).toBe(true);
    expect(isNear(rect, 240, 80)).toBe(true);
  });
  it('is false farther away, so the clock stays dim and click-through', () => {
    expect(isNear(rect, 60, 40)).toBe(false);
    expect(isNear(rect, 150, 100)).toBe(false);
    expect(isNear(rect, 250, 90)).toBe(false);
  });
});
