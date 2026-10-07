<script lang="ts">
  /** Figma Control/Toggle: square-cornered switch, ink track with the knob right when on. */
  let { checked, label, onchange }: { checked: boolean; label: string; onchange: (v: boolean) => void } = $props();
</script>

<button type="button" role="switch" aria-checked={checked} aria-label={label} onclick={() => onchange(!checked)}><span></span></button>

<style>
  button {
    display: flex; align-items: center; flex: none; inline-size: 44px; block-size: 26px; padding: 0 3px; box-sizing: border-box;
    border: 2px solid var(--color-border-control); border-radius: var(--radius-md); background: var(--color-bg-sunken); cursor: pointer;
  }
  span {
    inline-size: 20px; block-size: 20px; box-sizing: border-box; border: 2px solid var(--color-border-control); border-radius: 2px;
    background: var(--color-bg-panel); transition: transform 180ms ease-out;
  }
  button[aria-checked='true'] { background: var(--color-bg-action); border-color: var(--color-bg-action); }
  button[aria-checked='true'] span { transform: translateX(14px); border-color: var(--color-bg-action); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { span { transition: none; } }
</style>
