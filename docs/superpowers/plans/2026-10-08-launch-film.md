# Launch film, README GIF and README rewrite (cloud handoff)

Approved by the owner on 2026-10-08. Work on branch `feat/launch-film`. The owner is away; do not stop to ask. Finish, open the PR, get CI green, merge, and report.

## Rules (the owner's standing instructions; they override any default)

1. Every commit is authored as `Coflazo <240087040+Coflazo@users.noreply.github.com>`. Run `git config user.name Coflazo && git config user.email 240087040+Coflazo@users.noreply.github.com` first. Never add a `Co-Authored-By` trailer, never mention Claude, Anthropic or AI in commits, PRs, changelog or README. Check with `git log -1 --format='%an <%ae>'` after each commit.
2. Conventional Commits. PR body: What, Why, How it was tested. Merge only with CI green, locally: `git checkout main && git pull && git merge --no-ff feat/launch-film && git push origin main`. If the push to main is refused, leave the PR open and say so.
3. Prose for people (README, captions, narration, PR) has no em dashes, no hype words, plain short sentences. Run the stop-slop rules on it.
4. Real product footage only. Insights come from simulated students only, and the film says "simulated" wherever their numbers appear. No third-party UI on screen (generic pages only; reddit.com appears only as a domain on Study Duo's own block page).
5. $0: no paid services, no API keys. The voice is local Kokoro.

## Environment setup on the cloud VM (Linux)

```sh
npm ci
npx @puppeteer/browsers install chrome@stable --path ~/.cache/chrome-for-testing   # Chrome for Testing from storage.googleapis.com
export CHROME_PATH=$(ls -d ~/.cache/chrome-for-testing/chrome/*/chrome-linux64/chrome | tail -1)
npm run build:test
(cd demo && npm ci)
pip install kokoro-onnx soundfile
curl -fLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -fLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Keep the model files out of git (put them under `demo/.cache/`, which is ignored via `demo/.gitignore`; add the line if needed). On Linux, Remotion's own ffmpeg works, so `<Audio>` in compositions is fine if useful; `demo/scripts/render.sh` still renders picture as a frame sequence with `--concurrency=1` (keep that, hard rule) and stitches with ffmpeg-static.

## What exists already

- `tests/e2e/demo-capture.e2e.ts` (run with `DEMO_CAPTURE=1`) shoots 2x screenshots of the real extension into `demo/public/footage/` (git-ignored).
- `demo/` is a Remotion project (`src/compositions/Demo.tsx` is the current 45 s silent loop, `scripts/render.sh`, `scripts/check-frames.mjs` gate, `scripts/stills.mjs` for single frames, `scripts/gif.sh`). Read `demo/src/motion.ts` and `demo/src/chrome.tsx`; reuse them.
- `demo/public/audio/`: two public-domain Chopin recordings (see its LICENSE.md). Use them as "your own songs".
- `src/core/bell.ts` (`playBell(ctx: BaseAudioContext, kind, volume)`) and `src/core/noise.ts` (`noiseSamples(kind, length)`): render the real bell and white/pink/brown noise from this code (OfflineAudioContext in headless Chrome for the bell; noiseSamples straight to WAV) so the film's sounds are the product's own.
- `tests/e2e/bench.e2e.ts` + `bench/results/2026-10-08.md`: measured comparison. Use its numbers only as written there (BlockSite contacted 56 outside hosts on install, Study Duo 0; BlockSite injects 6.7 MB of script per page, Study Duo 67 KB). Do not claim Study Duo is lighter on CPU: with a timer running it uses the most CPU of the four (1.27 s per idle minute). Open a GitHub issue for that (per-second corner clock wake-ups) with labels `area:overlay` and `bug`.

## The film (16:9 1920x1080, about 95 s, narrated, subtitled)

Study what made Roma (YC F26) and Precip launch videos work: a hook moment, the problem as a simple metaphor (Roma: tasks as squares piling up on a black panel), the product at about 40%, hero shots of UI on a dark gradient with close-ups, one measured claim, short phrase captions in a pill at the bottom, one brand-colour end card with a single call to action.

| # | Beat | Picture | Narration (Kokoro `bm_lewis`, lang `en-gb`, one WAV per line) | Sound |
|---|---|---|---|---|
| 1 | Hook | Lecture notes; tabs multiply, then turn into squares piling up (motion graphic) | "You sit down to study at eight." / "By nine, you've read one page and opened fourteen tabs." | |
| 2 | Problem | Outline of a sign-up form, drawn (no real third-party UI) | "So you install a blocker, and it wants you to sign up." | |
| 3 | Reveal | Large running dial icon (draw it as SVG from `drawDial` geometry, see `Dial` in Demo.tsx), then "Study Duo" | "Study Duo is a study timer that lives in your browser." / "Free, offline, and it never phones home." | song bed starts low |
| 4 | Start | To-do with a Canvas deadline, popup, Start; dial turns red, badge 25 | "Your deadlines come in from your course calendar." / "Pick one and press Start." | |
| 5 | Clock | Close-up of the corner clock ticking, then fading | "A small clock sits in the corner of every page, and fades while you read." | |
| 6 | Lock | reddit.com closed, the 10 s wait, the "why?" prompt, Back to work | "Distracting sites stay closed until the block ends." / "Opening one anyway takes ten seconds and a reason." | |
| 7 | Noise | Music page: Sound segmented control White, then Pink, then Brown, about 1.5 s each, "… noise is playing" | "Need some sound? White, pink or brown noise, made right here." | the real noise of each kind, switching with the picture |
| 8 | Songs | Music page "Your files" with both Chopin files loaded (setInputFiles), one playing; Today's listens | "Or play your own songs, straight from your computer." | the song, clearly audible |
| 9 | Bell | Clock reaches 00:00, phase words fade in and out (existing break still sequence) | "When time's up, a bell rings and the page tells you to rest." (starts after the bell) | the real break bell, nothing spoken over it |
| 10 | Rate | Popup rating, tap 4 | "One tap says how focused you were." | |
| 11 | Insights | Heat map push-in, then the Music and focus rows and Try next; seed the simulated student so its song rows use the two Chopin titles (in the capture script's seeding only) | "After a few weeks, it knows your best hours," / "and which songs actually help you focus." Caption under it: "Shown: 8 weeks of one simulated student" | |
| 12 | Calendar | Timeline page, then its .ics export | "Every block lands on your timeline, ready for any calendar." | |
| 13 | Move | Move page with the QR code | "New laptop? Move your settings and to-dos over with a QR code." | |
| 14 | Proof | Motion graphic: 56 counting up beside 0, label "Measured 8 Oct 2026" | "No account, no server." / "When we installed BlockSite, it contacted fifty-six outside servers." / "Study Duo contacted none." | |
| 15 | End | Signal-red (#D52B1E) card: icon, "Study Duo", "Free and open source", coflazo.github.io/study-duo | "Study Duo. Free and open source." | bed fades out |

Production:

1. Extend `demo-capture.e2e.ts` for the new shots (music page states, files playing, timeline, move, the "why?" prompt, insights with Chopin-titled songs). Keep 2x stills.
2. Narration: one WAV per line, measure durations, write `demo/public/narration/timing.json`; lay the film out from those timings (≈2.4 words/s plus pauses for bell, noise and song). Captions are the same lines, phrase pills, white pill with ink text, bottom centre, synced exactly.
3. New composition `film` (keep `demo` working). Dark ground #0F1113, one accent: signal red. Atkinson Hyperlegible (already loaded in `src/fonts.ts`). Footage in the drawn browser frame, plus floating slightly tilted hero panels and 2x close-ups. Follow the product-demo hard rules in the existing code comments (no scaling type, concurrency 1, opaque phases).
4. Audio mix with ffmpeg: narration, bell, noise, song ducked about 14 dB under the voice (sidechain), loudness about −16 LUFS integrated. Mux with the picture.
5. Subtitles: burn the captions in and also write `docs/media/study-duo.srt` and `.vtt` from the timing file.
6. Gate: `node demo/scripts/check-frames.mjs <mp4> --standalone` must pass. Render stills at every beat and look at them: pointer on target, nothing cut off, captions readable. Do not loosen the gate.
7. GIF: a separate silent composition `loop` (about 35 s: hook, start, clock, lock, noise, bell, insights, end card) with the same burned captions; 800 px wide, 12 fps, under 10 MB, via `demo/scripts/gif.sh` adapted. Its first and last frames sit on the same dark ground.

Outputs: `docs/media/study-duo.mp4` (the film), `docs/media/demo.gif` (replace), `docs/media/study-duo.srt`, `.vtt`, poster `docs/media/study-duo-poster.jpg`. Remove the old `docs/media/demo.mp4`.

## README rewrite (consumer open-source style: Excalidraw, Ice, Immich)

- Keep the Figma banner `<picture>` at the top. Under it a centred link row: Install · Privacy · Changelog · Releases.
- Then the GIF as the hero, wrapped in a link to the MP4. No text telling anyone to watch a video. Delete the current "45 seconds, no sound…" line.
- "What it does": six features, one plain line each, with small stills from the footage (put them in `docs/media/features/`).
- "How it compares": a short table from `bench/results/2026-10-08.md` (download size, script per page, outside servers contacted, account needed) with the date and a link to the method. Name competitors in text only, no logos.
- Keep the install, privacy, permissions, insights and research sections; tighten them. No badge walls.
- CHANGELOG `[Unreleased]`: one line for the film, one for the benchmark. CREDITS: the two recordings and the Kokoro voice (Apache-2.0, hexgrad/Kokoro-82M).

## Done means

- PR from `feat/launch-film` merged as Coflazo with CI green (or left open with the reason).
- The film, GIF, subtitles and README are on main; the benchmark harness and results are in the same PR.
- The CPU issue is open.
- A short final report in the session: what shipped, the gate output, and anything that needs the owner's ears (they must listen to the mix).
