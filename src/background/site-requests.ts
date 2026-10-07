import type { SiteRequest } from '@/core/messages';
import type { SiteMode } from '@/core/settings';
import { dismissPrompt, fileSite } from '@/core/site-store';
import { categoryFor, hostOf, normalizeSites, type SiteCategory } from '@/core/sites';
import { loadSettings, loadState, promptDismissedItem, sitesItem } from '@/core/store';
import { lockActive } from './site-lock';

export interface SiteStatus {
  domain: string;
  category: SiteCategory | null;
  dismissed: boolean;
  lockActive: boolean;
  mode: SiteMode;
}

/** Requests from content scripts, already narrowed to the sending page's own site. */
export async function handleSiteRequest(req: SiteRequest): Promise<SiteStatus | null> {
  if (req.op === 'file') {
    await fileSite(req.domain, req.category);
    await dismissPrompt(req.domain);
    return null;
  }
  if (req.op === 'dismiss') {
    await dismissPrompt(req.domain);
    return null;
  }
  const [sites, dismissed, state, settings] = await Promise.all([sitesItem.getValue(), promptDismissedItem.getValue(), loadState(), loadSettings()]);
  return {
    domain: req.domain,
    category: categoryFor(req.domain, normalizeSites(sites)),
    dismissed: dismissed.includes(req.domain),
    lockActive: lockActive(state),
    mode: settings.siteMode,
  };
}

const MENU: Record<string, SiteCategory> = { 'file-blocked': 'blocked', 'file-study': 'study', 'file-neutral': 'neutral' };

export function menuCategory(id: string | number): SiteCategory | null {
  return MENU[String(id)] ?? null;
}

/** Right-click on a page or on the toolbar button: file that tab's site. */
export async function createSiteMenu(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: 'file-site', title: 'File this site in Study Duo', contexts: ['page', 'action'] });
  for (const [id, title] of [['file-blocked', 'Blocked'], ['file-study', 'Study'], ['file-neutral', 'Not blocked']] as const) {
    browser.contextMenus.create({ id, parentId: 'file-site', title, contexts: ['page', 'action'] });
  }
}

export async function onSiteMenuClick(info: { menuItemId: string | number; pageUrl?: string }, tab: { url?: string } | undefined): Promise<void> {
  const category = menuCategory(info.menuItemId);
  const domain = hostOf(info.pageUrl ?? tab?.url);
  if (category && domain) await fileSite(domain, category);
}
