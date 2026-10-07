<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createLive } from '@/ui/live.svelte';
  import Nav from './Nav.svelte';
  import Sites from './Sites.svelte';
  import Today from './Today.svelte';
  import Todo from './Todo.svelte';

  const ROUTES = ['today', 'todo', 'sites', 'settings'] as const;
  type Route = (typeof ROUTES)[number];
  const routeOf = (hash: string): Route => (ROUTES as readonly string[]).includes(hash.slice(1)) ? (hash.slice(1) as Route) : 'today';

  let route = $state<Route>(routeOf(location.hash));
  const data = createLive();
  let stop: (() => void) | undefined;
  const onHash = () => {
    route = routeOf(location.hash);
    document.getElementById('main')?.focus();
  };
  onMount(async () => {
    window.addEventListener('hashchange', onHash);
    stop = await data.start();
  });
  onDestroy(() => {
    window.removeEventListener('hashchange', onHash);
    stop?.();
  });
</script>

<div class="shell">
  <Nav {route} />
  <main id="main" tabindex="-1">
    {#if route === 'today'}
      <Today {data} />
    {:else if route === 'sites'}
      <h1>Site lock</h1>
      <Sites />
    {:else if route === 'todo'}
      <Todo {data} />
    {:else}
      <h1>Settings</h1>
    {/if}
  </main>
</div>

<style>
  .shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-block-size: 100vh; }
  .shell > :global(nav) { border-inline-end: 1px solid var(--color-border-subtle); background: var(--color-bg-panel); }
  main { box-sizing: border-box; max-inline-size: 1040px; inline-size: 100%; padding: 32px; outline: none; }
  h1 { margin: 0 0 24px; font: 800 28px/32px var(--font-family-ui); }
  @media (max-width: 899px) {
    .shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
    .shell > :global(nav) { border-inline-end: 0; border-block-end: 1px solid var(--color-border-subtle); }
    main { padding: 24px 16px 48px; }
  }
</style>
