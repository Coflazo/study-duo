import { normalizeSettings, type Appearance } from '@/core/settings';
import { settingsItem } from '@/core/store';

/** Settings > Appearance on extension pages: System follows the computer live, Light and Dark override it. */
export function applyAppearance(appearance: Appearance): void {
  if (appearance === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = appearance;
}

/** Watch first, then read, so a change between the two is never lost. */
export async function followAppearance(): Promise<() => void> {
  const unwatch = settingsItem.watch((v) => applyAppearance(normalizeSettings(v).appearance));
  applyAppearance(normalizeSettings(await settingsItem.getValue()).appearance);
  return unwatch;
}
