<script module lang="ts">
  import type { PlayerSource } from '@/core/player';
  export type SourcePick = { source: PlayerSource } | { tab: number };
</script>

<script lang="ts">
  /**
   * The source button and its list (Figma "Screens: Player (approved)", Source button and its list): everything Study
   * Duo can play, grouped as on this computer, streaming, and in your tabs. Shared by the popup card and the side panel;
   * the page decides what a pick does (the popup opens the side panel for links).
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import type { FolderRecord } from '@/core/library-db';
  import type { PlayerState } from '@/core/player';
  import { clip } from '@/core/text';
  import { LOGOS, serviceOf } from '@/ui/logos';

  let {
    player,
    folder,
    label,
    anchor = 'card',
    onpick,
    onopenpanel,
  }: { player: PlayerState; folder: FolderRecord | null; label: string; anchor?: 'card' | 'self'; onpick: (p: SourcePick) => void; onopenpanel?: () => void } = $props();

  const CARET = 'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z';
  const WAVE = 'M60,96v64a12,12,0,0,1-24,0V96a12,12,0,0,1,24,0ZM88,20A12,12,0,0,0,76,32V224a12,12,0,0,0,24,0V32A12,12,0,0,0,88,20Zm40,32a12,12,0,0,0-12,12V192a12,12,0,0,0,24,0V64A12,12,0,0,0,128,52Zm40,32a12,12,0,0,0-12,12v64a12,12,0,0,0,24,0V96A12,12,0,0,0,168,84Zm40-16a12,12,0,0,0-12,12v96a12,12,0,0,0,24,0V80A12,12,0,0,0,208,68Z';
  const FOLDER = 'M216,68H132L105.33,48a20.12,20.12,0,0,0-12-4H40A20,20,0,0,0,20,64V200a20,20,0,0,0,20,20H216.89A19.13,19.13,0,0,0,236,200.89V88A20,20,0,0,0,216,68Zm-4,128H44V68H92l28.8,21.6A12,12,0,0,0,128,92h84Z';
  /** The approved order and wording (Figma, Source button and its list). */
  const STREAMS = [
    { source: 'youtube', name: 'YouTube link', sub: 'A public playlist, video or live stream', logo: LOGOS.youtube },
    { source: 'spotify', name: 'Spotify', sub: 'Your account', logo: LOGOS.spotify },
    { source: 'apple', name: 'Apple Music', sub: 'Your account', logo: LOGOS.apple },
    { source: 'soundcloud', name: 'SoundCloud', sub: 'Public tracks, no account', logo: LOGOS.soundcloud },
    { source: 'tidal', name: 'Tidal', sub: 'Your account', logo: LOGOS.tidal },
  ] as const;
  const CHECK = 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z';

  let open = $state(false);
  let fromKeys = $state(false);
  let button: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();
  const id = `sources-${Math.random().toString(36).slice(2, 8)}`;
  const active = (p: SourcePick) => ('tab' in p ? player.active === 'tab' && player.tab === p.tab : player.active === p.source || (p.source === 'noise' && player.active === null));

  async function show(keys: boolean) {
    fromKeys = keys;
    open = true;
    await tick();
    (menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }
  function hide(focusBack: boolean) {
    open = false;
    if (focusBack) button?.focus();
  }
  function keys(e: KeyboardEvent) {
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      hide(true);
    } else if (e.key === 'Tab') hide(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  }
  function blur(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (to && !menu?.contains(to) && !button?.contains(to)) hide(false);
  }
  function outside(e: PointerEvent) {
    if (open && !menu?.contains(e.target as Node) && !button?.contains(e.target as Node)) hide(false);
  }
  function pick(p: SourcePick) {
    hide(true);
    onpick(p);
  }
  onMount(() => document.addEventListener('pointerdown', outside));
  onDestroy(() => document.removeEventListener('pointerdown', outside));
</script>

{#snippet item(p: SourcePick, path: string, title: string, sub: string, brand?: string, grid = 256)}
  <button role="menuitemradio" aria-checked={active(p)} onclick={() => pick(p)}>
    <svg viewBox="0 0 {grid} {grid}" aria-hidden="true" style:fill={brand}><path d={path} /></svg>
    <span><b>{title}</b><small>{sub}</small></span>
    {#if active(p)}<svg class="tick" viewBox="0 0 256 256" aria-hidden="true"><path d={CHECK} /></svg>{:else}<span></span>{/if}
  </button>
{/snippet}

<div class="anchor {anchor}">
  <button class="src" bind:this={button} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onclick={(e) => (open ? hide(false) : show(e.detail === 0))}>
    <span class="lamp"></span>{label}<svg viewBox="0 0 256 256" aria-hidden="true"><path d={CARET} /></svg>
  </button>
  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="menu" class:instant={fromKeys} {id} role="menu" tabindex="-1" aria-label="Play from" bind:this={menu} onkeydown={keys} onfocusout={blur}>
      <div role="group" aria-labelledby="{id}-local">
        <p class="group" id="{id}-local">ON THIS COMPUTER</p>
        {@render item({ source: 'folder' }, FOLDER, 'Your folder', folder ? `${clip(folder.name, 30)} · ${folder.count} ${folder.count === 1 ? 'song' : 'songs'}` : 'Choose a folder on the Music page')}
        {@render item({ source: 'noise' }, WAVE, 'Focus noise', 'White, pink or brown')}
      </div>
      <div class="sep" role="separator"></div>
      <div role="group" aria-labelledby="{id}-streaming">
        <p class="group" id="{id}-streaming">STREAMING</p>
        {#each STREAMS as s (s.source)}
          {@render item({ source: s.source }, s.logo.path, s.name, player.stream?.source === s.source && player.stream.title ? clip(player.stream.title, 34) : s.sub, s.logo.color, 24)}
        {/each}
      </div>
      {#if player.tabs.length}
        <div class="sep" role="separator"></div>
        <div role="group" aria-labelledby="{id}-tabs">
          <p class="group" id="{id}-tabs">IN YOUR TABS</p>
          {#each player.tabs as t (t.tabId)}
            {@const s = serviceOf(t.host)}
            {@render item({ tab: t.tabId }, s.path, `${s.name} tab`, `${t.playing ? 'Playing' : 'Paused'} in another tab`, s.color, s.grid)}
          {/each}
        </div>
      {/if}
      {#if onopenpanel}
        <div class="sep" role="separator"></div>
        <button class="open" role="menuitem" onclick={() => (hide(false), onopenpanel())}>Open the full player</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .anchor.self { position: relative; }
  .src {
    display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 6px; border: 1px solid var(--color-border-control);
    border-radius: 4px; background: none; color: var(--color-text-primary); font: 600 11px/14px var(--font-family-mono); letter-spacing: 0.04em; cursor: pointer;
    transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .src:active { transform: scale(0.97); }
  .src[aria-expanded='true'] { background: var(--color-bg-sunken); }
  .lamp { inline-size: 6px; block-size: 6px; background: var(--color-text-focus); }
  .src svg { inline-size: 12px; block-size: 12px; fill: var(--color-text-secondary); transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1); }
  .src[aria-expanded='true'] svg { transform: rotate(180deg); }
  /* Right-aligned to the popup card so it stays inside the 360 px popup; under the button in the side panel. */
  .menu {
    position: absolute; z-index: 4; inset-inline-end: 12px; inset-block-start: 40px; inline-size: min(264px, calc(100% - 24px)); padding-block: 6px;
    border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-bg-panel); box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    transform-origin: 58% 0; animation: open 180ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .self .menu { inset-inline-start: 0; inset-inline-end: auto; inset-block-start: calc(100% + 4px); inline-size: 280px; transform-origin: 20% 0; }
  .menu.instant { animation: none; }
  @keyframes open { from { opacity: 0; transform: scale(0.96); } }
  .group { margin: 0; padding: 8px 12px 4px; font: 600 10px/12px var(--font-family-mono); letter-spacing: 0.06em; color: var(--color-text-secondary); }
  .menu button {
    inline-size: 100%; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 12px;
    border: 0; background: none; color: var(--color-text-primary); text-align: start; cursor: pointer;
  }
  .menu button:hover, .menu button:focus-visible, .menu button[aria-checked='true'] { background: var(--color-bg-sunken); }
  .menu svg { inline-size: 18px; block-size: 18px; fill: var(--color-text-primary); }
  .menu .tick { inline-size: 16px; block-size: 16px; }
  .sep { block-size: 1px; margin-block: 6px; background: var(--color-border-subtle); }
  .menu .open { display: block; padding: 8px 12px; font: 600 13px/16px var(--font-family-ui); }
  .menu span { min-inline-size: 0; }
  .menu b { display: block; font: 700 13px/16px var(--font-family-ui); }
  .menu b, .menu small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu small { display: block; font: 400 11px/14px var(--font-family-ui); color: var(--color-text-secondary); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .src, .src svg { transition: none; }
    .menu { animation: none; }
  }
</style>
