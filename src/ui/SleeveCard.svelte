<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { NoiseKind } from '@/core/noise';
  import { INITIAL_PLAYER, type PlayerCommand, type PlayerState } from '@/core/player';
  import { playerItem } from '@/core/session-store';
  import { normalizeSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { FULL_SPEED, SPIN_STILL, stepSpin, type Spin } from '@/core/spin';
  import { ICONS } from '@/ui/icons';

  /**
   * The popup's player card, Figma "Screens: Player (approved)", direction B (Sleeve): the record half out of its
   * sleeve. Focus noise is its first source; the folder, YouTube links and streaming join in the next steps (#51).
   */
  const NOISE: Record<NoiseKind, { name: string; title: string; sleeve: string; c: [string, string]; ink: string; ring: string; mark: string; tint: string; chip: string; chipInk: string }> = {
    white: { name: 'White', title: 'White noise', sleeve: 'WHITE\nNOISE', c: ['#FFFFFF', '#CDD1D5'], ink: '#17191C', ring: 'rgb(23 25 28 / 0.3)', mark: 'rgb(23 25 28 / 0.55)', tint: '#9AA3AD', chip: '#FFFFFF', chipInk: '#17191C' },
    pink: { name: 'Pink', title: 'Pink noise', sleeve: 'PINK\nNOISE', c: ['#F7C9D4', '#E28AA1'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#E28AA1', chip: '#F3C9D3', chipInk: '#17191C' },
    brown: { name: 'Brown', title: 'Brown noise', sleeve: 'BROWN\nNOISE', c: ['#A27757', '#5A3A28'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#8B6448', chip: '#8B6448', chipInk: '#FFFFFF' },
  };
  const KINDS: NoiseKind[] = ['white', 'pink', 'brown'];
  /** Phosphor Bold on a 256 grid: caret-down, speaker-high, waveform, check. */
  const CARET = 'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z';
  const SPEAKER = 'M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z';
  const WAVE = 'M60,96v64a12,12,0,0,1-24,0V96a12,12,0,0,1,24,0ZM88,20A12,12,0,0,0,76,32V224a12,12,0,0,0,24,0V32A12,12,0,0,0,88,20Zm40,32a12,12,0,0,0-12,12V192a12,12,0,0,0,24,0V64A12,12,0,0,0,128,52Zm40,32a12,12,0,0,0-12,12v64a12,12,0,0,0,24,0V96A12,12,0,0,0,168,84Zm40-16a12,12,0,0,0-12,12v96a12,12,0,0,0,24,0V80A12,12,0,0,0,208,68Z';
  const CHECK = 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z';

  let player = $state<PlayerState>(INITIAL_PLAYER);
  let menuOpen = $state(false);
  let menuFromKeys = $state(false);
  let out = $state(false);
  let ready = $state(false);
  let spinEl: HTMLDivElement | undefined = $state();
  let srcEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  const noise = $derived(NOISE[player.noise]);
  const playing = $derived(player.playing && (player.active === 'noise' || player.active === null));
  const send = (cmd: PlayerCommand) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);

  // The disc: frame by frame only while its speed changes; at full speed the compositor turns it (no work per frame).
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  /** Settings, Spinning disc: "Always" turns it even when the computer asks for less motion. */
  let always = $state(false);
  const still = () => reduce.matches && !always;
  let spin: Spin = SPIN_STILL;
  let raf = 0;
  let last = 0;
  let steady: Animation | null = null;
  let steadyFrom = 0;

  function paint() {
    if (spinEl) spinEl.style.transform = `rotate(${spin.angle}deg)`;
  }
  function stopSteady() {
    if (!steady) return;
    const t = Number(steady.currentTime ?? 0);
    spin = { ...spin, angle: (steadyFrom + ((t % 1800) / 1800) * 360) % 360 };
    steady.cancel();
    steady = null;
  }
  function startSteady() {
    if (!spinEl || steady) return;
    steadyFrom = spin.angle;
    steady = spinEl.animate([{ transform: `rotate(${steadyFrom}deg)` }, { transform: `rotate(${steadyFrom + 360}deg)` }], { duration: 1800, iterations: Infinity });
  }
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    spin = stepSpin(spin, playing, dt);
    paint();
    // Back into the sleeve during the last of the coast, so stopping and tucking in read as one movement.
    out = playing || spin.speed > FULL_SPEED * 0.12;
    if (spin.settled) {
      raf = 0;
      if (playing) startSteady();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  function drive() {
    if (still()) {
      stopSteady();
      cancelAnimationFrame(raf);
      raf = 0;
      out = false;
      return;
    }
    stopSteady();
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  $effect(() => {
    void playing;
    void always;
    drive();
  });

  // The popup takes a light tint of what plays; it fades back when it stops.
  $effect(() => {
    const body = document.body;
    body.style.transition = 'background-color 600ms ease';
    body.style.backgroundColor = playing ? `color-mix(in oklab, var(--color-bg-canvas) 86%, ${noise.tint})` : '';
  });

  async function openMenu(fromKeys: boolean) {
    menuFromKeys = fromKeys;
    menuOpen = true;
    await tick();
    menuEl?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
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

  let unwatch: (() => void) | undefined;
  onMount(async () => {
    const unwatchPlayer = playerItem.watch((v) => (player = v ?? INITIAL_PLAYER));
    const unwatchSettings = settingsItem.watch((v) => (always = normalizeSettings(v).discMotion === 'always'));
    unwatch = () => (unwatchPlayer(), unwatchSettings());
    [player, always] = await Promise.all([playerItem.getValue(), settingsItem.getValue().then((v) => normalizeSettings(v).discMotion === 'always')]);
    // Opened while it plays: the disc is already out and turning at full speed. The music did not just start.
    if (playing && !still()) {
      spin = { angle: Math.random() * 360, speed: FULL_SPEED, accel: 0, settled: true };
      out = true;
      paint();
      startSteady();
    }
    await tick();
    requestAnimationFrame(() => (ready = true));
    document.addEventListener('pointerdown', outside);
    reduce.addEventListener('change', drive);
  });
  onDestroy(() => {
    unwatch?.();
    cancelAnimationFrame(raf);
    steady?.cancel();
    document.removeEventListener('pointerdown', outside);
    reduce.removeEventListener('change', drive);
    document.body.style.backgroundColor = '';
  });
</script>

<section class="card" class:ready class:still={!always} aria-label="Player">
  <div class="body">
    <div class="art" aria-hidden="true">
      <div class="disc" class:out style:--c1={noise.c[0]} style:--c2={noise.c[1]} style:--ring={noise.ring} style:--mark={noise.mark}>
        <div class="spin" bind:this={spinEl}><i></i><i></i><i></i><b></b></div>
        <div class="hole"></div>
      </div>
      <div class="sleeve" style:--c1={noise.c[0]} style:--c2={noise.c[1]} style:color={noise.ink}>{noise.sleeve}</div>
    </div>
    <div class="col">
      <button class="src" bind:this={srcEl} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="player-sources" onclick={(e) => (menuOpen ? closeMenu(false) : openMenu(e.detail === 0))}>
        <span class="lamp"></span>SOUNDS<svg viewBox="0 0 256 256" aria-hidden="true"><path d={CARET} /></svg>
      </button>
      <p class="title" title={noise.title}>{noise.title}</p>
      <p class="sub">Made in your browser</p>
      <label class="vol">
        <svg viewBox="0 0 256 256" aria-hidden="true"><path d={SPEAKER} /></svg>
        <input type="range" min="0" max="100" value={Math.round(player.volume * 100)} aria-label="Volume" style:--v="{Math.round(player.volume * 100)}%" oninput={(e) => send({ op: 'volume', volume: Number(e.currentTarget.value) / 100 })} />
      </label>
    </div>
  </div>

  <div class="row">
    <div class="noises" role="radiogroup" aria-label="Noise colour">
      {#each KINDS as k (k)}
        <button role="radio" aria-checked={player.noise === k} style:background={NOISE[k].chip} style:color={NOISE[k].chipInk} onclick={() => send({ op: 'noise', noise: k })}>{NOISE[k].name}</button>
      {/each}
    </div>
    <button class="key" aria-label={playing ? 'Pause' : 'Play'} onclick={() => send({ op: 'toggle' })}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={playing ? ICONS.pause : ICONS.play} /></svg>
    </button>
  </div>

  {#if menuOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="menu" class:instant={menuFromKeys} id="player-sources" role="menu" tabindex="-1" aria-label="Play from" bind:this={menuEl} onkeydown={menuKeys}>
      <p class="group">ON THIS COMPUTER</p>
      <button role="menuitemradio" aria-checked="true" onclick={() => closeMenu(true)}>
        <svg viewBox="0 0 256 256" aria-hidden="true"><path d={WAVE} /></svg>
        <span><b>Focus noise</b><small>White, pink or brown</small></span>
        <svg class="tick" viewBox="0 0 256 256" aria-hidden="true"><path d={CHECK} /></svg>
      </button>
    </div>
  {/if}
</section>

<style>
  .card {
    position: relative; display: grid; gap: 10px; padding: 12px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md);
    background: var(--color-bg-panel);
  }
  .body { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: center; }
  .art { position: relative; inline-size: 150px; block-size: 112px; }
  .disc {
    position: absolute; inset-inline-start: 8px; inset-block-start: 6px; inline-size: 100px; block-size: 100px; border-radius: 50%;
    transform: translateX(0); will-change: transform;
  }
  .ready .disc { transition: transform 380ms cubic-bezier(0.45, 0, 0.2, 1); }
  .disc.out { transform: translateX(40px); }
  .ready .disc.out { transition-duration: 560ms; }
  .spin { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(var(--c1), var(--c2)); box-shadow: 0 0 0 1px rgb(23 25 28 / 0.12) inset; }
  .spin i { position: absolute; border-radius: 50%; border: 1.5px dashed var(--ring); }
  .spin i:nth-child(1) { inset: 10%; }
  .spin i:nth-child(2) { inset: 20%; border: 1px solid var(--ring); }
  .spin i:nth-child(3) { inset: 30%; }
  /* A printed mark on one side, so the turning reads at a glance. */
  .spin b { position: absolute; inset-inline-start: 66%; inset-block-start: 24%; inline-size: 9%; block-size: 9%; border-radius: 50%; background: var(--mark); }
  .hole { position: absolute; inset: 46%; border-radius: 50%; background: var(--color-bg-panel); box-shadow: 0 0 0 1px rgb(23 25 28 / 0.22); }
  .sleeve {
    position: absolute; inset-inline-start: 0; inset-block-start: 2px; inline-size: 108px; block-size: 108px; box-sizing: border-box; padding: 10px;
    border-radius: 3px; background: linear-gradient(135deg, var(--c2), var(--c1)); box-shadow: 2px 3px 8px rgb(0 0 0 / 0.16);
    font: 600 10px/13px var(--font-family-mono); white-space: pre-line;
  }
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
  .key {
    display: grid; place-items: center; inline-size: 34px; block-size: 34px; border: 0; border-radius: 6px; background: var(--color-bg-action);
    color: var(--color-text-on-action); cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .key:active, .src:active { transform: scale(0.97); }
  .key svg { inline-size: 16px; block-size: 16px; fill: currentColor; }
  .menu {
    position: absolute; z-index: 2; inset-inline-end: 12px; inset-block-start: 40px; inline-size: min(264px, calc(100% - 24px)); padding-block: 6px;
    border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-bg-panel); box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    transform-origin: 58% 0; animation: open 180ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .menu.instant { animation: none; }
  @keyframes open { from { opacity: 0; transform: scale(0.96); } }
  .group { margin: 0; padding: 8px 12px 4px; font: 600 10px/12px var(--font-family-mono); letter-spacing: 0.06em; color: var(--color-text-secondary); }
  .menu button {
    inline-size: 100%; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 12px;
    border: 0; background: var(--color-bg-sunken); color: var(--color-text-primary); text-align: start; cursor: pointer;
  }
  .menu svg { inline-size: 18px; block-size: 18px; fill: var(--color-text-primary); }
  .menu .tick { inline-size: 16px; block-size: 16px; }
  .menu b { display: block; font: 700 13px/16px var(--font-family-ui); }
  .menu small { display: block; font: 400 11px/14px var(--font-family-ui); color: var(--color-text-secondary); }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .still.ready .disc, .still.ready .disc.out { transition: none; }
    .src svg, .noises button, .key { transition: none; }
    .menu { animation: none; }
  }
</style>
