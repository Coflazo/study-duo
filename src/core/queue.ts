/** What plays next from a folder or a playlist: folder order or shuffled, with repeat. Items are track ids. */
export type Repeat = 'off' | 'all' | 'one';
export interface Queue {
  items: string[];
  /** Positions in `items`, in play order. */
  order: number[];
  /** Where in `order` the playing song is. */
  at: number;
  shuffle: boolean;
  repeat: Repeat;
}

export function newQueue(items: string[], start = 0): Queue {
  return { items, order: items.map((_, i) => i), at: Math.min(Math.max(0, start), Math.max(0, items.length - 1)), shuffle: false, repeat: 'off' };
}

export const current = (q: Queue): string | null => q.items[q.order[q.at] ?? -1] ?? null;

/** The queue moved to the next song, or null at the end with repeat off. */
export function nextIn(q: Queue): Queue | null {
  if (q.repeat === 'one') return q;
  if (q.at + 1 < q.order.length) return { ...q, at: q.at + 1 };
  return q.repeat === 'all' && q.order.length > 0 ? { ...q, at: 0 } : null;
}

/** Previous: like every player, more than 3 s in (or on the first song) it goes back to the start of this song. */
export function prevIn(q: Queue, positionMs: number): { queue: Queue; restart: boolean } {
  if (positionMs > 3_000 || q.at === 0) return { queue: q, restart: true };
  return { queue: { ...q, at: q.at - 1 }, restart: false };
}

export const setRepeat = (q: Queue, repeat: Repeat): Queue => ({ ...q, repeat });

/** Shuffle keeps the playing song playing and shuffles the rest after it; turning it off returns to folder order there. */
export function toggleShuffle(q: Queue, random: () => number = Math.random): Queue {
  const playing = q.order[q.at] ?? 0;
  if (q.shuffle) return { ...q, order: q.items.map((_, i) => i), at: playing, shuffle: false };
  const rest = q.items.map((_, i) => i).filter((i) => i !== playing);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return { ...q, order: q.items.length ? [playing, ...rest] : [], at: 0, shuffle: true };
}

/**
 * One source plays at a time. Picking another while something plays fades that out and starts the new one by itself;
 * picking while nothing plays only changes which one the card shows.
 */
export function handoff<S extends string>(state: { active: S | null; playing: boolean }, picked: S): { fadeOut: S | null; start: S | null; active: S } {
  if (picked === state.active) return { fadeOut: null, start: null, active: picked };
  if (state.playing && state.active) return { fadeOut: state.active, start: picked, active: picked };
  return { fadeOut: null, start: null, active: picked };
}
