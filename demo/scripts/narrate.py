"""The film's voice and its clock.

Speaks every narration line with Kokoro (local, Apache-2.0, voice bm_lewis), one WAV per line, then lays the film out
from the measured lengths and writes public/narration/timing.json. The composition, the audio mix and the subtitles all
read that one file, so a line that runs long moves the picture, the sound and the captions together.

  pip install kokoro-onnx soundfile
  # model files in demo/.cache (git-ignored), see demo/README.md
  python3 scripts/narrate.py
"""

import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.dirname(HERE)
CACHE = os.path.join(DEMO, ".cache")
OUT = os.path.join(DEMO, "public", "narration")
VOICE, LANG, SPEED = "bm_lewis", "en-gb", 1.0
RATE = 24000

# Beats in order. Each: id, narration lines, and the extra time the beat needs around them (seconds).
#   lead: picture before the first word. gap: between lines. tail: picture after the last word.
#   hold: a stretch inside the beat with no voice (the bell, the noise, the song), placed by `hold_at`.
BEATS = [
    dict(id="hook", lead=0.8, gap=0.5, tail=0.4, lines=[
        ("hook-1", "You sit down to study at eight."),
        ("hook-2", "By nine, you've read one page and opened fourteen tabs."),
    ]),
    dict(id="problem", lead=0.3, tail=0.5, lines=[
        ("problem", "So you install a blocker, and it wants you to sign up."),
    ]),
    dict(id="reveal", lead=1.0, gap=0.4, tail=0.5, lines=[
        ("reveal-1", "Study Duo is a study timer that lives in your browser."),
        ("reveal-2", "Free, offline, and it never phones home."),
    ]),
    dict(id="start", lead=0.4, gap=0.8, tail=0.6, lines=[
        ("start-1", "Your deadlines come in from your course calendar."),
        ("start-2", "Pick one and press Start."),
    ]),
    dict(id="clock", lead=0.4, tail=0.7, lines=[
        ("clock", "A small clock sits in the corner of every page, and fades while you read."),
    ]),
    dict(id="lock", lead=0.3, gap=0.5, tail=0.8, lines=[
        ("lock-1", "Distracting sites stay closed until the block ends."),
        ("lock-2", "Opening one anyway takes ten seconds and a reason."),
    ]),
    # The popup's record player: the disc slides out of its sleeve and turns; white, pink and brown each get about
    # 1.5 s on their own after the line.
    dict(id="noise", lead=0.5, gap=0.5, tail=0.3, hold=4.2, hold_at="after", lines=[
        ("player", "Under the timer sits a record player."),
        ("noise", "White, pink or brown noise, made right here."),
    ]),
    # Your music folder in the side panel; the song plays on its own after the line, clearly audible.
    dict(id="songs", lead=0.3, tail=0.2, hold=2.8, hold_at="after", lines=[
        ("songs", "Point it at your music folder, and it plays like a music app."),
    ]),
    dict(id="streaming", lead=0.4, gap=0.5, tail=0.6, lines=[
        ("streaming-1", "A YouTube or Spotify link plays in the side panel."),
        ("streaming-2", "The popup plays, pauses and skips it."),
    ]),
    dict(id="tabs", lead=0.3, tail=0.7, lines=[
        ("tabs", "Music already playing in another tab? Pause it or skip it from here."),
    ]),
    # The clock reaches 00:00, the bell rings, and nothing is spoken until both strikes have landed.
    dict(id="bell", lead=0.0, tail=1.0, hold=3.2, hold_at="before", lines=[
        ("bell", "When time's up, a bell rings and the page tells you to rest."),
    ]),
    dict(id="rate", lead=0.5, tail=0.6, lines=[
        ("rate", "One tap says how focused you were."),
    ]),
    dict(id="insights", lead=0.6, gap=0.25, tail=1.2, lines=[
        ("insights-1", "After a few weeks, it knows your best hours,"),
        ("insights-2", "and which songs actually help you focus."),
    ]),
    dict(id="calendar", lead=0.4, tail=0.7, lines=[
        ("calendar", "Every block can land in your Google Calendar by itself."),
    ]),
    dict(id="move", lead=0.4, tail=0.7, lines=[
        ("move", "New laptop? Move your settings and to-dos over with a QR code."),
    ]),
    dict(id="proof", lead=0.5, gap=0.5, tail=1.0, lines=[
        ("proof-1", "We measured it next to five other focus extensions."),
        ("proof-2", "When we installed BlockSite, it contacted fifty-seven outside servers."),
        ("proof-3", "Study Duo contacted none."),
    ]),
    dict(id="price", lead=0.4, gap=0.4, tail=0.8, lines=[
        ("price-1", "The paid focus apps cost up to nineteen ninety-nine a month."),
        ("price-2", "All of this is free."),
    ]),
    dict(id="end", lead=0.8, tail=2.2, lines=[
        ("end", "Study Duo. Free and open source."),
    ]),
]

PAD = 0.06  # seconds of room kept around each trimmed line, so no consonant is clipped


def trim(samples: np.ndarray) -> np.ndarray:
    """Cut leading and trailing silence, so a line's length is the length of its words."""
    loud = np.flatnonzero(np.abs(samples) > 0.01)
    if not len(loud):
        return samples
    a = max(0, loud[0] - int(PAD * RATE))
    b = min(len(samples), loud[-1] + int(PAD * RATE))
    return samples[a:b]


def cues(beats: list, lines: list) -> dict:
    """When each sound starts and stops (seconds). The picture clicks on the same moments."""
    beat = {b["id"]: b for b in beats}
    line = {l["id"]: l for l in lines}
    hold = beat["noise"]["hold"]
    return dict(
        bed=[[round(beat["reveal"]["start"] + 0.6, 3), beat["songs"]["start"]], [beat["rate"]["start"], beat["end"]["end"]]],
        noise=[
            # Play is pressed as "a record player" lands: white noise under the line that names the three.
            ["white", round(line["player"]["end"] + 0.15, 3)],
            ["pink", round(hold[0] + 1.4, 3)],
            ["brown", round(hold[0] + 2.8, 3)],
            ["stop", round(hold[1], 3)],
        ],
        song=[round(line["songs"]["start"] + 1.3, 3), beat["songs"]["end"]],
        bell=round(beat["bell"]["start"] + 0.8, 3),
    )


BREAK_BEFORE = {"and", "with", "over", "until", "that", "of", "in"}


def phrases(text: str) -> list:
    """Split a line into short caption phrases: at its punctuation, short scraps joined to what follows, and anything
    over nine words cut once, near the middle, before a joining word."""
    chunks, cur = [], []
    for word in text.split():
        cur.append(word)
        if word[-1] in ",.?":
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    merged = []
    for c in chunks:
        if merged and (len(merged[-1]) == 1 or (len(merged[-1]) == 2 and merged[-1][-1].endswith(","))):
            merged[-1] = merged[-1] + c
        else:
            merged.append(c)
    out = []
    for c in merged:
        if len(c) > 9:
            n = len(c)
            i = min(range(3, n - 2), key=lambda k: abs(k - n / 2) - (2 if c[k].lower() in BREAK_BEFORE else 0))
            out += [c[:i], c[i:]]
        else:
            out.append(c)
    return [" ".join(c) for c in out]


def captions(lines: list) -> list:
    """Phrases timed inside their line by length, the way the voice spends its time."""
    out = []
    for l in lines:
        parts = phrases(l["text"])
        total = sum(len(p) for p in parts)
        t = l["start"]
        for p in parts:
            d = (l["end"] - l["start"]) * len(p) / total
            out.append(dict(line=l["id"], text=p.rstrip(",."), start=round(t, 3), end=round(t + d, 3)))
            t += d
    return out


def main() -> None:
    model = os.path.join(CACHE, "kokoro-v1.0.onnx")
    voices = os.path.join(CACHE, "voices-v1.0.bin")
    if not (os.path.exists(model) and os.path.exists(voices)):
        sys.exit(f"Kokoro model files missing in {CACHE}; see demo/README.md")
    kokoro = Kokoro(model, voices)
    os.makedirs(OUT, exist_ok=True)

    t = 0.0
    beats, lines = [], []
    for beat in BEATS:
        start = t
        t += beat.get("lead", 0.0)
        hold = beat.get("hold", 0.0)
        hold_from = None
        if beat.get("hold_at") == "before":
            hold_from = t
            t += hold
        for i, (lid, text) in enumerate(beat["lines"]):
            if i:
                t += beat.get("gap", 0.4)
            samples, rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang=LANG)
            assert rate == RATE, rate
            samples = trim(np.asarray(samples, dtype=np.float32))
            sf.write(os.path.join(OUT, f"{lid}.wav"), samples, RATE, subtype="PCM_16")
            dur = len(samples) / RATE
            lines.append(dict(id=lid, beat=beat["id"], text=text, start=round(t, 3), end=round(t + dur, 3)))
            print(f"{lid:12s} {dur:5.2f} s  {len(text.split()) / dur:4.2f} words/s")
            t += dur
        if beat.get("hold_at") == "after":
            hold_from = t
            t += hold
        t += beat.get("tail", 0.0)
        b = dict(id=beat["id"], start=round(start, 3), end=round(t, 3))
        if hold_from is not None:
            b["hold"] = [round(hold_from, 3), round(hold_from + hold, 3)]
        beats.append(b)

    timing = dict(fps=30, rate=RATE, voice=VOICE, lang=LANG, length=round(t, 3), beats=beats, lines=lines,
                  cues=cues(beats, lines), captions=captions(lines))
    with open(os.path.join(OUT, "timing.json"), "w") as f:
        json.dump(timing, f, indent=1)
        f.write("\n")
    print(f"film: {t:.1f} s, {len(lines)} lines")


if __name__ == "__main__":
    main()
