<script lang="ts">
  import { ICONS } from './icons';

  /** Figma List/Timetable Row: a departures-board line. Current carries a red rail, Done a check, Skipped says so in words. */
  let {
    state, time, task, duration = '', isBreak = false,
  }: { state: 'done' | 'current' | 'planned' | 'skipped'; time: string; task: string; duration?: string; isBreak?: boolean } = $props();
</script>

<li class="row {state}">
  <span class="time">{time}</span>
  <span class="marker" class:break={isBreak}></span>
  <span class="task">{task}</span>
  {#if state === 'done'}<svg viewBox="0 0 20 20" role="img" aria-label="Done"><path d={ICONS.check} /></svg>{/if}
  <span class="end">{state === 'current' ? 'Now' : state === 'skipped' ? 'Skipped' : duration}</span>
</li>

<style>
  .row {
    display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-block-size: 40px; padding: 8px 12px;
    border-block-end: 1px solid var(--color-border-subtle); list-style: none;
  }
  .row.current { border-block-end: 0; border-inline-start: 3px solid var(--color-border-focus); background: var(--color-bg-sunken); padding-inline-start: 9px; }
  .time { font: 500 14px/20px var(--font-family-mono); }
  .marker { inline-size: 8px; block-size: 8px; flex: none; background: var(--color-bg-plate-focus); }
  .marker.break { background: var(--color-bg-plate-break); }
  .task { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 14px/20px var(--font-family-ui); }
  .current .task { font-weight: 600; }
  .done .time, .done .task, .skipped .time, .skipped .task { color: var(--color-text-secondary); }
  .done .marker, .skipped .marker { opacity: 0.5; }
  svg { inline-size: 20px; block-size: 20px; flex: none; fill: var(--color-text-secondary); }
  .end { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; }
  .current .end { color: var(--color-text-focus); }
</style>
