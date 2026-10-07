<script lang="ts">
  /** Figma Notice/Update waiting: shown when newer files are on disk than the copy running; Reload restarts the extension. */
  import { onMount } from 'svelte';
  import { updateWaiting } from '@/core/update-check';
  import SignButton from './SignButton.svelte';

  let waiting = $state(false);
  onMount(async () => {
    try {
      const onDisk = await (await fetch('/manifest.json', { cache: 'no-store' })).json();
      waiting = updateWaiting(browser.runtime.getManifest(), onDisk);
    } catch {
      // no readable manifest: nothing to compare
    }
  });
</script>

{#if waiting}
  <div class="notice" role="status">
    <p>Study Duo has an update waiting.</p>
    <SignButton label="Reload" kind="secondary" onclick={() => browser.runtime.reload()} />
  </div>
{/if}

<style>
  .notice {
    display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 16px;
    border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-bg-panel);
  }
  p { flex: 1; min-inline-size: 0; margin: 0; font: 600 14px/20px var(--font-family-ui); }
</style>
