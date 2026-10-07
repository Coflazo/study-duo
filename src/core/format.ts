const pad = (n: number) => String(n).padStart(2, '0');

/** Countdowns round up (25:00 shows for the first second), count-ups round down. */
export function formatClock(ms: number, countsUp: boolean): string {
  const total = Math.max(0, countsUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
