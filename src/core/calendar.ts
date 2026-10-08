import type { ActivityRecord, ListenRecord } from './db';
import { SPOTIFY_HOSTS } from './music';
import type { SessionRecord } from './sessions';

const MIN = 60_000;

/** What a calendar event says about one block, gathered from the logs (see eventContext). */
export interface EventContext {
  timeZone: string;
  task?: { text: string; course: string | null };
  /** The block's number that day, and the daily goal. */
  block?: { n: number; goal: number };
  /** Minutes on Study sites during the block, most first. Only when the user lets details through. */
  sites?: { domain: string; minutes: number }[];
  /** Songs heard during the block, never Spotify's. Only when the user lets details through. */
  songs?: { title: string; artist: string }[];
  /** For a break: the task of the block it followed. */
  after?: string;
}

/** A Google Calendar event (Calendar API v3 Events resource), as Study Duo writes it. */
export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId: string;
  transparency: 'transparent';
  reminders: { useDefault: false; overrides: [] };
  extendedProperties: { private: { studyDuo: '1' } };
}

/**
 * The event's id, from the session's: lowercase hex of its bytes, which Google accepts (base32hex, 5 to 1024
 * characters). The same session always gives the same id, so a retry finds the event instead of adding a copy.
 */
export function eventId(sessionId: string): string {
  return [...new TextEncoder().encode(sessionId)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const STUDY_COLOR = '11'; // Tomato: the red of a study block
const BREAK_COLOR = '10'; // Basil: the green of a break

/** The event for one finished block or break (titles match the .ics export in src/core/ics.ts). */
export function calendarEvent(s: SessionRecord, c: EventContext): CalendarEvent {
  const study = s.phase === 'focus';
  const lines: (string | null)[] = study
    ? [
        s.rating ? `Focus: ${s.rating} of 5` : null,
        c.block ? `Block ${c.block.n} of ${c.block.goal} today` : null,
        !s.completed && s.plannedMs ? `Ended early: ${Math.round(s.activeMs / MIN)} of ${Math.round(s.plannedMs / MIN)} minutes` : null,
        c.sites?.length ? `Sites: ${c.sites.map((x) => `${x.domain} ${x.minutes} min`).join(' · ')}` : null,
        c.songs?.length ? `Music: ${c.songs.map((x) => (x.artist ? `${x.title} (${x.artist})` : x.title)).join(' · ')}` : null,
      ]
    : [c.after ? `After ${c.after}` : null];
  const named = c.task ? `${c.task.text}${c.task.course ? ` (${c.task.course})` : ''}` : c.sites?.[0]?.domain;
  const summary = study ? `Study${named ? `: ${named}` : ''}${s.completed ? '' : ' (ended early)'}` : s.phase === 'longBreak' ? 'Long break' : 'Short break';
  const when = (ms: number) => ({ dateTime: new Date(ms).toISOString(), timeZone: c.timeZone });
  return {
    id: eventId(s.id),
    summary,
    description: [...lines.filter((l): l is string => l !== null), '', 'Logged by Study Duo'].join('\n').replace(/^\n/, ''),
    start: when(s.startedAt),
    end: when(s.endedAt),
    colorId: study ? STUDY_COLOR : BREAK_COLOR,
    // Logged after the fact: it should not make the user look busy or ring a reminder.
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { studyDuo: '1' } },
  };
}

/** A short fingerprint of what the event says, so an unchanged event is not sent again. */
export function eventHash(e: CalendarEvent): string {
  const { id: _id, ...said } = e;
  let h = 0x811c9dc5; // FNV-1a, 32 bit
  for (const ch of JSON.stringify(said)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface ContextSources {
  timeZone: string;
  todos: { id: string; text: string; course: string | null }[];
  /** That day's study blocks, the event's own included. */
  dayFocus: SessionRecord[];
  goal: number;
  activity: ActivityRecord[];
  listens: ListenRecord[];
  /** The user's choice: send sites and songs to the calendar, or only the task and rating. */
  details: boolean;
}

/** Gathers what the event for session `s` says, from the logs around it. */
export function eventContext(s: SessionRecord, src: ContextSources): EventContext {
  const taskOf = (id: string | null) => {
    const t = id ? src.todos.find((x) => x.id === id) : undefined;
    return t ? { text: t.text, course: t.course } : undefined;
  };
  if (s.phase !== 'focus') {
    const before = src.dayFocus.filter((x) => x.endedAt <= s.startedAt + 1000).sort((a, b) => b.endedAt - a.endedAt)[0];
    const task = before ? taskOf(before.taskId) : undefined;
    return { timeZone: src.timeZone, ...(task ? { after: task.text } : {}) };
  }
  const c: EventContext = {
    timeZone: src.timeZone,
    block: { n: src.dayFocus.filter((x) => x.startedAt <= s.startedAt).length, goal: src.goal },
  };
  const task = taskOf(s.taskId);
  if (task) c.task = task;
  if (!src.details) return c;

  const minutes = new Map<string, number>();
  for (const a of src.activity) {
    if (a.category !== 'study' || !a.domain) continue;
    const overlap = Math.min(a.endedAt, s.endedAt) - Math.max(a.startedAt, s.startedAt);
    if (overlap > 0) minutes.set(a.domain, (minutes.get(a.domain) ?? 0) + overlap);
  }
  const sites = [...minutes]
    .map(([domain, ms]) => ({ domain, minutes: Math.round(ms / MIN) }))
    .filter((x) => x.minutes >= 1)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 3);
  if (sites.length) c.sites = sites;

  const seen = new Set<string>();
  const songs: { title: string; artist: string }[] = [];
  for (const l of src.listens) {
    if (l.sessionId !== s.id || SPOTIFY_HOSTS.has(l.host) || l.host === 'sound') continue;
    const key = `${l.title}\u0000${l.artist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push({ title: l.title, artist: l.artist });
  }
  if (songs.length) c.songs = songs.slice(0, 5);
  return c;
}
