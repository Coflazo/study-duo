import { describe, expect, it } from 'vitest';
import { allowedFromSender, isFromWebPage, parseAnnounce, parseMessage, parseOffscreenMessage } from './messages';

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

describe('parseAnnounce', () => {
  it('accepts a short announcement for a known phase', () => {
    expect(parseAnnounce({ kind: 'announce', line: 'Break is over.', sub: 'Study time, 25 minutes.', phase: 'focus' })).toEqual({ kind: 'announce', line: 'Break is over.', sub: 'Study time, 25 minutes.', phase: 'focus' });
  });
  it('rejects long text, empty lines and unknown phases', () => {
    expect(parseAnnounce({ kind: 'announce', line: 'x'.repeat(121), sub: '', phase: 'focus' })).toBeNull();
    expect(parseAnnounce({ kind: 'announce', line: '', sub: 'a', phase: 'focus' })).toBeNull();
    expect(parseAnnounce({ kind: 'announce', line: 'a', sub: 'b', phase: 'nap' })).toBeNull();
    expect(parseAnnounce({ kind: 'timer', event: { type: 'tick' } })).toBeNull();
  });
});

describe('allowedFromSender', () => {
  it('lets a page content script only tick, and extension pages do anything', () => {
    expect(allowedFromSender({ kind: 'timer', event: { type: 'tick' } }, true)).toBe(true);
    for (const type of ['pause', 'skip', 'reset', 'toggle', 'finish', 'start', 'resume'] as const) {
      expect(allowedFromSender({ kind: 'timer', event: { type } as never }, true)).toBe(false);
      expect(allowedFromSender({ kind: 'timer', event: { type } as never }, false)).toBe(true);
    }
  });
});

describe('isFromWebPage', () => {
  const base = 'chrome-extension://bcggiingdefmehpjcalkfpdnehpcieon/';
  it('treats the popup and dashboard as extension pages, even when opened in a tab', () => {
    expect(isFromWebPage(`${base}popup.html`, base)).toBe(false);
    expect(isFromWebPage(`${base}dashboard.html#today`, base)).toBe(false);
  });
  it('treats content scripts, unknown and look-alike senders as web pages', () => {
    expect(isFromWebPage('https://khanacademy.org/', base)).toBe(true);
    expect(isFromWebPage(undefined, base)).toBe(true);
    expect(isFromWebPage('https://evil.test/chrome-extension://bcggiingdefmehpjcalkfpdnehpcieon/', base)).toBe(true);
  });
});
