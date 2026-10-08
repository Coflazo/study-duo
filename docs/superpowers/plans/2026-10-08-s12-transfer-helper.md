# S12 Device Transfer and Desktop Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Move settings, site lists and to-dos to another computer without any server: as one file, or as a short run of QR codes shown on one screen and read by the other computer's camera. (B) An optional desktop helper that tells Study Duo what desktop music apps play (Apple Music, VLC, foobar2000, any app the system's media controls know), offline, so those songs count like the songs in tabs.

**Architecture:**
- (A) `src/core/transfer.ts` builds a versioned bundle `{ app: 'study-duo', kind: 'move', version: 1, settings, sites, todos }`, validates it with the existing normalizers, and compresses it with the browser's `CompressionStream('deflate-raw')` to base64url. It splits it into QR frames `SD1:<id>:<i>/<n>:<data>` and collects frames back in any order. History never moves (it stays where it was recorded); connections never move (a course feed link holds a private token). The QR codes come from `qrcode-generator` (already a dependency). The reader is `jsqr` (Apache-2.0, no dependencies), loaded only when the user presses Scan.
- (B) A native messaging host `com.coflazo.study_duo`:
  - macOS: a POSIX shell script that asks Music and Spotify through `osascript`;
  - Linux: MPRIS through `playerctl` or `dbus-send`;
  - Windows: PowerShell reading the system media session (`GlobalSystemMediaTransportControlsSessionManager`).

  Each script writes one length-prefixed JSON message whenever the song changes. The installer places the helper and registers the host for Chrome, Edge, Brave and Chromium when run with `--helper` / `-Helper`. The extension asks for the optional `nativeMessaging` permission only when the user turns Desktop apps on in Connections.

**Tech Stack:** TypeScript strict, Svelte 5, Vitest, Playwright, POSIX sh, PowerShell 5.1+.

**Spec:** design spec v0.4+ (device-to-device QR transfer, optional desktop helper). Issue #14.

## Global Constraints

- Nothing leaves the computer: the file and the QR codes go straight between the user's own computers. The camera runs only while the Scan panel is open, frames are read in memory and never kept, and the stream stops when the transfer completes, on Stop, and when the page hides.
- Importing replaces settings and site lists after a preview and a confirm; to-dos are added (an id already present is skipped). Untrusted input: the bundle passes `normalizeSettings`, `normalizeSites` and `normalizeTodos`, with a 1 MB cap.
- Spotify stays out of insights wherever it comes from (`app:spotify` joins `NOT_FOR_INSIGHTS`).
- The helper runs with the user's rights only, reads now-playing metadata and nothing else, and answers only the Study Duo extension ID (`allowed_origins`). Off until the user turns it on; removing it is `--uninstall`.
- Copy rules as before; Figma frames first; commits as Coflazo; branch feat/s12-transfer (A) and feat/s12-helper (B).

## Review Focus

1. **Round trip:** bundle to frames to QR images to `jsqr` to frames (shuffled, repeated) to the same bundle. Test: unit test that rasterises the QR codes and reads them with jsqr.
2. **Hostile bundles:** wrong app or version, oversized, bad JSON or deflate data, mixed frames from two transfers. Test: parse and collect tests.
3. **Camera discipline:** the stream stops on completion, Stop and page hide. Test: unit test of the scan controller with a fake stream.
4. **Helper protocol:** 4-byte little-endian length and UTF-8 JSON; strings capped; unknown apps pass; nothing printed except messages. Test: the shell and PowerShell helpers run in CI with a fake now-playing source (`STUDY_DUO_HELPER_FAKE`), and the TypeScript side parses their output.
5. **Registration:** host manifests point to the installed helper with the exact extension ID, for each browser present; uninstall removes them. Test: installer tests on Ubuntu, macOS and Windows.

### Task A1: Bundle, compression, frames (src/core/transfer.ts)
### Task A2: QR round trip with qrcode-generator and jsqr (tests only, plus `src/ui/qr.ts` shared by Connections)
### Task A3: Your data, "Move to another computer" (Figma first): Save a move file, Show QR codes, Load a move file, Scan QR codes, with a preview and confirm
### Task A4: E2E: save a file in one profile, load it in a fresh profile; the QR panel cycles; docs (PRIVACY: camera only while scanning)
### Task B1: Helper scripts and protocol (helper/), with fake-source tests in CI
### Task B2: Installer `--helper` and `-Helper`: install, register, uninstall, with tests
### Task B3: Extension: optional permission, Connections row, background port, listens from `app:<name>`, timer-only as for tabs
### Task B4: Docs: README and PRIVACY (what the helper reads, how to remove it)
