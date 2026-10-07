import { describe, expect, it } from 'vitest';
import { cornerOf, dropPos, placement } from './position';

const VW = 1280;
const VH = 720;
const rect = (left: number, top: number, w = 120, h = 46) => ({ left, top, right: left + w, bottom: top + h });

describe('dropPos', () => {
  it('measures from the nearest edges, so the clock keeps its place when the window resizes', () => {
    expect(dropPos(rect(1144, 16), VW, VH)).toEqual({ h: 'right', v: 'top', x: 16, y: 16 });
    expect(dropPos(rect(40, 600), VW, VH)).toEqual({ h: 'left', v: 'bottom', x: 40, y: 74 });
    expect(dropPos(rect(300, 100), VW, VH)).toEqual({ h: 'left', v: 'top', x: 300, y: 100 });
  });

  it('keeps the whole clock on screen when dropped past an edge', () => {
    expect(dropPos(rect(1250, -30), VW, VH)).toEqual({ h: 'right', v: 'top', x: 0, y: 0 });
    expect(dropPos(rect(-80, 700), VW, VH)).toEqual({ h: 'left', v: 'bottom', x: 0, y: 0 });
  });

  it('rounds to whole pixels', () => {
    expect(dropPos(rect(300.4, 99.6), VW, VH)).toEqual({ h: 'left', v: 'top', x: 300, y: 100 });
  });
});

describe('cornerOf', () => {
  it('names the preset a position matches, or none', () => {
    expect(cornerOf({ h: 'right', v: 'top', x: 16, y: 16 })).toBe('top-right');
    expect(cornerOf({ h: 'right', v: 'bottom', x: 16, y: 16 })).toBe('bottom-right');
    expect(cornerOf({ h: 'left', v: 'top', x: 16, y: 16 })).toBeNull();
    expect(cornerOf({ h: 'right', v: 'top', x: 40, y: 16 })).toBeNull();
  });
});

describe('placement', () => {
  it('pins the clock to its edges and never past the window', () => {
    expect(placement({ h: 'left', v: 'bottom', x: 40, y: 74 })).toEqual({
      left: 'clamp(0px, 40px, calc(100vw - var(--w)))',
      right: 'auto',
      bottom: 'clamp(0px, 74px, calc(100vh - var(--h)))',
      top: 'auto',
    });
  });
});
