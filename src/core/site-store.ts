import { normalizeDomain, normalizeSites, type SiteCategory } from './sites';
import { promptDismissedItem, sitesItem } from './store';

function canonical(domain: string): string {
  const n = normalizeDomain(domain);
  if (!('domain' in n) || n.domain !== domain) throw new Error(`Not a canonical domain: ${domain}`);
  return domain;
}

/** Files or moves a site. Used by extension pages directly and by the background for content scripts. */
export async function fileSite(domain: string, category: SiteCategory): Promise<void> {
  const d = canonical(domain);
  const sites = normalizeSites(await sitesItem.getValue());
  await sitesItem.setValue({ ...sites, [d]: category });
}

export async function removeSite(domain: string): Promise<void> {
  const { [domain]: _, ...rest } = normalizeSites(await sitesItem.getValue());
  await sitesItem.setValue(rest);
}

/** The "is this for studying?" prompt never comes back for this site. */
export async function dismissPrompt(domain: string): Promise<void> {
  const d = canonical(domain);
  const list = await promptDismissedItem.getValue();
  if (!list.includes(d)) await promptDismissedItem.setValue([...list, d].slice(-500));
}
