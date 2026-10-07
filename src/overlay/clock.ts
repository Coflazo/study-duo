import { DIGIT_H, DIGIT_W, litSegments, SEGMENT_PATHS, type Segment } from '@/core/segments';
import { ICONS } from './icons';

const NS = 'http://www.w3.org/2000/svg';
const GAP = 9; // 4 px at the 0.45 display scale, as in Figma
const COLON_W = 11;
const DOT = 7;
const SLOTS_X = [0, DIGIT_W + GAP, 2 * (DIGIT_W + GAP) + COLON_W + GAP, 3 * (DIGIT_W + GAP) + COLON_W + GAP];
const COLON_X = 2 * (DIGIT_W + GAP);
const WIDTH = SLOTS_X[3]! + DIGIT_W;
const SEGMENTS = Object.keys(SEGMENT_PATHS) as Segment[];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export interface Clock {
  el: HTMLDivElement;
  close: HTMLButtonElement;
  /** Shows "MM:SS" or "H:MM"; only segments that change are touched. */
  show(text: string): void;
}

export function createClock(): Clock {
  const el = document.createElement('div');
  el.className = 'clock';
  el.hidden = true;
  // The popup carries the accessible timer; this copy would only add noise to every page's reading order.
  el.setAttribute('aria-hidden', 'true');

  const lamp = document.createElement('span');
  lamp.className = 'lamp';

  const board = svg('svg', { class: 'digits', viewBox: `0 0 ${WIDTH} ${DIGIT_H}` });
  const slots = SLOTS_X.map((x) => {
    const g = svg('g', { transform: `translate(${x} 0)` });
    const paths = Object.fromEntries(
      SEGMENTS.map((s) => {
        const p = svg('path', { d: SEGMENT_PATHS[s], class: 'seg' });
        g.append(p);
        return [s, p];
      }),
    ) as Record<Segment, SVGPathElement>;
    board.append(g);
    return paths;
  });
  for (const cy of [DIGIT_H * 0.3, DIGIT_H * 0.7]) {
    board.append(svg('rect', { class: 'colon', x: COLON_X + (COLON_W - DOT) / 2, y: cy - DOT / 2, width: DOT, height: DOT }));
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.title = 'Hide the clock on this page';
  const icon = svg('svg', { viewBox: '0 0 20 20' });
  icon.append(svg('path', { d: ICONS.x }));
  close.append(icon);

  el.append(lamp, board, close);

  let last = '';
  return {
    el,
    close,
    show(text) {
      const chars = text.replace(':', '').padStart(4, ' ');
      if (chars === last) return;
      slots.forEach((paths, i) => {
        if (chars[i] === last[i]) return;
        const lit = litSegments(chars[i]!);
        for (const s of SEGMENTS) paths[s].classList.toggle('on', lit.has(s));
      });
      last = chars;
    },
  };
}
