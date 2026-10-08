<script lang="ts">
  import { ICONS } from '@/ui/icons';

  /** The sidebar from Figma Dashboard; screens from later stages join it when they exist. */
  let { route }: { route: string } = $props();
  const ITEMS = [
    ['today', 'Today', ICONS.clock],
    ['todo', 'To-do', ICONS.listChecks],
    ['insights', 'Insights', ICONS.chartBar],
    ['timeline', 'Timeline', ICONS.calendar],
    ['music', 'Music', ICONS.musicNotes],
    ['sites', 'Site lock', ICONS.lock],
    ['connections', 'Connections', ICONS.plugsConnected],
    ['settings', 'Settings', ICONS.gear],
    ['data', 'Your data', ICONS.shieldCheck],
  ] as const;
</script>

<nav aria-label="Study Duo">
  <p class="brand"><span aria-hidden="true"></span>Study Duo</p>
  <ul>
    {#each ITEMS as [id, label, icon] (id)}
      <li>
        <a href="#{id}" aria-current={route === id ? 'page' : undefined}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d={icon} /></svg>{label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav { display: flex; flex-direction: column; gap: 24px; box-sizing: border-box; padding: 24px 12px; }
  .brand { display: flex; align-items: center; gap: 10px; margin: 0; padding-inline: 8px; font: 700 20px/24px var(--font-family-ui); }
  .brand span { inline-size: 10px; block-size: 10px; background: var(--color-bg-plate-focus); }
  ul { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
  a {
    display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: var(--radius-md); color: var(--color-text-primary);
    font: 400 14px/20px var(--font-family-ui); text-decoration: none;
  }
  a:hover { background: var(--color-bg-sunken); }
  a[aria-current='page'] { background: var(--color-bg-sunken); font-weight: 600; box-shadow: inset 3px 0 0 var(--color-border-focus); }
  a:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  svg { inline-size: 18px; block-size: 18px; flex: none; fill: currentColor; }
  @media (max-width: 899px) {
    nav { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 16px; }
    .brand { flex: none; }
    ul { flex-direction: row; flex-wrap: wrap; }
    a { white-space: nowrap; }
  }
</style>
