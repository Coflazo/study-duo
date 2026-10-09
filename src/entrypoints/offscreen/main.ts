import { playBell } from '@/core/bell';
import { parseFileCommand, parseOffscreenMessage, parseSound } from '@/core/messages';
import { fileCommand } from './file';
import { startNoise } from '@/core/noise';

let ctx: AudioContext | null = null;
let noise: ReturnType<typeof startNoise> | null = null;

browser.runtime.onMessage.addListener((raw, sender) => {
  // Content scripts share the extension id; only the extension's own pages (the background) may drive audio.
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) return;
  // Every runtime message from any Study Duo page reaches this page; only a real audio command may wake the audio
  // stack (an idle AudioContext keeps the system's audio service busy, #41).
  const bell = parseOffscreenMessage(raw);
  if (bell) {
    const audio = (ctx ??= new AudioContext());
    return void audio.resume().then(() => playBell(audio, bell.bell, bell.volume));
  }
  // Only commands the background forwards; a page's own request to the background also reaches this page.
  if (!raw || typeof raw !== 'object' || (raw as { target?: unknown }).target !== 'offscreen') return;
  const file = parseFileCommand(raw);
  if (file) {
    const audio = (ctx ??= new AudioContext());
    return void audio.resume().then(() => fileCommand(audio, file)).catch(console.error);
  }
  const cmd = parseSound(raw);
  if (!cmd) return;
  const audio = (ctx ??= new AudioContext());
  void audio.resume().then(() => {
    if (cmd.op === 'play') {
      noise?.stop();
      noise = startNoise(audio, cmd.noise, cmd.volume);
    } else if (cmd.op === 'stop') {
      noise?.stop();
      noise = null;
    } else noise?.setVolume(cmd.volume);
  });
});
