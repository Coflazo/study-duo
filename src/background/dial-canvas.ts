import type { Dial, Tone } from '@/core/dial';

const TAU = Math.PI * 2;
/** Token values (service workers have no CSS): neutral-700, red-400, green-400, neutral-400, neutral-500. */
const TONES: Record<Tone, string> = {
  elapsed: '#363A37',
  study: '#E5483A',
  break: '#4FA772',
  pausedStudy: '#8D918B',
  pausedBreak: '#6A6E69',
};
const BOARD = '#0B0C0D';
const BARS = '#F3F3F0';

/** The same board, ring and gaps as Brand/App icon in Figma, at toolbar sizes. */
export function drawDial(size: number, d: Dial): ImageData {
  const g = new OffscreenCanvas(size, size).getContext('2d')!;
  g.fillStyle = BOARD;
  g.beginPath();
  g.roundRect(0, 0, size, size, Math.max(2, size * 0.2));
  g.fill();
  const c = size / 2;
  const width = Math.max(2.25, size * 0.13);
  const r = size * (size <= 16 ? 0.38 : 0.34) - width / 2;
  const gap = 1 / r; // one pixel between coloured sections
  g.lineWidth = width;
  for (const a of d.arcs) {
    const pad = a.tone === 'elapsed' ? 0 : gap / 2;
    const from = -Math.PI / 2 + a.from * TAU + pad;
    const to = -Math.PI / 2 + a.to * TAU - pad;
    if (to - from < 0.01) continue;
    g.strokeStyle = TONES[a.tone];
    g.beginPath();
    g.arc(c, c, r, from, to);
    g.stroke();
  }
  if (d.paused) {
    // Whole pixels, or the bars blur into one grey smudge at 16 px.
    const w = Math.max(1, Math.round(size * 0.07));
    const h = Math.round(size * 0.25);
    const y = Math.round(c - h / 2);
    g.fillStyle = BARS;
    g.fillRect(c - w - Math.ceil(w / 2), y, w, h);
    g.fillRect(c + Math.ceil(w / 2), y, w, h);
  }
  return g.getImageData(0, 0, size, size);
}
