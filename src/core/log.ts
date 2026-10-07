import { STORES, TIME_INDEX, withDb, type ActivityRecord, type BlockedAttempt, type ListenRecord, type StoreName } from './db';
import type { SessionRecord } from './sessions';

type Row<S extends StoreName> = S extends 'listens' ? ListenRecord : S extends 'activity' ? ActivityRecord : S extends 'blocks' ? BlockedAttempt : SessionRecord;

export function addRecords<S extends Exclude<StoreName, 'sessions'>>(store: S, rows: Row<S>[]): Promise<void> {
  if (rows.length === 0) return Promise.resolve();
  return withDb(async (db) => {
    const tx = db.transaction(store, 'readwrite');
    for (const r of rows) await tx.store.put(r as never);
    await tx.done;
  });
}

/** Rows whose time falls in [from, to), oldest first. */
export function recordsBetween<S extends Exclude<StoreName, 'sessions'>>(store: S, from: number, to: number): Promise<Row<S>[]> {
  return withDb((db) => db.getAllFromIndex(store, TIME_INDEX[store] as never, IDBKeyRange.bound(from, to, false, true)) as Promise<Row<S>[]>);
}

/** Retention: everything older than `days` goes, from every store. */
export function purgeOlderThan(days: number, now: number): Promise<void> {
  const cutoff = now - days * 86_400_000;
  return withDb(async (db) => {
    for (const store of STORES) {
      const tx = db.transaction(store, 'readwrite');
      let cursor = await tx.store.index(TIME_INDEX[store] as never).openCursor(IDBKeyRange.upperBound(cutoff, true));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  });
}

export interface ExportFile {
  app: 'Study Duo';
  exportedAt: number;
  sessions: SessionRecord[];
  listens: ListenRecord[];
  activity: ActivityRecord[];
  blocks: BlockedAttempt[];
}

export function exportAll(now: number): Promise<ExportFile> {
  return withDb(async (db) => ({
    app: 'Study Duo' as const,
    exportedAt: now,
    sessions: await db.getAll('sessions'),
    listens: await db.getAll('listens'),
    activity: await db.getAll('activity'),
    blocks: await db.getAll('blocks'),
  }));
}

export function deleteAll(): Promise<void> {
  return withDb(async (db) => {
    for (const store of STORES) await db.clear(store);
  });
}
