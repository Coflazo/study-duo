# Credits

Study Duo is built on other people's open work. Thank you.

## Fonts

- **Atkinson Hyperlegible Next** and **Atkinson Hyperlegible Mono**, by the Braille Institute of America and the Atkinson Hyperlegible project authors. SIL Open Font License 1.1. Bundled in `public/fonts/`, license text in [public/fonts/OFL.txt](public/fonts/OFL.txt).

## Icons

- **Phosphor Icons** (Bold weight), by Helena Zhang and Tobias Fried. MIT License. https://phosphoricons.com

## Sound

- The bell is synthesized in the browser with the Web Audio API (singing-bowl partials). There is no recording, so there is nothing to license.

## Code and ideas

- **WXT** (MIT) builds the extension for every browser.
- **idb** by Jake Archibald (ISC) wraps IndexedDB.
- **qrcode-generator** by Kazuhiko Arase (MIT) draws the QR codes. QR Code is a registered trademark of DENSO WAVE INCORPORATED.
- **jsQR** by Cosmo Wolfe (Apache License 2.0) reads move codes from the camera; it loads only when you press Scan. https://github.com/cozmo/jsQR
- The seven-segment digits are drawn from scratch as SVG, modelled on platform departure boards.
- Design direction chosen with the Impeccable design skill; research sources for the default settings are listed in the README.

## Launch film

- The film and the README loop in `docs/media` are composed with **Remotion** (free for individuals under the Remotion License, https://www.remotion.dev/license) from the **Agentic Product Demo** kit by Alex Ibragimov (MIT, kept in `demo/LICENSE`). Every page in it is a screenshot of the real extension; the insights show one simulated student.
- The voice is **Kokoro-82M** by hexgrad (Apache License 2.0, https://huggingface.co/hexgrad/Kokoro-82M), voice `bm_lewis`, run on this computer with kokoro-onnx (MIT).
- Music: Frédéric Chopin, Waltz in A-flat major, Op. 69 No. 1, played by Luke Faulkner for Musopen (Public Domain Mark 1.0), and Nocturne in F major, Op. 15 No. 1, from Musopen's Complete Chopin Collection (CC0 1.0). Sources in `demo/public/audio/LICENSE.md`.
- The bell and the white, pink and brown noise in the film are made by Study Duo's own code (`src/core/bell.ts`, `src/core/noise.ts`).
