import { describe, expect, it } from 'vitest';
import { clip } from './text';

describe('clip', () => {
  it('leaves a short title alone', () => {
    expect(clip('Nocturne in F major')).toBe('Nocturne in F major');
  });

  it('ends a long title in an ellipsis inside the limit', () => {
    const long = 'Deep Focus Playlist Study Music for Better Concentration and Memory with Binaural Beats, Rain Sounds and Soft Piano for Hours';
    const out = clip(long, 60);
    expect([...out].length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(clip('one two three four', 9)).toBe('one two…');
  });

  it('never cuts an emoji in half', () => {
    const out = clip('Deep Focus Playlist 🔵 Study Music', 22);
    expect(out).toBe('Deep Focus Playlist 🔵…');
    expect(clip('🔵🔵🔵🔵', 3)).toBe('🔵🔵…');
  });

  it('caps at 120 characters by default', () => {
    expect([...clip('x'.repeat(500))]).toHaveLength(120);
  });
});
