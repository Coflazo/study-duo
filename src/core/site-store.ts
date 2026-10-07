import { lockActive } from './blocking';
import { loosens } from './hard-lock';
import { normalizeSettings, type SiteMode, type TimerSettings } from './settings';
import { normalizeDomain, normalizeSites, type SiteCategory, type Sites } from './sites';
import { promptDismissedItem, settingsItem, sitesItem, timerItem } from './store';

/** Thrown when a change would loosen the site lock during a hard-locked study block. */
export class HardLockError extends Error {
  constructor() {
    super('Hard lock is on until this study block ends.');
    this.name = 'HardLockError';
  }
}

function canonical(domain: string): string {
  const n = normalizeDomain(domain);
  if (!('domain' in n) || n.domain !== domain) throw new Error(`Not a canonical domain: ${domain}`);
  return domain;
}

/** Hard lock means no way around it until the block ends: refuse any change that would open a page that is closed now. */
async function guard(next: { sites?: Sites; siteMode?: SiteMode; hardLock?: boolean }): Promise<{ sites: Sites; settings: TimerSettings }> {
  const [timer, settings, sites] = await Promise.all([timerItem.getValue(), settingsItem.getValue().then(normalizeSettings), sitesItem.getValue().then(normalizeSites)]);
  if (lockActive(timer) && settings.hardLock) {
    const before = { sites, mode: settings.siteMode };
    const after = { sites: next.sites ?? sites, mode: next.siteMode ?? settings.siteMode };
    if (next.hardLock === false || loosens(before, after)) throw new HardLockError();
  }
  return { sites, settings };
}

/** Whether a change would be refused right now (for greying out controls). */
export async function wouldBeRefused(next: { sites?: Sites; siteMode?: SiteMode; hardLock?: boolean }): Promise<boolean> {
  return guard(next).then(() => false, (e) => e instanceof HardLockError);
}

/** Files or moves a site. Used by extension pages directly and by the background for content scripts. */
export async function fileSite(domain: string, category: SiteCategory): Promise<void> {
  const d = canonical(domain);
  const sites = normalizeSites(await sitesItem.getValue());
  const next = { ...sites, [d]: category };
  await guard({ sites: next });
  await sitesItem.setValue(next);
}

export async function removeSite(domain: string): Promise<void> {
  const { [domain]: _, ...rest } = normalizeSites(await sitesItem.getValue());
  await guard({ sites: rest });
  await sitesItem.setValue(rest);
}

/** The study-block mode and the hard lock switch, through the same guard. */
export async function updateSiteSettings(patch: { siteMode?: SiteMode; hardLock?: boolean }): Promise<void> {
  const { settings } = await guard(patch);
  await settingsItem.setValue(normalizeSettings({ ...settings, ...patch }));
}

/** The "is this for studying?" prompt never comes back for this site. */
export async function dismissPrompt(domain: string): Promise<void> {
  const d = canonical(domain);
  const list = await promptDismissedItem.getValue();
  if (!list.includes(d)) await promptDismissedItem.setValue([...list, d].slice(-500));
}
