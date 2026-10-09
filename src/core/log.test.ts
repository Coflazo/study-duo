import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { addRecords, deleteAll, exportAll, forgetListens, purgeOlderThan, recordsBetween } from './log';
import { addSessions, rateSession, sessionId, sessionsBetween } from './sessions';
import { loadTracks, saveLibrary } from './library-db';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 7, 12).getTime();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('event log schema', () => {
  it('opens a version 1 database as version 2 without losing a session or its rating', async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('study-duo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('sessions', { keyPath: 'id' }).createIndex('endedAt', 'endedAt');
      req.onsuccess = () => {
        const tx = req.result.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put({ id: 'old', phase: 'focus', startedAt: NOW - 1000, endedAt: NOW, plannedMs: 1000, activeMs: 1000, pausedMs: 0, completed: true, taskId: null, rating: 5, ratingSkipped: false });
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    });
    expect((await sessionsBetween(NOW - DAY, NOW + 1))[0]).toMatchObject({ id: 'old', rating: 5 });
    await addRecords('listens', [{ id: 'l1', host: 'music.youtube.com', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', startedAt: NOW, endedAt: NOW + 1000, sessionId: null }]);
    expect(await recordsBetween('listens', NOW - 1, NOW + 1)).toHaveLength(1);
  });
});

describe('retention, export and delete', () => {
  const seed = async () => {
    await addSessions([{ phase: 'focus', startedAt: NOW - 400 * DAY, endedAt: NOW - 400 * DAY + 1000, plannedMs: 1000, activeMs: 1000, pausedMs: 0, completed: true, taskId: null }]);
    await addSessions([{ phase: 'focus', startedAt: NOW - 1000, endedAt: NOW, plannedMs: 1000, activeMs: 1000, pausedMs: 0, completed: true, taskId: null }]);
    await addRecords('activity', [
      { id: 'a-old', startedAt: NOW - 400 * DAY, endedAt: NOW - 400 * DAY + 60_000, category: 'study', domain: 'khanacademy.org', phase: 'focus' },
      { id: 'a-new', startedAt: NOW - 60_000, endedAt: NOW, category: 'blocked', domain: 'youtube.com', phase: 'focus' },
    ]);
    await addRecords('blocks', [{ id: 'b1', at: NOW - 400 * DAY, domain: 'reddit.com', unlocked: false, reasonGiven: false }]);
  };

  it('drops everything older than the retention period from every store', async () => {
    await seed();
    await purgeOlderThan(365, NOW);
    expect((await sessionsBetween(0, NOW + 1)).map((s) => s.endedAt)).toEqual([NOW]);
    expect((await recordsBetween('activity', 0, NOW + 1)).map((r) => r.id)).toEqual(['a-new']);
    expect(await recordsBetween('blocks', 0, NOW + 1)).toEqual([]);
  });

  it('exports every store and deletes everything', async () => {
    await seed();
    const data = await exportAll(NOW);
    expect(data).toMatchObject({ app: 'Study Duo', exportedAt: NOW });
    expect(data.sessions).toHaveLength(2);
    expect(data.activity).toHaveLength(2);
    expect(data.blocks).toHaveLength(1);
    await rateSession(sessionId({ phase: 'focus', startedAt: NOW - 1000 }), 4);
    await saveLibrary({ handle: {}, name: 'Music', indexedAt: 1 }, [{ id: 'a', path: 'a.mp3', title: 'a', artist: '', album: '', genre: '', cover: false, color: null, size: 1, modified: 1 }]);
    await deleteAll();
    const after = await exportAll(NOW);
    expect([after.sessions, after.listens, after.activity, after.blocks].every((l) => l.length === 0)).toBe(true);
    expect(await loadTracks()).toEqual([]); // the music folder's list goes too
  });
});

describe('forgetListens', () => {
  it('deletes only the listens that match, and says how many', async () => {
    const l = (id: string, host: string) => ({ id, host, title: id, artist: '', album: '', startedAt: NOW - 60_000, endedAt: NOW, sessionId: null });
    await addRecords('listens', [l('video', 'www.youtube.com'), l('song', 'music.youtube.com'), l('file', 'file')]);
    expect(await forgetListens((x) => x.host === 'www.youtube.com')).toBe(1);
    expect((await recordsBetween('listens', 0, NOW + 1)).map((x) => x.id).sort()).toEqual(['file', 'song']);
  });
});
