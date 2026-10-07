<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { DEFAULT_SETTINGS, normalizeSettings, type SiteMode, type TimerSettings } from '@/core/settings';
  import { lockActive } from '@/core/blocking';
  import { loosens } from '@/core/hard-lock';
  import { fileSite, HardLockError, removeSite, updateSiteSettings } from '@/core/site-store';
  import { normalizeDomain, normalizeSites, type SiteCategory, type Sites } from '@/core/sites';
  import { settingsItem, sitesItem, timerItem } from '@/core/store';
  import { initialState } from '@/core/timer';
  import { ICONS } from '@/ui/icons';
  import Segmented from '@/ui/Segmented.svelte';
  import Toggle from '@/ui/Toggle.svelte';

  const CATEGORIES: Array<{ cat: SiteCategory; name: string; desc: string }> = [
    { cat: 'blocked', name: 'Blocked', desc: 'Closed during study blocks.' },
    { cat: 'study', name: 'Study', desc: 'Always open. Time here counts as studying.' },
    { cat: 'neutral', name: 'Not blocked', desc: 'Open, and counted as neither.' },
  ];
  const MODES: Array<[SiteMode, string]> = [['closeBlocked', 'Close Blocked'], ['allowOnlyStudy', 'Allow only Study']];

  let sites = $state<Sites>({});
  let settings = $state<TimerSettings>(DEFAULT_SETTINGS);
  let menuFor = $state<string | null>(null);
  let adding = $state<SiteCategory | null>(null);
  let draft = $state('');
  let error = $state('');
  let timer = $state(initialState());
  let notice = $state('');

  const lists = $derived(
    Object.fromEntries(CATEGORIES.map(({ cat }) => [cat, Object.keys(sites).filter((d) => sites[d] === cat).sort()])) as Record<SiteCategory, string[]>,
  );
  const count = (n: number) => (n === 0 ? 'No sites yet' : n === 1 ? '1 site' : `${n} sites`);

  // During a hard-locked block, anything that would open a closed site is refused (the data layer enforces it too).
  const locked = $derived(lockActive(timer) && settings.hardLock);
  const refused = (next: { sites?: Sites; mode?: SiteMode }) =>
    locked && loosens({ sites, mode: settings.siteMode }, { sites: next.sites ?? sites, mode: next.mode ?? settings.siteMode });
  const without = (domain: string) => Object.fromEntries(Object.entries(sites).filter(([d]) => d !== domain)) as Sites;
  async function attempt(change: () => Promise<void>) {
    try {
      await change();
      notice = '';
    } catch (e) {
      if (e instanceof HardLockError) notice = e.message;
      else throw e;
    }
  }

  const unwatch: Array<() => void> = [];
  onMount(async () => {
    unwatch.push(sitesItem.watch((v) => (sites = normalizeSites(v))));
    unwatch.push(settingsItem.watch((v) => (settings = normalizeSettings(v))));
    unwatch.push(timerItem.watch((v) => (timer = v ?? initialState())));
    timer = await timerItem.getValue();
    sites = normalizeSites(await sitesItem.getValue());
    settings = normalizeSettings(await settingsItem.getValue());
  });
  onDestroy(() => unwatch.forEach((u) => u()));


  async function openMenu(domain: string) {
    menuFor = menuFor === domain ? null : domain;
    await tick();
    document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')?.focus();
  }
  function closeMenu(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && (e.target as HTMLElement).closest('.chip')) return;
    menuFor = null;
  }

  function startAdding(cat: SiteCategory) {
    adding = cat;
    draft = '';
    error = '';
  }
  async function add(e: SubmitEvent, cat: SiteCategory) {
    e.preventDefault();
    const n = normalizeDomain(draft);
    if ('error' in n) {
      error = n.error;
      return;
    }
    try {
      await fileSite(n.domain, cat);
      adding = null;
    } catch (e) {
      if (!(e instanceof HardLockError)) throw e;
      error = e.message;
    }
  }
  const focusOnMount = (el: HTMLElement) => el.focus();
</script>

<svelte:window onclick={closeMenu} onkeydown={closeMenu} />

<section aria-labelledby="sites-title">
  <h2 id="sites-title">Sites</h2>
  {#if locked}<p class="notice" role="status">Hard lock is on until this study block ends. You can still close more sites.</p>{/if}
  {#if notice && !locked}<p class="notice" role="status">{notice}</p>{/if}

  <div class="row">
    <div class="text">
      <p class="label">During study blocks</p>
      <p class="help">Allow only Study also closes sites you have not filed yet.</p>
    </div>
    <Segmented
      options={MODES}
      value={settings.siteMode}
      label="During study blocks"
      disabled={MODES.map(([m]) => m).filter((m) => refused({ mode: m }))}
      onchange={(siteMode) => attempt(() => updateSiteSettings({ siteMode }))}
    />
  </div>

  {#each CATEGORIES as { cat, name, desc } (cat)}
    <div class="group">
      <h3><span class="mark mark-{cat}"></span>{name} <span class="count">{count(lists[cat].length)}</span></h3>
      <p class="help">{desc}</p>
      <ul>
        {#each lists[cat] as domain (domain)}
          <li class="chip">
            <button class="name" aria-haspopup="menu" aria-expanded={menuFor === domain} onclick={() => openMenu(domain)}>{domain}</button>
            <button class="x" aria-label="Remove {domain}" disabled={refused({ sites: without(domain) })} onclick={() => attempt(() => removeSite(domain))}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.x} /></svg>
            </button>
            {#if menuFor === domain}
              <div class="menu" role="menu" aria-label="Move {domain}">
                {#each CATEGORIES.filter((c) => c.cat !== cat) as other (other.cat)}
                  <button role="menuitem" disabled={refused({ sites: { ...sites, [domain]: other.cat } })} onclick={() => { attempt(() => fileSite(domain, other.cat)); menuFor = null; }}>Move to {other.name}</button>
                {/each}
                <button role="menuitem" disabled={refused({ sites: without(domain) })} onclick={() => { attempt(() => removeSite(domain)); menuFor = null; }}>Remove</button>
              </div>
            {/if}
          </li>
        {/each}
        <li>
          {#if adding === cat}
            <form onsubmit={(e) => add(e, cat)}>
              <input
                aria-label="Add a site to {name}"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? `error-${cat}` : undefined}
                placeholder="khanacademy.org"
                autocomplete="off"
                spellcheck="false"
                bind:value={draft}
                use:focusOnMount
                onkeydown={(e) => e.key === 'Escape' && (adding = null)}
                onblur={() => !draft.trim() && (adding = null)}
              />
            </form>
          {:else}
            <button class="add" onclick={() => startAdding(cat)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.plus} /></svg>Add
            </button>
          {/if}
        </li>
      </ul>
      {#if adding === cat && error}<p class="error" id="error-{cat}" role="alert">{error}</p>{/if}
    </div>
  {/each}

  <p class="help hint">Click a site to move it to another list.</p>

  <div class="row">
    <div class="text">
      <p class="label" id="hard-lock">Opening a closed site</p>
      <p class="help">Wait 10 seconds and say why. A hard lock removes that, and keeps these lists from opening anything, until the block ends.</p>
    </div>
    <Toggle checked={settings.hardLock} label="Hard lock" disabled={locked} onchange={(hardLock) => attempt(() => updateSiteSettings({ hardLock }))} />
  </div>
</section>

<style>
  section { display: flex; flex-direction: column; }
  h2 { margin: 0 0 4px; font: 700 20px/24px var(--font-family-ui); }
  .row { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; padding-block: 12px; border-block-end: 1px solid var(--color-border-subtle); }
  .text { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; }
  .label { margin: 0; font: 600 14px/20px var(--font-family-ui); }
  .help { margin: 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .group { display: flex; flex-direction: column; gap: 8px; padding-block: 16px 4px; }
  h3 { display: flex; align-items: center; gap: 8px; margin: 0; font: 600 14px/20px var(--font-family-ui); }
  .count { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .mark { inline-size: 8px; block-size: 8px; }
  .mark-blocked { background: var(--color-bg-plate-focus); }
  .mark-study { background: var(--color-bg-plate-break); }
  .mark-neutral { background: var(--color-text-disabled); }
  ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .chip { position: relative; display: flex; align-items: center; border-radius: 2px; background: var(--color-bg-sunken); }
  .name {
    padding: 6px 0 6px 10px; border: 0; background: none; color: var(--color-text-primary);
    font: 500 14px/20px var(--font-family-mono); cursor: pointer; overflow-wrap: anywhere; text-align: start;
  }
  .x { display: grid; place-items: center; padding: 6px; border: 0; background: none; color: var(--color-text-primary); cursor: pointer; }
  .x svg, .add svg { inline-size: 16px; block-size: 16px; fill: currentColor; }
  .menu {
    position: absolute; inset-block-start: calc(100% + 4px); inset-inline-start: 0; z-index: 1; display: flex; flex-direction: column;
    min-inline-size: 180px; padding: 4px; border: 1px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  }
  .menu button { padding: 8px 10px; border: 0; border-radius: 2px; background: none; color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui); text-align: start; cursor: pointer; }
  .menu button:hover { background: var(--color-bg-sunken); }
  .add {
    display: flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px dashed var(--color-border-control); border-radius: 2px;
    background: none; color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui); cursor: pointer;
  }
  input {
    inline-size: 220px; max-inline-size: 100%; padding: 5px 10px; border: 2px solid var(--color-border-strong); border-radius: 2px;
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 500 14px/20px var(--font-family-mono);
  }
  input[aria-invalid='true'] { border-color: var(--color-bg-plate-focus); }
  .error { margin: 0; font: 600 12px/16px var(--font-family-ui); color: var(--color-text-focus); }
  .hint { padding-block: 8px; }
  .notice { margin: 4px 0 8px; padding: 8px 12px; border-inline-start: 3px solid var(--color-border-focus); background: var(--color-bg-sunken); font: 600 14px/20px var(--font-family-ui); }
  button:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
