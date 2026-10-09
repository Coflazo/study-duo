<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { sortTracks } from '@/core/library';
  import { loadFolder, loadThumb, loadTracks, type FolderRecord } from '@/core/library-db';
  import type { NoiseKind } from '@/core/noise';
  import { INITIAL_PLAYER, positionAt, type PlayerCommand, type PlayerSource, type PlayerState } from '@/core/player';
  import { playerItem } from '@/core/session-store';
  import { normalizeSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { clip } from '@/core/text';
  import { ICONS } from '@/ui/icons';
  import SleeveArt from '@/ui/SleeveArt.svelte';

  /**
   * The popup's player card, Figma "Screens: Player (approved)", direction B (Sleeve): the record half out of its
   * sleeve. It shows whichever source the one player has: focus noise, or the music folder.
   */
  const NOISE: Record<NoiseKind, { name: string; title: string; sleeve: string; c: [string, string]; ink: string; ring: string; mark: string; tint: string; chip: string; chipInk: string }> = {
    white: { name: 'White', title: 'White noise', sleeve: 'WHITE\nNOISE', c: ['#FFFFFF', '#CDD1D5'], ink: '#17191C', ring: 'rgb(23 25 28 / 0.3)', mark: 'rgb(23 25 28 / 0.55)', tint: '#9AA3AD', chip: '#FFFFFF', chipInk: '#17191C' },
    pink: { name: 'Pink', title: 'Pink noise', sleeve: 'PINK\nNOISE', c: ['#F7C9D4', '#E28AA1'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#E28AA1', chip: '#F3C9D3', chipInk: '#17191C' },
    brown: { name: 'Brown', title: 'Brown noise', sleeve: 'BROWN\nNOISE', c: ['#A27757', '#5A3A28'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#8B6448', chip: '#8B6448', chipInk: '#FFFFFF' },
  };
  const KINDS: NoiseKind[] = ['white', 'pink', 'brown'];
  /** Folder songs without a cover get this colour, mixed with white for the label. */
  const NO_COVER = '#5876C2';
  /** Phosphor Bold on a 256 grid. */
  const CARET = 'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z';
  const SPEAKER = 'M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z';
  const WAVE = 'M60,96v64a12,12,0,0,1-24,0V96a12,12,0,0,1,24,0ZM88,20A12,12,0,0,0,76,32V224a12,12,0,0,0,24,0V32A12,12,0,0,0,88,20Zm40,32a12,12,0,0,0-12,12V192a12,12,0,0,0,24,0V64A12,12,0,0,0,128,52Zm40,32a12,12,0,0,0-12,12v64a12,12,0,0,0,24,0V96A12,12,0,0,0,168,84Zm40-16a12,12,0,0,0-12,12v96a12,12,0,0,0,24,0V80A12,12,0,0,0,208,68Z';
  const FOLDER = 'M216,68H132L105.33,48a20.12,20.12,0,0,0-12-4H40A20,20,0,0,0,20,64V200a20,20,0,0,0,20,20H216.89A19.13,19.13,0,0,0,236,200.89V88A20,20,0,0,0,216,68Zm-4,128H44V68H92l28.8,21.6A12,12,0,0,0,128,92h84Z';
  const CHECK = 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z';

  let player = $state<PlayerState>(INITIAL_PLAYER);
  let folder = $state<FolderRecord | null>(null);
  let menuOpen = $state(false);
  let menuFromKeys = $state(false);
  let now = $state(Date.now());
  let dragging = $state<number | null>(null);
  let cover = $state<string | null>(null);
  let srcEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  const view = $derived<'noise' | 'folder'>(player.active === 'folder' ? 'folder' : 'noise');
  const noise = $derived(NOISE[player.noise]);
  const track = $derived(view === 'folder' ? player.now : null);
  const playing = $derived(player.playing && (view === 'folder' ? player.active === 'folder' : player.active === 'noise' || player.active === null));
  const duration = $derived(player.duration ?? 0);
  const position = $derived(dragging ?? positionAt(player, now));
  const upNext = $derived(view === 'folder' ? player.upNext : null);
  const tint = $derived(view === 'folder' ? (track?.color ?? NO_COVER) : noise.tint);
  const label = $derived(view === 'folder' ? 'FOLDER' : 'SOUNDS');
  const sleeveText = $derived(track ? [track.artist, track.album].filter(Boolean).join('\n').toUpperCase() || 'YOUR\nFOLDER' : 'YOUR\nFOLDER');
  const send = (cmd: PlayerCommand) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  /** Settings, Spinning disc: "Always" turns it even when the computer asks for less motion. */
  let always = $state(false);
  const art = $derived(
    view === 'noise'
      ? { kind: 'noise' as const, c: noise.c, ring: noise.ring, mark: noise.mark, sleeve: noise.sleeve, ink: noise.ink }
      : track
        ? { kind: 'cd' as const, color: track.color ?? NO_COVER, cover, sleeve: sleeveText }
        : { kind: 'empty' as const, sleeve: folder ? 'YOUR\nFOLDER' : 'CHOOSE A\nFOLDER' },
  );

  // The popup takes a light tint of what plays (the cover's colour for a song); it fades back when it stops.
  $effect(() => {
    const body = document.body;
    body.style.transition = 'background-color 600ms ease';
    body.style.backgroundColor = playing ? `color-mix(in oklab, var(--color-bg-canvas) 86%, ${tint})` : '';
  });

  // The song's place runs forward on screen only while the popup is open and the folder plays.
  $effect(() => {
    if (!(playing && view === 'folder')) return;
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });

  // The cover thumbnail of the song on the card.
  $effect(() => {
    const id = track?.cover ? track.id : null;
    let url: string | null = null;
    let gone = false;
    if (id) void loadThumb(id).then((b) => !gone && b && (cover = url = URL.createObjectURL(b))).catch(() => undefined);
    else cover = null;
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  async function openMenu(fromKeys: boolean) {
    menuFromKeys = fromKeys;
    menuOpen = true;
    await tick();
    (menuEl?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menuEl?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }
  function closeMenu(focusBack: boolean) {
    menuOpen = false;
    if (focusBack) srcEl?.focus();
  }
  function menuKeys(e: KeyboardEvent) {
    const items = [...(menuEl?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  }
  function outside(e: PointerEvent) {
    if (menuOpen && !menuEl?.contains(e.target as Node) && !srcEl?.contains(e.target as Node)) closeMenu(false);
  }
  function pick(source: PlayerSource) {
    closeMenu(true);
    if (source !== player.active) void send({ op: 'source', source });
  }
  const openMusicPage = () => void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html#music') });

  async function playAll() {
    const tracks = sortTracks(await loadTracks());
    if (!tracks.length) return openMusicPage();
    void send({ op: 'folder', tracks: tracks.slice(0, 5_000).map((t) => ({ id: t.id, path: t.path, title: t.title, artist: t.artist, album: t.album, genre: t.genre, color: t.color, cover: t.cover })), start: 0, shuffle: false });
  }
  async function reconnect() {
    const h = folder?.handle as (FileSystemDirectoryHandle & { requestPermission?(d: { mode: 'read' }): Promise<PermissionState> }) | undefined;
    if (h?.requestPermission && (await h.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted') void send({ op: 'play' });
    else openMusicPage();
  }
  function seekKeys(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    void send({ op: 'seek', ms: Math.max(0, positionAt(player, Date.now()) + (e.key === 'ArrowRight' ? 5_000 : -5_000)) });
  }

  let unwatch: (() => void) | undefined;
  onMount(async () => {
    const unwatchPlayer = playerItem.watch((v) => (player = v ?? INITIAL_PLAYER));
    const unwatchSettings = settingsItem.watch((v) => (always = normalizeSettings(v).discMotion === 'always'));
    unwatch = () => (unwatchPlayer(), unwatchSettings());
    [player, always, folder] = await Promise.all([
      playerItem.getValue(),
      settingsItem.getValue().then((v) => normalizeSettings(v).discMotion === 'always'),
      loadFolder().catch(() => null),
    ]);
    document.addEventListener('pointerdown', outside);
  });
  onDestroy(() => {
    unwatch?.();
    document.removeEventListener('pointerdown', outside);
    document.body.style.backgroundColor = '';
  });
</script>

{#snippet key(name: string, path: string, onclick: () => void, main = false, flip = false, disabled = false)}
  <button class="key" class:main class:flip aria-label={name} {disabled} {onclick}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={path} /></svg>
  </button>
{/snippet}

<section class="card" aria-label="Player">
  <div class="body">
    <SleeveArt {art} {playing} {always} />
    <div class="col">
      <button class="src" bind:this={srcEl} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="player-sources" onclick={(e) => (menuOpen ? closeMenu(false) : openMenu(e.detail === 0))}>
        <span class="lamp"></span>{label}<svg viewBox="0 0 256 256" aria-hidden="true"><path d={CARET} /></svg>
      </button>
      {#if view === 'noise'}
        <p class="title" title={noise.title}>{noise.title}</p>
        <p class="sub">Made in your browser</p>
        <label class="vol">
          <svg viewBox="0 0 256 256" aria-hidden="true"><path d={SPEAKER} /></svg>
          <input type="range" min="0" max="100" value={Math.round(player.volume * 100)} aria-label="Volume" style:--v="{Math.round(player.volume * 100)}%" oninput={(e) => send({ op: 'volume', volume: Number(e.currentTarget.value) / 100 })} />
        </label>
      {:else if player.problem === 'reconnect'}
        <p class="title">Chrome asks again for your folder</p>
        <p class="sub wrap">After a restart, Chrome needs one click to read your music again.</p>
        <button class="action" onclick={reconnect}>Reconnect folder</button>
      {:else if !folder}
        <p class="title">No music folder yet</p>
        <p class="sub wrap">Pick a folder of songs; they stay on this computer.</p>
        <button class="action" onclick={openMusicPage}>Choose a folder</button>
      {:else if !track}
        <p class="title" title={folder.name}>{clip(folder.name)}</p>
        <p class="sub">{folder.count} {folder.count === 1 ? 'song' : 'songs'} on this computer</p>
        <button class="action" onclick={playAll}>Play all</button>
      {:else}
        <p class="title" title={track.title}>{clip(track.title)}</p>
        <p class="sub" title={track.artist}>{player.problem === 'missing' ? 'This file is gone from your folder' : track.artist || track.album || 'Your folder'}</p>
        <div class="keys">
          {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), false, true)}
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), true)}
          {@render key('Next', ICONS.skip, () => send({ op: 'next' }), false, false, !upNext && player.queue?.repeat === 'off')}
        </div>
      {/if}
    </div>
  </div>

  {#if view === 'noise'}
    <div class="row">
      <div class="noises" role="radiogroup" aria-label="Noise colour">
        {#each KINDS as k (k)}
          <button role="radio" aria-checked={player.noise === k} style:background={NOISE[k].chip} style:color={NOISE[k].chipInk} onclick={() => send({ op: 'noise', noise: k })}>{NOISE[k].name}</button>
        {/each}
      </div>
      {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }))}
    </div>
  {:else if track}
    <div class="seek">
      <span>{fmt(position)}</span>
      <div class="track" style:--p="{duration ? Math.min(100, (position / duration) * 100) : 0}%">
        <input
          type="range" min="0" max={Math.max(1, Math.round(duration / 1000))} step="1" value={Math.round(position / 1000)} disabled={!duration}
          aria-label="Position" aria-valuetext="{fmt(position)} of {fmt(duration)}"
          oninput={(e) => (dragging = Number(e.currentTarget.value) * 1000)}
          onchange={(e) => {
            void send({ op: 'seek', ms: Number(e.currentTarget.value) * 1000 });
            dragging = null;
          }}
          onkeydown={seekKeys}
        />
        {#if dragging !== null}<span class="tip" aria-hidden="true">{fmt(dragging)}</span>{/if}
      </div>
      <span>{duration ? fmt(duration) : '0:00'}</span>
    </div>
    {#if player.queue}
      <p class="foot">Your folder · {player.queue.at + 1} of {player.queue.order.length}{upNext ? ` · Up next: ${clip(upNext, 40)}` : ''}</p>
    {/if}
  {/if}

  {#if menuOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="menu" class:instant={menuFromKeys} id="player-sources" role="menu" tabindex="-1" aria-label="Play from" bind:this={menuEl} onkeydown={menuKeys}>
      <p class="group">ON THIS COMPUTER</p>
      {@render item('folder', FOLDER, 'Your folder', folder ? `${clip(folder.name, 30)} · ${folder.count} ${folder.count === 1 ? 'song' : 'songs'}` : 'Choose a folder on the Music page')}
      {@render item('noise', WAVE, 'Focus noise', 'White, pink or brown')}
    </div>
  {/if}
</section>

{#snippet item(id: PlayerSource, path: string, title: string, sub: string)}
  <button role="menuitemradio" aria-checked={view === id} onclick={() => pick(id)}>
    <svg viewBox="0 0 256 256" aria-hidden="true"><path d={path} /></svg>
    <span><b>{title}</b><small>{sub}</small></span>
    {#if view === id}<svg class="tick" viewBox="0 0 256 256" aria-hidden="true"><path d={CHECK} /></svg>{:else}<span></span>{/if}
  </button>
{/snippet}

<style>
  .card {
    position: relative; display: grid; gap: 10px; padding: 12px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md);
    background: var(--color-bg-panel);
  }
  .body { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: center; }
  .col { display: grid; gap: 6px; align-content: center; min-inline-size: 0; }
  .src {
    justify-self: start; display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 6px; border: 1px solid var(--color-border-control);
    border-radius: 4px; background: none; color: var(--color-text-primary); font: 600 11px/14px var(--font-family-mono); letter-spacing: 0.04em; cursor: pointer;
  }
  .src[aria-expanded='true'] { background: var(--color-bg-sunken); }
  .lamp { inline-size: 6px; block-size: 6px; background: var(--color-text-focus); }
  .src svg { inline-size: 12px; block-size: 12px; fill: var(--color-text-secondary); transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1); }
  .src[aria-expanded='true'] svg { transform: rotate(180deg); }
  .title { margin: 0; font: 700 16px/20px var(--font-family-ui); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { margin: 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.wrap { white-space: normal; }
  .action {
    justify-self: start; padding: 8px 12px; border: 0; border-radius: 6px; background: var(--color-bg-action); color: var(--color-text-on-action);
    font: 700 13px/16px var(--font-family-ui); cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .vol { display: flex; align-items: center; gap: 8px; inline-size: 120px; }
  .vol svg { inline-size: 14px; block-size: 14px; flex: none; fill: var(--color-text-secondary); }
  .vol input { flex: 1; min-inline-size: 0; block-size: 16px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .vol input::-webkit-slider-runnable-track {
    block-size: 3px; border-radius: 2px;
    background: linear-gradient(var(--color-text-secondary), var(--color-text-secondary)) 0 / var(--v, 60%) 100% no-repeat, var(--color-bg-sunken);
  }
  .vol input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4.5px; border-radius: 50%; background: var(--color-text-primary); box-shadow: 0 0 0 2px var(--color-bg-panel); }
  .vol input::-moz-range-track { block-size: 3px; border-radius: 2px; background: var(--color-bg-sunken); }
  .vol input::-moz-range-progress { block-size: 3px; border-radius: 2px; background: var(--color-text-secondary); }
  .vol input::-moz-range-thumb { inline-size: 12px; block-size: 12px; border: 0; border-radius: 50%; background: var(--color-text-primary); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; gap: 8px; align-items: center; }
  .noises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--color-border-control); border-radius: 6px; overflow: hidden; }
  .noises button { block-size: 34px; border: 0; font: 600 13px/16px var(--font-family-ui); cursor: pointer; transition: box-shadow 160ms ease; }
  .noises button + button { border-inline-start: 1px solid var(--color-border-control); }
  .noises button[aria-checked='true'] { font-weight: 700; box-shadow: inset 0 0 0 2px #17191c; }
  .keys { display: flex; align-items: center; gap: 2px; }
  .key {
    display: grid; place-items: center; inline-size: 32px; block-size: 32px; border: 0; border-radius: 6px; background: none; color: var(--color-text-primary);
    cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .row .key, .key.main { inline-size: 34px; block-size: 34px; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .key.main { inline-size: 40px; block-size: 40px; }
  .key:disabled { color: var(--color-text-disabled); cursor: default; }
  .key.flip svg { transform: rotate(180deg); }
  .key:active:not(:disabled), .src:active, .action:active { transform: scale(0.97); }
  .key svg { inline-size: 16px; block-size: 16px; fill: currentColor; }
  .seek { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
  .track { position: relative; }
  .track input { inline-size: 100%; block-size: 24px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .track input:disabled { cursor: default; }
  .track input::-webkit-slider-runnable-track {
    block-size: 4px; border-radius: 2px;
    background: linear-gradient(var(--color-text-focus), var(--color-text-focus)) 0 / var(--p, 0%) 100% no-repeat, var(--color-bg-sunken);
  }
  .track input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4px; border-radius: 50%; background: var(--color-text-primary); box-shadow: 0 0 0 2px var(--color-bg-panel); transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1); }
  .track input:active::-webkit-slider-thumb { transform: scale(1.33); }
  .track input::-moz-range-track { block-size: 4px; border-radius: 2px; background: var(--color-bg-sunken); }
  .track input::-moz-range-progress { block-size: 4px; border-radius: 2px; background: var(--color-text-focus); }
  .track input::-moz-range-thumb { inline-size: 12px; block-size: 12px; border: 0; border-radius: 50%; background: var(--color-text-primary); }
  .tip {
    position: absolute; inset-block-end: 24px; inset-inline-start: var(--p); transform: translateX(-50%); padding: 3px 6px; border-radius: 4px;
    background: var(--color-bg-action); color: var(--color-text-on-action); font: 600 11px/14px var(--font-family-mono); pointer-events: none;
  }
  .foot { margin: 0; font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu {
    position: absolute; z-index: 4; inset-inline-end: 12px; inset-block-start: 40px; inline-size: min(264px, calc(100% - 24px)); padding-block: 6px;
    border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-bg-panel); box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    transform-origin: 58% 0; animation: open 180ms cubic-bezier(0.23, 1, 0.32, 1);
  }
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
  .menu span { min-inline-size: 0; }
  .menu b { display: block; font: 700 13px/16px var(--font-family-ui); }
  .menu b, .menu small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu small { display: block; font: 400 11px/14px var(--font-family-ui); color: var(--color-text-secondary); }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .src svg, .noises button, .key, .action { transition: none; }
    .menu { animation: none; }
  }
</style>
