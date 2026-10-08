# Study Duo demo film

The 45-second loop in the README. Everything inside the browser window is a screenshot of the real extension, shot at 2x by `tests/e2e/demo-capture.e2e.ts`; this folder draws the window, pointer and captions around them in [Remotion](https://www.remotion.dev) and renders the film. The insights come from one simulated student (`src/ml/synthetic.ts`), and the film says so on screen.

## Rebuild it

From the repository root:

```sh
npm run build:test
DEMO_CAPTURE=1 npx playwright test tests/e2e/demo-capture.e2e.ts   # writes demo/public/footage
cd demo
npm ci
npm run render        # out/demo.mp4 and out/demo-poster.jpg, then the frame gate
sh scripts/gif.sh     # out/demo.gif for the README
```

`npm run stills -- 444 518` renders single frames (title card included) to `out/stills` for checking before a full render. Renders run one frame at a time on purpose; see the comments in `scripts/render.sh`.

## Credits

Built on the Agentic Product Demo kit by Alex Ibragimov (MIT, see `LICENSE`). Remotion is free for individuals and small teams under its own license.
