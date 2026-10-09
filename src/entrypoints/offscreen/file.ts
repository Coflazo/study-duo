import { fadeCurve } from '@/core/fade';
import type { FileCommand } from '@/core/messages';
import { loadFolder } from '@/core/library-db';

/**
 * Plays songs from the music folder in the offscreen page, where audio keeps going with every Study Duo page closed.
 * The folder's handle comes from the library database; the song is read from it only when it plays. Songs fade in and
 * out over a short, ear-shaped curve, so a pause or a handover never clicks. Commands run one at a time, in order:
 * a quick "next, next, pause" must end paused on the last song, whatever each file takes to open.
 */
const FADE = 0.35;

let audio: HTMLAudioElement | null = null;
let source: MediaElementAudioSourceNode | null = null;
let gain: GainNode | null = null;
let url: string | null = null;
let path: string | null = null;
let stopping: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();

/** Every report names its song, so the background can ignore one that arrives after the next song started. */
const tell = (msg: Record<string, unknown>, about: string | null) => browser.runtime.sendMessage({ kind: 'player', ...msg, ...(about ? { path: about } : {}) }).catch(() => undefined);

/** The file at a path in the picked folder, or why it cannot be read. */
async function fileAt(where: string): Promise<File | 'reconnect' | 'missing'> {
  const folder = await loadFolder().catch(() => null);
  const dir = folder?.handle as FileSystemDirectoryHandle | undefined;
  if (!dir) return 'missing';
  // Chrome forgets the folder permission when it restarts; reading again needs a click on a Study Duo page.
  const query = (dir as unknown as { queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState> }).queryPermission;
  if (query && (await query.call(dir, { mode: 'read' })) !== 'granted') return 'reconnect';
  try {
    const parts = where.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return await (await d.getFileHandle(parts.at(-1)!)).getFile();
  } catch (e) {
    return (e as DOMException)?.name === 'NotAllowedError' ? 'reconnect' : 'missing';
  }
}

function release() {
  clearTimeout(stopping);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load(); // lets go of the media resource
  }
  source?.disconnect();
  gain?.disconnect();
  if (url) URL.revokeObjectURL(url);
  audio = source = gain = null;
  url = path = null;
}

function fade(ctx: AudioContext, to: number) {
  if (!gain) return;
  const now = ctx.currentTime;
  const from = gain.gain.value;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(from, now);
  const curve = to > from ? fadeCurve(32, 'in', to) : fadeCurve(32, 'out', from);
  try {
    gain.gain.setValueCurveAtTime(curve, now, FADE);
  } catch {
    gain.gain.setTargetAtTime(to, now, FADE / 4);
  }
}

async function load(ctx: AudioContext, where: string): Promise<boolean> {
  if (path === where && audio) return true;
  const file = await fileAt(where);
  release();
  if (typeof file === 'string') {
    void tell({ op: 'problem', problem: file }, where);
    return false;
  }
  const el = new Audio();
  url = URL.createObjectURL(file);
  el.src = url;
  gain = ctx.createGain();
  gain.gain.value = 0;
  source = ctx.createMediaElementSource(el);
  source.connect(gain).connect(ctx.destination);
  el.addEventListener('loadedmetadata', () => Number.isFinite(el.duration) && tell({ op: 'loaded', duration: Math.round(el.duration * 1000) }, where));
  el.addEventListener('ended', () => tell({ op: 'ended' }, where));
  audio = el;
  path = where;
  return true;
}

async function play(ctx: AudioContext, where: string, at: number, volume: number) {
  if (!(await load(ctx, where)) || !audio) return;
  clearTimeout(stopping);
  audio.currentTime = at / 1000;
  try {
    await audio.play();
  } catch (e) {
    // Cut off by the next command (AbortError) is normal; anything else is a file the browser cannot play.
    if ((e as DOMException)?.name !== 'AbortError') void tell({ op: 'problem', problem: 'missing' }, where);
    return;
  }
  fade(ctx, volume);
}

async function run(ctx: AudioContext, cmd: FileCommand): Promise<void> {
  if (cmd.op === 'play') return play(ctx, cmd.path, cmd.at, cmd.volume);
  if (cmd.op === 'seek') {
    // A page Chrome closed after a long quiet stretch comes back empty: load the song again where it was.
    if (!audio && cmd.path) return play(ctx, cmd.path, cmd.at, gain?.gain.value || 0.6);
    if (audio) audio.currentTime = cmd.at / 1000;
    return;
  }
  if (cmd.op === 'pause') {
    if (!audio) return;
    fade(ctx, 0);
    const el = audio;
    clearTimeout(stopping);
    stopping = setTimeout(() => el.pause(), FADE * 1000 + 30);
    return;
  }
  if (gain) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.setTargetAtTime(cmd.volume, now, 0.08);
  }
}

export function fileCommand(ctx: AudioContext, cmd: FileCommand): Promise<void> {
  chain = chain.then(() => run(ctx, cmd)).catch(console.error);
  return chain;
}
