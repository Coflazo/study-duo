<script lang="ts">
  /** Figma Sign/Button: 48 px tall; primary is an ink plate, secondary an outlined sign. Pressed scales to 0.97. */
  let {
    label, icon = '', kind = 'primary', disabled = false, type = 'button', onclick,
  }: { label: string; icon?: string; kind?: 'primary' | 'secondary'; disabled?: boolean; type?: 'button' | 'submit'; onclick?: () => void } = $props();
</script>

<button class={kind} {type} {disabled} {onclick}>
  {#if icon}<svg viewBox="0 0 20 20" aria-hidden="true"><path d={icon} /></svg>{/if}
  {label}
</button>

<style>
  button {
    display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; block-size: 48px;
    min-inline-size: 0; padding: 12px 20px; border-radius: var(--radius-md); font: 700 20px/24px var(--font-family-ui);
    white-space: nowrap; cursor: pointer; transition: transform 120ms ease;
  }
  svg { inline-size: 20px; block-size: 20px; flex: none; fill: currentColor; }
  .primary { border: 0; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .primary:hover:not(:disabled) { background: var(--color-bg-action-hover); }
  .secondary { border: 2px solid var(--color-border-strong); background: transparent; color: var(--color-text-primary); }
  .secondary:hover:not(:disabled) { background: var(--color-bg-sunken); }
  button:active:not(:disabled) { transform: scale(0.97); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .primary:disabled { background: var(--color-bg-disabled); color: var(--color-text-disabled); cursor: not-allowed; }
  .secondary:disabled { border-color: var(--color-border-subtle); color: var(--color-text-disabled); cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
