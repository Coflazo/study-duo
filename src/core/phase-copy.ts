import type { Phase } from './timer';

/** Placeholder lines until S3 brings the phrase bank. */
export function phaseTitle(next: Phase): string {
  if (next === 'focus') return 'Break is over. Study time.';
  if (next === 'longBreak') return 'Long break. Go for a walk.';
  return 'Break time. Stand up for a bit.';
}
