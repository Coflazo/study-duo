---
version: 1
slug: "src-entrypoints-popup-app-svelte"
primary_target: "src/entrypoints/popup/App.svelte"
related_targets: ["src/entrypoints/overlay.content","src/entrypoints/dashboard","src/entrypoints/blocked"]
---

## Scope

Operate mode. Surfaces: toolbar popup (first surface), on-page clock overlay and phase announcement, dashboard, blocked page. Audience: university students at a desk or in a library, glancing at the timer between pages of work.

## Direction contract

THESIS: Study blocks run on platform time. Every surface speaks the language of exam-hall clocks and railway signage, readable at a glance from across a desk. It refuses the category default: a tomato-red ring timer on rounded white cards.

OWN-WORLD: Enamel-white sign panels and night-platform graphite; one signal red for focus, one signal green for breaks, amber platform LED only inside segment displays. Hard-edged sign plates, a bold signage sans, pictogram glyphs, timetable rows with tabular figures. State is carried by form as well as colour: solid plate running, dashed outline paused, hollow stopped.

STORY: The student glances and knows the phase and minutes left in under a second, starts or pauses in one click, reads today's blocks as a timetable, and later reads their best hours as a departures board.

FIRST VIEWPORT: Popup 360 wide. Full-width phase sign plate on top (pictogram and phase name). The amber LED countdown board owns the top half, with a thin progress rail. Below it, Today as timetable rows (time, block, task). Two large sign buttons at the bottom; the primary action sits bottom left.

FORM: Exam Hall and Platform Clock, position 5 of 7 on the ordered list, seed key 00f48c89.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

At a phase change the clock behaves like a station clock: the red second marker stops at the top for a beat before the minute jumps, then the phase sign flips.

## Unresolved

Exact signage typeface (OFL candidates: Barlow, Atkinson Hyperlegible Next, Overpass); final hex values; dark-mode board tones. Decided in Figma foundations.
