import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import boxesJson from "../../public/footage/boxes.json";
import breakTimes from "../../public/footage/break/times.json";
import icsLines from "../../public/footage/ics.json";
import timing from "../../public/narration/timing.json";
import { Cursor, downAt, trackPos } from "../chrome";
import { MONO, TYPE } from "../fonts";
import { DUR, EASE, countTo, enter, mix, ramp } from "../motion";
import { Dial } from "./Demo";

/**
 * The launch film: about 100 seconds, narrated and subtitled, laid out from public/narration/timing.json.
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
const BOX = boxesJson as Record<string, Box>;
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
const SOUNDS = mid(BOX["music.sounds"]);
const FILES = { x: mid(BOX["music.files"]).x, y: (BOX["music.files"].y + BOX["music.listens"].y + BOX["music.listens"].height) / 2 };

function camAt(t: number): Cam {
  const push = (from: Cam, to: Cam, at: number, dur: number) => blend(from, to, ramp(t, at, dur, EASE.inOut));
  let c = REST;
  if (t >= BEAT.start.s && t < BEAT.clock.s) c = push(REST, on(mid(BOX["todo.first"]), 1.45), LINE["start-1"].s, 40);
  else if (t >= BEAT.clock.s && t < BEAT.lock.s) {
    c = push(REST, on(CLOCK_AT, 2.6), BEAT.clock.s + 30, 50);
  } else if (t >= BEAT.lock.s && t < BEAT.noise.s) c = push(REST, on({ x: 704, y: 420 }, 1.18), BEAT.lock.s + 10, 60);
  else if (t >= BEAT.noise.s && t < BEAT.songs.s) c = push(REST, on(SOUNDS, 1.7), BEAT.noise.s + 12, 36);
  else if (t >= BEAT.songs.s && t < BEAT.bell.s) c = push(on(SOUNDS, 1.7), on(FILES, 1.25), BEAT.songs.s, 30);
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
const WHITE_RADIO = CUE.white - 22;
const PLAY = CUE.white - 2;
const CHOOSE = CUE.song - 8;
const RATE_TAP = LINE.rate.s + 40;
const EXPORT = LINE.calendar.s + 40;

/** The window is up for these stretches; it rises out of the dark ground and sinks back into it. */
const WINDOW_SPANS: Span[] = [
  { s: 0, e: SQUARES_AT + 16 },
  { s: BEAT.start.s, e: BEAT.rate.s + 8 },
  { s: BEAT.insights.s, e: BEAT.proof.s + 8 },
];

/* ------------------------------------------------------------- footage -- */

type Shot = { from: number; full: number; src: string };
const SHOTS: Shot[] = (() => {
  const s: Shot[] = [];
  const add = (at: number, src: string, fade = 0) => s.push({ from: at, full: at + fade, src });
  add(-1, "notes.png");
  add(BEAT.start.s - 1, "todo.png");
  add(BEAT.clock.s, "clock-0.png", 9);
  for (let i = 1; i <= 5; i++) add(BEAT.clock.s + 30 * i, `clock-${i}.png`, 2);
  add(BEAT.lock.s, "blocked-10.png", 9);
  add(BEAT.lock.s + 30, "blocked-9.png", 2);
  add(LINE["lock-2"].s - 8, "blocked-open.png", 6);
  add(OPEN_ANYWAY + 2, "blocked-why.png", 4);
  add(OPEN_ANYWAY + 30, "blocked-reason.png", 4);
  add(BEAT.noise.s, "music-silence.png", 9);
  add(PLAY + 2, "music-white.png", 4);
  add(CUE.pink, "music-pink.png", 3);
  add(CUE.brown, "music-brown.png", 3);
  add(CHOOSE + 6, "music-files.png", 6);
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
  add(BEAT.calendar.s, "timeline.png", 9);
  add(BEAT.move.s, "move.png", 9);
  return s.sort((a, b) => a.from - b.from);
})();

function Layer({ src, opacity }: { src: string; opacity: number }) {
  return <Img src={staticFile(`footage/${src}`)} style={{ position: "absolute", inset: 0, width: VIEW.w, height: VIEW.h, opacity }} />;
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
        {k < 1 && <Layer key={`p${i}`} src={prev.src} opacity={1} />}
        <Layer key={`c${i}`} src={cur.src} opacity={k} />
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
  if (t < BEAT.bell.s) return duo("Music · Study Duo", "dashboard.html#music");
  if (t < BEAT.insights.s) return notes;
  if (t < BEAT.calendar.s) return duo("Insights · Study Duo", "dashboard.html#insights");
  if (t < BEAT.move.s) return duo("Timeline · Study Duo", "dashboard.html#timeline");
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

function Popup({ t }: { t: number }) {
  if (t < POP_OPEN || t >= POP_CLOSE + 6) return null;
  const inT = ramp(t, POP_OPEN, DUR.chip, EASE.out);
  const outT = ramp(t, POP_CLOSE, DUR.chip, EASE.out);
  const k = ramp(t, START_CLICK + 2, 4, EASE.out);
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
      <Img src={staticFile("footage/popup-ready.png")} style={img} />
      {k > 0 && <Img src={staticFile("footage/popup-running.png")} style={{ ...img, opacity: k }} />}
    </div>
  );
}

/** The calendar file the Timeline exports, as it was written, on a panel beside the window. */
function IcsPanel({ t }: { t: number }) {
  const at = EXPORT + 6;
  if (t < at || t >= BEAT.move.s) return null;
  const lines = (icsLines as string[]).filter(Boolean).slice(0, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: 1150,
        top: 300,
        width: 560,
        padding: "22px 26px",
        borderRadius: 14,
        background: "#16191c",
        boxShadow: "0 30px 80px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.08)",
        ...enter(t, at, { y: 16, dur: DUR.sheet }),
        opacity: ramp(t, at, DUR.sheet) * (1 - ramp(t, BEAT.move.s - 10, 10)),
      }}
    >
      <div style={{ font: `600 20px/1 ${TYPE}`, color: "white", marginBottom: 16 }}>study-duo-2026-10-08.ics</div>
      {lines.map((l, i) => (
        <div key={i} style={{ font: `400 16px/24px ${MONO}`, color: l.startsWith("SUMMARY") || l.startsWith("DTSTART") ? "white" : "rgb(255 255 255 / 0.55)", whiteSpace: "nowrap", overflow: "hidden" }}>
          {l}
        </div>
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
      <IcsPanel t={t} />
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

function Proof({ t }: { t: number }) {
  const b = BEAT.proof;
  if (t < b.s - 2 || t > b.e + 2) return null;
  const out = 1 - ramp(t, b.e - 14, 14, EASE.out);
  const countAt = LINE["proof-2"].s + Math.round((LINE["proof-2"].e - LINE["proof-2"].s) * 0.45);
  const n = countTo(t, countAt, 56, 40);
  const zeroAt = LINE["proof-3"].s;
  const col = (name: string, value: number, at: number, accent: boolean, dots: number) => (
    <div style={{ width: 520, display: "flex", flexDirection: "column", alignItems: "center", ...enter(t, at, { y: 14, dur: DUR.sheet }) }}>
      <div style={{ font: `600 34px/1 ${TYPE}`, color: "white", opacity: 0.8 }}>{name}</div>
      <div style={{ font: `700 190px/1 ${TYPE}`, fontVariantNumeric: "tabular-nums", color: accent ? "var(--brand)" : "white", marginTop: 18, letterSpacing: -4 }}>{value}</div>
      <div style={{ marginTop: 28, width: 8 * 28, height: 7 * 28, display: "flex", flexWrap: "wrap", alignContent: "flex-start" }}>
        {Array.from({ length: dots }, (_, i) => (
          <div key={i} style={{ width: 16, height: 16, margin: 6, borderRadius: 99, background: "white", opacity: 0.55 }} />
        ))}
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ font: `600 36px/1.2 ${TYPE}`, color: "white", marginTop: -40, ...enter(t, b.s + 4, { y: 10, dur: DUR.sheet }) }}>Outside servers contacted on install</div>
      <div style={{ display: "flex", gap: 80, marginTop: 50 }}>
        {col("BlockSite", n, b.s + 10, false, n)}
        {col("Study Duo", 0, b.s + 16, ramp(t, zeroAt, DUR.chip) > 0.5, 0)}
      </div>
      <div style={{ font: `500 24px/1 ${TYPE}`, color: "white", opacity: ramp(t, b.s + 22, DUR.sheet) * 0.6, marginTop: 6 }}>Measured 8 Oct 2026</div>
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------- 15. end card -- */

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

const CLICKS = [POP_OPEN - 2, START_CLICK, OPEN_ANYWAY, BACK, WHITE_RADIO, PLAY, CUE.pink - 2, CUE.brown - 2, CHOOSE, RATE_TAP, EXPORT];
const POINTER_SPANS: Span[] = [
  { s: POP_OPEN - 40, e: POP_CLOSE + 10 },
  { s: LINE["lock-2"].s - 10, e: BACK + 14 },
  { s: BEAT.noise.s + 20, e: CHOOSE + 20 },
  { s: BEAT.rate.s + 8, e: BEAT.rate.e - 10 },
  { s: LINE.calendar.s, e: EXPORT + 24 },
];

function pointerKeys() {
  const icon = { x: ICON.x, y: ICON.y };
  const start = onPopup(mid(BOX["popup.start"]));
  const p = (at: number, q: { x: number; y: number }) => ({ at, ...q });
  // Page targets move with the camera, so each key reads the camera at its own frame.
  const pg = (at: number, name: string) => p(at, onPage(at, mid(BOX[name])));
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
    p(BEAT.noise.s + 20, { x: 1200, y: 760 }),
    pg(WHITE_RADIO - 8, "music.white"),
    pg(WHITE_RADIO + 4, "music.white"),
    pg(PLAY - 8, "music.play"),
    pg(PLAY + 6, "music.play"),
    pg(CUE.pink - 12, "music.pink"),
    pg(CUE.pink + 4, "music.pink"),
    pg(CUE.brown - 12, "music.brown"),
    pg(CUE.brown + 6, "music.brown"),
    pg(CHOOSE - 10, "music.choose"),
    pg(CHOOSE + 20, "music.choose"),
    p(BEAT.rate.s + 8, { x: 1300, y: 760 }),
    p(RATE_TAP - 8, heroPoint(mid(BOX["popup.rate4"]))),
    p(RATE_TAP + 10, heroPoint(mid(BOX["popup.rate4"]))),
    p(LINE.calendar.s, { x: 1100, y: 640 }),
    pg(EXPORT - 8, "timeline.export"),
    pg(EXPORT + 24, "timeline.export"),
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
      <RateHero t={t} />
      <Proof t={t} />
      <EndCard t={t} />
      <Pointer t={t} />
      {captions && <Captions t={t} />}
    </AbsoluteFill>
  );
}

export function Film() {
  return <FilmFrame t={useCurrentFrame()} />;
}
