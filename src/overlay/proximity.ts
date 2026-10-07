/** True when the pointer is over the clock or within `margin` px of it (distance to the nearest edge). */
export function isNear(rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>, x: number, y: number, margin = 24): boolean {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy) <= margin;
}
