# Plan: launch film v2 (the last stage, after 0.3.0)

Approved by the owner on 2026-10-08 ("yes"). Runs after the whole player (#51) ships in 0.3.0.

## What

Retake the launch film to a high standard: every important feature and every comparison with close competitors that matters. About 2 to 2.5 minutes, narrated with the local Kokoro voice (`bm_lewis`, en-gb), plain white subtitles with no background and the smooth caption handover approved in #43, a new silent README loop and an updated comparison table.

## Reuse

- `tests/e2e/demo-capture.e2e.ts` (`DEMO_CAPTURE=1`): 2x stills of the real extension into `demo/public/footage/`.
- `demo/`: `Film.tsx` and `Loop.tsx` driven by `timing.json`; `scripts/render.sh` (frame sequence, concurrency 1, stitched with ffmpeg-static: Remotion's own ffmpeg fails on macOS 13); `scripts/check-frames.mjs` gate.
- Real sounds rendered from `src/core/bell.ts` and `src/core/noise.ts` (with the new fades); public-domain Chopin in `demo/public/audio/`.
- `tests/e2e/bench.e2e.ts` and `bench/results/`.

## Stages

| # | Stage | Waits on | Limited by |
|---|---|---|---|
| A | 0.3.0 released | the player (#51) | the owner's listen and design checks |
| B | Benchmark: add StayFocusd and a popular Pomodoro extension, re-run all six | A | about 45 min of Chrome (6 extensions x 2 runs) |
| C | Feature and price table from official pages, dated | nothing | about 20 Firecrawl credits |
| D | Script and storyboard | B, C | the owner's OK on the script |
| E | Footage capture, headless | A, D | about 20 min of Chrome |
| F | Narration, one WAV per line | D | about 5 min of CPU |
| G | Render, frame gate, mix, loudness to -16 LUFS | E, F | about 1 to 1.5 h for ~4,500 frames |
| H | Owner review (stills, then the cut) | G | the owner |
| I | README loop and table, CHANGELOG, PR, merge | H | CI |

## Story

1. Hook: tabs pile up while you study.
2. The problem: blockers want an account and sit heavy in your browser.
3. Reveal: Study Duo, free, offline, open source.
4. Deadlines from the course calendar, Start.
5. The quiet corner clock (0.11 s of CPU per idle minute, on screen).
6. Site lock: the 10 s wait and the reason.
7. The popup player: the disc slides out and turns; White, Pink, Brown with the real noise; the tint changes.
8. Your music folder: library, a Chopin track, the seek line dragged to 0:57.
9. A YouTube link in the side panel, the card controlling it; the source list with service logos.
10. Music in your tabs: play, pause, skip.
11. The bell, the break words, one-tap rating.
12. Insights: "8 weeks of one simulated student" on screen.
13. Google Calendar: one sign-in, events appear by themselves.
14. Move to a new laptop with a QR code.
15. Comparisons: the measured table (size, script per page, CPU, outside servers: BlockSite 56, Study Duo 0) and the dated feature and price table against Cold Turkey, Freedom, Forest, Pomofocus, Brain.fm, Endel, Session, Opal, Focusmate. End card in signal red, one call to action.

## Rules

Real product footage only; insights from simulated students only, labelled; prices only from official pages, dated; $0; Coflazo authorship; no AI mention; captions and narration pass the stop-slop rules.

## Risks

| Risk | Mitigation |
|---|---|
| Third-party players on screen | YouTube: a public-domain video, licence checked at capture time. Spotify: only the "Signed in" row and the logo, never its player or cover art |
| Prices change | Every row dated, sources linked in `bench/results` |
| CPU noise between runs | Two alternating runs per extension, ranges shown |
| Slow render on this Mac | Concurrency 1 stays; render while other work runs |
