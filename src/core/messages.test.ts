import { describe, expect, it } from 'vitest';
import { parseMessage, parseOffscreenMessage } from './messages';

describe('parseMessage', () => {
  it('accepts every plain timer event', () => {
    for (const type of ['pause', 'resume', 'toggle', 'skip', 'reset', 'tick', 'finish'] as const) {
      expect(parseMessage({ kind: 'timer', event: { type } })).toEqual({ kind: 'timer', event: { type } });
    }
  });

  it('accepts start with an optional short task id', () => {
    expect(parseMessage({ kind: 'timer', event: { type: 'start' } })).toEqual({ kind: 'timer', event: { type: 'start', taskId: null } });
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 't-1' } })).toEqual({ kind: 'timer', event: { type: 'start', taskId: 't-1' } });
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 'x'.repeat(65) } })).toBeNull();
    expect(parseMessage({ kind: 'timer', event: { type: 'start', taskId: 5 } })).toBeNull();
  });

  it('accepts extend only for whole minutes between 1 and 60', () => {
    expect(parseMessage({ kind: 'timer', event: { type: 'extend', ms: 300_000 } })).toEqual({ kind: 'timer', event: { type: 'extend', ms: 300_000 } });
    for (const ms of [0, 59_999, 3_600_001, 1.5, '300000', Infinity]) {
      expect(parseMessage({ kind: 'timer', event: { type: 'extend', ms } })).toBeNull();
    }
  });

  it('rejects anything else and drops unknown fields', () => {
    for (const raw of [null, 1, 'x', {}, { kind: 'timer' }, { kind: 'timer', event: { type: 'explode' } }, { kind: 'other', event: { type: 'pause' } }]) {
      expect(parseMessage(raw)).toBeNull();
    }
    expect(parseMessage({ kind: 'timer', event: { type: 'pause', extra: '<img>' } })).toEqual({ kind: 'timer', event: { type: 'pause' } });
  });
});

describe('parseOffscreenMessage', () => {
  it('accepts a bell request and clamps volume', () => {
    expect(parseOffscreenMessage({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: 2 })).toEqual({ target: 'offscreen', kind: 'bell', bell: 'breakStart', volume: 1 });
  });

  it('rejects other targets and kinds', () => {
    expect(parseOffscreenMessage({ kind: 'timer', event: { type: 'pause' } })).toBeNull();
    expect(parseOffscreenMessage({ target: 'offscreen', kind: 'bell', bell: 'gong', volume: 1 })).toBeNull();
  });
});
