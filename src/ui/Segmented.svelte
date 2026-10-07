<script lang="ts" generics="T extends string">
  /** Figma Control/Segmented: two or three options as a radio group; the selected one is an ink plate. Arrow keys move the choice.
   * With no option selected (a value set elsewhere), the first option takes the tab stop. */
  let { options, value, label, onchange, disabled = [] }: { options: Array<[T, string]>; value: T | null; label: string; onchange: (v: T) => void; disabled?: T[] } = $props();

  function key(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length]![0];
    if (disabled.includes(next)) return;
    onchange(next);
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as [v, text], i (v)}
    <button type="button" role="radio" aria-checked={value === v} tabindex={value === v || (i === 0 && !options.some(([o]) => o === value)) ? 0 : -1} data-value={v} disabled={disabled.includes(v)} onclick={() => onchange(v)} onkeydown={(e) => key(e, i)}>{text}</button>
  {/each}
</div>

<style>
  .segmented { display: inline-flex; flex-wrap: wrap; padding: 2px; border: 2px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-bg-panel); }
  button {
    padding: 8px 14px; border: 0; border-radius: 2px; background: transparent; color: var(--color-text-primary);
    font: 600 14px/20px var(--font-family-ui); cursor: pointer; white-space: nowrap;
  }
  button[aria-checked='true'] { background: var(--color-bg-action); color: var(--color-text-on-action); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  button:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
</style>
