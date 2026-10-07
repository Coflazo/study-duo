<script lang="ts">
  import type { Phase } from '@/core/timer';
  import { ICONS } from './icons';

  /** Figma Sign/Phase Plate: running is a solid plate, paused a dashed outline, stopped a hollow sign. The state reads without colour. */
  let { phase, status, note = '' }: { phase: Phase; status: 'running' | 'paused' | 'stopped'; note?: string } = $props();

  const NAME = { focus: 'Study', shortBreak: 'Short break', longBreak: 'Long break' } as const;
  const ICON = { focus: ICONS.book, shortBreak: ICONS.coffee, longBreak: ICONS.walk } as const;
</script>

<div class="plate {status}" class:break={phase !== 'focus'}>
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICON[phase]} /></svg>
  <span class="name">{NAME[phase]}</span>
  {#if note}<span class="note">{note}</span>{/if}
</div>

<style>
  .plate {
    display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-block-size: 56px; padding: 12px 16px;
    border-radius: var(--radius-md); background: var(--color-bg-plate-focus); color: var(--color-text-on-plate);
  }
  .plate.break { background: var(--color-bg-plate-break); }
  .plate.paused { background: var(--color-bg-panel); border: 2px dashed var(--color-border-focus); color: var(--color-text-focus); }
  .plate.paused.break { border-color: var(--color-border-break); color: var(--color-text-break); }
  .plate.stopped { background: var(--color-bg-panel); border: 2px solid var(--color-border-strong); color: var(--color-text-primary); }
  svg { inline-size: 24px; block-size: 24px; flex: none; fill: currentColor; }
  .name { flex: 1; font: 700 20px/24px var(--font-family-ui); }
  .note { font: 600 12px/16px var(--font-family-ui); white-space: nowrap; }
</style>
