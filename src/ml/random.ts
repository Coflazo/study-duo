/** A seeded generator (mulberry32) with a standard normal: simulations repeat exactly, and weekly suggestions stay put. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { u, normal: () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()) };
}

/** Sorted by startedAt; the rows that could overlap [from, to) when no row lasts longer than maxSpan. O(log n + k). */
export function overlapping<T extends { startedAt: number; endedAt: number }>(sorted: T[], from: number, to: number, maxSpan: number): T[] {
  let lo = 0;
  let hi = sorted.length;
  const first = from - maxSpan;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.startedAt < first) lo = mid + 1;
    else hi = mid;
  }
  const out: T[] = [];
  for (let i = lo; i < sorted.length && sorted[i]!.startedAt < to; i++) if (sorted[i]!.endedAt > from) out.push(sorted[i]!);
  return out;
}
