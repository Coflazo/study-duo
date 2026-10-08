import type { SessionRecord } from './sessions';

/**
 * TEXT values (RFC 5545 3.3.11): backslash, semicolon, comma and newline are escaped. A lone CR counts as a line break
 * too (some calendar apps split on it), and other control characters are dropped: song titles come from web pages.
 */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Folds a content line at 75 octets (RFC 5545 3.1): CRLF and one space, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines carry the leading space
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface ICSOptions {
  /** To-do texts by id, for "Study: <task>". */
  tasks: Map<string, string>;
  now: number;
  /** Songs per session id, listed only when the user turns that on. */
  songs?: Map<string, string[]>;
}

/**
 * One calendar file with every block and break (spec: Calendar). Event ids come from session ids, so importing the
 * same blocks again updates them instead of adding copies. Times are UTC; calendar apps show them in local time.
 */
export function toICS(sessions: SessionRecord[], opts: ICSOptions): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Study Duo//Study Duo//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Study Duo'];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const study = s.phase === 'focus';
    const task = study && s.taskId ? opts.tasks.get(s.taskId) : undefined;
    const title = study ? `Study${task ? `: ${task}` : ''}${s.completed ? '' : ' (ended early)'}` : 'Break';
    const notes = [s.rating ? `Focus: ${s.rating} of 5` : null, opts.songs?.get(s.id)?.length ? `Songs: ${opts.songs.get(s.id)!.join('; ')}` : null].filter((n): n is string => n !== null);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@study-duo`,
      `DTSTAMP:${stamp(opts.now)}`,
      `DTSTART:${stamp(s.startedAt)}`,
      `DTEND:${stamp(s.endedAt)}`,
      `SUMMARY:${escapeText(title)}`,
      ...(notes.length ? [`DESCRIPTION:${notes.map(escapeText).join('\\n')}`] : []),
      `CATEGORIES:${study ? 'Study' : 'Break'}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
