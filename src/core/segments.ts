/** Seven-segment geometry shared by the corner clock and the popup board (same shapes as the Figma LED digit). */
export type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

export const DIGIT_W = 36;
export const DIGIT_H = 64;
const T = 7; // segment thickness
const G = 1.5; // gap between segments

const r = (n: number) => Math.round(n * 100) / 100;
const path = (pts: Array<[number, number]>) => `M ${pts.map(([x, y]) => `${r(x)} ${r(y)}`).join(' L ')} Z`;
const horizontal = (cy: number) =>
  path([[T / 2 + G, cy], [T + G, cy - T / 2], [DIGIT_W - T - G, cy - T / 2], [DIGIT_W - T / 2 - G, cy], [DIGIT_W - T - G, cy + T / 2], [T + G, cy + T / 2]]);
const vertical = (cx: number, y0: number, y1: number) =>
  path([[cx, y0 + G], [cx + T / 2, y0 + T / 2 + G], [cx + T / 2, y1 - T / 2 - G], [cx, y1 - G], [cx - T / 2, y1 - T / 2 - G], [cx - T / 2, y0 + T / 2 + G]]);

export const SEGMENT_PATHS: Record<Segment, string> = {
  a: horizontal(T / 2),
  b: vertical(DIGIT_W - T / 2, T / 2, DIGIT_H / 2),
  c: vertical(DIGIT_W - T / 2, DIGIT_H / 2, DIGIT_H - T / 2),
  d: horizontal(DIGIT_H - T / 2),
  e: vertical(T / 2, DIGIT_H / 2, DIGIT_H - T / 2),
  f: vertical(T / 2, T / 2, DIGIT_H / 2),
  g: horizontal(DIGIT_H / 2),
};

const LIT: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

/** Segments lit for a character; anything that is not a digit is blank. */
export function litSegments(ch: string): Set<Segment> {
  return new Set((LIT[ch] ?? '').split('') as Segment[]);
}
