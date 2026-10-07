# Product

<!-- impeccable:product-schema 1 -->

Source: the approved design spec, `docs/superpowers/specs/2026-10-07-study-duo-design.md` (2026-10-07). Facts below were confirmed by the owner during planning; open decisions are marked.

## Platform

web

## Stack

WXT (cross-browser Manifest V3) + TypeScript + Svelte 5 for the popup and dashboard, vanilla TypeScript for the on-page overlay, IndexedDB via `idb`, Vitest and Playwright. Chosen in the approved plan.

## Users

University students who study at a computer with a browser open. The first user is the owner, a university student who wants one tool for timing study blocks, keeping distractions shut, playing music, logging sessions to a calendar, and learning when and with what music they focus best. Later: any student who installs it from the open-source repo.

## Product Purpose

Make starting and keeping a study block easy, and turn the record of those blocks into personal, trustworthy advice: which hours of which days and which music go with real focus for this one person. Success means the owner uses it every study day and the insights it shows hold up.

## Positioning

Free, open source, no account, runs fully offline on the user's own computer, and keeps every piece of data in the browser. It combines a Pomodoro timer, an always-visible digital clock on every page, a site locker, a todo list, music, calendar logging and on-device learning in one extension. Competitors cover parts of this behind paywalls, accounts, or a single platform.

## Operating Context

Used in the browser all study day: a block starts from the toolbar or a keyboard shortcut, the clock sits in the corner of whatever page is open, blocked sites redirect during focus, a bell and a large fading phrase mark each phase change. Music plays from browser tabs (YouTube Music, Spotify Web, Apple Music web, SoundCloud) or from the user's own downloaded files. Sessions land in a local timeline, an `.ics` export, and optionally Google Calendar.

## Capabilities and Constraints

- Core features work with no internet. No Study Duo server exists. Data never leaves the browser unless the user turns on a named connection.
- Development costs $0. No paid stores, developer programs or services.
- Distribution is open source first: GitHub Releases plus a one-line installer. Stores are not planned.
- No Spotify Web API (Spotify's developer policy forbids using its content in ML models).
- A browser extension can block websites, not desktop apps.
- Insights need a few weeks of sessions and must not claim an effect the data cannot support.
- Undecided: Outlook sync depends on a free Microsoft app registration being possible without a card.

## Brand Commitments

- Name: Study Duo.
- The clock is a nostalgic 7-segment digital display.
- The phase-change sound is a soft bell or singing bowl.
- Copy is short and human; no em dashes.

## Evidence on Hand

None yet: no screenshots, testimonials or usage data exist. Do not invent users, numbers or quotes. Research citations behind product defaults are listed in the spec.

## Product Principles

1. Offline and private by default; every online feature is opt-in and says exactly what it sends.
2. Calm: quiet during focus, one clear signal at each phase change.
3. Honest numbers: show uncertainty, gate insights on enough data.
4. Research-backed defaults (fixed breaks, no lyrics for reading), easy to override.
5. Free forever, no account, nothing that needs a card.

## Accessibility & Inclusion

Respect `prefers-reduced-motion`, keyboard operation for every control, screen-reader announcements for phase changes, WCAG AA contrast in light and dark themes.
