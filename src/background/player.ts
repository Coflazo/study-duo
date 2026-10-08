import { applyPlayer, type PlayerCommand, type PlayerEffect } from '@/core/player';
import { playerItem } from '@/core/session-store';
import { focusSound } from './sound';

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs player commands one at a time against the stored state, then carries out what they decided. The popup card,
 * the side panel, the Music page and the media keys all come through here, so there is one player.
 */
export function playerCommands(cmds: PlayerCommand[], now = Date.now()): Promise<void> {
  const run = queue.then(async () => {
    let state = await playerItem.getValue();
    const effects: PlayerEffect[] = [];
    for (const cmd of cmds) {
      const next = applyPlayer(state, cmd, now);
      state = next.state;
      effects.push(...next.effects);
    }
    await playerItem.setValue(state);
    for (const e of effects) await carryOut(e);
  });
  queue = run.catch(() => undefined);
  return run;
}

async function carryOut(e: PlayerEffect): Promise<void> {
  if (e.type === 'noise-start') return focusSound({ op: 'play', noise: e.noise, volume: e.volume });
  if (e.type === 'noise-stop') return focusSound({ op: 'stop' });
  if (e.type === 'noise-volume') return focusSound({ op: 'volume', volume: e.volume });
  // The folder, streaming and tabs arrive in the next steps of #51.
}
