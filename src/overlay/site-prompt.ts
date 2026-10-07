import type { SiteCategory } from '@/core/sites';
import { ICONS } from '@/ui/icons';

const CHOICES: Array<[SiteCategory, string, string]> = [
  ['study', 'Study', 'Always open. Time here counts as studying.'],
  ['neutral', 'Not blocked', 'Open, and counted as neither.'],
  ['blocked', 'Blocked', 'Closed during study blocks.'],
];

export interface SitePrompt {
  el: HTMLDivElement;
  show(domain: string): void;
  hide(): void;
}

/** "New site: khanacademy.org" with Study, Not blocked and Blocked. `answer(null)` means closed without filing. */
export function createSitePrompt(answer: (category: SiteCategory | null) => void): SitePrompt {
  const el = document.createElement('div');
  el.className = 'prompt';
  el.hidden = true;
  // Mouse first, like the clock; keyboard and screen-reader users file sites from the popup, the menu or Settings.
  el.setAttribute('aria-hidden', 'true');

  const head = document.createElement('div');
  head.className = 'prompt-head';
  const q = document.createElement('div');
  q.className = 'prompt-q';
  const kicker = document.createElement('span');
  kicker.className = 'prompt-kicker';
  kicker.textContent = 'New site';
  const domain = document.createElement('strong');
  domain.className = 'prompt-domain';
  q.append(kicker, domain);

  const trusted = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    if (e.isTrusted) fn(); // a page cannot click these for the user
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close prompt-close';
  close.tabIndex = -1;
  close.title = 'Do not ask about this site again';
  const x = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  x.setAttribute('viewBox', '0 0 20 20');
  const xp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  xp.setAttribute('d', ICONS.x);
  x.append(xp);
  close.append(x);
  close.addEventListener('click', trusted(() => answer(null)));
  head.append(q, close);

  const row = document.createElement('div');
  row.className = 'prompt-choices';
  for (const [category, label, hint] of CHOICES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `choice choice-${category}`;
    b.tabIndex = -1;
    b.title = hint;
    const mark = document.createElement('span');
    mark.className = `mark mark-${category}`;
    b.append(mark, label);
    b.addEventListener('click', trusted(() => answer(category)));
    row.append(b);
  }
  el.append(head, row);

  return {
    el,
    show(d) {
      domain.textContent = d;
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
  };
}
