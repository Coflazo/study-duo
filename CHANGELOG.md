# Changelog

All notable changes to Study Duo are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Connections, a new dashboard screen, each connection off until you turn it on:
  - Course deadlines: paste your course calendar link (Canvas: Calendar, then Calendar feed; Moodle or any .ics link works) and what is due in the next 8 weeks becomes to-dos with their due date, checked every 6 hours. Lectures are left out; a deadline you delete stays deleted; your edits stay.
  - Listening history: connect ListenBrainz (no key) or Last.fm (your own free API key), and songs your phone and desktop apps played during study blocks count, like the songs in your tabs.
  - A QR code that opens a page on your phone explaining how to send what you play to ListenBrainz or Last.fm.
- To-do rows show due dates, in red when less than a day is left or the date has passed.

### Changed

- Releases are published by the repository owner with `scripts/publish-release.sh`, from the zips the release workflow built and attested. No CI job can write to the repository any more.

## [0.1.0] - 2026-10-08

The first release. Everything runs in your browser, offline, with no account.

### Added

**Timer**

- Pomodoro and Flowtime modes, a long break every fourth block, auto-start options, idle pause and keyboard shortcuts. Time comes from timestamps, so laptop sleep never drifts it and never invents sessions.
- A singing-bowl bell synthesized in the browser, with a notification as a fallback, and phase words over the page: 560 hand-written lines in 8 moments that never repeat until a list runs out.
- Toolbar dial that counts down while a timer runs: red study time drains, then the green break, grey with pause bars when paused. The badge shows minutes left and the tooltip says it in words.

**Corner clock**

- A seven-segment clock on every page, open tabs included, that stays faint until the cursor comes near and hides in fullscreen. Settings > Clock when your mouse is away: Faint, Soft or Full.
- Drag it anywhere; the spot is saved for every tab, measured from the nearest window edges so it stays put when the window resizes. Settings > Clock position puts it back in a corner.

**Site lock**

- Three site categories (Blocked, Study, Not blocked), filed from the popup, the right-click menu, a one-time prompt beside the clock, or Settings > Sites. The most specific entry wins, so music.youtube.com can stay open while youtube.com is closed.
- During study blocks: Close Blocked, or Allow only Study, which closes unfiled sites too. Tabs already open go to the blocked page, and everything opens again in the break.
- Blocked page with the time left, Back to work, and Open anyway after a 10 second wait and a reason, for that block only. An optional hard lock removes it.

**Popup, dashboard and to-dos**

- Popup with the phase sign, the amber board, Today as a timetable, and Start, Pause, Resume, Skip. Pick a to-do before a study block; afterwards it asks once, "How focused were you?", from 1 to 5.
- Dashboard: Today, To-do (course tags, if-then plans, keyboard reordering, delete with undo, start a block on a task), Insights, Timeline, Music, Site lock, Settings and Your data.
- Light and dark follow the system, or pick one in Settings > Appearance.
- When newer files are on disk than the copy the browser is running, the popup and dashboard say "Study Duo has an update waiting." with a Reload button.

**Music**

- Songs playing on music sites (YouTube Music, YouTube, Spotify, Apple Music, SoundCloud, Tidal, Deezer, Amazon Music) are noted while the timer runs and tied to the block they played in.
- White, pink and brown focus noise, and your own MP3 or FLAC files, played in the Music screen.

**Your data**

- While the timer runs: time per kind of site by site name only, time away from the browser, blocked-site attempts and unlocks, and, only if you turn it on, keys, clicks and scrolls per minute in study blocks.
- Focus signals for every block: share of time on Study sites, switches away per hour, the longest study stretch, pauses, +5 extensions, whether it ran to the end.
- A screen that says what Study Duo measures in plain words with one switch each, how much is stored, how long history is kept, export to one JSON file, and delete everything.

**Insights**

- Your best hours: a map of expected focus by day and hour, best windows for weekdays, the weekend and any day that differs, music compared with silence, a sound and a block length to try for the week, and how accurate it is. A Bayesian model with grouped priors works it out on your computer and shows only what your data supports.
- Once your focus signals predict your ratings well, they fill in the blocks you skipped, so Study Duo asks less often.

**Timeline**

- Every study block and break by day or week, with the task and rating, and Export to calendar: one .ics file for Google Calendar, Apple Calendar or Outlook. Importing it again updates the same events. Settings > Calendar adds the songs that played.

**Install**

- One line for macOS, Linux and Windows that downloads the latest release, checks its checksum (and its build attestation when the GitHub CLI is signed in), unpacks it into a visible Study Duo folder and opens the extensions page. The same line updates it; `--uninstall` removes it.
- An install page at coflazo.github.io/study-duo that shows the right line for your computer.
- Releases built by GitHub Actions from a tag, with SHA-256 checksums and build provenance attestations.

### Security

- Web pages can only report that the clock reached zero, ask about or file their own site, and report what plays on known music sites. Every other command must come from the extension's own pages, judged by sender URL.
- Only site names are stored, never full addresses, typed text or page content. The extension makes no network requests.
- The page overlay lives in a closed shadow root with constructed styles and survives pages that delete it or fake a script restart.
- The blocked page refuses to work inside a frame and only ever opens http(s) addresses.
- Only Study Duo's own redirects can log a blocked attempt: they carry a random key kept per browser session, so a page that opens or frames the blocked page writes nothing.
- Study Duo does not run in private (Incognito) windows.
- Calendar export escapes semicolons and every kind of line break, and song titles lose control characters, so a song title cannot add lines to an .ics file.
- Releases are built in a job that can only read the repository; a separate job with no package code attests the zips and publishes them.
- The installers accept a different download address only over HTTPS, or plain HTTP to this computer for tests, and say so when one is set.

[Unreleased]: https://github.com/Coflazo/study-duo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Coflazo/study-duo/releases/tag/v0.1.0
