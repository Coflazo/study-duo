# S11 Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the opt-in connections that need no Google account: course deadlines from any calendar feed (Canvas, Brightspace, Moodle, any `.ics` link) become to-dos with due dates, and listening history from ListenBrainz or Last.fm counts the songs a phone or desktop app played during study blocks. A QR on the dashboard opens a phone setup page. Each connection is off until the user turns it on, and with all of them off the extension makes no requests.

**Architecture:** One network gate (`src/core/net.ts`) is the only module that calls `fetch` for connections. It refuses any URL whose origin is not an enabled connection's origin, sends no cookies or referrer, caps time and size, and only does GET over HTTPS. Pure modules parse and merge (`src/integrations/ics-feed.ts`, `deadlines.ts`, `listens-import.ts`); the background schedules syncs with one alarm and records each connection's status (last check, count, error) in `local:connections`. The dashboard gets a Connections screen from Figma (Dashboard / Connections 82:153) and to-do rows show due dates (Dashboard / To-do, deadlines 82:2029).

**Tech Stack:** TypeScript strict, WXT storage, Svelte 5, Vitest, Playwright. One new runtime dependency: `qrcode-generator` 2.0.4 (MIT, no dependencies, no install scripts, checked 2026-10-08) for QR codes, reused by S12 device transfer.

**Spec:** `docs/superpowers/specs/2026-10-07-study-duo-design.md` (v0.3 online opt-ins; Music 4 and 5). Issue #13. Google Calendar sync and Outlook wait for S10 (Google Cloud client, a human step) and stay out of this plan.

## Global Constraints

- Off by default, opt-in per connection, and nothing is fetched until the user presses Import or Connect. Turning one off stops its requests at once (the gate reads the current settings on every call).
- CSP becomes `connect-src 'self' https:` because course feeds live on any school's host; the gate, not the CSP, is the allowlist, and the E2E proves zero requests with everything off.
- Untrusted input: feed text and listening-history JSON are capped (2 MB, 2,000 events, 1,000 listens per sync), control characters stripped, strings cut to the same limits as page-supplied song metadata. No HTML rendering of any of it.
- Listens follow the existing rule: kept only when they fall inside a study block or break, tied to that session. Spotify plays reach the model only through the user's own scrobbles, as the spec allows.
- A deleted feed to-do stays deleted (its UID is remembered); a done one stays done; the user's own edits to a feed to-do's text are kept.
- Last.fm needs the user's own free API key, stored locally like the other settings; ListenBrainz needs only a public username.
- Copy rules as before (humanizer, no em dashes); Figma frames exist; commits as Coflazo; branch feat/s11-connections; PR closes #13 only for the parts listed here (Google and Outlook stay open on #13).

## Review Focus

1. **Network gate:** a URL from a disabled connection, a different origin, `http:`, a redirect to another origin, or an oversized response must never be fetched or read. Test: unit tests with a stub fetch; E2E with all connections off records zero external requests.
2. **Feed parsing:** folded lines, `VALUE=DATE`, `TZID=` times (converted with `Intl`, DST included), UTC `Z`, escaped text, missing UID or DUE/DTSTART, malformed input. Test: fixtures from Canvas's format plus a fuzzed garbage file that must not throw.
3. **Merging:** idempotent (two syncs give the same list), deleted stays deleted, done stays done, edits kept, events moved in the feed move the due date. Test: merge table.
4. **Listens:** dedupe against listens the browser already caught (same title and artist within 3 minutes), outside-a-session plays dropped, now-playing entries skipped, paging stops at the last sync. Test: mapper and merge tests.
5. **Scheduling:** one alarm; deadlines every 6 hours, listens every 30 minutes; a failure records a plain error and backs off without losing the last good data. Test: background sync unit tests with a stub gate.

### Task 1: Network gate (src/core/net.ts)
`connectionOrigins(connections)` and `getText(url, connections, opts)`: HTTPS only, origin in the enabled set, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, `cache: 'no-store'`, 15 s timeout, 2 MB cap read in chunks. Tests with a stub fetch for each refusal and the happy path.

### Task 2: Calendar feed parser (src/integrations/ics-feed.ts)
`parseFeed(text, now)` returns `{ uid, title, course, due }[]`: unfold, VEVENT and VTODO, DUE then DTSTART, `VALUE=DATE` as 23:59 local, `TZID` via `Intl.DateTimeFormat` offsets, `Z` as UTC, RFC 5545 unescaping, course from a trailing `[...]` (Canvas puts the course name there) shortened to a tag. Fixtures in `src/integrations/fixtures/`.

### Task 3: Deadlines into to-dos (src/integrations/deadlines.ts, src/core/todos.ts)
`Todo` gains optional `due` and `feedUid`. `mergeDeadlines(todos, events, dismissed, now)` keeps events due from 1 day ago to 8 weeks ahead, adds new ones, updates due dates, never resurrects dismissed UIDs, keeps done and edited items. Deleting a feed to-do adds its UID to the dismissed list.

### Task 4: Listening history (src/integrations/listens-import.ts)
`fromListenBrainz(json)` and `fromLastfm(json)` map to listens; `attachToSessions(listens, sessions)` keeps those inside a block or break; `mergeImported(existing, imported)` drops duplicates of browser-caught songs. Fetch URLs: `https://api.listenbrainz.org/1/user/{user}/listens?min_ts=…&count=100` and `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=…&api_key=…&from=…&limit=200&format=json`.

### Task 5: Background sync (src/background/connections.ts)
`local:connections` holds `{ deadlines: { url, lastSync, count, error, dismissed }, listenbrainz: { user, lastSync, count, error }, lastfm: { user, key, lastSync, count, error } }`. One alarm every 30 minutes; deadlines when 6 hours have passed; a `sync` message from extension pages only (sender check) runs one connection now.

### Task 6: Screens (Connections, To-do due dates, phone QR, nav)
Connections screen per Figma 82:153; due labels per 82:2029 (red within 24 hours); QR from `qrcode-generator` as an SVG path; nav item with the plugs-connected icon.

### Task 7: Phone setup page (site/phone.html) and docs
Static page in the install page's style: Android (Pano Scrobbler to ListenBrainz or Last.fm), iPhone (Last.fm in Apple Music via a scrobbler app, Spotify's own Last.fm link), then "come back to Connections and type your username". README and PRIVACY: connections now exist and what each sends; Google Calendar still planned.

### Task 8: End to end
All off: a full block and a dashboard visit make zero requests outside the extension. Deadlines: a routed feed creates to-dos with due dates, a second sync changes nothing, a deleted one stays deleted. ListenBrainz: a routed response adds the songs played inside a block and nothing else; requests go only to the ListenBrainz origin.
