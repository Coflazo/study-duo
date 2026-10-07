<script lang="ts">
  /** Figma input states: a boxed number with its unit; out of range shows a plain message and saves nothing. */
  let {
    id, value, min, max, unit, word, onsave,
  }: { id: string; value: number; min: number; max: number; unit: string; word: string; onsave: (v: number) => void } = $props();

  let draft = $state('');
  let error = $state('');
  $effect(() => {
    draft = String(value);
  });

  function commit() {
    const n = Number(draft.trim());
    if (!Number.isInteger(n) || n < min || n > max) {
      error = `Use ${min} to ${max} ${word}.`;
      return;
    }
    error = '';
    if (n !== value) onsave(n);
  }
</script>

<span class="wrap">
  <input
    {id} inputmode="numeric" autocomplete="off" bind:value={draft} aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${id}-error` : undefined} onkeydown={(e) => e.key === 'Enter' && commit()} onblur={commit}
  />
  <span class="unit">{unit}</span>
</span>
{#if error}<span class="error" id="{id}-error" role="alert">{error}</span>{/if}

<style>
  .wrap { display: inline-flex; align-items: baseline; gap: 6px; }
  input {
    inline-size: 64px; box-sizing: border-box; block-size: 40px; padding: 0 10px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 500 20px/24px var(--font-family-mono); text-align: end;
  }
  input:focus-visible { outline: none; border: 4px solid var(--color-border-strong); padding: 0 8px; }
  input[aria-invalid='true'] { border-color: var(--color-border-focus); }
  .unit { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); min-inline-size: 36px; }
  .error { flex-basis: 100%; text-align: end; font: 600 12px/16px var(--font-family-ui); color: var(--color-text-focus); }
</style>
