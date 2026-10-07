# S6 Activity Log, Focus Signals and Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start collecting the local data the insights need (time per site category, blocked attempts, quiet focus signals per block, songs listened to) and give music a home: detection in music tabs, generated focus sounds, and a player for the user's own files, with a screen that says exactly what is measured and lets the user export or delete it.

**Architecture:** IndexedDB moves to schema v2 with `listens`, `activity` and `blocks` stores beside `sessions`. The background keeps an event-driven activity tracker (tab activation, URL change, window focus, idle state) that writes category segments while the timer runs; no per-minute polling. Signals are a pure function of a block's activity, blocked attempts and session record, stored on the session when the block ends. The overlay content script reads `navigator.mediaSession` on known music hosts and reports now-playing to the background. Focus sounds are generated in the offscreen document; the user's files play in the dashboard's Music screen.

**Tech Stack:** WXT 0.21 (MV3), TypeScript strict, Svelte 5, idb 8, fake-indexeddb for unit tests, Vitest + fake-browser, Playwright + Chrome for Testing.

**Spec:** `docs/superpowers/specs/2026-10-07-study-duo-design.md` (Implicit focus signals; Music; Data logging from day 1; Storage; Security & privacy). Issue #8.

## Global Constraints

- No network; nothing leaves the browser. Records hold site names only (never full addresses, titles or page text); listens hold title, artist, album and the music host.
- No new permissions beyond those already granted (`tabs` and `webNavigation` stay out; `idle` and host access already exist).
- Activity and signals are recorded only while the timer runs (study blocks and breaks); input counting only in running study blocks and only when the user turns it on (off by default); never which key, never password fields.
- Unobserved time (idle, locked, another app, Chrome's PDF viewer) is recorded as unobserved, never as distraction.
- Every signal has its own switch on "What Study Duo measures"; Your data offers export (JSON), delete all and a retention period (default 365 days).
- Event-driven: no alarms or intervals added for tracking; counters flush once a minute and on `pagehide`.
- Figma first for the Music screen and the measures screen; tokens and components from DESIGN.md.
- Copy rules as before; commits as Coflazo; branch `feat/s6-activity-music`; PR closes #8.

## Review Focus

1. **Schema upgrade:** v1 databases with sessions and ratings must open as v2 without losing a record; a newer version must still be refused. Test: upgrade test with fake-indexeddb.
2. **Tracker edge cases:** switching windows, closing the active tab, a DevTools window, sleep and lock, Chrome losing focus to another app, a page that navigates within an SPA; time must never double count or run while the timer is stopped. Test: tracker reducer table.
3. **Untrusted page input:** a page can fake `navigator.mediaSession` or post junk; listens must be length-capped, rate-limited and accepted only from known music hosts; input counts only as small integers, at most one report per minute per tab. Test: message gates.
4. **Privacy promises:** no URL path, query or title anywhere in the stores; switches off means nothing recorded for that signal; delete all clears every store. Test: store scans in E2E.
5. **Battery and CPU:** no new periodic wake-ups in the background; the music probe polls only on music hosts and backs off when nothing plays. Test: assert no new alarms; probe interval test.

---

### Task 1: Event log schema v2 and retention
**Files:** `src/core/db.ts` (move `open()` here from sessions.ts, v2 upgrade), `src/core/sessions.ts`, `src/core/log.ts` (+ tests), `src/core/settings.ts` (`retentionDays`, `measure` switches, `inputCounting`).
- Stores: `listens` (id, host, title, artist, album, startedAt, endedAt, sessionId), `activity` (id, startedAt, endedAt, category: study | blocked | neutral | unfiled | unobserved, domain, phase, keys, clicks, scrolls), `blocks` (id, at, domain, unlocked, reasonGiven). Indexes on time.
- `purgeOlderThan(days, now)`; `exportAll()`; `deleteAll()`.
- Tests: v1 to v2 upgrade keeps sessions and ratings; purge; export shape; delete all.

### Task 2: Activity tracker
**Files:** `src/core/activity.ts` (pure reducer + tests), `src/background/activity.ts` (wiring), `src/entrypoints/background.ts`.
- Reducer: events `focus(domain|null)`, `away`, `back`, `timer(running|stopped, phase)`; emits closed segments with category from `categoryFor` (unfiled when none); ignores time while stopped; merges same-category runs.
- Wiring: `tabs.onActivated`, `tabs.onUpdated` (url of the active tab), `windows.onFocusChanged` (WINDOW_ID_NONE = away), `idle.onStateChanged`, timer changes; writes segments to `activity`.
- Tests: reducer table (window switch, tab close, idle, lock, stop mid-segment, SPA URL change, no double count).

### Task 3: Blocked attempts
**Files:** `src/entrypoints/blocked/App.svelte`, `src/core/log.ts`.
- The blocked page records one attempt per load (domain, time) and marks it unlocked when Open anyway succeeds, with `reasonGiven: true` (never the text).
- Test: E2E extension in site-lock suite.

### Task 4: Focus signals per block
**Files:** `src/core/signals.ts` (+ tests), `src/background/effects.ts`, `src/core/sessions.ts` (`signals` field).
- `blockSignals({ session, activity, blocks, previousBreakEnd })` returns studyShare, offSwitchesPerHour, blockedAttempts, unlocks, longestStudyMs, unobservedMs, pausedMs, extensions, startDelayMs, and input shares when present.
- Computed when a study block ends and stored on its session record; switches off drop the matching fields.
- Tests on synthetic timelines.

### Task 5: Opt-in input counts
**Files:** `src/overlay/input-counter.ts` (+ test), overlay content script, `src/core/messages.ts`, background.
- Counts keydown, pointerdown and wheel per minute in running study blocks when `inputCounting` is on; skips events from password fields; flushes once a minute and on `pagehide` as `{ kind: 'counts', minute, keys, clicks, scrolls }`; background accepts at most one per tab per minute, integers 0 to 10 000.

### Task 6: Music detection in tabs
**Files:** `src/overlay/music-probe.ts` (+ test), overlay content script, `src/core/listens.ts` (+ test), background.
- On music hosts (YouTube Music, YouTube, Spotify Web, Apple Music web, SoundCloud, Tidal, Deezer, Amazon Music), read `navigator.mediaSession.metadata` and `playbackState` every 5 s while playing, 30 s otherwise; report changes only.
- Background validates (host from `sender.url`, strings up to 200 chars, at most one report per 2 s per tab) and folds reports into listens (same track continues, pause closes, new track opens).
- Tests: probe change detection, listen folding, gate; E2E with a routed music page that sets mediaSession.

### Task 7: Focus sounds
**Files:** `src/entrypoints/offscreen/main.ts`, `src/core/noise.ts` (+ test), messages.
- White, pink and brown noise generated with Web Audio (no files, no licence), volume, play and stop; survives the popup closing.

### Task 8: Your own music files
**Files:** `src/core/id3.ts` (+ test with a fixture buffer), `src/entrypoints/dashboard/Music.svelte`.
- Pick files (`<input type="file" multiple accept="audio/*">`), read title, artist, album and genre from ID3v2 (TIT2, TPE1, TALB, TCON), queue and play in the page, log listens with host `file`.
- Ruling: files are picked per session; a persistent library (File System Access) waits for a measured need.

### Task 9: Music screen (Figma first)
- Dashboard route `#music`: Now playing (from tabs), Focus sounds, Your files, Today's listens. Responsive, light and dark.

### Task 10: What Study Duo measures and Your data (Figma first)
- Dashboard route `#data`: the plain-language list from the spec with one switch per signal, input counting off by default, retention, Export my data (JSON download), Delete everything (typed confirmation). PRIVACY.md updated to match.

### Task 11: Carry-over minors
- One-tick guard and `.catch` for pages at 00:00; Today refreshes on a storage key bumped after the session write instead of a timer guess; focus returns after rating and inline edit; rating keys' tab stop follows the arrows; row menu arrow keys.

### Task 12: End-to-end checks and docs
- E2E: activity rows during a block on routed hosts (study, blocked, unfiled), nothing recorded while stopped or with switches off; a listen from a routed music page; export contains no URL paths or titles; delete all empties every store; focus sounds start and stop. CHANGELOG.

## Self-review notes
- Spec coverage: data logging from day 1 (sessions, listens, domain time, blocked attempts), ship-first signals 1 to 7 (8, lecture video events, waits for S7 when the index needs it), tab music detection, local music and focus sounds, measures screen with switches, export, delete, retention.
- Rulings needed and taken: activity only while the timer runs (spec: signals only during study blocks; breaks give the "leisure before a block" feature); files per session instead of a persistent library.
