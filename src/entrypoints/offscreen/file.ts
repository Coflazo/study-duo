import { fadeCurve } from '@/core/fade';
import type { FileCommand } from '@/core/messages';
import { loadFolder } from '@/core/library-db';

/**
 * Plays songs from the music folder in the offscreen page, where audio keeps going with every Study Duo page closed.
 * The folder's handle comes from the library database; the song is read from it only when it plays. Songs fade in and
 * out over a short, ear-shaped curve, so a pause or a handover never clicks.
 */
const FADE = 0.35;

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let url: string | null = null;
let path: string | null = null;
let stopping: ReturnType<typeof setTimeout> | undefined;

const tell = (msg: Record<string, unknown>) => browser.runtime.sendMessage({ kind: 'player', ...msg }).catch(() => undefined);

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
  audio?.pause();
  audio?.removeAttribute('src');
  gain?.disconnect();
  if (url) URL.revokeObjectURL(url);
  audio = null;
  gain = null;
  url = null;
  path = null;
}

function fade(ctx: AudioContext, from: number, to: number) {
  if (!gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  const curve = to > from ? fadeCurve(32, 'in', to) : fadeCurve(32, 'out', from);
  try {
    gain.gain.setValueCurveAtTime(curve, now, FADE);
  } catch {
    gain.gain.setTargetAtTime(to, now, FADE / 4);
  }
}

export async function fileCommand(ctx: AudioContext, cmd: FileCommand): Promise<void> {
  if (cmd.op === 'play') {
    if (path !== cmd.path || !audio) {
      const file = await fileAt(cmd.path);
      if (typeof file === 'string') {
        release();
        return void tell({ op: 'problem', problem: file });
      }
      release();
      const el = new Audio();
      url = URL.createObjectURL(file);
      el.src = url;
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
      el.addEventListener('loadedmetadata', () => Number.isFinite(el.duration) && tell({ op: 'loaded', duration: Math.round(el.duration * 1000) }));
      el.addEventListener('ended', () => tell({ op: 'ended' }));
      audio = el;
      path = cmd.path;
    }
    clearTimeout(stopping);
    audio.currentTime = cmd.at / 1000;
    try {
      await audio.play();
    } catch {
      return void tell({ op: 'problem', problem: 'missing' }); // a file the browser cannot decode
    }
    fade(ctx, 0, cmd.volume);
  } else if (cmd.op === 'pause') {
    if (!audio) return;
    fade(ctx, gain?.gain.value ?? 0, 0);
    const el = audio;
    stopping = setTimeout(() => el.pause(), FADE * 1000 + 30);
  } else if (cmd.op === 'seek') {
    if (audio) audio.currentTime = cmd.at / 1000;
  } else if (gain) {
    gain.gain.setTargetAtTime(cmd.volume, ctx.currentTime, 0.08);
  }
}
