<script lang="ts">
  /** Figma Control/Rating Key: one tap from 1 (kept drifting) to 5 (fully in it), as a radio group. */
  let { value = null, onchange }: { value?: number | null; onchange: (v: 1 | 2 | 3 | 4 | 5) => void } = $props();
  const KEYS = [1, 2, 3, 4, 5] as const;
  /** The key that holds the tab stop: it follows the arrows, so Tab back in lands where you were. */
  let at = $state(1);
  $effect.pre(() => {
    if (value) at = value; // a chosen rating takes the tab stop
  });

  function key(e: KeyboardEvent, k: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    at = Math.min(5, Math.max(1, k + step));
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-k="${at}"]`)?.focus();
  }
</script>

<div class="keys" role="radiogroup" aria-label="How focused were you, from 1 to 5" aria-describedby="rating-scale">
  {#each KEYS as k (k)}
    <button type="button" role="radio" data-k={k} aria-checked={value === k} tabindex={k === at ? 0 : -1} onclick={() => onchange(k)} onkeydown={(e) => key(e, k)}>{k}</button>
  {/each}
</div>
<p class="scale" id="rating-scale"><span>1 = kept drifting</span><span>5 = fully in it</span></p>

<style>
  .keys { display: flex; gap: 8px; }
  button {
    flex: 1 1 0; block-size: 48px; min-inline-size: 0; max-inline-size: 48px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 600 20px/24px var(--font-family-ui); cursor: pointer;
  }
  button:hover, button[aria-checked='true'] { background: var(--color-bg-sunken); border-color: var(--color-border-strong); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .scale { display: flex; justify-content: space-between; margin: 8px 0 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
</style>
