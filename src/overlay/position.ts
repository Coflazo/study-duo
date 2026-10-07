import { CORNER_POS, type OverlayCorner, type OverlayPos } from '@/core/settings';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a dropped clock sits, measured from the nearest edges and kept fully on screen. */
export function dropPos(r: Box, vw: number, vh: number): OverlayPos {
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  const left = Math.min(Math.max(r.left, 0), Math.max(vw - w, 0));
  const top = Math.min(Math.max(r.top, 0), Math.max(vh - h, 0));
  const fromRight = vw - (left + w);
  const fromBottom = vh - (top + h);
  return {
    h: left + w / 2 > vw / 2 ? 'right' : 'left',
    v: top + h / 2 > vh / 2 ? 'bottom' : 'top',
    x: Math.round(left + w / 2 > vw / 2 ? fromRight : left),
    y: Math.round(top + h / 2 > vh / 2 ? fromBottom : top),
  };
}

/** The Settings preset a position matches, if any. */
export function cornerOf(pos: OverlayPos): OverlayCorner | null {
  for (const [name, p] of Object.entries(CORNER_POS) as Array<[OverlayCorner, OverlayPos]>) {
    if (p.h === pos.h && p.v === pos.v && p.x === pos.x && p.y === pos.y) return name;
  }
  return null;
}

/** Inline position for an element pinned to `pos`; `--w` and `--h` (its size, set in CSS) keep it inside the window. */
export function placement(pos: OverlayPos): { left: string; right: string; top: string; bottom: string } {
  const along = (px: number, size: string, axis: 'vw' | 'vh') => `clamp(0px, ${px}px, calc(100${axis} - var(${size})))`;
  return {
    left: pos.h === 'left' ? along(pos.x, '--w', 'vw') : 'auto',
    right: pos.h === 'right' ? along(pos.x, '--w', 'vw') : 'auto',
    top: pos.v === 'top' ? along(pos.y, '--h', 'vh') : 'auto',
    bottom: pos.v === 'bottom' ? along(pos.y, '--h', 'vh') : 'auto',
  };
}
