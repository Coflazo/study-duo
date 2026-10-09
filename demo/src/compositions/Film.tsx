import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import boxesJson from "../../public/footage/boxes.json";
import playerBoxesJson from "../../public/footage/player/boxes.json";
import breakTimes from "../../public/footage/break/times.json";
import timing from "../../public/narration/timing.json";
import { Cursor, downAt, trackPos } from "../chrome";
import { MONO, TYPE } from "../fonts";
import { DUR, EASE, countTo, enter, mix, ramp } from "../motion";
import { Dial } from "./Demo";

/**
 * The launch film: about two minutes, narrated and subtitled, laid out from public/narration/timing.json.
 *
 * scripts/narrate.py speaks every line and writes that file: when each beat starts, when each line is spoken, when
 * each sound plays and the caption phrases. Nothing here hardcodes a second; every frame below is counted from it,
 * so the voice, the picture, the mix (scripts/mix.mjs) and the subtitles never drift apart.
 *
 * Everything inside the browser window and the popup panels is a screenshot of the real extension, shot at 2x by
 * tests/e2e/demo-capture.e2e.ts. The window, pointer, captions and the motion graphics around them are drawn here.
 * Insights come from one simulated student, and the film says so on screen.
 *
 * FilmFrame draws any frame of the film from its number alone, so the README loop (Loop.tsx) can cut it up.
 */

/* --------------------------------------------------------------- timing -- */

const FPS = 30;
const fr = (s: number) => Math.round(s * FPS);
type Span = { s: number; e: number };
const BEAT: Record<string, Span> = Object.fromEntries(timing.beats.map((b) => [b.id, { s: fr(b.start), e: fr(b.end) }]));
const LINE: Record<string, Span> = Object.fromEntries(timing.lines.map((l) => [l.id, { s: fr(l.start), e: fr(l.end) }]));
const CUE = {
  white: fr(timing.cues.noise[0][1] as number),
  pink: fr(timing.cues.noise[1][1] as number),
  brown: fr(timing.cues.noise[2][1] as number),
  song: fr(timing.cues.song[0]),
  bell: fr(timing.cues.bell),
};
export const FILM_LEN = fr(timing.length);
export const FILM_BEATS = BEAT;
export const FILM_LINES = LINE;
export const FILM_CUES = CUE;
export const CAPTIONS = timing.captions.map((c) => ({ text: c.text, s: fr(c.start), e: fr(c.end), line: c.line }));

/* ------------------------------------------------------------- geometry -- */

const S = 1440 / 1408; // footage CSS px -> canvas px (pages were shot at 1408x720)
const WIN = { x: 240, y: 52, w: 1440 };
const TAB_H = 40;
const TOOL_H = 44;
const VIEW = { x: WIN.x, y: WIN.y + TAB_H + TOOL_H, w: WIN.w, h: Math.round(720 * S) };
const WIN_H = TAB_H + TOOL_H + VIEW.h;
const ICON = { x: WIN.x + WIN.w - 92, y: WIN.y + TAB_H + TOOL_H / 2 };
const OMNI = { x: WIN.x + 136, w: WIN.w - 136 - 132 };
const POPUP = { right: ICON.x + 18, top: VIEW.y + 2, w: 360 * S, h: 560 * S };
const PILL_Y = 912;

type Box = { x: number; y: number; width: number; height: number };
const BOX = { ...(boxesJson as Record<string, Box>), ...(playerBoxesJson as Record<string, Box>) };
/** The side panel beside the notes, in page footage px: the notes were shot 1028 px wide, the panel 380. */
const PANEL = { x: 1028, w: 380 };
const inPanel = (p: { x: number; y: number }) => ({ x: PANEL.x + p.x, y: p.y });
const mid = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/* ----------------------------------------------------- the camera (page) -- */

/** z: zoom on the page footage; cx, cy: the footage point (view px) held at the centre of the view. */
type Cam = { z: number; cx: number; cy: number };
const REST: Cam = { z: 1, cx: VIEW.w / 2, cy: VIEW.h / 2 };
/** A camera on a footage point given in CSS px, at zoom z. */
const on = (p: { x: number; y: number }, z: number): Cam => ({ z, cx: p.x * S, cy: p.y * S });
const blend = (a: Cam, b: Cam, t: number): Cam => ({ z: mix(t, a.z, b.z), cx: mix(t, a.cx, b.cx), cy: mix(t, a.cy, b.cy) });
/** Keep the footage covering the view at every zoom, so no edge of a screenshot ever shows. */
function clampCam(c: Cam): Cam {
  const hw = VIEW.w / (2 * c.z);
  const hh = VIEW.h / (2 * c.z);
  return { z: c.z, cx: Math.min(VIEW.w - hw, Math.max(hw, c.cx)), cy: Math.min(VIEW.h - hh, Math.max(hh, c.cy)) };
}

const CLOCK_AT = { x: 1408 - 150, y: 60 };
const QR = mid(BOX["move.qr"]);
const MAP = mid(BOX["insights.map"]);
const MUSIC_INS = { x: (BOX["insights.next"].x + BOX["insights.music"].x + BOX["insights.music"].width) / 2, y: 420 };
const GOOGLE = mid(BOX["connections.google"]);

function camAt(t: number): Cam {
  const push = (from: Cam, to: Cam, at: number, dur: number) => blend(from, to, ramp(t, at, dur, EASE.inOut));
  let c = REST;
  if (t >= BEAT.start.s && t < BEAT.clock.s) c = push(REST, on(mid(BOX["todo.first"]), 1.45), LINE["start-1"].s, 40);
  else if (t >= BEAT.clock.s && t < BEAT.lock.s) {
    c = push(REST, on(CLOCK_AT, 2.6), BEAT.clock.s + 30, 50);
  } else if (t >= BEAT.lock.s && t < BEAT.noise.s) c = push(REST, on({ x: 704, y: 420 }, 1.18), BEAT.lock.s + 10, 60);
  else if (t >= BEAT.songs.s && t < BEAT.bell.s) {
    // The side panel, with the notes beside it; back to the whole window before the popup opens over it, so the page and
    // the popup stay the same size, as they are on a screen.
    c = push(REST, on({ x: PANEL.x + PANEL.w / 2, y: 300 }, 1.4), BEAT.songs.s + 4, 36);
    c = push(c, REST, YT_POP_OPEN - 20, 18);
  } else if (t >= BEAT.calendar.s && t < BEAT.move.s) c = push(REST, on(GOOGLE, 1.35), BEAT.calendar.s + 10, 44);
  else if (t >= BEAT.bell.s && t < BEAT.rate.s) c = push(REST, on({ x: 768, y: 0 }, 1.1), BEAT.bell.s, 90); // the corner clock and the phase words both stay in
  else if (t >= BEAT.insights.s && t < BEAT.calendar.s) {
    c = push(REST, on(MAP, 1.3), BEAT.insights.s + 10, 50);
    c = push(c, on(MUSIC_INS, 1.3), LINE["insights-2"].s - 14, 28);
  } else if (t >= BEAT.move.s && t < BEAT.proof.s) c = push(REST, on(QR, 1.55), BEAT.move.s + 14, 50);
  return clampCam(c);
}

/** Where a footage point (CSS px) lands on the canvas under the camera at frame t. */
function onPage(t: number, p: { x: number; y: number }) {
  const c = camAt(t);
  return { x: Math.round(VIEW.x + VIEW.w / 2 + (p.x * S - c.cx) * c.z), y: Math.round(VIEW.y + VIEW.h / 2 + (p.y * S - c.cy) * c.z) };
}
const onPopup = (p: { x: number; y: number }) => ({ x: Math.round(POPUP.right - POPUP.w + p.x * S), y: Math.round(POPUP.top + p.y * S) });

/* --------------------------------------------------------------- beats -- */

const SQUARES_AT = LINE["hook-2"].s + Math.round((LINE["hook-2"].e - LINE["hook-2"].s) * 0.72); // tabs become squares
const POP_OPEN = LINE["start-2"].s - 22;
const START_CLICK = LINE["start-2"].e - 6;
const POP_CLOSE = BEAT.start.e - 14;
const OPEN_ANYWAY = LINE["lock-2"].s + 26;
const BACK = BEAT.lock.e - 22;
const PLAY = CUE.white - 2;
const CHOOSE = CUE.song - 8; // the Nocturne in the panel's library
const within = (id: string, k: number) => LINE[id].s + Math.round((LINE[id].e - LINE[id].s) * k); // a moment inside a line
const LINK_IN = within("streaming-1", 0.45); // the link, pasted, after the list of services has been seen
const LINK_PLAY = within("streaming-1", 0.85);
const YT_POP_OPEN = LINE["streaming-2"].s - 8;
const YT_PAUSE = within("streaming-2", 0.45);
const YT_POP_CLOSE = BEAT.streaming.e - 10;
const TAB_POP_OPEN = within("tabs", 0.38);
const TAB_PAUSE = within("tabs", 0.62);
const TAB_NEXT = within("tabs", 0.8);
const TAB_POP_CLOSE = BEAT.tabs.e - 6;
const RATE_TAP = LINE.rate.s + 40;

/** The window is up for these stretches; it rises out of the dark ground and sinks back into it. */
const WINDOW_SPANS: Span[] = [
  { s: 0, e: SQUARES_AT + 16 },
  { s: BEAT.start.s, e: BEAT.noise.s + 8 }, // the record player has the screen to itself
  { s: BEAT.songs.s - 8, e: BEAT.rate.s + 8 },
  { s: BEAT.insights.s, e: BEAT.proof.s + 8 },
];

/* ------------------------------------------------------------- footage -- */

/** w: the shot's width in footage px when it is narrower than the page (the notes beside the side panel). */
type Shot = { from: number; full: number; src: string; w?: number };
const SHOTS: Shot[] = (() => {
  const s: Shot[] = [];
  const add = (at: number, src: string, fade = 0, w?: number) => s.push({ from: at, full: at + fade, src, w });
  add(-1, "notes.png");
  add(BEAT.start.s - 1, "todo.png");
  add(BEAT.clock.s, "clock-0.png", 9);
  for (let i = 1; i <= 5; i++) add(BEAT.clock.s + 30 * i, `clock-${i}.png`, 2);
  add(BEAT.lock.s, "blocked-10.png", 9);
  add(BEAT.lock.s + 30, "blocked-9.png", 2);
  add(LINE["lock-2"].s - 8, "blocked-open.png", 6);
  add(OPEN_ANYWAY + 2, "blocked-why.png", 4);
  add(OPEN_ANYWAY + 30, "blocked-reason.png", 4);
  add(BEAT.noise.s, "clock-back.png", 9);
  add(BEAT.songs.s - 9, "player/notes-beside-panel.png", 0, PANEL.x);
  // The break, as shot: one still per capture, timed by its distance from the end of the block.
  const times = breakTimes as number[];
  const at = (ms: number) => CUE.bell + Math.round((ms * FPS) / 1000);
  add(BEAT.bell.s - 1, `break/${times[0]}.jpg`, 9);
  for (let i = 1; i < times.length; i++) {
    const prev = at(times[i - 1]);
    const here = at(times[i]);
    if (here <= BEAT.bell.s) continue;
    s.push({ from: here - prev <= 9 ? prev : here, full: here, src: `break/${times[i]}.jpg` });
  }
  add(BEAT.insights.s - 1, "insights.png");
  add(LINE["insights-2"].s - 10, "insights-music.png", 12);
  add(BEAT.calendar.s, "player/connections-google.png", 9);
  add(BEAT.move.s, "move.png", 9);
  return s.sort((a, b) => a.from - b.from);
})();

function Layer({ src, opacity, w }: { src: string; opacity: number; w?: number }) {
  return <Img src={staticFile(`footage/${src}`)} style={{ position: "absolute", left: 0, top: 0, width: w ? w * S : VIEW.w, height: VIEW.h, opacity }} />;
}

/** What the side panel shows, as shot: the library, the song playing, where it can play from, a link, YouTube, tabs. */
const PANEL_SHOTS: Shot[] = [
  { from: -1, full: -1, src: "player/panel-library.png" },
  { from: CHOOSE + 4, full: CHOOSE + 10, src: "player/panel-now.png" },
  { from: BEAT.streaming.s, full: BEAT.streaming.s + 8, src: "player/panel-sources.png" },
  { from: LINK_IN, full: LINK_IN + 6, src: "player/panel-link.png" },
  { from: LINK_PLAY + 4, full: LINK_PLAY + 12, src: "player/panel-youtube.png" },
  { from: BEAT.tabs.s, full: BEAT.tabs.s + 8, src: "player/panel-tabs.png" },
];

/** The side panel, part of the page under the camera: Chrome draws it beside the page, a thin line between them. */
function Panel({ t }: { t: number }) {
  if (t < BEAT.songs.s - 9 || t >= BEAT.bell.s) return null;
  let i = 0;
  while (i < PANEL_SHOTS.length - 1 && PANEL_SHOTS[i + 1].from <= t) i++;
  const cur = PANEL_SHOTS[i];
  const prev = PANEL_SHOTS[Math.max(0, i - 1)];
  const k = cur.full > cur.from ? Math.min(1, (t - cur.from) / (cur.full - cur.from)) : 1;
  const img = (src: string, opacity: number) => <Img src={staticFile(`footage/${src}`)} style={{ position: "absolute", inset: 0, width: PANEL.w * S, height: VIEW.h, opacity }} />;
  return (
    <div style={{ position: "absolute", left: PANEL.x * S, top: 0, width: PANEL.w * S, height: VIEW.h, borderLeft: "1px solid var(--line)", background: "white" }}>
      {k < 1 && img(prev.src, 1)}
      {img(cur.src, k)}
    </div>
  );
}

function Page({ t }: { t: number }) {
  let i = 0;
  while (i < SHOTS.length - 1 && SHOTS[i + 1].from <= t) i++;
  const cur = SHOTS[i];
  const prev = SHOTS[Math.max(0, i - 1)];
  const k = cur.full > cur.from ? Math.min(1, (t - cur.from) / (cur.full - cur.from)) : 1;
  const c = camAt(t);
  return (
    <div style={{ position: "absolute", left: VIEW.x, top: VIEW.y, width: VIEW.w, height: VIEW.h, overflow: "hidden", background: "var(--paper)", borderRadius: "0 0 12px 12px" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: `translate(${(VIEW.w / 2 - c.cx * c.z).toFixed(2)}px, ${(VIEW.h / 2 - c.cy * c.z).toFixed(2)}px) scale(${c.z.toFixed(4)})`,
        }}
      >
        {k < 1 && <Layer key={`p${i}`} src={prev.src} opacity={1} w={prev.w} />}
        <Layer key={`c${i}`} src={cur.src} opacity={k} w={cur.w} />
        <Panel t={t} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- window chrome -- */

type Where = { title: string; icon: "notes" | "duo"; chip?: string; path: string };
function whereAt(t: number): Where {
  const duo = (title: string, path: string): Where => ({ title, icon: "duo", chip: "Study Duo", path });
  const notes: Where = { title: "Week 6 · Eigenvalues", icon: "notes", path: "lecture-notes.example/linear-algebra/week-6" };
  if (t < BEAT.start.s) return notes;
  if (t < BEAT.clock.s) return duo("To-do · Study Duo", "dashboard.html#todo");
  if (t < BEAT.lock.s) return notes;
  if (t < BEAT.noise.s) return duo("Closed for now", "blocked.html");
  if (t < BEAT.insights.s) return notes;
  if (t < BEAT.calendar.s) return duo("Insights · Study Duo", "dashboard.html#insights");
  if (t < BEAT.move.s) return duo("Connections · Study Duo", "dashboard.html#connections");
  return duo("Your data · Study Duo", "dashboard.html#data");
}

/** Generic pages for the tabs that pile up in the opening. No real site names, no real interfaces. */
const STRAY_TABS = [
  "Watch", "10 hours of rain", "Every cat video, ranked", "Inbox (3)", "Group chat", "Why you can’t focus",
  "Cheap flights", "Top 50 goals", "Shop", "News", "Recipes", "Lo-fi beats", "Wiki: Pencil",
];
const TAB_X = WIN.x + 84;
const TAB_AREA = WIN.w - 84 - 60;

/** How many tabs are open in the opening: one, then thirteen more across the second line. */
function tabCount(t: number): number {
  const a = LINE["hook-2"].s + 6;
  const b = SQUARES_AT - 6;
  if (t < a) return 1;
  return 1 + Math.min(STRAY_TABS.length, Math.floor(((t - a) / (b - a)) * STRAY_TABS.length) + 1);
}
const tabWidth = (n: number) => Math.min(236, TAB_AREA / n);

function TabIcon({ kind }: { kind: "notes" | "duo" | "stray" }) {
  const box: CSSProperties = { width: 16, height: 16, borderRadius: 4, flexShrink: 0 };
  if (kind === "duo") return <Img src={staticFile("icon.png")} style={{ ...box, borderRadius: 3 }} />;
  if (kind === "stray") return <div style={{ ...box, background: "#9aa0a6" }} />;
  return <div style={{ ...box, background: "#6a6e69", color: "white", font: `700 10px/16px ${TYPE}`, textAlign: "center" }}>L</div>;
}

function Tabs({ t }: { t: number }) {
  const where = whereAt(t);
  const inHook = t < BEAT.start.s;
  const n = inHook ? tabCount(t) : 1;
  const out: ReactNode[] = [];
  let x = TAB_X;
  for (let i = 0; i < n; i++) {
    const born = i === 0 ? -100 : LINE["hook-2"].s + 6 + Math.round(((i - 1) / STRAY_TABS.length) * (SQUARES_AT - 12 - LINE["hook-2"].s));
    const grow = ramp(t, born, 6, EASE.out);
    const w = tabWidth(n) * grow;
    const active = inHook ? i === n - 1 : true;
    out.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: WIN.y + 6,
          width: w,
          height: TAB_H - 6,
          borderRadius: "10px 10px 0 0",
          background: active ? "white" : "transparent",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 12px",
          overflow: "hidden",
          opacity: Math.min(1, grow * 1.6),
        }}
      >
        <TabIcon kind={i === 0 ? where.icon : "stray"} />
        <span style={{ font: `500 14px/1 ${TYPE}`, color: active ? "var(--ink)" : "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {i === 0 ? where.title : STRAY_TABS[i - 1]}
        </span>
        {!active && <span style={{ position: "absolute", right: 0, top: 9, bottom: 9, width: 1, background: "var(--line)" }} />}
      </div>,
    );
    x += w;
  }
  // Music in another tab: the tab the popup and the panel control.
  if (t >= BEAT.tabs.s - 8 && t < BEAT.bell.s) {
    const w = 236 * ramp(t, BEAT.tabs.s - 8, 8, EASE.out);
    out.push(
      <div key="music" style={{ position: "absolute", left: x, top: WIN.y + 6, width: w, height: TAB_H - 6, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", overflow: "hidden" }}>
        <div style={{ width: 16, height: 16, borderRadius: 99, background: "#e5484d", flexShrink: 0 }} />
        <span style={{ font: `500 14px/1 ${TYPE}`, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Gymnopédie No. 1</span>
        <svg viewBox="0 0 256 256" width="15" height="15" style={{ flexShrink: 0, fill: "var(--ink-2)" }} aria-hidden="true"><path d="M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z"/></svg>
      </div>,
    );
    x += w;
  }
  return (
    <>
      {out}
      <div style={{ position: "absolute", left: x + 8, top: WIN.y + 9, width: 26, height: 26, font: `400 22px/26px ${TYPE}`, color: "var(--ink-2)", textAlign: "center" }}>+</div>
    </>
  );
}

function Address({ t }: { t: number }) {
  const where = whereAt(t);
  const inHook = t < BEAT.start.s && tabCount(t) > 1;
  return (
    <div
      style={{
        position: "absolute",
        left: OMNI.x,
        top: WIN.y + TAB_H + 7,
        width: OMNI.w,
        height: TOOL_H - 14,
        borderRadius: 99,
        background: "var(--canvas)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        font: `400 15px/1 ${TYPE}`,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {inHook ? (
        <span style={{ color: "var(--ink-3)" }}>Search or type a web address</span>
      ) : where.chip ? (
        <>
          <span style={{ padding: "3px 10px", borderRadius: 99, background: "var(--sunken)", color: "var(--ink)", fontWeight: 600 }}>{where.chip}</span>
          <span style={{ color: "var(--ink-3)" }}>{where.path}</span>
        </>
      ) : (
        <span>
          <span style={{ color: "var(--ink)" }}>{where.path.split("/")[0]}</span>
          <span style={{ color: "var(--ink-3)" }}>/{where.path.split("/").slice(1).join("/")}</span>
        </span>
      )}
    </div>
  );
}

/** The study block as the toolbar button shows it: 25 minutes from Start, then (after the cut) its last seconds. */
function timerAt(t: number): { phase: "focus" | "break"; left: number } | null {
  if (t < START_CLICK + 2 || t >= BEAT.rate.s) return null;
  if (t < BEAT.bell.s) return { phase: "focus", left: Math.max(60_500, 25 * 60_000 - ((t - START_CLICK) * 1000) / FPS) };
  if (t < CUE.bell) return { phase: "focus", left: ((CUE.bell - t) * 1000) / FPS };
  return { phase: "break", left: 5 * 60_000 - ((t - CUE.bell) * 1000) / FPS };
}

function ToolbarButton({ t }: { t: number }) {
  const tm = timerAt(t);
  const badge = tm ? (tm.left < 60_000 ? "<1" : String(Math.ceil(tm.left / 60_000))) : "";
  return (
    <div style={{ position: "absolute", left: ICON.x - 11, top: ICON.y - 11, width: 22, height: 22 }}>
      {tm ? <Dial phase={tm.phase} left={tm.left} /> : <Img src={staticFile("icon.png")} style={{ width: 22, height: 22 }} />}
      {badge && (
        <div
          style={{
            position: "absolute",
            right: -8,
            bottom: -6,
            minWidth: 17,
            height: 14,
            padding: "0 3px",
            borderRadius: 4,
            background: tm?.phase === "break" ? "var(--green)" : "var(--red)",
            color: "white",
            font: `700 10.5px/14px ${TYPE}`,
            textAlign: "center",
          }}
        >
          {badge}
        </div>
      )}
    </div>
  );
}

/** The popup each time it opens: Start, then the YouTube card, then the music in a tab. Shots cross-fade inside it. */
const POPS: { open: number; close: number; shots: { at: number; src: string }[] }[] = [
  { open: POP_OPEN, close: POP_CLOSE, shots: [{ at: -1, src: "popup-ready.png" }, { at: START_CLICK + 2, src: "popup-running.png" }] },
  { open: YT_POP_OPEN, close: YT_POP_CLOSE, shots: [{ at: -1, src: "player/popup-youtube.png" }] },
  { open: TAB_POP_OPEN, close: TAB_POP_CLOSE, shots: [{ at: -1, src: "player/popup-tab.png" }] },
];

function Popup({ t }: { t: number }) {
  const pop = POPS.find((p) => t >= p.open && t < p.close + 6);
  if (!pop) return null;
  const inT = ramp(t, pop.open, DUR.chip, EASE.out);
  const outT = ramp(t, pop.close, DUR.chip, EASE.out);
  const img: CSSProperties = { position: "absolute", inset: 0, width: POPUP.w, height: POPUP.h };
  return (
    <div
      style={{
        position: "absolute",
        left: POPUP.right - POPUP.w,
        top: POPUP.top,
        width: POPUP.w,
        height: POPUP.h,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 12px 40px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(0 0 0 / 0.08)",
        opacity: inT * (1 - outT),
        transform: `translateY(${mix(inT, -6, 0).toFixed(2)}px)`,
      }}
    >
      {pop.shots.map((sh, i) => (
        <Img key={sh.src} src={staticFile(`footage/${sh.src}`)} style={{ ...img, opacity: i === 0 ? 1 : ramp(t, sh.at, 4, EASE.out) }} />
      ))}
    </div>
  );
}

function windowOpacity(t: number): number {
  let best = 0;
  for (const w of WINDOW_SPANS) {
    if (t < w.s || t > w.e) continue;
    best = Math.max(best, ramp(t, w.s, DUR.hero, EASE.inOut) * (1 - ramp(t, w.e - DUR.hero, DUR.hero, EASE.inOut)));
  }
  return best;
}

function Window({ t }: { t: number }) {
  const o = windowOpacity(t);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o, transform: `translateY(${mix(o, 14, 0).toFixed(2)}px)` }}>
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN_H,
          borderRadius: 12,
          overflow: "hidden",
          background: "#e3e5e1",
          boxShadow: "0 40px 100px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.08)",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ position: "absolute", left: WIN.x + 18 + i * 20, top: WIN.y + 16, width: 12, height: 12, borderRadius: 99, background: "#c5c8c2" }} />
      ))}
      <Tabs t={t} />
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y + TAB_H, width: WIN.w, height: TOOL_H, background: "white", borderBottom: "1px solid var(--line)" }} />
      <div style={{ position: "absolute", left: WIN.x + 22, top: WIN.y + TAB_H + 10, font: `400 20px/24px ${TYPE}`, color: "var(--ink-3)", letterSpacing: 14 }}>‹›↻</div>
      <Address t={t} />
      <ToolbarButton t={t} />
      <div style={{ position: "absolute", left: WIN.x + WIN.w - 50, top: ICON.y - 12, width: 24, height: 24, borderRadius: 99, background: "var(--sunken)" }} />
      <Page t={t} />
      <Popup t={t} />
    </div>
  );
}

/* ------------------------------------------------- 1. tabs into squares -- */

const PILE = (() => {
  const rows = [6, 5, 3];
  const size = 76;
  const gap = 10;
  const floor = 760;
  const out: { x: number; y: number }[] = [];
  rows.forEach((n, r) => {
    const w = n * size + (n - 1) * gap;
    for (let i = 0; i < n; i++) out.push({ x: 960 - w / 2 + i * (size + gap), y: floor - (r + 1) * size - r * gap });
  });
  return { size, out };
})();

function Squares({ t }: { t: number }) {
  if (t < SQUARES_AT - 2 || t > BEAT.problem.s + 20) return null;
  const leave = 1 - ramp(t, BEAT.problem.s, 16, EASE.out);
  const n = 1 + STRAY_TABS.length;
  const w = tabWidth(n);
  return (
    <AbsoluteFill style={{ opacity: leave }}>
      {/* The black panel the tabs pile onto. */}
      <div style={{ position: "absolute", left: 960 - 330, top: 440, width: 660, height: 340, borderRadius: 22, background: "#000", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.07)", opacity: ramp(t, SQUARES_AT, 14) }} />
      {PILE.out.slice(0, n).map((p, i) => {
        const at = SQUARES_AT + i * 2;
        const k = ramp(t, at, 22, EASE.out);
        const from = { x: TAB_X + i * w + w / 2 - PILE.size / 2, y: WIN.y + 6 };
        const x = mix(k, from.x, p.x);
        const y = mix(k, from.y, p.y);
        const shade = ["#3a3f44", "#4a5056", "#2f3438"][i % 3];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: mix(k, Math.min(w, 120), PILE.size),
              height: mix(k, 34, PILE.size),
              borderRadius: 12,
              background: i === 0 ? "#6a6e69" : shade,
              boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)",
              opacity: ramp(t, at - 2, 4),
              transform: `rotate(${mix(k, 0, ((i * 37) % 9) - 4).toFixed(2)}deg)`,
            }}
          >
            <div style={{ position: "absolute", left: 10, top: 10, width: 14, height: 14, borderRadius: 4, background: i === 0 ? "white" : "#9aa0a6", opacity: 0.8 }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------ 2. the sign-up -- */

function SignUp({ t }: { t: number }) {
  const b = BEAT.problem;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const draw = (at: number) => 1 - ramp(t, at, 18, EASE.out);
  const out = 1 - ramp(t, b.e - 12, 12, EASE.out);
  const line: CSSProperties = {};
  const stroke = { stroke: "white", strokeWidth: 2.5, fill: "none", pathLength: 1, strokeDasharray: 1 } as const;
  const label = (at: number): CSSProperties => ({ opacity: ramp(t, at, DUR.panel) * 0.8, font: `500 24px ${TYPE}`, fill: "white" } as CSSProperties);
  const at = b.s + 4;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, ...line }}>
      <svg width={620} height={640} viewBox="0 0 620 640" style={{ marginTop: -80 }}>
        <rect x={10} y={10} width={600} height={620} rx={20} {...stroke} strokeDashoffset={draw(at)} />
        <text x={60} y={92} style={{ ...label(at + 6), font: `700 34px ${TYPE}` }}>Create an account</text>
        <text x={60} y={132} style={label(at + 9)}>to start blocking sites</text>
        <text x={60} y={200} style={label(at + 12)}>Email</text>
        <rect x={60} y={216} width={500} height={60} rx={10} {...stroke} strokeDashoffset={draw(at + 10)} />
        <text x={60} y={326} style={label(at + 15)}>Password</text>
        <rect x={60} y={342} width={500} height={60} rx={10} {...stroke} strokeDashoffset={draw(at + 14)} />
        <rect x={60} y={446} width={500} height={64} rx={12} fill="white" style={{ opacity: ramp(t, at + 22, DUR.panel) }} />
        <text x={310} y={487} textAnchor="middle" style={{ opacity: ramp(t, at + 24, DUR.panel), font: `700 24px ${TYPE}`, fill: "#0f1113" }}>Sign up</text>
        <text x={310} y={566} textAnchor="middle" style={label(at + 28)}>Already have an account? Log in</text>
      </svg>
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------- 3. the reveal -- */

function Reveal({ t }: { t: number }) {
  const b = BEAT.reveal;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const out = 1 - ramp(t, b.e - 14, 14, EASE.out);
  // The dial runs: a block under way, its red arc shrinking as the beat plays.
  const left = 25 * 60_000 - ((t - b.s) / (b.e - b.s)) * 9 * 60_000;
  const nameAt = LINE["reveal-1"].s + 4;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ ...enter(t, b.s + 4, { y: 20, dur: DUR.hero }), marginTop: -110 }}>
        <Dial phase="focus" left={left} size={300} />
      </div>
      <div style={{ display: "flex", gap: 26, marginTop: 36 }}>
        {["Study", "Duo"].map((w, i) => (
          <span key={w} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 8 }}>
            <span style={{ display: "inline-block", font: `700 104px/1.06 ${TYPE}`, letterSpacing: -2.8, color: "white", transform: `translateY(${mix(ramp(t, nameAt + i * 3, DUR.word, EASE.word), 110, 0).toFixed(2)}%)` }}>
              {w}
            </span>
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* --------------------------------------------------- 10. the rating hero -- */

const HERO = { scale: 1.42, cx: 960, cy: 470, tilt: -2.5 };
function heroPoint(p: { x: number; y: number }) {
  const w = 360 * HERO.scale;
  const h = 560 * HERO.scale;
  const dx = p.x * HERO.scale - w / 2;
  const dy = p.y * HERO.scale - h / 2;
  const a = (HERO.tilt * Math.PI) / 180;
  return { x: Math.round(HERO.cx + dx * Math.cos(a) - dy * Math.sin(a)), y: Math.round(HERO.cy + dx * Math.sin(a) + dy * Math.cos(a)) };
}

/**
 * The popup's record player, large, on its own: at rest, then Play. The disc slides out and turns, white, then pink, then
 * brown, each frame as the browser drew it (one capture per film frame). White plays its first 90 frames once, then
 * turns on the last 54: one revolution at 33 1/3 rpm, so the loop has no seam.
 */
function playerFrame(t: number): string {
  const n = (k: number) => String(k).padStart(3, "0");
  if (t < PLAY + 2) return "player/rest.png";
  if (t < CUE.pink) {
    const k = t - (PLAY + 2);
    return `player/white-${n(k < 90 ? k : 36 + ((k - 36) % 54))}.jpg`;
  }
  if (t < CUE.brown) return `player/pink-${n(Math.min(53, t - CUE.pink))}.jpg`;
  return `player/brown-${n(Math.min(53, t - CUE.brown))}.jpg`;
}

function PlayerHero({ t }: { t: number }) {
  const b = BEAT.noise;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const inT = ramp(t, b.s + 2, DUR.hero, EASE.inOut);
  const outT = ramp(t, b.e - 14, 14, EASE.inOut);
  const w = 360 * HERO.scale;
  const h = 560 * HERO.scale;
  return (
    <div
      style={{
        position: "absolute",
        left: HERO.cx - w / 2,
        top: HERO.cy - h / 2,
        width: w,
        height: h,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 50px 120px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.1)",
        opacity: inT * (1 - outT),
        transform: `translateY(${mix(inT, 18, 0).toFixed(2)}px) rotate(${HERO.tilt}deg)`,
      }}
    >
      <Img src={staticFile(`footage/${playerFrame(t)}`)} style={{ position: "absolute", inset: 0, width: w, height: h }} />
    </div>
  );
}

function RateHero({ t }: { t: number }) {
  const b = BEAT.rate;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const inT = ramp(t, b.s + 2, DUR.hero, EASE.inOut);
  const outT = ramp(t, b.e - 14, 14, EASE.inOut);
  const k = ramp(t, RATE_TAP + 2, 4, EASE.out);
  const w = 360 * HERO.scale;
  const h = 560 * HERO.scale;
  const img: CSSProperties = { position: "absolute", inset: 0, width: w, height: h };
  return (
    <div
      style={{
        position: "absolute",
        left: HERO.cx - w / 2,
        top: HERO.cy - h / 2,
        width: w,
        height: h,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 50px 120px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.1)",
        opacity: inT * (1 - outT),
        transform: `translateY(${mix(inT, 18, 0).toFixed(2)}px) rotate(${HERO.tilt}deg)`,
      }}
    >
      <Img src={staticFile("footage/popup-rating.png")} style={img} />
      {k > 0 && <Img src={staticFile("footage/popup-rated.png")} style={{ ...img, opacity: k }} />}
    </div>
  );
}

/* ----------------------------------------------------------- 14. proof -- */

/** bench/results/2026-10-09.md: six extensions, each alone in a fresh browser, free versions, measured 9 Oct 2026. */
const BENCH = [
  { name: "Study Duo", script: "59 KB", cpu: "0.13 s", servers: 0 },
  { name: "LeechBlock NG", script: "5 KB", cpu: "0.33 s", servers: 0 },
  { name: "Forest", script: "309 KB", cpu: "0.10 s", servers: 0 },
  { name: "Focus To-Do", script: "0 KB", cpu: "below noise", servers: 0 },
  { name: "StayFocusd", script: "7.0 MB", cpu: "0.71 s", servers: 9 },
  { name: "BlockSite", script: "6.7 MB", cpu: "0.50 s", servers: 57 },
];

function Proof({ t }: { t: number }) {
  const b = BEAT.proof;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const out = 1 - ramp(t, b.e - 14, 14, EASE.out);
  const blockAt = within("proof-2", 0.3);
  const countAt = within("proof-2", 0.6);
  const duoAt = LINE["proof-3"].s;
  const COLS = "330px 260px 260px 300px";
  const cell: CSSProperties = { font: `500 30px/1 ${TYPE}`, color: "white", fontVariantNumeric: "tabular-nums" };
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ font: `600 40px/1.2 ${TYPE}`, color: "white", marginTop: -60, ...enter(t, b.s + 4, { y: 10, dur: DUR.sheet }) }}>Six focus extensions, measured</div>
      <div style={{ display: "grid", gridTemplateColumns: COLS, marginTop: 44, rowGap: 0, ...enter(t, b.s + 10, { y: 12, dur: DUR.sheet }) }}>
        {["", "Script in every page", "CPU per idle minute", "Servers on install"].map((h) => (
          <div key={h} style={{ font: `500 22px/1 ${TYPE}`, color: "white", opacity: 0.6, padding: "0 0 18px", textAlign: h ? "right" : "left" }}>{h}</div>
        ))}
        {BENCH.map((r, i) => {
          const hot = r.name === "BlockSite" ? ramp(t, blockAt, DUR.chip) : r.name === "Study Duo" ? ramp(t, duoAt, DUR.chip) : 0;
          const n = r.name === "BlockSite" ? countTo(t, countAt, 57, 30) : r.servers;
          const color = r.name === "Study Duo" && hot > 0.5 ? "var(--brand)" : "white";
          const row: CSSProperties = { ...cell, padding: "16px 0", borderTop: "1px solid rgb(255 255 255 / 0.12)", opacity: 0.55 + 0.45 * Math.max(hot, ramp(t, b.s + 12 + i * 3, DUR.sheet) * 0.6) };
          return [
            <div key={`${r.name}n`} style={{ ...row, fontWeight: 600, color }}>{r.name}</div>,
            <div key={`${r.name}s`} style={{ ...row, textAlign: "right" }}>{r.script}</div>,
            <div key={`${r.name}c`} style={{ ...row, textAlign: "right" }}>{r.cpu}</div>,
            <div key={`${r.name}v`} style={{ ...row, textAlign: "right", fontWeight: 700, fontSize: 34, color }}>{n}</div>,
          ];
        })}
      </div>
      <div style={{ font: `500 22px/1 ${TYPE}`, color: "white", opacity: ramp(t, b.s + 22, DUR.sheet) * 0.55, marginTop: 30 }}>
        Free versions, each alone in a fresh browser, 9 Oct 2026. CPU while a timer runs, for Study Duo.
      </div>
    </AbsoluteFill>
  );
}

/* ----------------------------------------------------------- 15. price -- */

/** Monthly prices from each product's own pricing page or App Store listing, bench/results/2026-10-08-competitors.md. */
const PRICES = [
  { name: "Opal", price: 19.99 },
  { name: "Brain.fm", price: 14.99 },
  { name: "Focusmate", price: 12 },
  { name: "Freedom", price: 8.99 },
  { name: "Forest Plus", price: 5.99 },
  { name: "Session", price: 4.99 },
  { name: "Pomofocus", price: 3 },
];

function Price({ t }: { t: number }) {
  const b = BEAT.price;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const out = 1 - ramp(t, b.e - 14, 14, EASE.out);
  const freeAt = LINE["price-2"].s;
  const MAX = 760;
  const bar = (name: string, price: number, i: number, ours = false) => {
    const k = ramp(t, ours ? freeAt : b.s + 8 + i * 3, DUR.sheet, EASE.out);
    return (
      <div key={name} style={{ display: "grid", gridTemplateColumns: "240px 800px 150px", alignItems: "center", height: 58, opacity: ours ? k : 0.35 + 0.65 * k }}>
        <div style={{ font: `${ours ? 700 : 500} 30px/1 ${TYPE}`, color: ours ? "var(--brand)" : "white" }}>{name}</div>
        <div style={{ height: 22, width: Math.max(ours ? 6 : 0, (price / 19.99) * MAX * k), borderRadius: 4, background: ours ? "var(--brand)" : "rgb(255 255 255 / 0.75)" }} />
        <div style={{ font: `600 30px/1 ${TYPE}`, color: ours ? "var(--brand)" : "white", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ours ? "$0" : `$${price % 1 ? price.toFixed(2) : price}`}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ font: `600 40px/1.2 ${TYPE}`, color: "white", marginTop: -40, marginBottom: 34, ...enter(t, b.s + 2, { y: 10, dur: DUR.sheet }) }}>A month of focus, at full price</div>
      {PRICES.map((p, i) => bar(p.name, p.price, i))}
      <div style={{ height: 14 }} />
      {bar("Study Duo", 0, 0, true)}
      <div style={{ font: `500 22px/1 ${TYPE}`, color: "white", opacity: ramp(t, b.s + 20, DUR.sheet) * 0.55, marginTop: 30 }}>Monthly prices on each official page, 8 Oct 2026</div>
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------- 16. end card -- */

function EndCard({ t }: { t: number }) {
  const b = BEAT.end;
  if (t < b.s) return null;
  const inT = ramp(t, b.s, 16, EASE.inOut);
  const at = b.s + 10;
  return (
    <AbsoluteFill style={{ background: "var(--brand)", opacity: inT, alignItems: "center", justifyContent: "center" }}>
      <div style={{ marginTop: -90, ...enter(t, at, { y: 14, dur: DUR.sheet }) }}>
        <Img src={staticFile("icon.png")} style={{ width: 132, height: 132, borderRadius: 28, boxShadow: "0 20px 50px rgb(0 0 0 / 0.25)" }} />
      </div>
      <div style={{ display: "flex", gap: 26, marginTop: 30 }}>
        {["Study", "Duo"].map((w, i) => (
          <span key={w} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 8 }}>
            <span style={{ display: "inline-block", font: `700 112px/1.06 ${TYPE}`, letterSpacing: -3, color: "white", transform: `translateY(${mix(ramp(t, at + 6 + i * 3, DUR.word, EASE.word), 110, 0).toFixed(2)}%)` }}>
              {w}
            </span>
          </span>
        ))}
      </div>
      <div style={{ marginTop: 14, font: `600 38px/1 ${TYPE}`, color: "white", ...enter(t, at + 18, { y: 8 }) }}>Free and open source</div>
      <div style={{ marginTop: 30, font: `500 34px/1 ${MONO}`, color: "white", ...enter(t, at + 24, { y: 8 }), opacity: ramp(t, at + 24, DUR.sheet) * 0.92 }}>
        coflazo.github.io/study-duo
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ captions -- */

/**
 * Captions: white text on the film itself, no plate, bottom centre, on screen while the voice says them.
 * Back-to-back phrases hand over in sequence, never stacked: the outgoing one lifts away a beat before the
 * next line starts, then the incoming one rises into place (exit 5 frames, entrance 9: exits run faster).
 */
export function Captions({ t }: { t: number }) {
  const shown = CAPTIONS.map((c, i) => {
    const next = CAPTIONS[i + 1];
    const joined = next !== undefined && next.s - c.e < 18;
    return { ...c, leave: joined ? next.s - 6 : c.e + 6 };
  }).filter((c) => t >= c.s - 3 && t < c.leave + 5);
  const sub = t >= LINE["insights-1"].s && t < BEAT.insights.e;
  return (
    <>
      {shown.map((c) => {
        const inT = ramp(t, c.s - 3, 9, EASE.out);
        const outT = ramp(t, c.leave, 5, EASE.out);
        return (
          <div
            key={`${c.s}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: PILL_Y + 13,
              textAlign: "center",
              font: `600 38px/1.15 ${TYPE}`,
              letterSpacing: -0.3,
              color: "white",
              // Legibility if a line ever crosses light footage; a soft edge, not a plate.
              textShadow: "0 1px 2px rgb(0 0 0 / 0.45), 0 2px 14px rgb(0 0 0 / 0.35)",
              opacity: inT * (1 - outT),
              transform: `translateY(${(mix(inT, 10, 0) + mix(outT, 0, -8)).toFixed(2)}px)`,
            }}
          >
            {c.text}
          </div>
        );
      })}
      {sub && (
        <div style={{ position: "absolute", left: 0, right: 0, top: PILL_Y + 92, textAlign: "center", font: `500 24px/1 ${TYPE}`, color: "white", opacity: ramp(t, LINE["insights-1"].s, DUR.sheet) * (1 - ramp(t, BEAT.insights.e - 10, 10)) * 0.75 }}>
          Shown: 8 weeks of one simulated student
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- pointer -- */

const LINK_PLAY_AT = { x: BOX["panel.link"].x + BOX["panel.link"].width + 30, y: mid(BOX["panel.link"]).y }; // Play, beside the link
const CLICKS = [POP_OPEN - 2, START_CLICK, OPEN_ANYWAY, BACK, PLAY, CUE.pink - 2, CUE.brown - 2, CHOOSE, LINK_PLAY, YT_POP_OPEN - 2, YT_PAUSE, TAB_POP_OPEN - 2, TAB_PAUSE, TAB_NEXT, RATE_TAP];
const POINTER_SPANS: Span[] = [
  { s: POP_OPEN - 40, e: POP_CLOSE + 10 },
  { s: LINE["lock-2"].s - 10, e: BACK + 14 },
  { s: BEAT.noise.s + 20, e: CUE.brown + 20 },
  { s: CHOOSE - 30, e: TAB_NEXT + 16 },
  { s: BEAT.rate.s + 8, e: BEAT.rate.e - 10 },
];

function pointerKeys() {
  const icon = { x: ICON.x, y: ICON.y };
  const start = onPopup(mid(BOX["popup.start"]));
  const p = (at: number, q: { x: number; y: number }) => ({ at, ...q });
  // Page targets move with the camera, so each key reads the camera at its own frame.
  const pg = (at: number, name: string) => p(at, onPage(at, mid(BOX[name])));
  const pn = (at: number, q: { x: number; y: number }) => p(at, onPage(at, inPanel(q)));
  const hero = (name: string) => heroPoint(mid(BOX[name]));
  return [
    p(POP_OPEN - 40, { x: 1240, y: 640 }),
    p(POP_OPEN - 10, icon),
    p(POP_OPEN + 6, icon),
    p(START_CLICK - 8, start),
    p(START_CLICK + 8, start),
    p(POP_CLOSE + 10, { x: 1000, y: 620 }),
    p(LINE["lock-2"].s - 10, { x: 1180, y: 760 }),
    pg(OPEN_ANYWAY - 8, "blocked.openAnyway"),
    pg(OPEN_ANYWAY + 8, "blocked.openAnyway"),
    pg(BACK - 10, "blocked.back"),
    pg(BACK + 10, "blocked.back"),
    p(BEAT.noise.s + 20, { x: 1300, y: 820 }),
    p(PLAY - 10, hero("player.play")),
    p(PLAY + 6, hero("player.play")),
    p(CUE.pink - 12, hero("player.pink")),
    p(CUE.pink + 4, hero("player.pink")),
    p(CUE.brown - 12, hero("player.brown")),
    p(CUE.brown + 6, hero("player.brown")),
    p(CHOOSE - 30, { x: 1300, y: 760 }),
    pn(CHOOSE - 8, mid(BOX["panel.nocturne"])),
    pn(CHOOSE + 10, mid(BOX["panel.nocturne"])),
    pn(LINK_PLAY - 10, LINK_PLAY_AT),
    pn(LINK_PLAY + 8, LINK_PLAY_AT),
    p(YT_POP_OPEN - 12, icon),
    p(YT_POP_OPEN + 6, icon),
    p(YT_PAUSE - 8, onPopup(mid(BOX["popup.youtube.pause"]))),
    p(YT_PAUSE + 10, onPopup(mid(BOX["popup.youtube.pause"]))),
    p(TAB_POP_OPEN - 12, icon),
    p(TAB_POP_OPEN + 6, icon),
    p(TAB_PAUSE - 8, onPopup(mid(BOX["popup.tab.pause"]))),
    p(TAB_PAUSE + 4, onPopup(mid(BOX["popup.tab.pause"]))),
    p(TAB_NEXT - 6, onPopup(mid(BOX["popup.tab.next"]))),
    p(TAB_NEXT + 14, onPopup(mid(BOX["popup.tab.next"]))),
    p(BEAT.rate.s + 8, { x: 1300, y: 760 }),
    p(RATE_TAP - 8, heroPoint(mid(BOX["popup.rate4"]))),
    p(RATE_TAP + 10, heroPoint(mid(BOX["popup.rate4"]))),
  ];
}

const KEYS = pointerKeys();

function Pointer({ t }: { t: number }) {
  let o = 0;
  for (const s of POINTER_SPANS) if (t >= s.s && t <= s.e) o = Math.max(o, ramp(t, s.s, DUR.panel) * (1 - ramp(t, s.e - DUR.panel, DUR.panel)));
  if (o <= 0) return null;
  const pos = trackPos(t, KEYS);
  const last = [...CLICKS].reverse().find((c) => t >= c && t < c + 12);
  return (
    <div style={{ opacity: o }}>
      {last !== undefined && (
        <div
          style={{
            position: "absolute",
            left: pos.x - 22,
            top: pos.y - 22,
            width: 44,
            height: 44,
            borderRadius: 99,
            border: "2px solid rgb(23 25 28 / 0.5)",
            opacity: (1 - ramp(t, last, 12, EASE.out)) * 0.8,
            transform: `scale(${mix(ramp(t, last, 12, EASE.out), 0.4, 1).toFixed(3)})`,
          }}
        />
      )}
      <Cursor x={pos.x} y={pos.y} down={downAt(t, CLICKS)} />
    </div>
  );
}

/* ------------------------------------------------------------ the film -- */

/** One frame of the film, drawn from its number alone. */
export function FilmFrame({ t, captions = true }: { t: number; captions?: boolean }) {
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 35%, #1a1e22 0%, var(--ground) 62%)", fontFamily: TYPE }}>
      <Squares t={t} />
      <SignUp t={t} />
      <Reveal t={t} />
      <Window t={t} />
      <PlayerHero t={t} />
      <RateHero t={t} />
      <Proof t={t} />
      <Price t={t} />
      <EndCard t={t} />
      <Pointer t={t} />
      {captions && <Captions t={t} />}
    </AbsoluteFill>
  );
}

export function Film() {
  return <FilmFrame t={useCurrentFrame()} />;
}
