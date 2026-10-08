/**
 * Caps a title at `max` characters, ending in "…" when it was longer. Counts characters as people see them, so an
 * emoji is never cut in half, and leaves no space before the ellipsis.
 */
export function clip(s: string, max = 120): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
