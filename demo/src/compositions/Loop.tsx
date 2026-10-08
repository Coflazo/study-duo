import { AbsoluteFill, useCurrentFrame } from "remotion";
import { EASE, ramp } from "../motion";
import { CAPTIONS, FILM_BEATS as B, FILM_CUES as CUE, FILM_LINES as L, FilmFrame } from "./Film";

/**
 * The README loop: a silent cut of the film (hook, start, clock, lock, noise, bell, insights, end card) with the same
 * burned captions. Each piece is a stretch of film frames; pieces dissolve into each other, and the loop opens and
 * closes on the same dark ground so the seam never flashes.
 */

/** Film frames [from, to) for each piece, cut on caption phrases so no caption is chopped. */
const phraseStart = (text: string) => CAPTIONS.find((c) => c.text.startsWith(text))!.s;
const PIECES: Array<[number, number]> = [
  [0, B.hook.e],
  [L["start-2"].s - 34, B.start.e],
  [B.clock.s, B.clock.e - 12],
  [B.lock.s, L["lock-1"].e + 14],
  [phraseStart("White") - 8, CUE.brown + 30],
  [CUE.bell - 30, L.bell.e + 10],
  [B.insights.s, L["insights-1"].e + 16],
  [B.end.s, B.end.e - 20],
];
const X = 10; // dissolve between pieces
const OUT = 18; // the end card sinks back to the dark ground the loop opens on

const STARTS = (() => {
  const s: number[] = [];
  let at = 0;
  for (const [a, b] of PIECES) {
    s.push(at);
    at += b - a - X;
  }
  return s;
})();
export const LOOP_LEN = STARTS[STARTS.length - 1] + (PIECES[PIECES.length - 1][1] - PIECES[PIECES.length - 1][0]);

export function Loop() {
  const f = useCurrentFrame();
  const layers = PIECES.map(([a, b], i) => ({ i, t: a + f - STARTS[i], len: b - a, at: STARTS[i] })).filter((p) => f >= p.at && f < p.at + p.len);
  return (
    <AbsoluteFill style={{ background: "var(--ground)" }}>
      {layers.map((p) => (
        <AbsoluteFill key={p.i} style={{ opacity: p.i === 0 || f >= p.at + X ? 1 : ramp(f, p.at, X, EASE.inOut) }}>
          <FilmFrame t={p.t} />
        </AbsoluteFill>
      ))}
      <AbsoluteFill style={{ background: "var(--ground)", opacity: ramp(f, LOOP_LEN - OUT, OUT - 2, EASE.inOut) }} />
    </AbsoluteFill>
  );
}
