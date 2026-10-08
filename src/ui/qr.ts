import qrcode from 'qrcode-generator';

/** A QR code as one SVG path in module units (draw it in a viewBox of -4 -4 n+8 n+8 for the quiet zone). Offline. */
export function qrPath(text: string, level: 'L' | 'M' = 'M'): { n: number; d: string } {
  const q = qrcode(0, level);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { n, d };
}

/** The QR modules as dark or light, row by row: for tests and for drawing on a canvas. */
export function qrModules(text: string, level: 'L' | 'M' = 'M'): boolean[][] {
  const q = qrcode(0, level);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}
