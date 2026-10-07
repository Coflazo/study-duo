import { formatClock } from './format';

/** Text for the corner clock: MM:SS, or H:MM once an hour is reached (the capsule has room for four digits). */
export function capsuleText(ms: number, countsUp: boolean): string {
  const full = formatClock(ms, countsUp);
  const parts = full.split(':');
  return parts.length === 3 ? `${parts[0]}:${parts[1]}` : full;
}
