import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { buildBundle, decodeBundle, encodeBundle, FrameCollector, toFrames } from '@/core/transfer';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { qrModules } from './qr';

/** Draws a QR like a screen would (3 px per module, 4-module quiet zone) and reads it the way the scanner does. */
function scan(text: string): string | null {
  const m = qrModules(text);
  const scale = 3;
  const size = (m.length + 8) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + 4) * scale + y) * size + (c + 4) * scale + x) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }),
  );
  return jsQR(px, size, size)?.data ?? null;
}

describe('QR transfer round trip', () => {
  it('reads back every frame of a real bundle and rebuilds it', async () => {
    const todos = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, text: `Exercise ${i}: chapter ${i % 9} problems`, course: 'LINALG', done: false, doneAt: null, ifThen: null }));
    const bundle = buildBundle({ settings: { ...DEFAULT_SETTINGS, focusMin: 45 }, sites: { 'youtube.com': 'blocked', 'canvas.uva.nl': 'study' }, todos }, 1_800_000_000_000);
    const frames = toFrames(await encodeBundle(bundle), 'k3x9');
    const c = new FrameCollector();
    for (const f of frames) {
      const read = scan(f);
      expect(read).toBe(f);
      c.add(read!);
    }
    expect((await decodeBundle(c.text()!))?.settings.focusMin).toBe(45);
  });
});
