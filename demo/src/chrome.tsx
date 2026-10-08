import { EASE, ramp } from "./motion";

/**
 * The pointer: its path, its press, and the arrow itself. The browser window the film is drawn in lives in
 * compositions/Demo.tsx, and the no-camera-on-chrome rule (skill hard rule 2) binds it: only the page footage
 * inside it ever scales.
 */

/** Piecewise cursor path. Keys are absolute frames; between them the
 *  pointer travels on an in-out cubic so it never teleports between
 *  targets. A cursor that jumps is the fastest way to break the illusion —
 *  faster than any of the panels behind it. */
export function trackPos(
  frame: number,
  keys: { at: number; x: number; y: number }[],
) {
  let i = 0;
  while (i < keys.length - 1 && frame >= keys[i + 1].at) i += 1;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  if (a.at === b.at) return { x: a.x, y: a.y };
  const t = ramp(frame, a.at, b.at - a.at, EASE.inOutCubic);
  return {
    x: Math.round(a.x + (b.x - a.x) * t),
    y: Math.round(a.y + (b.y - a.y) * t),
  };
}

/** True for the 6 frames after each click beat. Pair it with press() from
 *  motion.ts so the button answers on the same frames the pointer dips. */
export function downAt(frame: number, beats: number[]) {
  return beats.some((b) => frame >= b && frame < b + 6);
}

export function Cursor({
  x,
  y,
  down,
}: {
  x: number;
  y: number;
  down: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 34,
        height: 34,
        /* The dip is on the pointer itself, not on anything behind it, and
         * it returns to exactly 1. */
        transform: `translate(-3px, -2px) scale(${down ? 0.82 : 1})`,
        transformOrigin: "3px 2px",
        zIndex: 50,
        pointerEvents: "none",
        filter: "drop-shadow(0 2px 6px oklch(0 0 0 / 0.45))",
      }}
    >
      <svg width="34" height="34" viewBox="0 0 28 28">
        <path
          d="M4 3.5 L4 24 L11.2 17.4 L17.8 26.2 L21.2 24.2 L14.8 15.6 L24 15.6 Z"
          fill="white"
          stroke="oklch(0.15 0 0)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
