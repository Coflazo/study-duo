# Study Duo: product + build plan

Spine: superpowers (brainstorming, architectural path). Approving this plan = approving the design spec. Next steps after approval: commit spec to repo, then `writing-plans` per stage, then TDD.

## Context

Cagan wants one browser extension that makes studying easier and smarter:
Pomodoro timer, a nostalgic digital clock floating on every page, a site/tab locker during focus,
music (online services + offline downloaded music), a soft bell and big fading phase text,
automatic logging of every study/break session to a calendar, a todo list, and on-device ML that
learns which music and which hours make *this* user productive.
Hard rules added mid-planning: works fully offline on the computer's own compute, no data stored
online (all local), secure enough for anyone to trust, free, $0 development cost.
Built for Cagan's own Chrome first; public store release is a later stage on his go.

Project folder `~/Desktop/Projects/study-duo` is empty (greenfield). GitHub: `Coflazo/study-duo` (to create).

## Decisions locked (from Cagan's answers)

| Topic | Decision |
|---|---|
| Offline | Core product needs no internet ever. No Study Duo server exists. All data in the browser profile. |
| Calendar | Always: built-in local timeline + `.ics` export. Opt-in: Google / Outlook sync, browser talks straight to the provider. |
| Music | Online services allowed. Offline: plays the user's downloaded music files + bundled focus sounds. |
| Phone music | Allowed, set up through a QR code (see Music section for how). |
| QR | Not for logins (one-click). Used for: phone music setup, and moving settings/todos between your own devices offline. |
| Release | **Now: personal.** Built for you, loaded unpacked in your Chrome with a fixed extension ID (`key` in manifest) so OAuth stays stable. Repo public on GitHub (open source, no secrets in it; your keys live only in the extension's settings). **Later (separate stage):** Firefox Add-ons + Edge Add-ons (free) + GitHub Releases zip for Chrome; Chrome Web Store only if you ever accept its $5 fee. |
| Price | Free for users. No paywall, no ads, no tracking. |
| Dev cost | **$0 total.** Free tiers only: GitHub (public repo, Actions, Pages, CodeQL, attestations), Figma Education, Google Cloud project without billing, Last.fm/ListenBrainz free keys, OFL fonts, CC0 sounds. Nothing that needs a card. |

## Honest constraints (no way around these)

1. **"100% secure" is not a promise anyone can keep.** What we can deliver: no server, no telemetry, no remote code, least-privilege permissions, local-only data, open source, verifiable builds, audits. Details in Security.
2. **No Spotify API at all.** Spotify's Developer Policy (2025-05-15) forbids putting Spotify content into any ML model or building listener profiles, which is our core feature. Also: dev mode = 5 users max and the app owner needs Premium (not $0); Extended Quota needs a company with 250k MAU; recommendations / audio-features / related-artists removed (2024-11-27). Spotify listening still counts through (a) the Spotify Web Player tab, read locally like any music tab, and (b) Spotify's own built-in Last.fm connection for desktop and phone apps.
3. **Phone apps cannot be read directly** by a browser extension (iOS forbids apps reading each other's now-playing). Route: phone app sends plays to a free listening account (Last.fm or ListenBrainz); the extension reads that account; a QR opens the setup on the phone.
4. **Google Calendar, personal now:** free Google Cloud project (no billing), OAuth consent screen set to "In production" without verification: you click past "Google hasn't verified this app" once, tokens do not expire weekly (that 7-day limit only applies to "Testing" status), fine for up to 100 users. **At public release** Google verification is needed (free, privacy policy on `coflazo.github.io` verified in Search Console, days to weeks of review).
5. **$0 rule consequences:** no Chrome Web Store ($5) → Chrome users install from GitHub Releases ("Load unpacked", Chrome shows a developer-mode notice). No Safari ($99/yr Apple program, and Safari has no `identity` API anyway) → Safari only as build-from-source for people with Xcode. Outlook sync ships only if a Microsoft app registration is possible without a card; otherwise Outlook users use `.ics`.
5b. **Reading music tabs is a terms-of-service gray zone** (Web Scrobbler has done it for years). We read `navigator.mediaSession`, the metadata the page itself publishes to the browser's media controls, locally, never sent anywhere.
6. **"Block apps" = websites only.** A browser extension cannot block desktop apps.
7. **Every-site clock needs `<all_urls>`.** Chrome shows "read and change all your data on all websites" at install (and store review is slower later). Unavoidable for the overlay; mitigated by open source and a content script that only draws the clock.
8. **Language: TypeScript, not C.** TS compiles to JS that runs in every browser. The ML is small closed-form math (<10 ms per refit). C/Rust→WASM only if profiling ever demands it.

## Features

### v0.1 (first public release, fully offline)
- **Timer:** Pomodoro 25/5, long break 15 every 4 (all editable); preset 12/3; Flowtime count-up option. Start / pause / skip / +5 min / reset. Auto-start toggles. Idle auto-pause (`chrome.idle`). Keyboard shortcuts (`chrome.commands`).
- **Toolbar icon:** idle = default icon. Running = progress ring drawn on `OffscreenCanvas` + badge minutes left (`24`, then `<1`), phase color.
- **Overlay clock:** small 7-segment clock top-right of every page, counting down. ~15% opacity, full on cursor approach, click-through until the cursor is near (so it never blocks page buttons). × to hide on this page; global on/off in popup + settings; corner choice; hidden in fullscreen video.
- **Phase announcement:** bell + big centered text ("Break's over", "Study time") fades in, holds, fades out slowly. ~300 hand-written lines across ~12 moments, no repeats (shuffle bag).
- **Tab locker:** during focus, blocklist mode or allowlist mode ("only these sites + my music sites"). Blocked tabs go to a calm blocked page (time left, current task). Unlock = 10 s wait + "why?" prompt (research: Grüning 2023); opt-in hard lock.
- **Todo:** add / edit / reorder / complete / delete, optional course tag, pick a task as the session's intention. Done items in calendar event title.
- **Intention + rating:** before focus, pick a task (+ optional if-then plan). After focus, one-tap 1-5 focus rating (skippable) = the ML label.
- **Music v0.1:** detect now-playing in browser tabs (YouTube Music, Spotify Web, Apple Music web, SoundCloud, YouTube, Deezer, Tidal) locally, no login. Built-in player: your downloaded music folder (offline, reads ID3 artist/album/genre) + bundled CC0 focus sounds + generated white/pink/brown noise.
- **Local calendar:** day/week timeline of sessions; `.ics` export (one-click, any calendar app).
- **Data logging from day 1** (so ML has data later): sessions, ratings, listens, domain-level browsing time (leisure vs study, never full URLs), blocked attempts. Local only, viewable, exportable, deletable, retention setting.
- **Break suggestions:** stand, water, look out a window, no phone (Kang & Kurtzberg 2019).
- **Gentle progress:** daily goal in blocks, weekly totals, no punishing streaks (Silverman & Barasch 2023).
- Light/dark/system theme, reduced motion, screen-reader announcements, keyboard nav. Strings via `chrome.i18n` (English first; NL/TR later).

### v0.2: Insights (ML) - code ships early, insights unlock as data accrues
- Productivity heatmap per weekday and weekend day, best windows per day, music effects, focus-song suggestions, adaptive session length suggestion. See ML section.

- **From community wishlists** (Reddit, store reviews, Marinara issues): volume control for bell, music per phase (focus playlist vs break playlist), scheduled blocking (e.g. weekdays 9-17 even without a timer), skip break, configurable long-break cadence, no account ever. Marinara (2.5k stars, MIT) was removed from the Chrome store for being MV2, so its users need a new home.

### v0.3: Online opt-ins (each off by default, permission requested only when turned on)
- Google Calendar sync, Outlook sync if free registration works (auto-log each finished session: "Study: <task>" / "Break"; queued while offline, synced later, no duplicates).
- Last.fm / ListenBrainz link (catches desktop and phone app listening, incl. Spotify via its built-in Last.fm link), phone setup QR.
- Deadline import: paste any calendar feed URL (Canvas gives every student one under Calendar > Calendar Feed) → upcoming assignments appear as todos with due dates. No login, just the feed URL.
- Similar-song suggestions from Last.fm (free key; its non-commercial terms fit a free product).

### v0.4+
- Device-to-device QR transfer (settings, todos, blocklists; webcam scan on the receiving computer, file import fallback).
- Optional desktop helper (native messaging, unsigned script, free) to see Spotify/Music desktop apps fully offline, incl. downloaded songs (macOS AppleScript, Windows SMTC, Linux MPRIS).
- More languages (NL, TR), "hide feeds instead of blocking" (YouTube home feed).

## Architecture

Stack: **WXT** (cross-browser MV3 framework, v0.21.x) + **TypeScript** + **Svelte 5** for popup/dashboard + **vanilla TS** for the overlay (tiny, no framework injected into pages). **idb** for IndexedDB. **Vitest** + WXT fake-browser for unit tests, **Playwright** for E2E. No CSS framework: hand-written CSS with tokens.

```
                  chrome.storage.local (settings, timer state, todos)   IndexedDB (event log)
                               ^                                            ^
popup (Svelte) ──msg──> background (SW / FF event page) ──> DNR rules, alarms, badge/icon
dashboard (Svelte) ─────────────^   |  ^                         |
blocked page ───────────────────┘   |  └── media-probe (MAIN world, music sites) via overlay relay
overlay content script <── storage.onChanged (ticks locally from endsAt)
offscreen doc (Chrome) / background audio (Firefox) <── bell + built-in player
```

Entry points (`src/entrypoints/`): `background.ts`, `overlay.content/` (closed Shadow DOM), `media-probe.content.ts` (`world: "MAIN"`, music hosts only), `popup/`, `dashboard/` (full-tab app: Today, Todo, Insights, Timeline, Music, Blocking, Connections, Settings, Data & privacy), `blocked/`, `offscreen/`.

Core modules (`src/core/`, pure TS, unit-tested): `timer.ts` (state machine), `blocking.ts` (DNR rule builder), `db.ts` (schema + migrations), `phrases.ts` (shuffle bag), `ics.ts` (RFC 5545), `messages.ts` (typed messages + hand-written validators), `audio.ts` (per-browser chime: offscreen on Chrome, background page on Firefox).

**Timer engine:** state = `{phase, startedAt, endsAt | remainingMs (paused), cycle, taskId}`. Time is always derived from timestamps, never counted, so service-worker sleeps and laptop sleep cannot drift it. One-shot `chrome.alarms` at `endsAt` (fires ≥30 s ahead, may be late, so on every wake the engine reconciles: if `endsAt` passed, complete at `endsAt`). A 30 s periodic alarm refreshes badge/icon while running. Overlay and popup tick locally from `endsAt` (1 s interval, paused when tab hidden).

**Phase change pipeline:** complete session → write to IndexedDB → play bell → announcement in the active tab (all visible tabs if multiple windows) → swap DNR rules (unlock on break) → queue calendar sync (if on) → next phase (auto-start per setting) → ask rating next time popup/overlay is seen.

**Blocking (declarativeNetRequest session rules):** blocklist = priority-1 `redirect` rules (`resourceTypes: ["main_frame"]`, must be explicit) to `/blocked.html`. Allowlist = priority-1 redirect-all main_frame + priority-2 `allow` for allowed + music domains. Session rules auto-clear on browser restart; engine re-applies on startup. Already-open blocked tabs redirect at focus start. Limits are far above need (5,000 session rules).

**Storage:** `storage.local` (settings, timer, todos, blocklists; `unlimitedStorage`), `storage.session` (access tokens, memory only), IndexedDB stores: `sessions`, `listens`, `activity` (domain + minute buckets), `blocks`, `syncQueue`, `library` (local music index). Schema versioned with migrations.

## Music

1. **Tab detection (local):** MAIN-world probe on known music hosts reads `navigator.mediaSession` metadata + playback state, posts to the overlay content script, which validates (type, length caps, rate limit) and relays to background. Site-specific fallbacks where mediaSession is incomplete (patterns learned from Web Scrobbler connectors, after license check). Logs `{source, title, artist, album, startedAt, endedAt}`.
2. **Local library (offline):** pick your music folder once. Chrome/Edge: File System Access handle persisted in IndexedDB. Firefox: `webkitdirectory` picker (re-pick per browser session). Metadata from ID3/Vorbis tags (genre included, offline). Player plays in the offscreen document so it keeps playing with the popup closed.
3. **Focus sounds:** bundled CC0 loops + Web Audio generated noise (no files, no license).
4. **Last.fm / ListenBrainz (opt-in, online):** read recent listens = desktop + phone listening from any app that scrobbles (Spotify: built-in Last.fm link in its settings; Android: Pano Scrobbler, any player; iOS: Apple Music scrobbler apps). Listens have timestamps, so phone plays get matched to sessions even if they sync later. Free keys, no card.
5. **Phone QR:** dashboard shows a QR (generated offline) that opens a static setup page (GitHub Pages, no data) for the user's phone + app. QR carries only a public URL.
6. **Desktop apps offline (v0.4):** optional native helper; covers Spotify desktop offline downloads and the Apple Music app.
7. Detection code adapted from **Web Scrobbler** (MIT, 375 site connectors incl. `youtube-music.ts`, `spotify.ts`, `soundcloud.ts`, `musickit.ts`), with its notice kept.

Research defaults until the model has data: instrumental or no music for reading/writing tasks, low volume (Vasilev 2018, Cheah 2022, Perham & Currie 2014).

## Calendar

- **Local timeline** (always): day/week view of sessions from IndexedDB.
- **`.ics` export** (always): one-click download, works with Google/Apple/Outlook import.
- **Google (opt-in):** Chrome = `identity.getAuthToken` (no client secret in the package). Firefox/Edge = `launchWebAuthFlow`. Scope `calendar.app.created`: creates a dedicated "Study Duo" calendar and only touches it (never your other events, easy to delete). Event IDs derived from session IDs → retries never duplicate. Offline → `syncQueue`, flushed on `online`.
- **Outlook (opt-in):** Microsoft Graph, PKCE, `Calendars.ReadWrite`, own "Study Duo" calendar. Prototype the extension redirect early (unverified that SPA token redemption works from an extension).
- **iCloud:** `.ics` export (CalDAV later if asked).
- Event title per your spec: "Study" / "Break" (+ task name if set). Description: focus rating; song list only if you turn it on.

## ML: on-device insights

Grounding: Murphy, *PML: Advanced Topics* §3.5 hierarchical priors; Ruppert & Matteson §20.8 hierarchical shrinkage; Sutton & Barto ch. 2 bandits; *Reliable ML* p.81 cold start (local ml-skill corpus).

- **Label (y ∈ [0,1]) per focus session:** one-tap self-rating (primary; Weinstein 2018: keep the prompt wording fixed). Unrated sessions get an imputed score from behavior (completed?, share of time on study vs leisure domains, blocked attempts, tab switches, pauses), calibrated on rated sessions and given lower weight. Never use "did you like the song" (liked lyrical music still hurts: Perham & Currie 2014).
- **Model: Bayesian linear regression with grouped Gaussian priors** (closed form, ~300 features, Cholesky in JS):
  - Time: global hour-of-day effect → weekday-category and weekend-category effects → per-day effects (Mon..Fri share the weekday prior, Sat/Sun share the weekend prior). This is exactly your "5 days in one category, 2 in another" structure, with partial pooling so a day with few sessions borrows strength from its category. Optional "free day" flag for holidays. Optional 5-question rMEQ chronotype at onboarding sets the starting prior.
  - Music: time-share in the session per genre → artist → track (nested shrinkage: a track heard twice borrows from its artist and genre), plus source (local/YT Music/Spotify/noise/silence), lyrics-vs-instrumental tag when known.
  - Controls: nth session today, leisure minutes before the session, planned length, task/course tag.
  - Prior variances per group tuned by evidence maximization (MacKay fixed-point, few iterations).
- **Outputs:** 7×24 heatmap (posterior mean + uncertainty), best window per day, weekday vs weekend summary, music effects with 80% credible intervals, "your focus tracks", "try next" (Thompson sampling over your genres/artists/library), similar new songs (offline: unplayed local tracks by similar tags; online opt-in: Last.fm similar), suggested focus length (bandit over 25/35/45/50).
- **"Enough data" gate:** an insight shows only when its posterior SD is below a threshold and its group has enough sessions; otherwise a "learning" state with progress ("9 of ~25 sessions for your Tuesday map"). Effects are claimed only when the 80% interval excludes zero.
- **Validation:** walk-forward one-step-ahead MAE vs running-mean baseline (shown on a small "model health" line). Leakage rule: only features known at session start. Unit tests: synthetic users with known true effects; model must recover them inside its intervals.
- Runs in the background after each session (incremental) and on dashboard open (full refit). No network, no WASM needed.

## Security & privacy (security-audit gate on every boundary stage)

Assets: browsing-domain log, listening history, todos, OAuth tokens. Threats: hostile web pages (content-script surface), compromised npm dependency, other extensions, network attackers, the developer (us).

1. No backend, no analytics, no remote config, no remote code. MV3 CSP `script-src 'self'`. Fonts, sounds, icons bundled (no CDNs).
2. Least privilege. Required: `storage`, `unlimitedStorage`, `alarms`, `declarativeNetRequestWithHostAccess`, `offscreen` (Chrome), `notifications`, `idle`, host `<all_urls>` (overlay). Optional, requested only when you turn a feature on, removed on disconnect: `identity`, provider API hosts, `nativeMessaging`.
3. Extension CSP `connect-src` lists only enabled provider origins. No remote images (album art not fetched).
4. Content scripts: closed Shadow DOM, `textContent` only (never `innerHTML` with page data), every message schema-checked, `sender.id` checked, no `externally_connectable`, `web_accessible_resources` minimal with `use_dynamic_url`.
5. Page-supplied song metadata treated as untrusted text: length caps, rate limits, only on known music hosts.
6. OAuth: PKCE + `state`, exact redirect URIs, minimal scopes, no client secrets shipped, access tokens in memory (`storage.session`), refresh tokens local, revoked at the provider on disconnect, never logged.
7. Data at rest stays in the browser profile, protected by the OS account (stated honestly, no fake encryption). Export, delete-all, retention setting.
8. Supply chain: ~6 runtime deps, pinned lockfile, `npm ci`, Dependabot, `npm audit` + OSV-Scanner, CodeQL, gitleaks (pre-commit + CI). Releases built in GitHub Actions from tags with SHA-256 + artifact attestations, so anyone can check the store zip matches the source.
9. `SECURITY.md` with GitHub private vulnerability reporting. Plain-language `PRIVACY.md` + GitHub Pages privacy page (stores + Google verification need it).
10. Offline/no-upload proof: E2E test runs with network off and asserts the extension makes zero network requests while integrations are off.

## Design

Design read: calm study tool for university students, operate mode (popup/dashboard), nostalgic hardware detail in one place: the clock. Dials: variance 4, motion 3, density 4.

- **Clock capsule:** always-dark LCD/VFD capsule (theme-independent, like a real clock radio), 7-segment digits (DSEG7, SIL OFL, bundled) with faint unlit "ghost" segments. Colon steady while running, blinks only when paused. Amber LED digits in focus, soft sage in breaks.
- **Palette (proposed, finalized in Figma):** graphite neutrals (dark bg ~#141413, light bg ~#F1F1EF), amber accent for focus, sage for break; avoids the generic teal/orange and tomato-red defaults the design tools suggested.
- **Type:** Geist Sans (UI) + Geist Mono (numbers) + DSEG7 (clock only), all bundled woff2. Icons: Phosphor, only used glyphs bundled.
- **Motion (animate / emil rules):** announcement = rare event, purpose state indication: enter 400 ms opacity + scale 0.98→1 + blur 4px→0 with `cubic-bezier(0.23,1,0.32,1)`, hold ~1.6 s, exit 1.8 s opacity fade. Clock hover = opacity only, 180 ms. Keyboard shortcuts: no animation. Buttons: scale 0.97 on press. `prefers-reduced-motion`: opacity only. No transform hovers on touch.
- **Copy:** humanizer + voice pass on every string; zero em dashes; short. Samples: focus start "Study time." / "Back to it." / "Phone face down."; break start "Stand up for a bit." / "Look out a window."; break end "Break's over."; long break "Long break. Go for a walk."; goal "Today's goal: done."; late "Last block tonight?".

### Figma workflow (Education plan, Full seat: MCP writes allowed; Code Connect not available on this plan)
1. `figma:figma-create-new-file` "Study Duo".
2. `figma:figma-generate-library`: variables (color light/dark, type, spacing 4/8, radius, motion durations/easings).
3. Components: clock capsule (dim, hover, focus, break, paused, last minute), announcement (in/hold/out), popup timer, buttons, todo row, toggle, segmented control, heatmap cell, insight card, blocked page, empty states.
4. Screens: popup (idle/running/break/rating), dashboard tabs, blocked page, onboarding (3 steps), store screenshots 1280×800, promo tile 440×280.
5. Motion: `figma:figma-use-motion` for announcement + clock hover prototypes.
6. FigJam: `figma:figma-generate-diagram` for architecture + timer state machine.
7. **Gate:** you review the Figma file before UI code. Then code from Figma (`get_design_context`, `get_variable_defs` → `src/ui/tokens.css`), compare with Playwright screenshots, run the no-slop checklist, impeccable critique/audit, and an emil before/after review.

## Research basis (agent reports, verified sources)

| Product choice | Evidence |
|---|---|
| Fixed breaks default | Biwer et al. 2023, BJEP (experiment): self-regulated breaks → more fatigue, same output |
| Break activities, no phone | Albulescu et al. 2022 PLOS ONE (meta); Kang & Kurtzberg 2019 (RCT: phone breaks → 22% fewer solved) |
| No lyrics for reading/writing | Vasilev et al. 2018 (Bayesian meta); Cheah et al. 2022 (review, 154 exps); Perham & Currie 2014 |
| Personalised music model | large moderators (task difficulty, lyrics, introversion: Furnham & Strbac 2002) |
| Weekday/weekend + hour model | Schmidt et al. 2007 (review); Wittmann et al. 2006 (social jetlag); rMEQ (Adan & Almirall 1991) |
| Friction unlock | Grüning et al. 2023 PNAS (field exp: 10 s delay → 37% fewer opens) |
| Blocking helps low-control users | Mark, Czerwinski & Iqbal 2018 CHI |
| Intention before session | Gollwitzer & Sheeran 2006 (meta, d=.65) |
| Visible progress logging | Harkin et al. 2016 Psych Bull (meta, d=.40) |
| No punishing streaks | Silverman & Barasch 2023 JCR; Lally et al. 2010 |
| Quiet during focus | Mark, Gudith & Klocke 2008 CHI |

Bell sound: CC0 candidates (verify page + snapshot before bundling): bigsoundbank "Tibetan bowl singing" #1109 (FAQ allows app redistribution), Freesound airtaxi #76888, inoshirodesign #271370, qubodup #169289, nahmandub #131348. Avoid Mixkit (bans tools) and Pixabay (gray area). Fallback: Web Audio additive-synthesis bowl (partials ~1, 2.8, 5.3 with 1-3 Hz detune), zero license.

## Open-source reuse (licenses checked live with `gh api`, 2026-10-07)

| Use | Repo | License | How |
|---|---|---|---|
| Build, cross-browser | wxt-dev/wxt (10.6k★, active) | MIT | dependency |
| Tab music detection | web-scrobbler/web-scrobbler | MIT | adapt connectors, keep notice |
| DNR blocker, offscreen audio, alarms, identity | GoogleChrome/chrome-extensions-samples | Apache-2.0 | adapt samples, keep notice |
| Timer UX, heatmap, wishlist | schmich/marinara (MV2, stale) | MIT | ideas + issue list |
| Timer state machine | Splode/pomotroid | MIT | ideas |
| Todo/time data model | super-productivity | MIT | ideas |
| IndexedDB | jakearchibald/idb | ISC | dependency |
| Clock font | keshikan/DSEG | OFL-1.1 | bundle with OFL text in CREDITS |
| Calendar auth samples | googleworkspace/browser-samples | Apache-2.0 | adapt |
| Blocking ideas (delay page, lockdown) | LeechBlock NG | MPL-2.0 | ideas only, no copied files |
| Local activity logging ideas | ActivityWatch + aw-watcher-web | MPL-2.0 | ideas only |
| Advanced DNR | uBOL | GPL-3.0 | do not copy |
| Bandit / Beta sampling | none needed | | ~30 lines own code (no good npm pkg) |

Skip: webextension-polyfill (archived; WXT covers it), tfjs/ml.js (overkill), Spotify SDK (policy).

## Positioning (competitor scan)

Closest overlap: Session (Apple-only, paid features), Pomodoro Club (web-only, no blocker), Exist.io (music × productivity correlation but no timer, paid), Forest (no music, sync complaints), BlockSite/Opal (paywalls, billing complaints). Open gap: free, no-account, offline, cross-browser, all-in-one (timer + clock + locker + todo + music + calendar + personal insights). Top complaints we design against: too easy to disable, paywalls, forced accounts, broken notifications in Firefox, battery drain, bloat.

## Distribution: open source first (no stores)

The promise is the GitHub repo, not a store listing. Every release is a GitHub Release with
`study-duo-chromium.zip`, `study-duo-firefox.zip`, `SHA256SUMS`, and a GitHub artifact attestation
(build provenance), all built by GitHub Actions from a tag. Stores stay optional for later.

### One-line install (README top)

| Your computer | Paste this in any terminal |
|---|---|
| macOS / Linux (Terminal, iTerm, bash, zsh, fish) | `curl -fsSL https://raw.githubusercontent.com/Coflazo/study-duo/main/install.sh \| sh` |
| Windows (PowerShell, Command Prompt, Windows Terminal) | `powershell -c "irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1 \| iex"` (no execution-policy flag needed: piped scripts are not subject to it) |

**Install page (the README's first link):** `coflazo.github.io/study-duo`, a static GitHub Pages page (free, no server, no tracking) that detects the visitor's OS and shows the one matching line with a large copy button, plus "how to open a terminal" for that OS and a short GIF of the 3 browser clicks. No single command line works across bash/zsh/fish and Windows PowerShell 5.1 (different syntax, no `sh` on Windows), so OS detection on a page is how rustup, Bun and Deno solve the same problem. README written for non-technical readers: plain steps first, technical detail folded into `<details>` sections.

What the installer does (and nothing else):
1. Downloads the latest release zip + `SHA256SUMS` from `github.com/Coflazo/study-duo/releases/latest/download/` over HTTPS.
2. Checks the SHA-256; stops if it does not match.
3. Unzips to a fixed folder in your user directory: `~/.study-duo/chromium` (Windows: `%LOCALAPPDATA%\StudyDuo\chromium`). No sudo, no admin rights.
4. Copies that folder path to the clipboard and opens your browser's extensions page (finds Chrome, Edge, Brave, Arc, Opera, Vivaldi, Chromium).
5. Prints the 3 clicks left: Developer mode on → Load unpacked → paste the path.

Browsers do not allow any script to install an extension silently (outside company policy), so those 3 clicks are the minimum, once.
Updating = run the same line again, then press reload on the extension card; your data stays because the extension ID is fixed.
Uninstall = `sh install.sh --uninstall` / `install.ps1 -Uninstall` (removes the folder; you remove the card in the browser).
Script safety: POSIX `sh` (works when piped from fish too) and PowerShell 5.1+; the whole body sits in a function called on the last line so a cut-off download never runs half a script; detects WSL and points to the Windows line; optional `gh attestation verify` when GitHub CLI is installed.
Firefox: unsigned add-ons only load temporarily, so Firefox gets a signed `.xpi` through Mozilla's free unlisted self-distribution signing (needs a free AMO account, a human step) and the installer opens it in Firefox. Until then Firefox users use `about:debugging` (documented).

### README outline (finished-artifact voice, humanizer + voice pass, no em dashes, no badge walls)
1. Name + one line: what it is, that it runs offline and needs no account.
2. Screenshot / short GIF of the clock and the phase text (after S3).
3. Install: the table above, "what this does" in 5 lines, links to read both scripts first, manual install (download zip from Releases, check checksum, Load unpacked).
4. Update / uninstall.
5. What you get: short feature list (timer, clock, tab locker, todo, music, calendar, insights).
6. Privacy in plain words: what stays on your computer (everything), what each optional connection sends and to whom, how to export or delete your data.
7. Permissions table: each permission and why.
8. How the insights work: what is measured, why it needs ~3 weeks of sessions, why it never claims an effect it can't back.
9. Research behind the defaults (short, linked).
10. Run from source: Node 22+, `git clone https://github.com/Coflazo/study-duo && cd study-duo && npm ci && npm run dev`.
11. Credits (DSEG font, CC0 sounds, Web Scrobbler, Chrome samples), security reporting, MIT license.

S13 changes from "stores" to "OSS release": release workflow, install scripts tested on macOS + Windows (GitHub Actions runners) + Linux, README final, AMO unlisted signing for Firefox. Stores only if you ask later.

## S14: Brag GIF and product demo (last stage)

Runs only after the product is finished. Two deliverables, both from real footage and real numbers:

1. **README hero GIF** (`/brag --tone chaotic`, Hyperframes, landscape): fast cuts, loud kinetic type, every important feature on screen: clock fading in on a page, the bell + phase text, a blocked site bouncing, music detected, todo to calendar, the insights heatmap. Then a comparison beat and a "how smart" beat. Target 25-35 s, 800x500, 12 fps, palette-optimized, under 10 MB so GitHub loads it fast; if it runs over, the GIF keeps the hero cut and links the full video. Lives at `docs/media/demo.gif`, first thing in the README.
2. **Full product demo video** (`product-demo` pipeline, Remotion, standalone, up to 90 s, sound on, optional narration with local Kokoro voice `bm_lewis`), linked under the GIF.

Numbers come from a benchmark harness (`bench/`, Playwright + CDP, fixed page set, documented method, dated):
- install size, script injected per page (KB), memory of the extension processes, CPU wakeups per minute while a timer runs, network requests during a 1-hour session with connections off (Study Duo: target 0),
- the same measurements for every competitor with a free installable version (Forest, BlockSite free tier, LeechBlock NG and others found then),
- paid competitors (Session, Freedom, Opal, Brain.fm, Forest Premium): price, account requirement, offline support, permissions and privacy from their official pages, with the date checked; their performance is not measured because buying them breaks the $0 rule,
- "how smart": on simulated students, how many sessions until the model finds each student's true best hours and music, and its forecast error versus a plain average (labeled as simulated); real figures from your own data added only if you agree.
Competitors appear by name only, no logos. Every number in the video traces to a file in `bench/results/`.

## Repo & tooling

`Coflazo/study-duo`, public, MIT. Commits as Coflazo (git config already correct). Layout:
`src/entrypoints/*`, `src/core/*`, `src/ml/*`, `src/integrations/*`, `src/ui/*`, `src/locales/en/`, `public/fonts`, `public/sounds`, `tests/e2e`, `docs/` (GitHub Pages: privacy, phone setup), `docs/superpowers/specs/2026-10-07-study-duo-design.md`, `PRODUCT.md` + `DESIGN.md` (impeccable), `README.md`, `PRIVACY.md`, `SECURITY.md`, `CREDITS.md` (fonts/sounds), `LICENSE`, `.github/workflows/{ci,release}.yml`, `dependabot.yml`.

## Stages (dependency graph, not calendar)

| Stage | Waits on | Limiting resource |
|---|---|---|
| S0 `gh repo create Coflazo/study-duo --public`, WXT scaffold, CI, MIT license, spec + PRODUCT/DESIGN docs | approval | none |
| S1 timer engine, storage, alarms, badge/icon, bell | S0 | none |
| S2 Figma foundations → components → screens | S0 (parallel with S1) | **your review** |
| S3 overlay clock + announcements + phrase bank | S1, S2 tokens | your review of feel |
| S4 tab locker (DNR) + blocked page | S1 | none |
| S5 popup + dashboard shell + todo + intention/rating | S1, S2 | none |
| S6 event log, activity tracking, tab music detection, local player | S1 | music sites to test against |
| S7 ML on synthetic data, then insights UI | S6 schema (start on synthetic in parallel with S3-S6) | **your real study data (weeks)** |
| S8 local timeline + `.ics` | S6 | none |
| S9 security audit, release workflow + install scripts, v0.1.0 GitHub Release, you install with the one-liner | S3-S6, S8 | you: one pasted line + 3 clicks |
| S10 Google Cloud project (no billing), consent screen "In production" unverified, Chrome-extension OAuth client for the fixed ID | S0 | **you: ~10 min in Google Cloud console (guided)** |
| S11 Google sync, Outlook (if card-free), Last.fm/ListenBrainz, phone QR, deadline feed import | S9, S10 | you: free Last.fm key |
| S12 device QR transfer, desktop helper | S11 | none |
| S13 OSS launch (on your say): final README + GIFs, Firefox signed `.xpi` (free AMO account), privacy page, Google verification for >100 users; stores only if you ask | S9-S11 + your go | Google review wait (external) |
| S14 brag GIF + product demo video (runs last, once the product is finished) | S13 + benchmark harness | your real study data for the "smart" numbers |

Critical path: S0 → S1 → S2 (your Figma review) → S3/S5 → S9 audit + install. Everything else runs in parallel around it. Logging ships in v0.1 so your real study data accumulates while S7 is built; the insights need a few weeks of your sessions, which is the real limiting resource for the ML.

Human-only steps become `TODO:` Google Calendar events (your task inbox rule) after approval: review Figma, load the extension, Google Cloud consent screen + OAuth client (guided), Last.fm API key (free), paste Canvas feed URL.

After approval, also: save a project memory (offline-first, $0, personal-first, no Spotify API) and track stages in claude-mem `work_state`.

## Risks to prototype first (cheap spikes inside their stage)

1. Local music folder: does the File System Access permission persist for the extension origin across browser restarts, and can the offscreen document read the stored handle? Fallback: a "resume library" click in the dashboard.
2. Isolated-world content script reading `navigator.mediaSession` on YouTube Music / Spotify Web; fallback MAIN-world probe (planned anyway).
3. Firefox background page playing long music (may suspend); fallback: play from a dashboard tab. Chrome is the priority now.
4. Alarms can fire late: when a page is visible, overlay/popup reaching 00:00 also triggers the transition (idempotent), so the bell is on time.

## Verification

1. `npm test` (Vitest): timer reconcile after sleep, all phase transitions, DNR rule builder (block/allow priority), `.ics` validity, phrase shuffle-bag never repeats, message validators reject bad input, ML recovers synthetic effects + beats baseline walk-forward.
2. `npm run build` for chrome, firefox, edge; `wxt zip`; `web-ext lint` for Firefox.
3. Playwright E2E, Chromium headless with the unpacked extension: start focus → overlay at top-right counting down, dims, brightens on approach, closes; blocked domain redirects, allowed domain loads; fast-forward clock (test-only time source) → bell + announcement appear and fade; badge text changes; `.ics` downloads with correct times.
4. Offline proof: same E2E with `context.setOffline(true)` passes; request log shows zero extension network calls with integrations off.
5. Security: focused security-audit at S4/S6/S11, full audit before S9 submit; gitleaks over history; OSV/npm audit clean.
6. Design: no-slop review checklist PASS, impeccable critique + audit, emil before/after table, screenshots light/dark/reduced-motion.
7. Manual: Firefox run, real YouTube Music / Spotify Web detection, a full 25/5 cycle with real time.
