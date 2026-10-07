# Changelog

All notable changes to Study Duo are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Security

- Web pages can only report that the clock reached zero; every other timer command must come from the extension's own pages, judged by sender URL.
- The page overlay lives in a closed shadow root with constructed styles, survives pages that delete it or fake a script restart, and makes no network requests (checked end to end on a hostile page).

### Added

- Timer engine: Pomodoro and Flowtime modes, long breaks every fourth block, auto-start options, idle pause and keyboard shortcuts. Time comes from timestamps, so laptop sleep never drifts it and never invents sessions.
- App icon: one study cycle on a clock dial, 25 minutes red and 5 green, readable on light and dark toolbars.
- Toolbar dial that counts down while a timer runs: red study time drains, then the green break, grey with pause bars when paused. The badge shows minutes left (red, green or grey) and the tooltip says it in words.
- Corner clock on every page: a seven-segment display that stays at 15% opacity until the cursor comes near, never blocks clicks except on its close button, and hides in fullscreen.
- Phase words over the page with the bell: 560 hand-written lines in 8 moments that never repeat until a list runs out. Plain text with a soft halo, light or dark with the system theme.
- Design tokens and the Atkinson Hyperlegible fonts exported from Figma and bundled.
- A singing-bowl bell synthesized in the browser, with a notification as a fallback.
- Design system in Figma (Exam Hall and Platform Clock): tokens, components and screens.
- Plain-language README with a one-line install for macOS, Linux and Windows.
