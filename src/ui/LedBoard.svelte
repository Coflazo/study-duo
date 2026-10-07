<script lang="ts">
  import { DIGIT_H, DIGIT_W, litSegments, SEGMENT_PATHS, type Segment } from '@/core/segments';

  /** The amber countdown board from Figma (LED/Board): four digits, a progress rail and a label. */
  let { text, progress = 0, label = '', paused = false }: { text: string; progress?: number; label?: string; paused?: boolean } = $props();

  const SEGMENTS = Object.keys(SEGMENT_PATHS) as Segment[];
  const chars = $derived(text.replace(':', '').padStart(4, ' ').split(''));
</script>

<div class="board" role="timer" aria-label="{text.trim()} left{label ? `, ${label}` : ''}">
  <div class="digits" aria-hidden="true">
    {#each chars as ch, i (i)}
      {#if i === 2}
        <svg class="colon" class:off={paused} viewBox="0 0 18 96"><rect x="3.75" y="23.55" width="10.5" height="10.5" /><rect x="3.75" y="61.95" width="10.5" height="10.5" /></svg>
      {/if}
      <svg class="digit" viewBox="0 0 {DIGIT_W} {DIGIT_H}">
        {#each SEGMENTS as s (s)}<path d={SEGMENT_PATHS[s]} class:on={litSegments(ch).has(s)} />{/each}
      </svg>
    {/each}
  </div>
  <div class="footer">
    <div class="rail"><div class="fill" style:inline-size="{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%"></div></div>
    {#if label}<span>{label}</span>{/if}
  </div>
</div>

<style>
  .board {
    display: flex; flex-direction: column; gap: 12px; inline-size: 328px; max-inline-size: 100%; box-sizing: border-box;
    padding: 16px; border-radius: var(--radius-md); background: var(--color-bg-board); direction: ltr;
  }
  .digits { display: flex; gap: 12px; align-items: center; }
  .digit { inline-size: 54px; block-size: 96px; flex: 0 1 54px; min-inline-size: 0; }
  .colon { inline-size: 18px; block-size: 96px; flex: none; fill: var(--color-text-led); }
  .colon.off { fill: var(--color-text-led-ghost); }
  path { fill: var(--color-text-led-ghost); }
  path.on { fill: var(--color-text-led); }
  .footer { display: flex; gap: 12px; align-items: center; }
  .rail { flex: 1; block-size: 4px; border-radius: 2px; overflow: hidden; background: var(--color-text-led-ghost); }
  .fill { block-size: 100%; background: var(--color-text-led); }
  span { font: 600 12px/16px var(--font-family-ui); color: var(--color-text-led); white-space: nowrap; }
</style>
