import { ensureOffscreen } from '@/background/effects';
import type { SoundCommand } from '@/core/messages';
import { startNoise, type NoiseKind } from '@/core/noise';

/** What plays now, for the Music screen. Session only: sounds stop with the browser. */
export const soundItem = storage.defineItem<{ noise: NoiseKind; volume: number } | null>('session:focusSound', { fallback: null });

let firefox: { ctx: AudioContext; noise: ReturnType<typeof startNoise> } | null = null;

/** Chrome plays in the offscreen page (it keeps playing with every Study Duo page closed); Firefox in the background page. */
export async function focusSound(cmd: SoundCommand): Promise<void> {
  if (import.meta.env.BROWSER === 'firefox') {
    if (cmd.op === 'play') {
      firefox?.noise.stop();
      const ctx = firefox?.ctx ?? new AudioContext();
      firefox = { ctx, noise: startNoise(ctx, cmd.noise, cmd.volume) };
    } else if (cmd.op === 'stop') {
      firefox?.noise.stop();
      firefox = null;
    } else firefox?.noise.setVolume(cmd.volume);
  } else {
    await ensureOffscreen();
    await browser.runtime.sendMessage({ target: 'offscreen', kind: 'sound', ...cmd });
  }
  const now = await soundItem.getValue();
  await soundItem.setValue(cmd.op === 'play' ? { noise: cmd.noise, volume: cmd.volume } : cmd.op === 'stop' ? null : now && { ...now, volume: cmd.volume });
}
