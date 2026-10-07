import { playBell } from '@/core/bell';
import { parseOffscreenMessage } from '@/core/messages';

let ctx: AudioContext | null = null;

browser.runtime.onMessage.addListener((raw, sender) => {
  if (sender.id !== browser.runtime.id) return;
  const msg = parseOffscreenMessage(raw);
  if (!msg) return;
  const audio = (ctx ??= new AudioContext());
  void audio.resume().then(() => playBell(audio, msg.bell, msg.volume));
});
