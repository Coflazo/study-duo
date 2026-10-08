/** The few fields counting needs, so the counter can be tested without a DOM. */
export interface CountableEvent {
  type: string;
  composedPath(): unknown[];
}

export interface Counts {
  keys: number;
  clicks: number;
  scrolls: number;
}

/** Per minute; more than this is a stuck key or a script, not a person. */
export const MAX_PER_MINUTE = 10_000;
const KIND: Record<string, keyof Counts> = { keydown: 'keys', pointerdown: 'clicks', wheel: 'scrolls' };

/**
 * Opt-in input counting (Settings: off by default): how many keys, clicks and scrolls, never which key, where or when
 * within the minute. Typing into a password field is never counted.
 */
export function createInputCounter() {
  let c: Counts = { keys: 0, clicks: 0, scrolls: 0 };
  return {
    count(e: CountableEvent): void {
      const kind = KIND[e.type];
      if (!kind) return;
      const target = e.composedPath()[0] as { type?: unknown } | undefined;
      if (typeof target?.type === 'string' && target.type.toLowerCase() === 'password') return;
      c[kind] = Math.min(MAX_PER_MINUTE, c[kind] + 1);
    },
    /** The counts since the last take, or null when there were none. */
    take(): Counts | null {
      const out = c;
      c = { keys: 0, clicks: 0, scrolls: 0 };
      return out.keys + out.clicks + out.scrolls > 0 ? out : null;
    },
  };
}
