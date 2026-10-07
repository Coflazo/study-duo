# S5 Popup, Dashboard, To-do and Focus Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bare popup and the Settings-only dashboard into the approved Figma screens, with a to-do list, a task picked as each block's intention, a one-tap focus rating after each block, and a local session log that feeds Today.

**Architecture:** Completed and abandoned blocks are written by the background to an IndexedDB `sessions` store (the first store of the S6 event log, schema v1 with a migration hook). To-dos live in `chrome.storage.local` behind pure list operations. The popup and dashboard read both directly (same extension origin) and send timer commands as before. Shared Svelte pieces (phase plate, board, timetable row, sign button, rating keys) live in `src/ui/` and follow Figma component names.

**Tech Stack:** WXT 0.21, Svelte 5 runes, TypeScript strict, idb 8, fake-indexeddb (dev, MIT) for unit tests, Vitest + fake-browser, Playwright + Chrome for Testing.

**Spec:** `docs/superpowers/specs/2026-10-07-study-duo-design.md` (Features v0.1: Todo, Intention + rating, Gentle progress, Break suggestions, System theme, Responsive; Storage; Design system v0.1). Issue #7. Figma Screens page: Popup Ready 13:179, Focus 13:261, Break 13:373, Dark 13:476, Rating 13:557, Dashboard Today 15:467, Settings 18:704, States 19:739.

## Global Constraints

- No network; everything local. Session records hold times, phase, task id, rating and the typed intention plan only; never page addresses or titles.
- Approved Figma wins over generic rules; tokens from `src/ui/tokens.css`; Atkinson Next and Mono; Phosphor Bold icons from `src/ui/icons.ts`.
- Light and dark follow the system live; Settings > Appearance (System, Light, Dark) sets `data-theme` on extension pages only. The corner clock stays dark.
- Responsive from 360 px wide (dashboard) and the popup's 360 x 560; 200% zoom; logical properties.
- Accessibility: every control reachable by keyboard with visible focus (2 px canvas gap plus 3 px ring), radio groups and switches with ARIA roles, timer announced with `role="timer"` and `aria-live="off"`, rating keys as a radio group, reduced motion respected.
- Copy: plain, short, no em or en dashes, no filler words; humanizer, voice and stop-slop rules. "Study block", not "focus block", in UI text.
- Popup reads watch-then-read (subscribe before the first read) so no update is lost between the two (S1 deferred minor).
- No punishing streaks; progress is "3 of 8 blocks, goal 8" and weekly totals only.
- Commits as Coflazo, Conventional Commits, branch `feat/s5-popup-dashboard`, PR closes #7.

## Review Focus

1. **Midnight and time zones:** "Today" must use the local day, survive a block that crosses midnight, and not double-count a block that was reset then restarted. Test: session log day queries around midnight.
2. **Rating prompt timing:** the rating card shows once per finished study block, survives closing and reopening the popup, disappears after rating or Skip, and never asks about a block from yesterday or an abandoned one. Test: pending-rating selector.
3. **To-do edits under concurrency:** popup and dashboard open at once must not lose an added or reordered item. Test: list operations are pure and every write re-reads and applies the single change.
4. **Bad stored data:** a corrupted `todos` array, an unknown session schema version or an IndexedDB open failure must leave the popup usable (timer still works). Test: normalisers and a failing-open stub.
5. **Small and zoomed screens:** popup at 360 x 560 with a long task name, dashboard at 360 px and at 200% zoom, no horizontal scroll. Test: E2E screenshots and a scroll-width assertion.

---

### Task 1: Session log in IndexedDB

**Files:** Create `src/core/db.ts`, `src/core/sessions.ts` (+ tests). Modify `src/background/effects.ts` or `timer-service.ts` to persist every emitted segment. Add dev dependency `fake-indexeddb`.

**Interfaces:**
- Produces: `SessionRecord { id: string; phase: Phase; startedAt: number; endedAt: number; plannedMs: number | null; activeMs: number; completed: boolean; taskId: string | null; rating: 1 | 2 | 3 | 4 | 5 | null; ratingSkipped: boolean }`; `openDb(): Promise<IDBPDatabase>` (schema v1, `sessions` keyed by id with an `endedAt` index); `addSessions(segments, now)`; `sessionsBetween(from, to)`; `localDayRange(now): [number, number]`; `rateSession(id, rating | 'skip')`; `pendingRating(sessions, now): SessionRecord | null` (latest completed study block today without rating or skip, ended within 2 hours).
- [ ] Failing tests with fake-indexeddb: add and read back, day range around midnight (block 23:50 to 00:15 belongs to the day it ended), rating and skip, pendingRating rules (Review Focus 2), schema version guard.
- [ ] Implement; persist segments in the timer service's effect path (`.catch(console.error)` so a database failure never blocks the timer).
- [ ] Commit `feat(sessions): local session log in IndexedDB`.

### Task 2: To-do model

**Files:** Create `src/core/todos.ts` (+ test). Modify `src/core/store.ts`.

**Interfaces:**
- Produces: `Todo { id: string; text: string; course: string | null; done: boolean; doneAt: number | null; ifThen: string | null }`; pure `addTodo`, `editTodo`, `toggleTodo`, `moveTodo(list, id, toIndex)`, `removeTodo`; `normalizeTodos(raw)` (text 1..200 chars, course up to 12 chars uppercased, ifThen up to 160); `todosItem` (`local:todos`); `updateTodos(fn)` which re-reads, applies `fn`, writes (Review Focus 3).
- [ ] Failing tests for each operation and the normaliser → implement → commit `feat(todo): to-do list model`.

### Task 3: Shared UI pieces from Figma

**Files:** Create `src/ui/PhasePlate.svelte`, `src/ui/SignButton.svelte`, `src/ui/TimetableRow.svelte`, `src/ui/RatingKeys.svelte`, `src/ui/base.css` (body, focus ring, theme attribute), `src/ui/theme.ts` (applies Appearance setting). Modify `src/core/settings.ts` (`appearance: 'system' | 'light' | 'dark'`, `dailyGoal: number` default 8).

Behaviour from Figma components: Phase Plate (Focus red, Break green; running solid, paused dashed outline, stopped hollow; right label), Sign Button (primary ink, secondary outline, 48 px, pressed 0.97 for 120 ms, disabled muted), Timetable Row (Done with check and duration, Current with red rail and "Now", Planned with duration, Skipped in words), Rating Keys (1 to 5 radio group, 48 px keys, labels "1 = kept drifting", "5 = fully in it").

- [ ] Settings tests for the two new fields → implement → components with `svelte-check` clean → commit `feat(ui): phase plate, sign button, timetable row and rating keys`.

### Task 4: Popup from Figma

**Files:** Rewrite `src/entrypoints/popup/App.svelte` into small components under `src/entrypoints/popup/`.

Behaviour: Ready (hollow plate "Up next", board with planned length, Start), Running (solid plate with "Block 2 of 4", board with progress and "Ends 10:25", Pause and Skip), Paused (dashed plate, colon unlit, Resume and Skip), Break (green plate with minutes, break suggestion line, Skip break), Rating card after a finished study block (Figma 13:557), Today list (done sessions today, current, next planned), "This site" row and a Settings link kept below the fold. Task picker on Ready: choose from open to-dos ("Up next" plate shows it), starts the block with `taskId`. Watch-then-read.

- [ ] E2E first (popup flows: start with a task, pause and resume, rating appears after a finished block and is stored, Skip on the rating) → build → screenshots light, dark, long task name → commit `feat(popup): popup from the Figma screens`.

### Task 5: Dashboard shell and Today

**Files:** Modify `src/entrypoints/dashboard/App.svelte`; create `Nav.svelte`, `Today.svelte`.

Behaviour from Figma 15:467: sidebar (Today, To-do, Site lock, Settings; screens from later stages appear when they exist), hash routes, Today with plate, board, controls, timetable ("3 of 8 blocks, goal 8") and the to-do summary with "On now". Below 900 px the sidebar becomes a top bar; at 360 px one column.

- [ ] E2E: navigation by hash and keyboard, Today shows the running block and today's sessions → build → commit `feat(dashboard): shell and Today`.

### Task 6: To-do screen

**Files:** Create `src/entrypoints/dashboard/Todo.svelte`, `src/ui/TodoRow.svelte`.

Behaviour: add (text, optional course tag, optional if-then plan "If I get stuck, I will..."), edit inline, complete, delete with undo, reorder by drag and by keyboard (Move up, Move down), "Start a block on this" which starts focus with the task. Done items fold under "Done today".

- [ ] E2E: add, edit, complete, reorder by keyboard, delete and undo, start a block on a task → commit `feat(todo): to-do screen`.

### Task 7: Settings screen

**Files:** Create `src/entrypoints/dashboard/Settings.svelte` (Timer, Bell and clock, Appearance, Sites from S4).

Behaviour from Figma 18:704: mode segmented (Pomodoro, Flowtime), number fields with unit labels for study block, short break, long break, long break after N blocks, daily goal; switches for auto-start; bell volume with a "Play" preview through the offscreen document; corner clock switch and corner segmented; Appearance segmented. Every field writes through `normalizeSettings` and shows the clamped value.

- [ ] E2E: change study length then start shows the new length; Appearance Dark sets `data-theme` and survives reload; bell preview sends one bell message → commit `feat(settings): Settings screen`.

### Task 8: DESIGN.md and final checks

**Files:** Create `DESIGN.md` (impeccable format, written from the built world: tokens, type, components, motion, states, accessibility rules, what was decided against). Update README "What you get" if wording changed.

- [ ] Run no-slop review checklist and impeccable audit over popup, dashboard and blocked page screenshots; fix REVISE items.
- [ ] Commit `docs(design): DESIGN.md from the built screens`.

## Self-review notes

- Spec coverage: popup states, dashboard Today, To-do (add, edit, reorder, complete, delete, course tag, intention), intention if-then plan, rating as the ML label, gentle progress with a daily goal, break suggestions, Appearance with System default, responsive targets, DESIGN.md. Insights, Timeline and Music screens belong to S6 to S8; "Your data" (export, delete, retention) belongs to S6 with the full event log.
- Types defined once: `SessionRecord`, `Todo`, `appearance`, `dailyGoal`; names match across tasks.
- Review Focus lines each have a test in Tasks 1, 2, 4 or 5.
