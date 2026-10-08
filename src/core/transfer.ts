import { normalizeSettings, type TimerSettings } from './settings';
import { normalizeSites, type Sites } from './sites';
import { normalizeTodos, type Todo } from './todos';

/**
 * Moving Study Duo to another computer: settings, site lists and to-dos, never history (it stays where it was
 * recorded) and never connections (a course feed link holds a private token). As a file, or as QR codes.
 */
export interface MoveBundle {
  app: 'study-duo';
  kind: 'move';
  version: 1;
  /** When it was made, epoch ms. */
  at: number;
  settings: TimerSettings;
  sites: Sites;
  todos: Todo[];
}

/** The largest bundle accepted, before and after decompression (a few thousand to-dos fit easily). */
const MAX_BYTES = 1_000_000;

export function buildBundle(parts: { settings: TimerSettings; sites: Sites; todos: Todo[] }, at: number): MoveBundle {
  return { app: 'study-duo', kind: 'move', version: 1, at, settings: parts.settings, sites: parts.sites, todos: parts.todos };
}

/** A bundle from a file or QR codes, cleaned with the same rules as storage, or null when it is not one we can read. */
export function parseBundle(raw: unknown): MoveBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.app !== 'study-duo' || r.kind !== 'move' || r.version !== 1) return null;
  return {
    app: 'study-duo',
    kind: 'move',
    version: 1,
    at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    settings: normalizeSettings(r.settings),
    sites: normalizeSites(r.sites),
    todos: normalizeTodos(r.todos),
  };
}

const toBase64url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Reads a stream up to MAX_BYTES, so a small compressed text cannot unpack into something huge. */
async function readCapped(stream: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

const streamOf = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();

/** A bundle as compact text for QR codes: JSON, deflated by the browser, in URL-safe base64. */
export async function encodeBundle(bundle: MoveBundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  const packed = await readCapped(streamOf(json).pipeThrough(new CompressionStream('deflate-raw')));
  if (!packed) throw new Error('Too much to move at once.');
  return toBase64url(packed);
}

/** The bundle in a QR text, or null for anything damaged, foreign or too large. */
export async function decodeBundle(text: string): Promise<MoveBundle | null> {
  if (text.length > (MAX_BYTES * 4) / 3 || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const json = await readCapped(streamOf(fromBase64url(text)).pipeThrough(new DecompressionStream('deflate-raw')));
    return json ? parseBundle(JSON.parse(new TextDecoder().decode(json))) : null;
  } catch {
    return null;
  }
}

const FRAME = /^SD1:([a-z0-9]{4}):(\d{1,3})\/(\d{1,3}):([\s\S]*)$/;
const MAX_FRAMES = 200;

/** Splits text into numbered QR frames: SD1:<transfer id>:<i>/<n>:<part>. */
export function toFrames(text: string, id: string, size = 250): string[] {
  const n = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: n }, (_, i) => `SD1:${id}:${i + 1}/${n}:${text.slice(i * size, (i + 1) * size)}`);
}

/** Gathers frames read by the camera, in any order and with repeats, from the first transfer it sees. */
export class FrameCollector {
  private id: string | null = null;
  private n = 0;
  private parts = new Map<number, string>();

  add(frame: string): void {
    const m = FRAME.exec(frame);
    if (!m) return;
    const [, id, iRaw, nRaw, part] = m;
    const i = Number(iRaw);
    const n = Number(nRaw);
    if (n < 1 || n > MAX_FRAMES || i < 1 || i > n) return;
    if (this.id === null) [this.id, this.n] = [id!, n];
    if (id !== this.id || n !== this.n) return;
    this.parts.set(i, part!);
  }

  progress(): { have: number; of: number } {
    return { have: this.parts.size, of: this.n };
  }

  /** The whole text once every frame is in, else null. */
  text(): string | null {
    if (this.n === 0 || this.parts.size < this.n) return null;
    return Array.from({ length: this.n }, (_, i) => this.parts.get(i + 1)!).join('');
  }
}

/** Moved to-dos go after the ones already here; an id already present is kept as it is here. */
export function mergeTodos(here: Todo[], moved: Todo[]): Todo[] {
  const ids = new Set(here.map((t) => t.id));
  return [...here, ...moved.filter((t) => !ids.has(t.id))];
}
