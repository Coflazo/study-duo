<script lang="ts">
  import Sites from './Sites.svelte';
</script>

<main>
  <h1>Settings</h1>
  <Sites />
</main>

<style>
  :global(html) { color-scheme: light dark; }
  :global(body) { margin: 0; background: var(--color-bg-canvas); color: var(--color-text-primary); font-family: var(--font-family-ui); }
  main { box-sizing: border-box; max-inline-size: 720px; margin-inline: auto; padding: 32px 16px 64px; }
  h1 { margin: 0 0 24px; font: 800 28px/32px var(--font-family-ui); }
</style>
