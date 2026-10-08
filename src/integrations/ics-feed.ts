/** Course deadlines from a calendar feed (RFC 5545): Canvas, Brightspace, Moodle or any .ics link. Input is untrusted. */

export interface FeedEvent {
  uid: string;
  title: string;
  /** A short tag like FPTS or STAT2001, from Canvas's trailing [Course name] or the CATEGORIES property. */
  course: string | null;
  /** When it is due, epoch ms. All-day items are due at 23:59 local time. */
  due: number;
}

const MAX_EVENTS = 2000;
const MAX_TITLE = 200;
/** Every property value is cut to this before any pattern runs on it, so hostile input stays linear. */
const MAX_VALUE = 500;
// Lectures and tutorials are not to-dos; these words mark the events that are.
const DEADLINE_WORDS = /\b(due|deadline|assignment|homework|quiz|exam|test|submission|submit|deliverable|essay|report|project|opdracht|inleveren|tentamen|toets)\b/i;
const STOPWORDS = new Set(['of', 'and', 'the', 'for', 'to', 'in', 'a', 'an', 'on', 'with', 'en', 'de', 'het', 'van', 'voor']);

/** Tabs and line breaks become spaces; other control characters go. */
const clean = (s: string) => s.replace(/[\t\n\r]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

/** RFC 5545 TEXT unescaping: \n becomes a space here (titles are one line), \, \; \\ become themselves. */
const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c));

/** A course name as a short tag: a course code if there is one (STAT2001), else the initials (FPTS). */
export function courseTag(name: string): string | null {
  const words = clean(name).split(' ').filter(Boolean);
  const code = words.find((w) => w.length <= 16 && /^[A-Za-z]{2,}[A-Za-z0-9-]*\d{2,}[A-Za-z]?$/.test(w));
  if (code) return code.toUpperCase().slice(0, 12);
  const initials = words
    .filter((w) => /^\p{L}/u.test(w) && !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 6);
  if (initials.length >= 2) return initials;
  return words[0] ? words[0].toUpperCase().slice(0, 12) : null;
}

/** A wall-clock time in an IANA zone as epoch ms, daylight saving included; an unknown zone counts as local time. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return new Date(y, mo, d, h, mi, s).getTime();
  }
  const offset = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!) - t;
  };
  const guess = Date.UTC(y, mo, d, h, mi, s);
  // Twice, so a time right after a daylight-saving change uses the offset that applies at that moment.
  return guess - offset(guess - offset(guess));
}

/** DTSTART, DTEND or DUE as epoch ms, or null when malformed. Dates without a time are due at 23:59 local. */
function parseTime(value: string, params: Map<string, string>): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1]!, +m[2]! - 1, +m[3]!];
  if (mo > 11 || d < 1 || d > 31) return null;
  if (m[4] === undefined) return new Date(y, mo, d, 23, 59).getTime();
  const [h, mi, s] = [+m[4], +m[5]!, +(m[6] ?? 0)];
  if (h > 23 || mi > 59 || s > 60) return null;
  if (m[7]) return Date.UTC(y, mo, d, h, mi, s);
  const tz = params.get('TZID');
  return tz ? zonedToUtc(y, mo, d, h, mi, s, tz) : new Date(y, mo, d, h, mi, s).getTime();
}

/** NAME;PARAM=VALUE;PARAM="quoted":VALUE, split at the first colon outside quotes. */
function parseLine(line: string): { name: string; params: Map<string, string>; value: string } | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const parts = line.slice(0, colon).split(';');
  const params = new Map<string, string>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1).replace(/^"|"$/g, ''));
  }
  return { name: parts[0]!.toUpperCase(), params, value: line.slice(colon + 1, colon + 1 + MAX_VALUE) };
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};

/** The deadlines in a feed: to-dos (VTODO) and events that look like something due, never lectures. Never throws. */
export function parseFeed(text: string): FeedEvent[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  const out: FeedEvent[] = [];
  let item: { kind: string; props: Map<string, { params: Map<string, string>; value: string }> } | null = null;
  for (const line of lines) {
    if (out.length >= MAX_EVENTS) break;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && (p.value === 'VEVENT' || p.value === 'VTODO')) {
      item = { kind: p.value, props: new Map() };
    } else if (p.name === 'END' && item && p.value === item.kind) {
      const event = toEvent(item.kind, item.props);
      if (event) out.push(event);
      item = null;
    } else if (item && !item.props.has(p.name)) {
      item.props.set(p.name, { params: p.params, value: p.value });
    }
  }
  return out;
}

function toEvent(kind: string, props: Map<string, { params: Map<string, string>; value: string }>): FeedEvent | null {
  const time = (name: string) => {
    const p = props.get(name);
    return p ? parseTime(p.value, p.params) : null;
  };
  const start = time('DTSTART');
  const end = time('DTEND');
  const due = kind === 'VTODO' ? (time('DUE') ?? start) : start;
  if (due === null) return null;

  let summary = clean(unescape(props.get('SUMMARY')?.value ?? ''));
  let courseName = '';
  const bracket = /\s*\[([^\]]+)\]\s*$/.exec(summary);
  if (bracket) {
    courseName = bracket[1]!;
    summary = summary.slice(0, bracket.index);
  } else {
    courseName = clean(unescape(props.get('CATEGORIES')?.value ?? '').split(',')[0] ?? '');
  }
  const title = summary.slice(0, MAX_TITLE).trim() || 'Untitled deadline';
  const uidRaw = clean(props.get('UID')?.value ?? '').slice(0, 200);
  const uid = uidRaw || `sd-${hash(`${title}|${due}`)}`;

  const looksDue = kind === 'VTODO' || /assignment/i.test(uid) || end === null || end === start || DEADLINE_WORDS.test(title);
  if (!looksDue) return null;
  return { uid, title, course: courseName ? courseTag(courseName) : null, due };
}
