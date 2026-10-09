<script lang="ts">
  /**
   * Chrome's side panel: the full player (Figma "Screens: Player (approved)", Side panel). Now playing with what comes
   * next, and the music folder's library. It drives the same player as the popup card.
   */
  import { onDestroy, onMount } from 'svelte';
  import { loadFolder, loadThumb, type FolderRecord } from '@/core/library-db';
  import type { NoiseKind } from '@/core/noise';
  import { INITIAL_PLAYER, positionAt, type PlayerCommand, type PlayerState, type PlayerTrack } from '@/core/player';
  import type { Repeat } from '@/core/queue';
  import { playerItem, playerTracksItem } from '@/core/session-store';
  import { normalizeSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { clip } from '@/core/text';
  import FolderLibrary from '@/ui/FolderLibrary.svelte';
  import { ICONS } from '@/ui/icons';
  import Segmented from '@/ui/Segmented.svelte';
  import SleeveArt from '@/ui/SleeveArt.svelte';

  const NOISE: Record<NoiseKind, { name: string; title: string; sleeve: string; c: [string, string]; ink: string; ring: string; mark: string; tint: string; chip: string; chipInk: string }> = {
    white: { name: 'White', title: 'White noise', sleeve: 'WHITE\nNOISE', c: ['#FFFFFF', '#CDD1D5'], ink: '#17191C', ring: 'rgb(23 25 28 / 0.3)', mark: 'rgb(23 25 28 / 0.55)', tint: '#9AA3AD', chip: '#FFFFFF', chipInk: '#17191C' },
    pink: { name: 'Pink', title: 'Pink noise', sleeve: 'PINK\nNOISE', c: ['#F7C9D4', '#E28AA1'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#E28AA1', chip: '#F3C9D3', chipInk: '#17191C' },
    brown: { name: 'Brown', title: 'Brown noise', sleeve: 'BROWN\nNOISE', c: ['#A27757', '#5A3A28'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#8B6448', chip: '#8B6448', chipInk: '#FFFFFF' },
  };
  const KINDS: NoiseKind[] = ['white', 'pink', 'brown'];
  const NO_COVER = '#5876C2';
  const SECTIONS: Array<['now' | 'library', string]> = [['now', 'Now playing'], ['library', 'Library']];
  const SOURCES: Array<['folder' | 'noise', string]> = [['folder', 'Your folder'], ['noise', 'Focus noise']];
  /** Phosphor Bold on a 256 grid: shuffle, repeat, speaker-high. */
  const SHUFFLE = 'M240.49,175.51a12,12,0,0,1,0,17l-24,24a12,12,0,0,1-17-17L203,196h-2.09a76.17,76.17,0,0,1-61.85-31.83L97.38,105.78A52.1,52.1,0,0,0,55.06,84H32a12,12,0,0,1,0-24H55.06a76.17,76.17,0,0,1,61.85,31.83l41.71,58.39A52.1,52.1,0,0,0,200.94,172H203l-3.52-3.51a12,12,0,0,1,17-17Zm-95.62-72.62a12,12,0,0,0,16.93-1.13A52,52,0,0,1,200.94,84H203l-3.52,3.51a12,12,0,0,0,17,17l24-24a12,12,0,0,0,0-17l-24-24a12,12,0,0,0-17,17L203,60h-2.09a76,76,0,0,0-57.2,26A12,12,0,0,0,144.87,102.89Zm-33.74,50.22a12,12,0,0,0-16.93,1.13A52,52,0,0,1,55.06,172H32a12,12,0,0,0,0,24H55.06a76,76,0,0,0,57.2-26A12,12,0,0,0,111.13,153.11Z';
  const REPEAT = 'M20,128A76.08,76.08,0,0,1,96,52h99l-3.52-3.51a12,12,0,1,1,17-17l24,24a12,12,0,0,1,0,17l-24,24a12,12,0,0,1-17-17L195,76H96a52.06,52.06,0,0,0-52,52,12,12,0,0,1-24,0Zm204-12a12,12,0,0,0-12,12,52.06,52.06,0,0,1-52,52H61l3.52-3.51a12,12,0,1,0-17-17l-24,24a12,12,0,0,0,0,17l24,24a12,12,0,1,0,17-17L61,204h99a76.08,76.08,0,0,0,76-76A12,12,0,0,0,224,116Z';
  const SPEAKER = 'M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z';
  const NEXT_REPEAT: Record<Repeat, Repeat> = { off: 'all', all: 'one', one: 'off' };
  const REPEAT_LABEL: Record<Repeat, string> = { off: 'Repeat: off', all: 'Repeat: all songs', one: 'Repeat: this song' };

  let section = $state<'now' | 'library'>('now');
  let player = $state<PlayerState>(INITIAL_PLAYER);
  let tracks = $state<Record<string, PlayerTrack>>({});
  let folder = $state<FolderRecord | null>(null);
  let always = $state(false);
  let now = $state(Date.now());
  let dragging = $state<number | null>(null);
  let cover = $state<string | null>(null);

  const view = $derived<'noise' | 'folder'>(player.active === 'folder' ? 'folder' : 'noise');
  const noise = $derived(NOISE[player.noise]);
  const track = $derived(view === 'folder' ? player.now : null);
  const playing = $derived(player.playing && (view === 'folder' ? player.active === 'folder' : player.active === 'noise' || player.active === null));
  const duration = $derived(player.duration ?? 0);
  const position = $derived(dragging ?? positionAt(player, now));
  const repeat = $derived<Repeat>(player.queue?.repeat ?? 'off');
  /** The next songs in play order, with their place in the queue, for Up next. */
  const upNext = $derived.by(() => {
    const q = player.queue;
    if (!q) return [];
    const out: { at: number; track: PlayerTrack }[] = [];
    for (let at = q.at + 1; at < q.order.length && out.length < 20; at++) {
      const t = tracks[q.items[q.order[at]!]!];
      if (t) out.push({ at, track: t });
    }
    return out;
  });
  const art = $derived(
    view === 'noise'
      ? { kind: 'noise' as const, c: noise.c, ring: noise.ring, mark: noise.mark, sleeve: noise.sleeve, ink: noise.ink }
      : track
        ? { kind: 'cd' as const, color: track.color ?? NO_COVER, cover, sleeve: [track.artist, track.album].filter(Boolean).join('\n').toUpperCase() || 'YOUR\nFOLDER' }
        : { kind: 'empty' as const, sleeve: folder ? 'YOUR\nFOLDER' : 'CHOOSE A\nFOLDER' },
  );

  const send = (cmd: PlayerCommand) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  function seekKeys(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    void send({ op: 'seek', ms: Math.max(0, positionAt(player, Date.now()) + (e.key === 'ArrowRight' ? 5_000 : -5_000)) });
  }
  async function reconnect() {
    const h = folder?.handle as (FileSystemDirectoryHandle & { requestPermission?(d: { mode: 'read' }): Promise<PermissionState> }) | undefined;
    if (h?.requestPermission && (await h.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted') void send({ op: 'play' });
  }

  $effect(() => {
    if (!(playing && view === 'folder')) return;
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });
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
  $effect(() => {
    const body = document.body;
    body.style.transition = 'background-color 600ms ease';
    body.style.backgroundColor = playing ? `color-mix(in oklab, var(--color-bg-canvas) 88%, ${view === 'folder' ? (track?.color ?? NO_COVER) : noise.tint})` : '';
  });

  const unwatch: Array<() => void> = [];
  onMount(async () => {
    unwatch.push(
      playerItem.watch((v) => (player = v ?? INITIAL_PLAYER)),
      playerTracksItem.watch((v) => (tracks = v ?? {})),
      settingsItem.watch((v) => (always = normalizeSettings(v).discMotion === 'always')),
    );
    [player, tracks, folder, always] = await Promise.all([
      playerItem.getValue(),
      playerTracksItem.getValue(),
      loadFolder().catch(() => null),
      settingsItem.getValue().then((v) => normalizeSettings(v).discMotion === 'always'),
    ]);
  });
  onDestroy(() => unwatch.forEach((u) => u()));
</script>

{#snippet key(name: string, path: string, onclick: () => void, opts: { main?: boolean; flip?: boolean; on?: boolean; grid?: number } = {})}
  <button class="key" class:main={opts.main} class:flip={opts.flip} class:on={opts.on} aria-label={name} aria-pressed={opts.on === undefined ? undefined : opts.on} {onclick}>
    <svg viewBox="0 0 {opts.grid ?? 20} {opts.grid ?? 20}" aria-hidden="true"><path d={path} /></svg>
  </button>
{/snippet}

<main>
  <header>
    <h1>Player</h1>
    <span class="brand">Study Duo</span>
  </header>
  <Segmented options={SECTIONS} value={section} label="Sections" onchange={(v) => (section = v)} />

  {#if section === 'now'}
    <div class="now">
      <div class="art"><SleeveArt {art} {playing} {always} size="large" /></div>
      <Segmented options={SOURCES} value={view} label="Play from" onchange={(v) => v !== view && send({ op: 'source', source: v })} />

      {#if view === 'noise'}
        <div class="song">
          <p class="title">{noise.title}</p>
          <p class="sub">Made in your browser. It keeps playing with every Study Duo page closed.</p>
        </div>
        <div class="row">
          <div class="noises" role="radiogroup" aria-label="Noise colour">
            {#each KINDS as k (k)}
              <button role="radio" aria-checked={player.noise === k} style:background={NOISE[k].chip} style:color={NOISE[k].chipInk} onclick={() => send({ op: 'noise', noise: k })}>{NOISE[k].name}</button>
            {/each}
          </div>
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
        </div>
      {:else if player.problem === 'reconnect'}
        <div class="song">
          <p class="title">Chrome asks again for your folder</p>
          <p class="sub">After a restart, Chrome needs one click to read your music again. Nothing was lost.</p>
          <button class="action" onclick={reconnect}>Reconnect folder</button>
        </div>
      {:else if !track}
        <div class="song">
          <p class="title">{folder ? clip(folder.name) : 'No music folder yet'}</p>
          <p class="sub">{folder ? `${folder.count} ${folder.count === 1 ? 'song' : 'songs'} on this computer` : 'Pick a folder of songs; they stay on this computer.'}</p>
          <button class="action" onclick={() => (section = 'library')}>{folder ? 'Open the library' : 'Choose a folder'}</button>
        </div>
      {:else}
        <div class="song">
          <p class="title" title={track.title}>{clip(track.title)}</p>
          <p class="sub">{player.problem === 'missing' ? 'This file is gone from your folder' : [track.artist, track.album].filter(Boolean).join(' · ') || 'Your folder'}</p>
        </div>
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
        <div class="transport">
          {@render key('Shuffle', SHUFFLE, () => send({ op: 'shuffle' }), { on: !!player.queue?.shuffle, grid: 256 })}
          {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), { flip: true })}
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
          {@render key('Next', ICONS.skip, () => send({ op: 'next' }))}
          <button class="key" class:on={repeat !== 'off'} aria-label={REPEAT_LABEL[repeat]} onclick={() => send({ op: 'repeat', repeat: NEXT_REPEAT[repeat] })}>
            <svg viewBox="0 0 256 256" aria-hidden="true"><path d={REPEAT} /></svg>{#if repeat === 'one'}<small>1</small>{/if}
          </button>
        </div>
      {/if}

      <label class="vol">
        <svg viewBox="0 0 256 256" aria-hidden="true"><path d={SPEAKER} /></svg>
        <input type="range" min="0" max="100" value={Math.round(player.volume * 100)} aria-label="Volume" style:--v="{Math.round(player.volume * 100)}%" oninput={(e) => send({ op: 'volume', volume: Number(e.currentTarget.value) / 100 })} />
        <span>{Math.round(player.volume * 100)}%</span>
      </label>

      {#if view === 'folder' && upNext.length}
        <section aria-labelledby="next-title">
          <h2 id="next-title" class="eyebrow">Up next</h2>
          <ol class="queue">
            {#each upNext as n (n.at)}
              <li><button onclick={() => send({ op: 'jump', at: n.at })}><span class="name">{clip(n.track.title)}</span><span class="meta">{n.track.artist}</span></button></li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>
  {:else}
    <FolderLibrary />
  {/if}
</main>

<style>
  :global(body) { min-inline-size: 300px; }
  main { display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; padding: 16px; }
  header { display: flex; align-items: baseline; justify-content: space-between; }
  h1 { margin: 0; font: 800 20px/24px var(--font-family-ui); }
  .brand { font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); }
  .now { display: flex; flex-direction: column; gap: 16px; }
  .art { display: flex; justify-content: center; }
  .song { display: grid; gap: 4px; }
  .title { margin: 0; font: 700 20px/24px var(--font-family-ui); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { margin: 0; font: 400 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .action {
    justify-self: start; margin-block-start: 6px; padding: 10px 14px; border: 0; border-radius: 6px; background: var(--color-bg-action); color: var(--color-text-on-action);
    font: 700 14px/18px var(--font-family-ui); cursor: pointer;
  }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .noises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--color-border-control); border-radius: 6px; overflow: hidden; }
  .noises button { block-size: 40px; border: 0; font: 600 14px/18px var(--font-family-ui); cursor: pointer; }
  .noises button + button { border-inline-start: 1px solid var(--color-border-control); }
  .noises button[aria-checked='true'] { font-weight: 700; box-shadow: inset 0 0 0 2px #17191c; }
  .seek { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; font: 500 12px/16px var(--font-family-mono); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
  .track { position: relative; }
  .track input { inline-size: 100%; block-size: 24px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .track input::-webkit-slider-runnable-track { block-size: 4px; border-radius: 2px; background: linear-gradient(var(--color-text-focus), var(--color-text-focus)) 0 / var(--p, 0%) 100% no-repeat, var(--color-bg-sunken); }
  .track input::-webkit-slider-thumb { appearance: none; inline-size: 14px; block-size: 14px; margin-block-start: -5px; border-radius: 50%; background: var(--color-text-primary); box-shadow: 0 0 0 2px var(--color-bg-canvas); }
  .track input::-moz-range-track { block-size: 4px; border-radius: 2px; background: var(--color-bg-sunken); }
  .track input::-moz-range-progress { block-size: 4px; border-radius: 2px; background: var(--color-text-focus); }
  .tip { position: absolute; inset-block-end: 24px; inset-inline-start: var(--p); transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: var(--color-bg-action); color: var(--color-text-on-action); font: 600 11px/14px var(--font-family-mono); pointer-events: none; }
  .transport { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .key {
    position: relative; display: grid; place-items: center; inline-size: 40px; block-size: 40px; border: 0; border-radius: 6px; background: none;
    color: var(--color-text-primary); cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .key.main { inline-size: 52px; block-size: 52px; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .key.on { color: var(--color-text-focus); }
  .key.flip svg { transform: rotate(180deg); }
  .key svg { inline-size: 20px; block-size: 20px; fill: currentColor; }
  .key small { position: absolute; inset-block-start: 4px; inset-inline-end: 6px; font: 700 9px/1 var(--font-family-mono); }
  .key:active, .action:active { transform: scale(0.97); }
  .vol { display: grid; grid-template-columns: 16px minmax(0, 1fr) 40px; gap: 10px; align-items: center; font: 500 12px/16px var(--font-family-mono); color: var(--color-text-secondary); }
  .vol svg { inline-size: 16px; block-size: 16px; fill: var(--color-text-secondary); }
  .vol input { block-size: 16px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .vol input::-webkit-slider-runnable-track { block-size: 3px; border-radius: 2px; background: linear-gradient(var(--color-text-secondary), var(--color-text-secondary)) 0 / var(--v, 60%) 100% no-repeat, var(--color-bg-sunken); }
  .vol input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4.5px; border-radius: 50%; background: var(--color-text-primary); }
  .eyebrow { margin: 8px 0 4px; font: 600 11px/14px var(--font-family-mono); letter-spacing: 0.06em; color: var(--color-text-secondary); text-transform: uppercase; }
  .queue { margin: 0; padding: 0; list-style: none; }
  .queue button { inline-size: 100%; display: grid; gap: 1px; padding: 8px 10px; border: 0; border-radius: 4px; background: none; color: var(--color-text-primary); text-align: start; cursor: pointer; }
  .queue button:hover { background: var(--color-bg-sunken); }
  .name { font: 600 13px/18px var(--font-family-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font: 400 11px/14px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .key, .action { transition: none; } }
</style>
