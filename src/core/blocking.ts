import type { SiteMode } from './settings';
import type { TimerState } from './timer';
import type { Sites } from './sites';

/** The declarativeNetRequest rule shape this extension uses (a subset of chrome.declarativeNetRequest.Rule). */
export interface DnrRule {
  id: number;
  priority: number;
  action: { type: 'redirect'; redirect: { regexSubstitution: string } } | { type: 'allow' };
  condition: { requestDomains?: string[]; regexFilter?: string; resourceTypes: ['main_frame'] };
}

const UNLOCKED_PRIORITY = 1000;
const WEB_PAGE = '^https?://.*';
/** localhost, IP addresses and single-label intranet names: they cannot be filed, so Allow only Study must not close them. */
const LOCAL_PAGE = '^https?://([^/?#@]*@)?(\\[[^\\]/]*\\]|[^./?#:@]+|[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+)(:[0-9]+)?([/?#]|$)';

/**
 * Session rules for a study block. Each filed domain gets its own rule with priority = its label count + 1,
 * so the most specific entry wins (music.youtube.com over youtube.com); unlocked sites beat everything.
 * The blocked page receives the original address in its fragment.
 */
export function buildRules(input: { sites: Sites; mode: SiteMode; unlocked: string[]; blockedPage: string }): DnrRule[] {
  const close = { type: 'redirect' as const, redirect: { regexSubstitution: `${input.blockedPage}#\\0` } };
  const rules: Array<Omit<DnrRule, 'id'>> = [];
  if (input.mode === 'allowOnlyStudy') {
    rules.push({ priority: 1, action: close, condition: { regexFilter: WEB_PAGE, resourceTypes: ['main_frame'] } });
    rules.push({ priority: 2, action: { type: 'allow' }, condition: { regexFilter: LOCAL_PAGE, resourceTypes: ['main_frame'] } });
  }
  for (const domain of Object.keys(input.sites).sort()) {
    const priority = domain.split('.').length + 1;
    const condition = { requestDomains: [domain], resourceTypes: ['main_frame'] as ['main_frame'] };
    rules.push(
      input.sites[domain] === 'blocked'
        ? { priority, action: close, condition: { ...condition, regexFilter: WEB_PAGE } }
        : { priority, action: { type: 'allow' }, condition },
    );
  }
  if (!rules.some((r) => r.action.type === 'redirect')) return [];
  for (const domain of [...new Set(input.unlocked)].sort()) {
    rules.push({ priority: UNLOCKED_PRIORITY, action: { type: 'allow' }, condition: { requestDomains: [domain], resourceTypes: ['main_frame'] } });
  }
  return rules.map((r, i) => ({ id: i + 1, ...r }));
}

/** Whether these rules send a top-level page at `url` to the blocked page: highest priority wins, allow beats redirect on a tie. */
export function wouldClose(rules: DnrRule[], url: string | undefined): boolean {
  let host: string;
  try {
    host = new URL(url ?? '').hostname.toLowerCase();
  } catch {
    return false;
  }
  const hits = rules.filter(
    (r) =>
      (!r.condition.requestDomains || r.condition.requestDomains.some((d) => host === d || host.endsWith(`.${d}`))) &&
      (!r.condition.regexFilter || new RegExp(r.condition.regexFilter).test(url!)),
  );
  hits.sort((a, b) => b.priority - a.priority || (a.action.type === 'allow' ? -1 : 1));
  return hits[0]?.action.type === 'redirect';
}

/** Sites stay closed while a study block runs or is paused; breaks and a stopped timer open everything. */
export function lockActive(state: TimerState): boolean {
  return state.phase === 'focus' && state.status !== 'stopped';
}
