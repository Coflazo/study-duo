// The film's sound, from public/narration/timing.json: the voice, the bell and the noise from the product's own code
// (scripts/sounds.mjs), and the two recordings in public/audio, under the voice with a sidechain duck (about 14 dB),
// then loudness-normalised to -16 LUFS integrated. Muxes the mix with the picture render.sh made.
//
//   node scripts/mix.mjs [picture.mp4] [out.mp4]    (defaults: out/film.mp4 -> out/study-duo.mp4)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = path.join(DEMO, "node_modules/ffmpeg-static/ffmpeg");
const FFMPEG = existsSync(LOCAL) ? LOCAL : "ffmpeg";
const pub = (p) => path.join(DEMO, "public", p);
const picture = path.resolve(process.argv[2] ?? path.join(DEMO, "out/film.mp4"));
const output = path.resolve(process.argv[3] ?? path.join(DEMO, "out/study-duo.mp4"));
const T = JSON.parse(readFileSync(pub("narration/timing.json"), "utf8"));
const LEN = T.length;
const LUFS = -16;

function ff(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-3000));
  return r.stderr;
}

const inputs = [];
const input = (file) => (inputs.push("-i", file), inputs.length / 2 - 1);
const ms = (s) => Math.round(s * 1000);
const f = [];
const FMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

// Voice: every line at its time.
const voice = T.lines.map((l, i) => {
  const k = input(pub(`narration/${l.id}.wav`));
  f.push(`[${k}:a]${FMT},adelay=${ms(l.start)}:all=1[v${i}]`);
  return `[v${i}]`;
});
f.push(`${voice.join("")}amix=inputs=${voice.length}:normalize=0,apad=whole_dur=${LEN}[voice]`);
f.push(`[voice]asplit=2[voiceMix][voiceKey]`);

// Under the voice: the song bed (the waltz, low), the nocturne playing from "Your files", and the three noises.
const under = [];
const waltz = pub("audio/chopin-waltz-op69-1.mp3");
T.cues.bed.forEach(([a, b], i) => {
  const k = input(waltz);
  const from = i === 0 ? 0 : T.cues.bed[0][1] - T.cues.bed[0][0]; // the second stretch carries on where the first stopped
  const len = b - a;
  f.push(`[${k}:a]${FMT},atrim=${from}:${from + len},asetpts=PTS-STARTPTS,afade=t=in:d=1.5,afade=t=out:st=${len - 2.5}:d=2.5,volume=0.32,adelay=${ms(a)}:all=1[bed${i}]`);
  under.push(`[bed${i}]`);
});
const SONG_IN = 2.9; // the recording opens on three seconds of room tone; the song starts with its first note
{
  const [a, b] = T.cues.song;
  const k = input(pub("audio/chopin-nocturne-op15-1.mp3"));
  f.push(`[${k}:a]${FMT},atrim=${SONG_IN}:${SONG_IN + b - a},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${b - a - 0.8}:d=0.8,volume=2,adelay=${ms(a)}:all=1[song]`);
  under.push("[song]");
}
// Noise levels by ear-loudness: white is hiss at full spread, brown is a low rumble, so they get different gains.
const NOISE_GAIN = { white: 0.1, pink: 0.2, brown: 0.3 };
T.cues.noise.forEach(([kind, at], i) => {
  if (kind === "stop") return;
  const until = T.cues.noise[i + 1][1];
  const len = until - at;
  const k = input(pub(`sounds/noise-${kind}.wav`));
  const last = T.cues.noise[i + 1][0] === "stop";
  f.push(`[${k}:a]${FMT},atrim=0:${len + 0.05},asetpts=PTS-STARTPTS,afade=t=in:d=${i === 0 ? 0.6 : 0.04},afade=t=out:st=${len - (last ? 0.4 : 0.01)}:d=${last ? 0.4 : 0.05},volume=${NOISE_GAIN[kind]},adelay=${ms(at)}:all=1[n${i}]`);
  under.push(`[n${i}]`);
});
f.push(`${under.join("")}amix=inputs=${under.length}:normalize=0,apad=whole_dur=${LEN}[under]`);
// The duck: the voice keys a compressor on everything under it. Fast attack so the first word is clear, slow release
// so the music does not pump between words.
f.push(`[under][voiceKey]sidechaincompress=threshold=0.008:ratio=8:attack=15:release=450:knee=4:makeup=1[ducked]`);

// The bell: the real break bell, alone (nothing is spoken over it).
const bell = input(pub("sounds/bell-breakStart.wav"));
f.push(`[${bell}:a]${FMT},volume=0.9,adelay=${ms(T.cues.bell)}:all=1[bell]`);

f.push(`[voiceMix][ducked][bell]amix=inputs=3:normalize=0,atrim=0:${LEN},afade=t=out:st=${LEN - 1.2}:d=1.2[mix]`);

const raw = path.join(DEMO, "out/mix-raw.wav");
ff([...inputs, "-filter_complex", f.join(";"), "-map", "[mix]", "-c:a", "pcm_s24le", raw]);

// Two-pass loudness: measure, then normalise to the target with a true-peak ceiling.
const probe = ff(["-i", raw, "-af", `loudnorm=I=${LUFS}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(probe.slice(probe.lastIndexOf("{"), probe.lastIndexOf("}") + 1));
const wav = path.join(DEMO, "out/mix.wav");
ff([
  "-i", raw, "-af",
  `loudnorm=I=${LUFS}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`,
  "-c:a", "pcm_s16le", wav,
]);
const check = ff(["-i", wav, "-af", "ebur128=peak=true", "-f", "null", "-"]);
const summary = check.slice(check.lastIndexOf("Summary:"));
console.log(summary.trim());

ff(["-i", picture, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", output]);
console.log("wrote", output);
