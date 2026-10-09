import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Track } from './library';

/**
 * The music folder, kept apart from the study history: the folder the user picked (the browser's handle, which only
 * this extension can use), one record per song and a small cover thumbnail per song. Never the audio itself.
 */
export interface FolderRecord {
  /** A FileSystemDirectoryHandle in the browser. */
  handle: unknown;
  name: string;
  indexedAt: number;
  count: number;
}

interface Schema extends DBSchema {
  tracks: { key: string; value: Track };
  thumbs: { key: string; value: Blob };
  folder: { key: string; value: FolderRecord };
}

const DB = 'study-duo-library';
const VERSION = 1;
const FOLDER = 'folder';

function openLibrary(): Promise<IDBPDatabase<Schema>> {
  return openDB<Schema>(DB, VERSION, {
    upgrade(db) {
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('thumbs');
      db.createObjectStore('folder');
    },
  });
}

/** Opens, runs and always closes, like the history database. */
async function withLibrary<T>(fn: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
  const db = await openLibrary();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

// Pages that stay open (the side panel, the Music page) hear when another page picks, rescans or forgets the folder.
const CHANNEL = 'study-duo-library';
const announce = () => {
  const c = new BroadcastChannel(CHANNEL);
  c.postMessage('changed');
  c.close();
};
/** Calls `fn` whenever any Study Duo page saves or forgets the folder. Returns a function that stops listening. */
export function onLibraryChange(fn: () => void): () => void {
  const c = new BroadcastChannel(CHANNEL);
  c.onmessage = () => fn();
  return () => c.close();
}

/** A fresh scan: the folder and its songs replace what was kept, and thumbnails of songs that are gone go too. */
export async function saveLibrary(folder: Omit<FolderRecord, 'count'>, tracks: Track[]): Promise<void> {
  await withLibrary(async (db) => {
    const tx = db.transaction(['tracks', 'thumbs', 'folder'], 'readwrite');
    const keep = new Set(tracks.map((t) => t.id));
    await tx.objectStore('tracks').clear();
    for (const t of tracks) await tx.objectStore('tracks').put(t);
    for (const id of await tx.objectStore('thumbs').getAllKeys()) if (!keep.has(id)) await tx.objectStore('thumbs').delete(id);
    await tx.objectStore('folder').put({ ...folder, count: tracks.length }, FOLDER);
    await tx.done;
  });
  announce();
}

export const loadTracks = (): Promise<Track[]> => withLibrary((db) => db.getAll('tracks'));
export const loadFolder = (): Promise<FolderRecord | null> => withLibrary(async (db) => (await db.get('folder', FOLDER)) ?? null);
export const saveThumb = (id: string, blob: Blob): Promise<void> => withLibrary(async (db) => void (await db.put('thumbs', blob, id)));
export const loadThumb = (id: string): Promise<Blob | null> => withLibrary(async (db) => (await db.get('thumbs', id)) ?? null);

/** "Delete everything" in Your data, or Forget folder: the folder, the songs and the thumbnails. */
export async function forgetLibrary(): Promise<void> {
  await withLibrary(async (db) => {
    const tx = db.transaction(['tracks', 'thumbs', 'folder'], 'readwrite');
    await Promise.all([tx.objectStore('tracks').clear(), tx.objectStore('thumbs').clear(), tx.objectStore('folder').clear(), tx.done]);
  });
  announce();
}
