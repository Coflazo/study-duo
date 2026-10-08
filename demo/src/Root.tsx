import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from "remotion";
import "./theme.css";
import { Demo, DEMO_LEN } from "./compositions/Demo";
import { Film, FILM_LEN } from "./compositions/Film";
import { Loop, LOOP_LEN } from "./compositions/Loop";
import { TITLE_LEN, TitleCard } from "./title-card";

export const FPS = 30;

/* 16:9 at 1080p: a standalone clip as much as a README loop. Delivered at this size (DELIVER=1920:1080). */
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * Title card, then the flow.
 *
 * The body is wrapped in a Sequence rather than retimed. Every click beat
 * and pointer keyframe inside a composition is an absolute frame number,
 * and shifting sixty of them by hand is how a cursor ends up clicking six
 * frames after the button it was aiming at. Inside the Sequence the body
 * still sees its own frame 0 where it always did. (hard rule / titles 7)
 *
 * Both layers sit on the same dark ground, so the handover is a dissolve
 * between two states of one field rather than a cut between two lit frames,
 * and the last frame matches frame 0 — which is what keeps the loop seam
 * from strobing every time the tile repeats.
 */
function Clip({
  body,
  name,
  kicker,
}: {
  body: React.ReactNode;
  name: string;
  kicker: string;
}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "var(--ground)" }}>
      {frame < TITLE_LEN && (
        <TitleCard name={name} kicker={kicker} frame={frame} />
      )}
      <Sequence from={TITLE_LEN}>{body}</Sequence>
    </AbsoluteFill>
  );
}

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="demo"
        component={() => (
          <Clip
            body={<Demo />}
            name="Study Duo"
            kicker="A study timer that lives in your browser"
          />
        )}
        durationInFrames={DEMO_LEN + TITLE_LEN}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* The launch film: narrated, subtitled, about 100 seconds. Its sound is mixed by scripts/mix.mjs. */}
      <Composition id="film" component={Film} durationInFrames={FILM_LEN} fps={FPS} width={WIDTH} height={HEIGHT} />
      {/* The README loop: a silent cut of the film with the same captions. */}
      <Composition id="loop" component={Loop} durationInFrames={LOOP_LEN} fps={FPS} width={WIDTH} height={HEIGHT} />
    </>
  );
}
