<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { FULL_SPEED, SPIN_STILL, stepSpin, type Spin } from '@/core/spin';

  /**
   * The record half out of its sleeve (Figma "Screens: Player (approved)", Sleeve), at the popup's size or the side
   * panel's. The disc follows the tested spin model (src/core/spin.ts): frame by frame only while its speed changes,
   * turned by the compositor at full speed, already turning when it opens mid-song, still when the computer asks
   * for less motion unless Settings, Spinning disc is Always.
   */
  type Art =
    | { kind: 'noise'; c: [string, string]; ring: string; mark: string; sleeve: string; ink: string }
    | { kind: 'cd'; color: string; cover: string | null; sleeve: string }
    | { kind: 'empty'; sleeve: string };
  let { art, playing, always, size = 'small' }: { art: Art; playing: boolean; always: boolean; size?: 'small' | 'large' } = $props();

  let out = $state(false);
  let ready = $state(false);
  let spinEl: HTMLDivElement | undefined = $state();

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
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
  function frame(t: number) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
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
    void spinEl; // a source change swaps the disc on screen: hand the turning to the new one
    drive();
  });

  onMount(async () => {
    // Opened while it plays: the disc is already out and turning at full speed. The music did not just start.
    if (playing && !still()) {
      spin = { angle: Math.random() * 360, speed: FULL_SPEED, accel: 0, settled: true };
      out = true;
      paint();
      startSteady();
    }
    await tick();
    requestAnimationFrame(() => (ready = true));
    reduce.addEventListener('change', drive);
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    steady?.cancel();
    reduce.removeEventListener('change', drive);
  });
</script>

<div class="art {size}" class:ready class:still={!always} aria-hidden="true">
  {#if art.kind === 'noise'}
    <div class="disc noise" class:out style:--c1={art.c[0]} style:--c2={art.c[1]} style:--ring={art.ring} style:--mark={art.mark}>
      <div class="spin" bind:this={spinEl}><i></i><i></i><i></i><b></b></div>
      <div class="hole"></div>
    </div>
    <div class="sleeve" style:--c1={art.c[0]} style:--c2={art.c[1]} style:color={art.ink}>{art.sleeve}</div>
  {:else if art.kind === 'cd'}
    <div class="disc cd" class:out style:--c1={art.color}>
      <div class="spin" bind:this={spinEl}>
        <div class="label">{#if art.cover}<img src={art.cover} alt="" />{/if}</div>
        <span class="band"></span><b></b>
        <div class="hub"></div>
      </div>
      <div class="hole"></div>
    </div>
    {#if art.cover}
      <div class="sleeve cover"><img src={art.cover} alt="" /></div>
    {:else}
      <div class="sleeve" style:--c1={art.color} style:--c2="#1f2f5c" style:color="#ffffff">{art.sleeve}</div>
    {/if}
  {:else}
    <div class="sleeve empty">{art.sleeve}</div>
  {/if}
</div>

<style>
  .art { position: relative; --w: 150px; --h: 112px; --disc: 100px; --sleeve: 108px; --shift: 40px; --pad: 10px; --font: 10px; inline-size: var(--w); block-size: var(--h); }
  .art.large { --w: 300px; --h: 204px; --disc: 184px; --sleeve: 200px; --shift: 92px; --pad: 16px; --font: 14px; }
  .disc {
    position: absolute; inset-inline-start: calc(var(--disc) * 0.08); inset-block-start: calc((var(--h) - var(--disc)) / 2); inline-size: var(--disc); block-size: var(--disc);
    border-radius: 50%; transform: translateX(0); will-change: transform;
  }
  .ready .disc { transition: transform 380ms cubic-bezier(0.45, 0, 0.2, 1); }
  .disc.out { transform: translateX(var(--shift)); }
  .ready .disc.out { transition-duration: 560ms; }
  .spin { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 1px rgb(23 25 28 / 0.12) inset; }
  .noise .spin { background: radial-gradient(var(--c1), var(--c2)); }
  .noise .spin i { position: absolute; border-radius: 50%; border: 1.5px dashed var(--ring); }
  .noise .spin i:nth-child(1) { inset: 10%; }
  .noise .spin i:nth-child(2) { inset: 20%; border: 1px solid var(--ring); }
  .noise .spin i:nth-child(3) { inset: 30%; }
  /* A printed mark on one side of every disc, so the turning reads at a glance. */
  .spin b { position: absolute; inset-inline-start: 66%; inset-block-start: 24%; inline-size: 9%; block-size: 9%; border-radius: 50%; background: var(--mark, rgb(255 255 255 / 0.85)); z-index: 2; }
  /* A CD: one rainbow sweep (not a symmetric ring, or the turning would not show), the cover as its label. */
  .cd .spin { background: conic-gradient(#c9cdd2, #f7f8f9 6%, #bfe3ea 12%, #e7d3f2 18%, #f5ebc8 24%, #d4d8dc 32%, #c2c6cb 55%, #eceef0 66%, #c9cdd2 74%); }
  .cd .label { position: absolute; inset: 18%; border-radius: 50%; overflow: hidden; background: linear-gradient(135deg, var(--c1), color-mix(in oklab, var(--c1) 55%, #ffffff)); }
  .cd .label img { inline-size: 100%; block-size: 100%; object-fit: cover; }
  .cd .band { position: absolute; inset: 18%; border-radius: 50%; z-index: 1; background: conic-gradient(from 200deg, rgb(255 255 255 / 0.42) 0 110deg, transparent 110deg); -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%); mask: radial-gradient(circle, transparent 62%, #000 63%); }
  .cd .hub { position: absolute; inset: 40%; border-radius: 50%; background: #f4f4f1; box-shadow: 0 0 0 1px rgb(23 25 28 / 0.14); z-index: 1; }
  .hole { position: absolute; inset: 46%; border-radius: 50%; background: var(--color-bg-panel); box-shadow: 0 0 0 1px rgb(23 25 28 / 0.22); z-index: 3; }
  .sleeve {
    position: absolute; inset-inline-start: 0; inset-block-start: calc((var(--h) - var(--sleeve)) / 2); inline-size: var(--sleeve); block-size: var(--sleeve);
    box-sizing: border-box; padding: var(--pad); border-radius: 3px; background: linear-gradient(135deg, var(--c2), var(--c1)); box-shadow: 2px 3px 8px rgb(0 0 0 / 0.16);
    font: 600 var(--font) / 1.3 var(--font-family-mono); white-space: pre-line; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 6; line-clamp: 6; -webkit-box-orient: vertical;
  }
  .sleeve.cover { padding: 0; }
  .sleeve.cover img { inline-size: 100%; block-size: 100%; object-fit: cover; display: block; }
  .sleeve.empty { background: var(--color-bg-sunken); border: 1.5px dashed var(--color-text-secondary); box-shadow: none; color: var(--color-text-secondary); }
  @media (prefers-reduced-motion: reduce) {
    .still.ready .disc, .still.ready .disc.out { transition: none; }
  }
</style>
