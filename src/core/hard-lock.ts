import { buildRules, wouldClose } from './blocking';
import type { SiteMode } from './settings';
import type { Sites } from './sites';

type Lists = { sites: Sites; mode: SiteMode };
const PAGE = 'chrome-extension://hard-lock/blocked.html';

/** True when going from `before` to `after` would open a page the rules close now. Checks every filed site and one unfiled one. */
export function loosens(before: Lists, after: Lists): boolean {
  const was = buildRules({ ...before, unlocked: [], blockedPage: PAGE });
  const now = buildRules({ ...after, unlocked: [], blockedPage: PAGE });
  const hosts = new Set([...Object.keys(before.sites), ...Object.keys(after.sites), 'unfiled.invalid']);
  return [...hosts].some((h) => wouldClose(was, `https://${h}/`) && !wouldClose(now, `https://${h}/`));
}
