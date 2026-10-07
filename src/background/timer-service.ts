import type { TimerSettings } from '@/core/settings';
import { reduce, type Segment, type TimerEvent, type TimerState } from '@/core/timer';

export interface EffectInput {
  event: TimerEvent;
  prev: TimerState;
  state: TimerState;
  settings: TimerSettings;
  segments: Segment[];
  now: number;
}

export interface TimerDeps {
  now(): number;
  loadSettings(): Promise<TimerSettings>;
  loadState(): Promise<TimerState>;
  saveState(state: TimerState): Promise<void>;
  applyEffects(input: EffectInput): Promise<void>;
}

/** Events run one at a time, so an alarm and a popup tick can never both complete the same phase. */
export function createTimerService(deps: TimerDeps) {
  let queue: Promise<unknown> = Promise.resolve();

  async function run(event: TimerEvent): Promise<TimerState> {
    const [settings, prev] = await Promise.all([deps.loadSettings(), deps.loadState()]);
    const now = deps.now();
    const { state, segments } = reduce(prev, event, settings, now);
    if (state !== prev) await deps.saveState(state);
    await deps.applyEffects({ event, prev, state, settings, segments, now });
    return state;
  }

  return {
    dispatch(event: TimerEvent): Promise<TimerState> {
      const result = queue.then(() => run(event));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
