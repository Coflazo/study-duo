import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import breakTimes from "../../public/footage/break/times.json";
import { Cursor, downAt, trackPos } from "../chrome";
import { MONO, TYPE } from "../fonts";
import { DUR, EASE, caretOn, enter, mix, ramp, typed } from "../motion";

/**
 * Study Duo in 45 seconds: the problem (tabs), then the product doing its job on one study block.
 *
 * Every pixel inside the browser window is a screenshot of the real extension, shot at 2x by
 * tests/e2e/demo-capture.e2e.ts. The window, tab strip, address bar, toolbar icon and pointer are drawn here.
 * Insights come from one simulated student (src/ml/synthetic.ts), and the film says so on screen.
 *
 * Frames are absolute within the body (Root.tsx shifts the body past the title card).
 */

/* ------------------------------------------------------------ geometry -- */

const S = 1600 / 1408; // footage CSS px -> canvas px (the page was shot at 1408x720)
const WIN = { x: 160, y: 30, w: 1600 };
const TAB_H = 40;
const TOOL_H = 44;
const VIEW = { x: WIN.x, y: WIN.y + TAB_H + TOOL_H, w: WIN.w, h: Math.round(720 * S) };
const WIN_H = TAB_H + TOOL_H + VIEW.h;
const CAPTION_Y = WIN.y + WIN_H + 40;

const ICON = { x: WIN.x + WIN.w - 92, y: WIN.y + TAB_H + TOOL_H / 2 }; // the Study Duo toolbar button, centre
const OMNI = { x: WIN.x + 136, w: WIN.w - 136 - 132 };
const POPUP = { right: ICON.x + 18, top: VIEW.y + 2, w: 360 * S, h: 560 * S };
const TAB_X = WIN.x + 84;
const TAB_W = 236;

/** A point on the page footage, in canvas px (page at zoom 1). */
const page = (x: number, y: number) => ({ x: Math.round(VIEW.x + x * S), y: Math.round(VIEW.y + y * S) });
/** A point in the popup footage, in canvas px. */
const pop = (x: number, y: number) => ({ x: Math.round(POPUP.right - POPUP.w + x * S), y: Math.round(POPUP.top + y * S) });

/* ------------------------------------------------------------- the beats -- */

const PLUS = 92; // new tab
const GO_VIDEOS = 116;
const THUMBS = [150, 168, 186];
const CLOSE_TABS = 226;
const OPEN_POPUP = 272;
const START = 320;
const CLOSE_POPUP = 372;
const CLOCK_ON = 378;
const OMNI_CLICK = 600;
const REDDIT = 626;
const BACK = 720;
const SKIP = 752; // 25 minutes later
const BLOCK_END = 800;
const RATE_OPEN = 924;
const RATE_4 = 952;
const RATE_CLOSE = 978;
const INSIGHTS = 990;
const OUTRO = 1176;
export const DEMO_LEN = 1284;

const CLICKS = [PLUS, ...THUMBS, OPEN_POPUP, START, CLOSE_POPUP, OMNI_CLICK, BACK, RATE_OPEN, RATE_4, RATE_CLOSE];

const START_BTN = pop(94, 449);
const KEY_4 = pop(229, 209);
const BACK_BTN = page(565, 528);
const THUMB_AT = [page(531, 172), page(876, 172), page(1220, 172)];
const PLUS_AT = { x: TAB_X + TAB_W + 20, y: WIN.y + 22 };
const OMNI_AT = { x: OMNI.x + 260, y: ICON.y };

const POINTER = [
  { at: 0, x: 1040, y: 760 },
  { at: 40, x: 1040, y: 760 },
  { at: PLUS - 8, ...PLUS_AT },
  { at: PLUS + 8, ...PLUS_AT },
  { at: 132, x: 900, y: 520 },
  { at: THUMBS[0] - 8, ...THUMB_AT[0] },
  { at: THUMBS[0] + 8, ...THUMB_AT[0] },
  { at: THUMBS[1] - 4, ...THUMB_AT[1] },
  { at: THUMBS[1] + 8, ...THUMB_AT[1] },
  { at: THUMBS[2] - 4, ...THUMB_AT[2] },
  { at: THUMBS[2] + 8, ...THUMB_AT[2] },
  { at: 230, x: 1180, y: 620 },
  { at: OPEN_POPUP - 8, ...ICON },
  { at: OPEN_POPUP + 8, ...ICON },
  { at: START - 8, ...START_BTN },
  { at: START + 8, ...START_BTN },
  { at: CLOSE_POPUP - 10, x: 760, y: 560 },
  { at: CLOSE_POPUP + 8, x: 760, y: 560 },
  { at: 420, x: 1060, y: 860 },
  { at: OMNI_CLICK - 8, ...OMNI_AT },
  { at: OMNI_CLICK + 8, ...OMNI_AT },
  { at: 660, x: 1240, y: 780 },
  { at: BACK - 8, ...BACK_BTN },
  { at: BACK + 8, ...BACK_BTN },
  { at: 780, x: 1060, y: 700 },
  { at: 880, x: 1060, y: 700 },
  { at: RATE_OPEN - 8, ...ICON },
  { at: RATE_OPEN + 8, ...ICON },
  { at: RATE_4 - 6, ...KEY_4 },
  { at: RATE_4 + 8, ...KEY_4 },
  { at: RATE_CLOSE - 6, x: 1180, y: 560 },
  { at: RATE_CLOSE + 6, x: 1180, y: 560 },
];

/* ------------------------------------------------------------- footage -- */

type Shot = { from: number; full: number; src: string | null };

/** The page stream: each shot dissolves in over the one before it (never both fading), so no frame dips. */
const SHOTS: Shot[] = (() => {
  const s: Shot[] = [];
  const add = (at: number, src: string | null, fade = 0) => s.push({ from: at, full: at + fade, src });
  add(-1, "notes.png");
  add(PLUS + 2, null, 3); // the new tab page
  add(GO_VIDEOS + 2, "videos.png", 5);
  add(CLOSE_TABS + 4, "notes.png", 6);
  add(CLOCK_ON, "clock-0.png", 9); // the corner clock fades in on the page
  for (let i = 1; i <= 7; i++) add(CLOCK_ON + 30 * i, `clock-${i}.png`, 2);
  add(REDDIT + 2, "blocked-10.png", 6);
  add(REDDIT + 32, "blocked-9.png", 2);
  add(BACK + 4, "clock-back.png", 6);
  // The break, as shot: one still per capture, each blended into the next unless the gap was long.
  const times = breakTimes as number[];
  const at = (ms: number) => BLOCK_END + (ms * 30) / 1000;
  add(SKIP, `break/${times[0]}.jpg`, at(times[0]) - SKIP);
  for (let i = 1; i < times.length; i++) {
    const prev = at(times[i - 1]);
    const here = at(times[i]);
    s.push({ from: here - prev <= 9 ? prev : here, full: here, src: `break/${times[i]}.jpg` });
  }
  add(INSIGHTS + 2, "insights.png", 9);
  return s;
})();

function Layer({ src, opacity }: { src: string | null; opacity: number }) {
  const style: CSSProperties = { position: "absolute", inset: 0, width: VIEW.w, height: VIEW.h, opacity };
  if (!src) return <div style={{ ...style, background: "var(--paper)" }} />;
  return <Img src={staticFile(`footage/${src}`)} style={style} />;
}

/** Slow pushes on the footage only: towards the corner clock, then the heat map. */
function zoomAt(f: number): { z: number; ox: number; oy: number } {
  const clockIn = ramp(f, 412, 34, EASE.inOut);
  const clockOut = ramp(f, 538, 34, EASE.inOut);
  // From the page's top-right corner, so the clock keeps its margin and stays whole at full push.
  if (f < 600) return { z: mix(clockIn - clockOut, 1, 1.7), ox: VIEW.w, oy: 0 };
  // The heat map and the best windows together; the nav rail is what leaves the frame.
  const heat = ramp(f, INSIGHTS + 16, 60, EASE.inOut);
  return { z: mix(heat, 1, 1.2), ox: VIEW.w, oy: 180 * S };
}

function Page({ f }: { f: number }) {
  let i = 0;
  while (i < SHOTS.length - 1 && SHOTS[i + 1].from <= f) i++;
  const cur = SHOTS[i];
  const prev = SHOTS[Math.max(0, i - 1)];
  const t = cur.full > cur.from ? Math.min(1, (f - cur.from) / (cur.full - cur.from)) : 1;
  const { z, ox, oy } = zoomAt(f);
  return (
    <div style={{ position: "absolute", left: VIEW.x, top: VIEW.y, width: VIEW.w, height: VIEW.h, overflow: "hidden", background: "var(--paper)" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${z.toFixed(4)})`, transformOrigin: `${ox}px ${oy}px` }}>
        {t < 1 && <Layer key={`p${i}`} src={prev.src} opacity={1} />}
        <Layer key={`c${i}`} src={cur.src} opacity={t} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the tabs -- */

type Tab = { id: string; title: (f: number) => string; icon: "notes" | "video" | "duo" | "blank"; open: number; close?: number };

const TABS: Tab[] = [
  {
    id: "notes",
    title: (f) => (f >= REDDIT + 2 && f < BACK + 4 ? "Closed for now" : "Week 6 · Eigenvalues"),
    icon: "notes",
    open: -100,
  },
  { id: "watch", title: (f) => (f < GO_VIDEOS + 2 ? "New Tab" : "Watch"), icon: "video", open: PLUS, close: CLOSE_TABS },
  { id: "monk", title: () => "I studied like a monk for 30 days", icon: "video", open: THUMBS[0] + 2, close: CLOSE_TABS + 3 },
  { id: "cats", title: () => "Every cat video from 2014, ranked", icon: "video", open: THUMBS[1] + 2, close: CLOSE_TABS + 6 },
  { id: "focus", title: () => "Why you can’t focus (and how to fix it)", icon: "video", open: THUMBS[2] + 2, close: CLOSE_TABS + 9 },
  { id: "duo", title: () => "Study Duo", icon: "duo", open: INSIGHTS },
];

function activeTab(f: number): string {
  if (f >= INSIGHTS) return "duo";
  if (f >= PLUS && f < CLOSE_TABS) return "watch";
  return "notes";
}

function TabIcon({ kind, f }: { kind: Tab["icon"]; f: number }) {
  const box: CSSProperties = { width: 16, height: 16, borderRadius: 4, flexShrink: 0 };
  if (kind === "blank") return <div style={{ ...box, borderRadius: 99, border: "1.5px solid var(--ink-3)" }} />;
  if (kind === "video") return <div style={{ ...box, background: "#e5484d" }} />;
  if (kind === "duo" || (kind === "notes" && f >= REDDIT + 2 && f < BACK + 4))
    return <Img src={staticFile("icon.png")} style={{ ...box, borderRadius: 3 }} />;
  return <div style={{ ...box, background: "#6a6e69", color: "white", font: `700 10px/16px ${TYPE}`, textAlign: "center" }}>L</div>;
}

function Tabs({ f }: { f: number }) {
  const active = activeTab(f);
  let x = TAB_X;
  const out: ReactNode[] = [];
  for (const tab of TABS) {
    const grow = ramp(f, tab.open, 8, EASE.out) * (tab.close === undefined ? 1 : 1 - ramp(f, tab.close, 6, EASE.out));
    if (grow <= 0.01) continue;
    const w = TAB_W * grow;
    const on = tab.id === active;
    out.push(
      <div
        key={tab.id}
        style={{
          position: "absolute",
          left: x,
          top: WIN.y + 6,
          width: w,
          height: TAB_H - 6,
          borderRadius: "10px 10px 0 0",
          background: on ? "white" : "transparent",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 12px",
          overflow: "hidden",
          opacity: Math.min(1, grow * 1.6),
        }}
      >
        <TabIcon kind={tab.id === "watch" && f < GO_VIDEOS + 2 ? "blank" : tab.icon} f={f} />
        <span style={{ font: `500 14px/1 ${TYPE}`, color: on ? "var(--ink)" : "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tab.title(f)}
        </span>
        {!on && <span style={{ position: "absolute", right: 0, top: 9, bottom: 9, width: 1, background: "var(--line)" }} />}
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

/* ------------------------------------------------------- the address bar -- */

function Address({ f }: { f: number }) {
  const chip = (label: string, rest: string) => (
    <>
      <span style={{ padding: "3px 10px", borderRadius: 99, background: "var(--sunken)", color: "var(--ink)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--ink-3)" }}>{rest}</span>
    </>
  );
  let body: ReactNode;
  if (f >= INSIGHTS) body = chip("Study Duo", "dashboard.html#insights");
  else if (f >= REDDIT && f < BACK + 4) body = chip("Study Duo", "chrome-extension://…/blocked.html");
  else if (f >= OMNI_CLICK && f < REDDIT) {
    const text = typed(f, OMNI_CLICK + 6, "reddit.com");
    body = f < OMNI_CLICK + 6
      ? <span style={{ background: "#b4d5fe", color: "var(--ink)" }}>lecture-notes.example/linear-algebra/week-6</span>
      : <span style={{ color: "var(--ink)" }}>{text}<Caret f={f} /></span>;
  } else if (f >= PLUS && f < CLOSE_TABS + 4) {
    body = f < GO_VIDEOS
      ? <span style={{ color: "var(--ink)" }}>{typed(f, PLUS + 4, "videos.example")}<Caret f={f} /></span>
      : <span style={{ color: "var(--ink)" }}>videos.example</span>;
  } else body = <span><span style={{ color: "var(--ink)" }}>lecture-notes.example</span><span style={{ color: "var(--ink-3)" }}>/linear-algebra/week-6</span></span>;
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
      {body}
    </div>
  );
}

function Caret({ f }: { f: number }) {
  return <span style={{ display: "inline-block", width: 1.5, height: 17, marginLeft: 1, verticalAlign: -3, background: "var(--ink)", opacity: caretOn(f) ? 1 : 0 }} />;
}

/* ------------------------------------------------- the toolbar button -- */

/** Time left in the film's study block, then its break (ms), from the moment Start is pressed. */
function timer(f: number): { phase: "focus" | "break"; left: number } | null {
  if (f < START + 2) return null;
  if (f < SKIP + 6) return { phase: "focus", left: 25 * 60_000 - ((f - START) * 1000) / 30 };
  if (f < BLOCK_END) return { phase: "focus", left: ((BLOCK_END - f) * 1000) / 30 };
  return { phase: "break", left: 5 * 60_000 - ((f - BLOCK_END) * 1000) / 30 };
}

/** The running dial, drawn with drawDial's geometry (src/background/dial-canvas.ts) at size 32. */
function Dial({ phase, left }: { phase: "focus" | "break"; left: number }) {
  const total = 30 * 60_000;
  const spent = phase === "focus" ? 25 * 60_000 - left : total - left;
  const arcs =
    phase === "focus"
      ? [
          { from: 0, to: spent / total, c: "#363A37" },
          { from: spent / total, to: 25 / 30, c: "#E5483A" },
          { from: 25 / 30, to: 1, c: "#4FA772" },
        ]
      : [
          { from: 0, to: spent / total, c: "#363A37" },
          { from: spent / total, to: 1, c: "#4FA772" },
        ];
  const w = 32 * 0.13;
  const r = 32 * 0.34 - w / 2;
  const gap = 1 / r;
  const path = (a: number, b: number) => {
    const p = (t: number) => [16 + r * Math.cos(t - Math.PI / 2), 16 + r * Math.sin(t - Math.PI / 2)];
    const [x1, y1] = p(a);
    const [x2, y2] = p(b);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <svg width={22} height={22} viewBox="0 0 32 32">
      <rect width={32} height={32} rx={6.4} fill="#0B0C0D" />
      {arcs.map((a, i) => {
        const pad = a.c === "#363A37" ? 0 : gap / 2;
        const from = a.from * Math.PI * 2 + pad;
        const to = a.to * Math.PI * 2 - pad;
        return to - from < 0.01 ? null : <path key={i} d={path(from, to)} stroke={a.c} strokeWidth={w} fill="none" />;
      })}
    </svg>
  );
}

function ToolbarButton({ f }: { f: number }) {
  const t = timer(f);
  const badge = t ? (t.left < 60_000 ? "<1" : String(Math.ceil(t.left / 60_000))) : "";
  return (
    <div style={{ position: "absolute", left: ICON.x - 11, top: ICON.y - 11, width: 22, height: 22 }}>
      {t ? <Dial phase={t.phase} left={t.left} /> : <Img src={staticFile("icon.png")} style={{ width: 22, height: 22 }} />}
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
            background: t?.phase === "break" ? "var(--green)" : "var(--red)",
            color: "white",
            font: `700 10.5px/14px ${TYPE}`,
            textAlign: "center",
            opacity: ramp(f, START + 2, DUR.chip),
          }}
        >
          {badge}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the popup -- */

function Popup({ f, open, close, first, second, switchAt }: { f: number; open: number; close: number; first: string; second: string; switchAt: number }) {
  if (f < open || f >= close + 6) return null;
  const inT = ramp(f, open, DUR.chip, EASE.out);
  const outT = ramp(f, close, DUR.chip, EASE.out);
  const t2 = ramp(f, switchAt, 4, EASE.out);
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
        transform: `translateY(${mix(inT, -6, 0).toFixed(2)}px) scale(${mix(inT, 0.98, 1).toFixed(4)})`,
        transformOrigin: "top right",
      }}
    >
      <Img src={staticFile(`footage/${first}`)} style={img} />
      {t2 > 0 && <Img src={staticFile(`footage/${second}`)} style={{ ...img, opacity: t2 }} />}
    </div>
  );
}

/* ---------------------------------------------------------- the window -- */

function Window({ f }: { f: number }) {
  // A bright window on a dark ground: a symmetric 18-frame ease spreads the luminance change so no single frame
  // jumps (check-frames.mjs flagged the 12-frame ease-out at both ends).
  const inT = ramp(f, 0, DUR.hero, EASE.inOut);
  const outT = ramp(f, OUTRO, DUR.hero, EASE.inOut);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: inT * (1 - outT),
        transform: `translateY(${(mix(inT, 14, 0) + mix(outT, 0, 14)).toFixed(2)}px)`,
      }}
    >
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
      <Tabs f={f} />
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y + TAB_H, width: WIN.w, height: TOOL_H, background: "white", borderBottom: "1px solid var(--line)" }} />
      <div style={{ position: "absolute", left: WIN.x + 22, top: WIN.y + TAB_H + 10, font: `400 20px/24px ${TYPE}`, color: "var(--ink-3)", letterSpacing: 14 }}>
        ‹›↻
      </div>
      <Address f={f} />
      <ToolbarButton f={f} />
      <div style={{ position: "absolute", left: WIN.x + WIN.w - 50, top: ICON.y - 12, width: 24, height: 24, borderRadius: 99, background: "var(--sunken)" }} />
      <div style={{ position: "absolute", left: VIEW.x, top: VIEW.y, width: VIEW.w, height: VIEW.h, borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -VIEW.x, top: -VIEW.y }}>
          <Page f={f} />
        </div>
      </div>
      <Popup f={f} open={OPEN_POPUP + 2} close={CLOSE_POPUP} first="popup-ready.png" second="popup-running.png" switchAt={START + 2} />
      <Popup f={f} open={RATE_OPEN + 2} close={RATE_CLOSE} first="popup-rating.png" second="popup-rated.png" switchAt={RATE_4 + 2} />
    </div>
  );
}

/* ------------------------------------------------------------ captions -- */

const CAPTIONS: { at: number; out: number; text: string; sub?: string }[] = [
  { at: 16, out: 106, text: "You sit down to study" },
  { at: 124, out: 222, text: "20 minutes later…" },
  { at: 246, out: 404, text: "Pick a task, press Start" },
  { at: 416, out: 576, text: "A clock in the corner of every page" },
  { at: 634, out: 744, text: "Distracting sites stay closed" },
  { at: 752, out: 800, text: "25 minutes later…" },
  { at: 808, out: 984, text: "A bell, a break, one tap to rate it" },
  { at: INSIGHTS + 8, out: OUTRO - 4, text: "It learns your best hours", sub: "Shown: 8 weeks of one simulated student" },
];

function Caption({ f }: { f: number }) {
  const c = CAPTIONS.find((c) => f >= c.at && f < c.out + 8);
  if (!c) return null;
  const gone = ramp(f, c.out, 8, EASE.out);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: CAPTION_Y,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: 1 - gone,
        transform: `translateY(${mix(gone, 0, -8).toFixed(2)}px)`,
      }}
    >
      <div style={{ display: "flex", gap: 13 }}>
        {c.text.split(" ").map((word, i) => {
          const t = ramp(f, c.at + i * 3, DUR.word, EASE.word);
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 4 }}>
              <span style={{ display: "inline-block", font: `700 42px/1.1 ${TYPE}`, letterSpacing: -0.6, color: "var(--paper)", transform: `translateY(${mix(t, 110, 0).toFixed(2)}%)` }}>
                {word}
              </span>
            </span>
          );
        })}
      </div>
      {c.sub && (
        <div style={{ marginTop: 10, font: `500 21px/1 ${TYPE}`, color: "var(--paper)", ...enter(f, c.at + 12, { y: 6 }), opacity: ramp(f, c.at + 12, DUR.sheet) * 0.66 }}>
          {c.sub}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- outro -- */

function Outro({ f }: { f: number }) {
  if (f < OUTRO + 10) return null;
  const fade = 1 - ramp(f, DEMO_LEN - 16, 14, EASE.out); // back to the bare ground the title card opens on
  const words = ["Offline.", "Free.", "No", "account."];
  const at = OUTRO + 11; // rising as the window goes: an empty frame between the two reads as a tiled frame to the gate
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade }}>
      <div style={{ display: "flex", gap: 20 }}>
        {words.map((w, i) => (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 6 }}>
            <span
              style={{
                display: "inline-block",
                font: `700 84px/1.06 ${TYPE}`,
                letterSpacing: -2.2,
                color: "white",
                transform: `translateY(${mix(ramp(f, at + i * 3, DUR.word, EASE.word), 110, 0).toFixed(2)}%)`,
              }}
            >
              {w}
            </span>
          </span>
        ))}
      </div>
      <div style={{ width: 120, height: 3, borderRadius: 99, marginTop: 28, background: "var(--brand)", transform: `scaleX(${ramp(f, at + 18, DUR.sheet).toFixed(3)})` }} />
      <div style={{ marginTop: 28, font: `500 34px/1 ${MONO}`, color: "white", ...enter(f, at + 22, { y: 8 }), opacity: ramp(f, at + 22, DUR.sheet) * 0.92 }}>
        coflazo.github.io/study-duo
      </div>
      <div style={{ marginTop: 16, font: `500 21px/1 ${TYPE}`, color: "white", ...enter(f, at + 28, { y: 6 }), opacity: ramp(f, at + 28, DUR.sheet) * 0.6 }}>
        Open source. One line to install.
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ the film -- */

export function Demo() {
  const f = useCurrentFrame();
  const pos = trackPos(f, POINTER);
  const pointerFade = ramp(f, 14, DUR.panel) * (1 - ramp(f, INSIGHTS, 10)); // nothing left to click once the insights are up
  const lastClick = [...CLICKS].reverse().find((c) => f >= c && f < c + 12);
  return (
    <AbsoluteFill style={{ background: "var(--ground)", fontFamily: TYPE }}>
      <Window f={f} />
      {lastClick !== undefined && (
        <div
          style={{
            position: "absolute",
            left: pos.x - 22,
            top: pos.y - 22,
            width: 44,
            height: 44,
            borderRadius: 99,
            border: "2px solid rgb(23 25 28 / 0.5)",
            opacity: (1 - ramp(f, lastClick, 12, EASE.out)) * 0.8,
            transform: `scale(${mix(ramp(f, lastClick, 12, EASE.out), 0.4, 1).toFixed(3)})`,
          }}
        />
      )}
      <div style={{ opacity: pointerFade }}>
        <Cursor x={pos.x} y={pos.y} down={downAt(f, CLICKS)} />
      </div>
      <Caption f={f} />
      <Outro f={f} />
    </AbsoluteFill>
  );
}
