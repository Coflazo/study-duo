# Study Duo launch film

The narrated film (`docs/media/study-duo.mp4`) and the silent loop at the top of the README (`docs/media/demo.gif`). Everything inside the browser window, the side panel and the popup is a screenshot of the real extension, shot at 2x by `tests/e2e/demo-capture.e2e.ts`; the record player's turning disc is one screenshot per film frame. The bell and the noise are made by Study Duo's own code, the songs are two public-domain Chopin recordings (`public/audio/LICENSE.md`), the YouTube link plays NASA's public-domain "The Earth: 4K Extended Edition" (`public/footage-credits.md`), and the voice is Kokoro, run locally. The insights come from one simulated student (`src/ml/synthetic.ts`), and the film says so on screen.

## Rebuild it

From the repository root:

```sh
npm run build:test
DEMO_CAPTURE=1 npx playwright test tests/e2e/demo-capture.e2e.ts   # writes demo/public/footage
cd demo
npm ci
pip install kokoro-onnx soundfile
mkdir -p .cache && (cd .cache && \
  curl -fLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx && \
  curl -fLO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin)
python3 scripts/narrate.py        # one WAV per line, and public/narration/timing.json
node scripts/sounds.mjs           # the bell and the noise, from src/core (CHROME_PATH=<a Chrome> if Playwright's own is not installed)
DELIVER=1920:1080 STANDALONE=1 sh scripts/render.sh film 760   # the picture, then the frame gate
node scripts/mix.mjs              # the sound, muxed: out/study-duo.mp4
node scripts/subtitles.mjs        # docs/media/study-duo.srt and .vtt
DELIVER=1920:1080 sh scripts/render.sh loop 0 && sh scripts/gif.sh   # out/demo.gif
sh scripts/features.sh            # the README's feature stills
```

`timing.json` is the film's clock: when each beat starts, when each line is spoken, when each sound plays and the caption phrases. The composition, the mix and the subtitles all read it, so a line that runs long moves all three together.

`npm run render` still renders the older 45-second `demo` composition. `COMP=film node scripts/stills.mjs 455 849` renders single frames to `out/stills` (after `npx remotion bundle src/index.ts --out-dir out/bundle`). Renders run one frame at a time on purpose; see the comments in `scripts/render.sh`.

## Credits

Built on the Agentic Product Demo kit by Alex Ibragimov (MIT, see `LICENSE`). Remotion is free for individuals and small teams under its own license. The voice is Kokoro-82M by hexgrad (Apache-2.0).
