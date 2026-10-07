import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Phase } from './timer';
import type { SessionRecord } from './sessions';

/** A song heard during a session: from a music tab (its host) or the user's own file ('file'). */
export interface ListenRecord {
  id: string;
  host: string;
  title: string;
  artist: string;
  album: string;
  startedAt: number;
  endedAt: number;
  sessionId: string | null;
}

export type ActivityCategory = 'study' | 'blocked' | 'neutral' | 'unfiled' | 'unobserved';

/** Time on one kind of site while the timer runs. Site name only; unobserved means idle, locked or another app. */
export interface ActivityRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  category: ActivityCategory;
  domain: string | null;
  phase: Phase;
  /** Opt-in input counts (Settings), study blocks only: totals, and minutes that had any input. */
  keys?: number;
  clicks?: number;
  scrolls?: number;
  inputMinutes?: number;
}

/** One visit to the blocked page. The typed reason itself is never kept. */
export interface BlockedAttempt {
  id: string;
  at: number;
  domain: string;
  unlocked: boolean;
  reasonGiven: boolean;
}

export interface Schema extends DBSchema {
  sessions: { key: string; value: SessionRecord; indexes: { endedAt: number } };
  listens: { key: string; value: ListenRecord; indexes: { startedAt: number } };
  activity: { key: string; value: ActivityRecord; indexes: { startedAt: number } };
  blocks: { key: string; value: BlockedAttempt; indexes: { at: number } };
}

export const STORES = ['sessions', 'listens', 'activity', 'blocks'] as const;
export type StoreName = (typeof STORES)[number];
/** The time index of each store, used for ranges, retention and export. */
export const TIME_INDEX = { sessions: 'endedAt', listens: 'startedAt', activity: 'startedAt', blocks: 'at' } as const;

const DB = 'study-duo';
const VERSION = 2;

/** One database for the whole event log. A newer version than this code knows is refused, never altered. */
function openDb(): Promise<IDBPDatabase<Schema>> {
  return openDB<Schema>(DB, VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('endedAt', 'endedAt');
      if (oldVersion < 2) {
        db.createObjectStore('listens', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
        db.createObjectStore('activity', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
        db.createObjectStore('blocks', { keyPath: 'id' }).createIndex('at', 'at');
      }
    },
  });
}

/** Opens, runs and always closes, so no connection is left to block a later upgrade. */
export async function withDb<T>(fn: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}
