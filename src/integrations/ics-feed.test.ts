import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { courseTag, parseFeed, zonedToUtc } from './ics-feed';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('parseFeed on a Canvas feed', () => {
  const events = parseFeed(fixture('canvas.ics'));
  const byUid = new Map(events.map((e) => [e.uid, e]));

  it('keeps deadlines and leaves out lectures', () => {
    expect(events.map((e) => e.uid).sort()).toEqual(['event-assignment-456', 'event-assignment-457', 'event-assignment-458', 'event-calendar-event-790']);
  });

  it('unfolds lines, unescapes text and splits off the course', () => {
    expect(byUid.get('event-assignment-456')).toEqual({ uid: 'event-assignment-456', title: 'Homework 3: Bayes, priors and posteriors', course: 'FPTS', due: Date.UTC(2026, 9, 9, 21, 59) });
    expect(byUid.get('event-calendar-event-790')?.course).toBe('STAT2001');
  });

  it('reads all-day deadlines as 23:59 that day, local time', () => {
    expect(byUid.get('event-calendar-event-790')?.due).toBe(new Date(2026, 9, 16, 23, 59).getTime());
  });

  it('converts zone times, on both sides of the change from summer time', () => {
    expect(byUid.get('event-assignment-457')?.due).toBe(Date.UTC(2026, 9, 24, 21, 59)); // CEST, UTC+2
    expect(byUid.get('event-assignment-458')?.due).toBe(Date.UTC(2026, 10, 1, 22, 59)); // CET, UTC+1
  });
});

describe('parseFeed on other feeds', () => {
  it('reads Moodle-style to-dos with DUE and their category as the course', () => {
    expect(parseFeed(fixture('moodle.ics'))).toEqual([{ uid: '991@moodle.example.edu', title: 'Lab report 2 is due', course: 'CHEM101', due: Date.UTC(2026, 9, 20, 10) }]);
  });

  it('never throws on garbage, and skips events without a date', () => {
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('hello\nworld\n:::\n;;;')).toEqual([]);
    expect(parseFeed('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:No date\nUID:x\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:2026-bad\nUID:y\nEND:VEVENT\n')).toEqual([]);
    const random = Array.from({ length: 2000 }, (_, i) => String.fromCharCode((i * 7919) % 126 + 1)).join('');
    expect(() => parseFeed(`BEGIN:VEVENT\n${random}\nEND:VEVENT`)).not.toThrow();
  });

  it('strips control characters and caps long titles', () => {
    const [e] = parseFeed(`BEGIN:VEVENT\nUID:z\nDTSTART:20261009T100000Z\nDTEND:20261009T100000Z\nSUMMARY:a\u0007b ${'x'.repeat(400)}\nEND:VEVENT`);
    expect(e!.title.startsWith('ab ')).toBe(true);
    expect(e!.title.length).toBeLessThanOrEqual(200);
  });

  it('gives an event without a UID a stable one', () => {
    const text = 'BEGIN:VEVENT\nDTSTART:20261009T100000Z\nDTEND:20261009T100000Z\nSUMMARY:Untitled task\nEND:VEVENT';
    expect(parseFeed(text)[0]!.uid).toBe(parseFeed(text)[0]!.uid);
  });
});

describe('helpers', () => {
  it('makes short course tags from codes or initials', () => {
    expect(courseTag('Foundations of Probability Theory and Statistics')).toBe('FPTS');
    expect(courseTag('STAT2001 Applied Statistics')).toBe('STAT2001');
    expect(courseTag('Linear Algebra')).toBe('LA');
    expect(courseTag('')).toBeNull();
  });

  it('treats an unknown zone as local time instead of failing', () => {
    expect(zonedToUtc(2026, 9, 9, 12, 0, 0, 'Not/AZone')).toBe(new Date(2026, 9, 9, 12, 0, 0).getTime());
  });
});
