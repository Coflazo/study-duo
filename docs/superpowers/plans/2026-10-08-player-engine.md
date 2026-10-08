# Plan: the player engine (stage 3b of the player, #51)

**Source:** the approved player plan (stage 3b) and the Figma page "Screens: Player (approved)".
**Complexity:** large, built in four pull requests.

## Summary

One player, owned by the background service worker, that the popup card, the side panel and the media keys all drive. It holds which source is active (Folder, Sounds, YouTube link, streaming, a tab), whether it plays, what plays, the position, the volume and the queue. Audio still plays where Chrome allows it: noise and folder files in the offscreen page; streaming in its own player in the side panel; tabs in their tab. Only one source plays at a time, and switching hands over with a crossfade.

## Decisions

- **The background owns the state**, in session storage (`session:player`), so it survives the service worker sleeping and is gone when the browser closes. Pages read it and send commands; they never hold their own copy.
- **Position is a timestamp, not a stream.** The state keeps `position` (ms) at time `at`; pages extrapolate while playing. Writing the position into storage every second would undo the corner clock's CPU fix (#41).
- **A pure reducer** `applyPlayer(state, command, now) -> { state, effects }` decides everything; the background only carries out the effects (start noise, play a file, pause a tab). This is what the tests cover.
- **Commands** are validated like `parseSound`: `{ kind: 'player', op: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'seek' | 'source' | 'noise' | 'volume' | 'shuffle' | 'repeat', ... }`, from extension pages only.
- **Handoff** uses `handoff()` from `src/core/queue.ts`: picking a source while something plays fades that out and starts the new one; picking while nothing plays only changes the card.
- **Listens**: the player's own plays are logged as listens with hosts `player:folder` and `player:youtube`, under the same rules as today (only while the timer runs, only with Songs you play on). Noise keeps host `sound`. Videos are never read from tabs (0.2.3); a YouTube link the user chose to play in Study Duo is logged by Study Duo itself.
- **Firefox**: the background page plays directly, as noise does today.

## Steps (one PR each)

1. **State and reducer** (`src/core/player.ts`, TDD): types, `parsePlayer`, `applyPlayer` for Sounds (play, pause, noise colour, volume) and source switching with handoff; `src/background/player.ts` carries out noise effects through the existing offscreen path, and the old `{ kind: 'sound' }` messages become player commands. No UI change: the Music page's noise buttons send player commands.
2. **Folder library** after spike S2 (needs one real folder pick by a person): `showDirectoryPicker` in the side panel or dashboard, the handle and a tracks index in IndexedDB (DB v4), tags and cover art (ID3 APIC, FLAC PICTURE) in `src/core/tags.ts`, playback through one `<audio>` in the offscreen page with `fadeCurve` for pause and handoff. Reconnect after a Chrome restart.
3. **Popup card and side panel** from the approved Figma frames (`MiniPlayer.svelte`, `src/entrypoints/sidepanel/`), the CD motion spec, the source list, long-title clipping, "Spinning disc: follow the system / always".
4. **Tabs and streaming** after spikes S4 and S3: media keys of music tabs through a MAIN-world `setActionHandler` wrapper; YouTube links in the official embed in the side panel (Referer rule for error 153), then Spotify, SoundCloud, Apple Music and Tidal embeds.

## Validation

```bash
npm test && npm run typecheck && npm run test:e2e
```

Plus, per step: a person listens to the fades and handoffs (step 1), picks a real folder (step 2), and checks the card against Figma (step 3).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Chrome forgets the folder permission at restart | High (known) | "Reconnect folder" in the side panel and dashboard; the popup links there |
| Offscreen page reading the folder with no extension page open | Unknown | Spike S2 before step 2; fall back to resolving files when playback starts |
| YouTube embed refusing to play in an extension page (error 153) | Known | Dynamic DNR rule adding a Referer; relay page on coflazo.github.io as fallback |
| Position drift between pages | Low | Single timestamped position; pages extrapolate and correct on every state change |
