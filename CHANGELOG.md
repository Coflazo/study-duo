# Changelog

All notable changes to Study Duo are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Security

- Web pages can only ask about or file their own site; unlocking, modes and other domains stay with the extension's own pages. Only site names are stored, never full addresses. The blocked page refuses to work inside a frame and only ever opens http(s) addresses.

- Web pages can only report that the clock reached zero; every other timer command must come from the extension's own pages, judged by sender URL.
- The page overlay lives in a closed shadow root with constructed styles, survives pages that delete it or fake a script restart, and makes no network requests (checked end to end on a hostile page).

### Added

- Activity log while the timer runs: time per kind of site (Study, Blocked, Not blocked, unfiled) by site name only, time away from the browser counted as away, blocked-site attempts and unlocks, and, only if you turn it on, keys, clicks and scrolls per minute in study blocks.
- Focus signals for every study block, worked out from that log: share of time on Study sites, switches to Blocked or unfiled sites per hour, the longest study stretch, pauses, +5 extensions, whether it ran to the end, and how fast it started after a break.
- Music: songs playing on music sites (YouTube Music, YouTube, Spotify, Apple Music, SoundCloud, Tidal, Deezer, Amazon Music) become listens tied to the block they played in; white, pink and brown focus noise; your own MP3 or FLAC files, played in the Music screen.
- Your data: what Study Duo measures in plain words with one switch each, how much is stored, how long history is kept, export to one JSON file, and delete everything.

- Popup from the Figma screens: the phase sign, the amber board, Today as a timetable, and Start, Pause, Resume, Skip. Pick a to-do to work on before a study block; afterwards it asks once, "How focused were you?", from 1 to 5.
- Dashboard with Today (timer beside the timetable and to-dos), To-do (add with a course tag and an optional if-then plan, edit, reorder by keyboard, complete, delete with undo, start a block on a task), Site lock and Settings (lengths, daily goal, auto-start, bell volume with a preview, corner clock, Appearance).
- A local session log in IndexedDB that keeps every block and break, with its task and rating, for Today now and insights later.
- DESIGN.md describing the visual system as built.
- Drag the corner clock anywhere on a page; the spot is saved for every tab, open or new, measured from the nearest window edges so it stays put when the window resizes. Settings > Clock position puts it back in a corner.
- Settings > Clock when your mouse is away: Faint, Soft (default) or Full.

### Changed

- Hovering the corner clock now makes it grabbable, so a click on its body no longer reaches the page beneath it; drag it aside or close it to reach what is under it.

### Fixed

- When newer Study Duo files are on disk than the copy Chrome is running (no reload after an update), the popup and dashboard say "Study Duo has an update waiting." with a Reload button. A copy that missed a reload had kept the corner clock off tabs that were already open.
- A page that cannot get its corner clock is now reported on the extension's Errors page instead of failing silently.
- Tabs that were open across an install, an update or switching the extension off and on now get one working clock, without reloading the page.
- A quick "No task" in the Work on picker is never overwritten by the default.

- Site lock during study blocks: Close Blocked, or Allow only Study, which closes unfiled sites too. Tabs already open go to the blocked page, and everything opens again in the break.
- Three site categories (Blocked, Study, Not blocked), filed from the popup, the right-click menu, a one-time prompt beside the corner clock, or Settings > Sites, where sites can be added, moved and removed. The most specific entry wins, so music.youtube.com can stay open while youtube.com is closed.
- Blocked page with the time left in the block, Back to work, and Open anyway after a 10 second wait and a reason, for that block only. An optional hard lock removes it.

- Timer engine: Pomodoro and Flowtime modes, long breaks every fourth block, auto-start options, idle pause and keyboard shortcuts. Time comes from timestamps, so laptop sleep never drifts it and never invents sessions.
- App icon: one study cycle on a clock dial, 25 minutes red and 5 green, readable on light and dark toolbars.
- Toolbar dial that counts down while a timer runs: red study time drains, then the green break, grey with pause bars when paused. The badge shows minutes left (red, green or grey) and the tooltip says it in words.
- Corner clock on every page: a seven-segment display that stays at 15% opacity until the cursor comes near, never blocks clicks except on its close button, and hides in fullscreen.
- Phase words over the page with the bell: 560 hand-written lines in 8 moments that never repeat until a list runs out. Plain text with a soft halo, light or dark with the system theme.
- Design tokens and the Atkinson Hyperlegible fonts exported from Figma and bundled.
- A singing-bowl bell synthesized in the browser, with a notification as a fallback.
- Design system in Figma (Exam Hall and Platform Clock): tokens, components and screens.
- Plain-language README with a one-line install for macOS, Linux and Windows.
