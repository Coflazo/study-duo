---
name: Study Duo
description: A study timer that lives in your browser, set like an exam-hall clock and a railway departures board.
colors:
  canvas: "#F3F3F0"
  panel: "#FBFBF9"
  sunken: "#E6E7E3"
  ink: "#17191C"
  ink-secondary: "#4E524E"
  ink-disabled: "#8D918B"
  rule-subtle: "#D2D4CF"
  rule-control: "#6A6E69"
  signal-red: "#D52B1E"
  signal-red-text: "#B3211A"
  signal-green: "#2E7D4F"
  signal-green-text: "#246841"
  board: "#0B0C0D"
  led-amber: "#FFB000"
  led-ghost: "#FFB0001F"
  on-plate: "#FBFBF9"
  canvas-dark: "#0F1113"
  panel-dark: "#17191C"
  ink-dark: "#F3F3F0"
typography:
  sign-display:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "32px"
  sign-title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "24px"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  body-strong:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
  caption:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  timetable-time:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  phase-words:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(32px, 6vw, 64px)"
    fontWeight: 800
    lineHeight: 1.0625
    letterSpacing: "-0.01em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  "2": "2px"
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
  "48": "48px"
components:
  sign-button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.sign-title}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  sign-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.sign-title}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  phase-plate-running:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.on-plate}"
    typography: "{typography.sign-title}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "56px"
  phase-plate-break:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "56px"
  led-board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.led-amber}"
    rounded: "{rounded.md}"
    padding: "16px"
  timetable-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 12px"
    height: "40px"
  site-chip:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.timetable-time}"
    rounded: "{rounded.sm}"
    padding: "6px 6px 6px 10px"
  number-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px"
    width: "64px"
---

# Design System: Study Duo

## Overview

**Creative North Star: "Exam Hall and Platform Clock"**

Study blocks run on platform time. Every surface speaks the language of exam-hall clocks and railway signage: enamel sign plates, a bold signage sans, timetable rows with tabular figures, and an amber seven-segment board that reads from across a desk. The student glances and knows the phase and the minutes left in under a second, starts or pauses in one click, and reads today as a departures board.

The system is calm and operational. Colour is scarce: one signal red for study, one signal green for breaks, and amber only inside segment displays. State is carried by form as well as colour, so it survives colour blindness and grayscale: a running plate is solid, a paused plate is a dashed outline, a stopped plate is a hollow sign. Light and dark follow the computer live; the corner clock and every LED board stay a dark clock-radio display in both.

It deliberately refuses the category default: a tomato-red ring timer on rounded white cards, gradients, glass, emoji and pill buttons.

**Key Characteristics:**
- Sign plates and boards, not cards: hard 4 px corners, no floating surfaces.
- One signal colour per phase; amber lives only in LED digits and their rail.
- Atkinson Hyperlegible Next for signs and text, Atkinson Hyperlegible Mono for times.
- State by form (solid, dashed, hollow) as well as colour.
- Plain, short copy; "study block", never "focus block" or productivity talk.

## Colors

Graphite and enamel neutrals carry the page; colour appears only where it means something.

### Primary
- **Signal Red** (#D52B1E; dark #B3211A): the study phase. Phase plate while running, the current-row rail in timetables and to-dos, the dashed outline when a study block is paused, the Blocked category mark, the blocked page plate.
- **Signal Red Text** (#B3211A; dark #F07A6E): red words on the canvas ("Now", "On now", validation messages, study phase words).

### Secondary
- **Signal Green** (#2E7D4F; dark #246841): breaks. Break plates, the break marker in timetables, the Study category mark.
- **Signal Green Text** (#246841; dark #7BC59A): green words on the canvas (break phase words).

### Tertiary
- **Platform LED Amber** (#FFB000) and **LED Ghost** (#FFB000 at 12%): lit and unlit segments of the seven-segment digits, the board's progress rail and label. Nowhere else.
- **Board Black** (#0B0C0D): the LED board, the corner clock, the site prompt and the app icon tile, in both themes.

### Neutral
- **Enamel Canvas** (#F3F3F0; dark #0F1113): page background.
- **Panel** (#FBFBF9; dark #17191C): fields, menus, the hollow plate, sidebar.
- **Sunken** (#E6E7E3; dark #23262A): current rows, site chips, course tags, disabled fills.
- **Ink** (#17191C; dark #F3F3F0): text, primary sign buttons, strong rules.
- **Ink Secondary** (#4E524E; dark #B4B7B1): help text, counts, units, done rows.
- **Rules** (#D2D4CF subtle, #6A6E69 control): row dividers and field strokes.

### Named Rules
**The Signal Rule.** Red means study, green means break. Never use either for decoration, success toasts or links.

**The Amber Rule.** Amber appears only inside a board-black display. It is never a button, a highlight or a text colour on the canvas.

## Typography

**Display and body font:** Atkinson Hyperlegible Next (variable 200 to 800, bundled, SIL OFL)
**Time font:** Atkinson Hyperlegible Mono (bundled, SIL OFL)
**Digits on boards:** drawn as SVG seven-segment glyphs with ghost segments, not a font.

**Character:** a signage sans built for legibility, with a mono for times so the timetable columns line up.

### Hierarchy
- **Sign Display** (800, 28/32): page titles ("Today", "Settings"), "Block done.", the blocked site name.
- **Sign Title** (700, 20/24): phase plate names, section titles, sign buttons.
- **Body** (400, 14/20) and **Body Strong** (600, 14/20): rows, labels, the current task.
- **Label** (600, 12/16) and **Caption** (400, 12/16): field labels, counts, help text, units.
- **Timetable Time** (Mono 500, 14/20): clock times, site names, course tags.
- **Phase Words** (800, clamp(32px, 6vw, 64px), -0.01em): the big line over a page at a phase change, plain text with a canvas-coloured halo, no background plate.

### Named Rules
**The Tabular Rule.** Times and domains are set in the mono so columns align like a departures board.

## Layout

Popup: 360 px wide, 16 px padding, 16 px gaps; plate, board, Today, two large buttons, then a quiet footer. Dashboard: a 240 px sidebar and a content column up to 1040 px with 32 px padding; Today uses two columns (timer up to 360 px, lists fill the rest). Below 900 px the sidebar becomes a wrapping top bar and every screen is one column with 16 px side padding; nothing scrolls sideways at 360 px. Spacing steps are 2, 4, 8, 12, 16, 20, 24, 32 and 48 px. Logical properties throughout, so right-to-left languages can follow.

## Elevation & Depth

Flat. Depth comes from tone (canvas, panel, sunken, board) and rules, not shadows. Two small shadows exist: `0 2px 8px rgb(0 0 0 / 0.25)` under the corner clock and the site prompt so they separate from any web page, and `0 2px 8px rgb(0 0 0 / 0.08)` under open menus.

### Named Rules
**The Flat Sign Rule.** Plates, boards and rows sit flat. Only things floating over someone else's page, or an open menu, get a shadow.

## Shapes

Hard-edged signage: 4 px corners on plates, boards, buttons and fields; 2 px on chips, course tags and small buttons; 8 px only on the blocked page plate and the phase words layer. Checkboxes and switches are square-cornered. Category marks and phase markers are small squares, never dots.

## Components

### Sign Buttons
- **Shape:** 48 px tall, 4 px corners, 12 px by 20 px padding, icon 20 px plus label.
- **Primary:** ink plate with panel text (inverts in dark mode). Hover ink-secondary tone.
- **Secondary:** 2 px ink outline, transparent; hover fills sunken.
- **Press / Focus / Disabled:** press scales to 0.97 for 120 ms; focus is a 3 px ring with a 2 px gap; disabled is a muted plate with disabled text and a not-allowed cursor.

### Phase Plate
- **Running:** solid signal plate (red study, green break), pictogram, phase name and a right note ("Block 2 of 4", "5 min").
- **Paused:** panel fill with a 2 px dashed outline in the phase colour, note "Paused".
- **Stopped:** hollow panel with a 2 px ink outline, note "Up next".

### LED Board
Board black, 16 px padding, four seven-segment digits (54 by 96 px at full size) with ghost segments, a colon that goes unlit when paused, a 4 px amber progress rail and a label ("Ends 10:25", "Paused", "25 min study"). The corner clock is the same language at 0.45 scale inside a board capsule.

### Timetable and To-do Rows
40 px rows with a subtle rule. Current rows get a 3 px signal-red rail on the inline start and a sunken fill; "Now" or "On now" in red text. Done rows are secondary text with a check; skipped rows say "Skipped" in words.

### Chips, Tags and Fields
Site chips: sunken fill, mono name, x to remove, 2 px corners; Add is a dashed outline. Course tags: mono 12 px on sunken. Number fields: 64 by 40 px, 2 px control stroke, right-aligned mono 20 px, unit beside; focus thickens the stroke to 4 px ink; out of range turns the stroke red and shows "Use 1 to 180 minutes."

### Navigation
Dashboard sidebar on panel, 18 px pictograms, current item on sunken with a 3 px red inset rail. Segmented controls are radio groups with an ink plate on the selected option; switches are square-cornered with an ink track when on.

### Signature: Corner Clock and Phase Words
The corner clock is a board-black capsule at 15% opacity, 16 px from the top or bottom right of every page, with a 6 px phase lamp; it rises to full opacity within 24 px of the cursor and never takes clicks except on its close button. Phase words appear over the page with the bell: plain text, a canvas halo, 400 ms in, 1.6 s hold, 1.8 s fade; reduced motion keeps only the fade.

## Do's and Don'ts

### Do:
- **Do** carry state by form as well as colour: solid running, dashed paused, hollow stopped.
- **Do** keep amber inside board-black displays only.
- **Do** use the mono for every time, domain and course tag.
- **Do** write "study block", "Up next", "Block 2 of 4"; short, plain, no em dashes.
- **Do** follow the system theme by default and keep the corner clock dark in both themes.

### Don't:
- **Don't** use a tomato or a red progress ring as the timer's identity.
- **Don't** add gradients, glass, glows, emoji or pill-shaped buttons.
- **Don't** use rounded white cards with large radii (anything over 8 px).
- **Don't** put a background rectangle behind the phase words over a page.
- **Don't** use signal red or green for anything but study and break.
