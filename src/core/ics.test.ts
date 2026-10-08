import { describe, expect, it } from 'vitest';
import type { SessionRecord } from './sessions';
import { escapeText, foldLine, toICS } from './ics';

const T = Date.UTC(2026, 9, 6, 7, 30); // Tuesday 6 October 2026 09:30 in Amsterdam
const s = (extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `${T}-focus`, phase: 'focus', startedAt: T, endedAt: T + 25 * 60_000, plannedMs: 25 * 60_000, activeMs: 25 * 60_000, pausedMs: 0,
  completed: true, taskId: 't1', rating: 4, ratingSkipped: false, ...extra,
});

describe('escapeText', () => {
  it('escapes backslashes, semicolons, commas and newlines (RFC 5545 3.3.11)', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\;c\\,d\\ne');
  });
});

describe('foldLine', () => {
  it('folds lines longer than 75 octets with CRLF and a space, never inside a UTF-8 character', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });
});

describe('toICS', () => {
  it('makes one event per block and break with stable ids, UTC times, CRLF lines, task names and the rating', () => {
    const ics = toICS([s(), s({ id: `${T + 25 * 60_000}-shortBreak`, phase: 'shortBreak', startedAt: T + 25 * 60_000, endedAt: T + 30 * 60_000, taskId: null, rating: null })], { tasks: new Map([['t1', 'Linear algebra, chapter 3']]), now: T + 3_600_000 });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Study Duo//Study Duo//EN\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain(`UID:${T}-focus@study-duo\r\n`);
    expect(ics).toContain('DTSTART:20261006T073000Z\r\n');
    expect(ics).toContain('DTEND:20261006T075500Z\r\n');
    expect(ics).toContain('SUMMARY:Study: Linear algebra\\, chapter 3\r\n');
    expect(ics).toContain('SUMMARY:Break\r\n');
    expect(ics).toContain('DESCRIPTION:Focus: 4 of 5\r\n');
    expect(ics).toContain('DTSTAMP:20261006T083000Z\r\n');
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });

  it('marks an unfinished block, leaves out the rating when there is none, and handles an empty list', () => {
    const ics = toICS([s({ completed: false, rating: null, taskId: null })], { tasks: new Map(), now: T });
    expect(ics).toContain('SUMMARY:Study (ended early)\r\n');
    expect(ics).not.toContain('DESCRIPTION:');
    expect(toICS([], { tasks: new Map(), now: T }).match(/BEGIN:VEVENT/g)).toBeNull();
  });

  it('lists the songs only when asked', () => {
    const songs = new Map([[`${T}-focus`, ['Says, Nils Frahm', 'Hammers, Nils Frahm']]]);
    expect(toICS([s()], { tasks: new Map(), now: T, songs })).toContain('DESCRIPTION:Focus: 4 of 5\\nSongs: Says\\, Nils Frahm\; Hammers\\, Nils Frahm');
  });
});
