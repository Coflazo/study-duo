<script lang="ts">
  import RatingKeys from '@/ui/RatingKeys.svelte';

  /** Figma Popup / Rating: asked once after each finished study block. The answer is the label the insights learn from. */
  let { onrate, onskip }: { onrate: (r: 1 | 2 | 3 | 4 | 5) => void; onskip: () => void } = $props();
</script>

<section class="card" aria-labelledby="rating-title">
  <h2 id="rating-title">Block done.</h2>
  <p class="q">How focused were you?</p>
  <RatingKeys onchange={onrate} />
  <button class="skip" onclick={onskip}>Skip</button>
</section>

<style>
  .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-bg-panel); }
  h2 { margin: 0; font: 800 28px/32px var(--font-family-ui); }
  .q { margin: 0; font: 600 14px/20px var(--font-family-ui); }
  .skip { align-self: flex-start; padding: 4px 0; border: 0; background: none; color: var(--color-text-secondary); font: 600 14px/20px var(--font-family-ui); cursor: pointer; }
  .skip:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
