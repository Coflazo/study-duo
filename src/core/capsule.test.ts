import { describe, expect, it } from 'vitest';
import { capsuleText } from './capsule';

describe('capsuleText', () => {
  it('shows MM:SS, rounding a countdown up', () => {
    expect(capsuleText(25 * 60_000, false)).toBe('25:00');
    expect(capsuleText(61_500, false)).toBe('01:02');
    expect(capsuleText(0, false)).toBe('00:00');
  });

  it('switches to H:MM from one hour', () => {
    expect(capsuleText(65 * 60_000, true)).toBe('1:05');
    expect(capsuleText(59 * 60_000 + 59_999, true)).toBe('59:59');
  });
});
