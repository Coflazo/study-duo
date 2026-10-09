import { indexSong, listSongs, type FolderLike, type Track } from '@/core/library';
import { saveLibrary, saveThumb } from '@/core/library-db';
import { readCover, dominantColor, type Cover } from '@/core/tags';

/**
 * Scans a picked folder on an extension page (it needs a canvas for thumbnails): every song's tags, a 96 px cover
 * thumbnail and the cover's main colour. Keeps only those, never the audio, and replaces the old list in one go.
 */
const THUMB = 96;

async function thumbnail(cover: Cover): Promise<{ blob: Blob; color: string } | null> {
  try {
    const bmp = await createImageBitmap(new Blob([cover.bytes as Uint8Array<ArrayBuffer>], { type: cover.mime }));
    const canvas = new OffscreenCanvas(THUMB, THUMB);
    const ctx = canvas.getContext('2d')!;
    // Fill the square: crop the longer side, like a sleeve.
    const side = Math.min(bmp.width, bmp.height);
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, THUMB, THUMB);
    bmp.close();
    const color = dominantColor(ctx.getImageData(0, 0, THUMB, THUMB).data);
    return { blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }), color };
  } catch {
    return null; // a cover the browser cannot decode: the song keeps its tags, without a picture
  }
}

export async function scanFolder(handle: FileSystemDirectoryHandle, onProgress: (done: number, total: number) => void): Promise<Track[]> {
  const songs = await listSongs(handle as unknown as FolderLike);
  const tracks: Track[] = [];
  const thumbs = new Map<string, Blob>();
  for (const [i, s] of songs.entries()) {
    try {
      const file = await s.file.getFile();
      const track = await indexSong(file, s.path);
      if (track.cover) {
        const cover = readCover(await file.slice(0, 1_000_000).arrayBuffer());
        const thumb = cover ? await thumbnail(cover) : null;
        if (thumb) {
          thumbs.set(track.id, thumb.blob);
          track.color = thumb.color;
        } else track.cover = false;
      }
      tracks.push(track);
    } catch {
      // unreadable file: skipped
    }
    if (i % 10 === 0 || i === songs.length - 1) onProgress(i + 1, songs.length);
  }
  await saveLibrary({ handle, name: handle.name, indexedAt: Date.now() }, tracks);
  for (const [id, blob] of thumbs) await saveThumb(id, blob);
  return tracks;
}
