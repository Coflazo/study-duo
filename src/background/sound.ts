import { ensureOffscreen } from '@/background/effects';
import { addRecords } from '@/core/log';
import type { SoundCommand } from '@/core/messages';
import { foldListen } from '@/core/music';
import { startNoise, type NoiseKind } from '@/core/noise';
import { sessionId } from '@/core/sessions';
import { normalizeSettings } from '@/core/settings';
import { settingsItem, soundItem, timerItem } from '@/core/store';

let firefox: { ctx: AudioContext; noise: ReturnType<typeof startNoise> } | null = null;
const NAMES: Record<NoiseKind, string> = { white: 'White noise', pink: 'Pink noise', brown: 'Brown noise' };

/**
 * Chrome plays in the offscreen page (it keeps playing with every Study Duo page closed); Firefox in the background
 * page. Each sound that played is logged as a listen (site "sound"), so the insights can weigh noise against music.
 */
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
  const [now, timer, settings] = await Promise.all([soundItem.getValue(), timerItem.getValue(), settingsItem.getValue().then(normalizeSettings)]);
  const at = Date.now();
  if (cmd.op === 'volume') return void (now && (await soundItem.setValue({ ...now, volume: cmd.volume })));
  const timerRuns = timer.status !== 'stopped';
  // Like songs, a focus sound is kept only if it played while the timer ran.
  if (now && settings.measure.music && (now.sessionId !== null || timerRuns)) {
    const open = { host: 'sound', title: NAMES[now.noise], artist: '', album: '', startedAt: now.startedAt, sessionId: now.sessionId };
    const { closed } = foldListen(open, null, at, 'sound', null);
    if (closed) await addRecords('listens', [closed]);
  }
  const inSession = timer.status !== 'stopped' && timer.startedAt !== null ? sessionId({ phase: timer.phase, startedAt: timer.startedAt }) : null;
  await soundItem.setValue(cmd.op === 'play' ? { noise: cmd.noise, volume: cmd.volume, startedAt: at, sessionId: inSession } : null);
}
