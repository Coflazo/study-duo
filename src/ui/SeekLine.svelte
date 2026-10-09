<script lang="ts">
  /**
   * The seek line under a song (Figma "Screens: Player (approved)", Seek line): elapsed, a line you can drag to any
   * second with the time shown above the thumb, arrow keys 5 s, total. Shared by the popup card and the side panel.
   */
  import { untrack } from 'svelte';

  let { position, duration, stamp, onseek, size = 'small' }: { position: number; duration: number; stamp: number; onseek: (ms: number) => void; size?: 'small' | 'large' } = $props();

  let dragging = $state<number | null>(null);
  let sent = false;
  const shown = $derived(dragging ?? position);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  function seek(ms: number) {
    sent = true;
    onseek(ms);
  }
  // The thumb stays where it was dropped until the player confirms the new position, so it never snaps back.
  $effect(() => {
    void stamp;
    untrack(() => {
      if (!sent) return;
      sent = false;
      dragging = null;
    });
  });
  /** A drag that ends where it started fires no change: let go of it. */
  function release() {
    setTimeout(() => {
      if (!sent) dragging = null;
    }, 50);
  }
  function keys(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (duration) seek(Math.min(duration, Math.max(0, position + (e.key === 'ArrowRight' ? 5_000 : -5_000))));
  }
</script>

<div class="seek {size}">
  <span>{fmt(shown)}</span>
  <div class="track" style:--p="{duration ? Math.min(100, (shown / duration) * 100) : 0}%">
    <!-- aria-disabled, not disabled: a song change must not throw keyboard focus out of the line -->
    <input
      type="range" min="0" max={Math.max(1, Math.round(duration / 1000))} step="1" value={Math.round(shown / 1000)} aria-disabled={!duration}
      aria-label="Position" aria-valuetext="{fmt(shown)} of {fmt(duration)}"
      oninput={(e) => (duration ? (dragging = Number(e.currentTarget.value) * 1000) : (e.currentTarget.value = '0'))}
      onchange={(e) => duration && seek(Number(e.currentTarget.value) * 1000)}
      onpointerup={release}
      onblur={release}
      onkeydown={keys}
    />
    {#if dragging !== null}<span class="tip" aria-hidden="true">{fmt(dragging)}</span>{/if}
  </div>
  <span>{duration ? fmt(duration) : '0:00'}</span>
</div>

<style>
  .seek { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
  .seek.large { font-size: 12px; line-height: 16px; }
  .track { position: relative; }
  .track input { inline-size: 100%; block-size: 24px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .track input[aria-disabled='true'] { cursor: default; }
  .track input::-webkit-slider-runnable-track {
    block-size: 4px; border-radius: 2px;
    background: linear-gradient(var(--color-text-focus), var(--color-text-focus)) 0 / var(--p, 0%) 100% no-repeat, var(--color-bg-sunken);
  }
  .track input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4px; border-radius: 50%; background: var(--color-text-primary); box-shadow: 0 0 0 2px var(--color-bg-canvas); transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1); }
  .large .track input::-webkit-slider-thumb { inline-size: 14px; block-size: 14px; margin-block-start: -5px; }
  .track input:active::-webkit-slider-thumb { transform: scale(1.33); }
  .track input[aria-disabled='true']::-webkit-slider-thumb { visibility: hidden; }
  .track input::-moz-range-track { block-size: 4px; border-radius: 2px; background: var(--color-bg-sunken); }
  .track input::-moz-range-progress { block-size: 4px; border-radius: 2px; background: var(--color-text-focus); }
  .track input::-moz-range-thumb { inline-size: 12px; block-size: 12px; border: 0; border-radius: 50%; background: var(--color-text-primary); }
  .track input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .tip {
    position: absolute; inset-block-end: 24px; inset-inline-start: var(--p); transform: translateX(-50%); padding: 3px 6px; border-radius: 4px;
    background: var(--color-bg-action); color: var(--color-text-on-action); font: 600 11px/14px var(--font-family-mono); pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) { .track input::-webkit-slider-thumb { transition: none; } }
</style>
