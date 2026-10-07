import { describe, expect, it } from 'vitest';
import { litSegments, SEGMENT_PATHS } from './segments';

describe('seven segments', () => {
  it('lights the classic shapes', () => {
    expect([...litSegments('8')].sort().join('')).toBe('abcdefg');
    expect([...litSegments('1')].sort().join('')).toBe('bc');
    expect([...litSegments('7')].sort().join('')).toBe('abc');
    expect([...litSegments('0')].sort().join('')).toBe('abcdef');
    expect(litSegments(' ').size).toBe(0);
  });

  it('has a closed path for each of the seven segments', () => {
    expect(Object.keys(SEGMENT_PATHS).sort().join('')).toBe('abcdefg');
    for (const d of Object.values(SEGMENT_PATHS)) expect(d).toMatch(/^M .* Z$/);
  });
});
