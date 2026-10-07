import { playBell } from '@/core/bell';
import { parseOffscreenMessage, parseSound } from '@/core/messages';
import { startNoise } from '@/core/noise';

let ctx: AudioContext | null = null;
let noise: ReturnType<typeof startNoise> | null = null;

browser.runtime.onMessage.addListener((raw, sender) => {
  if (sender.id !== browser.runtime.id) return;
  const audio = (ctx ??= new AudioContext());
  const bell = parseOffscreenMessage(raw);
  if (bell) return void audio.resume().then(() => playBell(audio, bell.bell, bell.volume));
  // Only commands the background forwards; a page's own request to the background also reaches this page.
  if (!raw || typeof raw !== 'object' || (raw as { target?: unknown }).target !== 'offscreen') return;
  const cmd = parseSound(raw);
  if (!cmd) return;
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
