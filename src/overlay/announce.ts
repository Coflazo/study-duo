import type { AnnounceMessage } from '@/core/messages';
import { ICONS } from '@/ui/icons';
import { ensureFont } from './styles';

const ENTER = 400;
const HOLD = 1600;
const LEAVE = 1800;
const TOTAL = ENTER + HOLD + LEAVE;
const ICON = { focus: ICONS.book, shortBreak: ICONS.coffee, longBreak: ICONS.walk } as const;

export interface Announcer {
  el: HTMLDivElement;
  show(msg: AnnounceMessage): void;
}

export function createAnnouncer(): Announcer {
  const el = document.createElement('div');
  el.className = 'words';
  // Always rendered (opacity 0) so screen readers already know the live region when text arrives.
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const inner = document.createElement('div');
  inner.className = 'words-inner';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('aria-hidden', 'true');
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  icon.append(glyph);
  const line = document.createElement('p');
  line.className = 'line';
  const sub = document.createElement('p');
  sub.className = 'sub';
  inner.append(icon, line, sub);
  el.append(inner);

  let running: Animation | undefined;
  return {
    el,
    show(msg) {
      ensureFont();
      running?.cancel();
      el.dataset.phase = msg.phase === 'focus' ? 'focus' : 'break';
      glyph.setAttribute('d', ICON[msg.phase]);
      line.textContent = msg.line;
      sub.textContent = msg.sub;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hidden = still ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)', filter: 'blur(4px)' };
      const shown = still ? { opacity: 1 } : { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' };
      running = el.animate(
        [
          { ...hidden, offset: 0, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
          { ...shown, offset: ENTER / TOTAL },
          { ...shown, offset: (ENTER + HOLD) / TOTAL, easing: 'ease' },
          { ...shown, opacity: 0, offset: 1 },
        ],
        { duration: TOTAL, fill: 'forwards' },
      );
      running.onfinish = () => {
        line.textContent = '';
        sub.textContent = '';
      };
    },
  };
}
