import { formatClock } from './format';

/** Text for the corner clock: MM:SS, or H:MM once an hour is reached (the capsule has room for four digits). */
export function capsuleText(ms: number, countsUp: boolean): string {
  const full = formatClock(ms, countsUp);
  const parts = full.split(':');
  return parts.length === 3 ? `${parts[0]}:${parts[1]}` : full;
}

/**
 * What the corner clock shows and how long until it next changes (#41). With `seconds` false (the clock is dimmed)
 * it shows the minutes with both seconds digits unlit and wakes once a minute instead of once a second; the last
 * minute of a countdown always shows seconds. H:MM (an hour or more) changes once a minute either way.
 */
export function tickPlan(ms: number, countsUp: boolean, seconds: boolean): { text: string; nextInMs: number } {
  const full = capsuleText(ms, countsUp);
  const total = countsUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  // Until the displayed whole second changes, then whole seconds after that.
  const firstStep = countsUp ? 1000 - (ms % 1000) : ms % 1000 || 1000;
  const hours = total >= 3600;
  const lastMinute = !countsUp && total <= 60;
  if (!hours && (seconds || lastMinute)) return { text: full, nextInMs: firstStep };
  const s = total % 60;
  // A countdown's minute changes once its seconds pass :00; a count-up's when they reach :00.
  let nextInMs = firstStep + (countsUp ? 59 - s : s) * 1000;
  if (!countsUp && !hours) nextInMs = Math.min(nextInMs, firstStep + (total - 61) * 1000); // wake for the last minute
  return { text: hours ? full : `${full.slice(0, 2)}:  `, nextInMs };
}
