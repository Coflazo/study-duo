<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { capsuleText } from '@/core/capsule';
  import { pendingRating, rateSession } from '@/core/sessions';
  import { fileSite } from '@/core/site-store';
  import { categoryFor, normalizeSites, siteOf, type SiteCategory, type Sites } from '@/core/sites';
  import { sitesItem } from '@/core/store';
  import { isBreak } from '@/core/timer';
  import { boardLabel, defaultTask, plateNote, timetable } from '@/core/today-view';
  import { ICONS } from '@/ui/icons';
  import LedBoard from '@/ui/LedBoard.svelte';
  import { createLive, send } from '@/ui/live.svelte';
  import PhasePlate from '@/ui/PhasePlate.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import TimetableRow from '@/ui/TimetableRow.svelte';
  import RatingCard from './RatingCard.svelte';
  import UpdateNotice from '@/ui/UpdateNotice.svelte';

  const SITE_CHOICES: Array<[SiteCategory, string]> = [['study', 'Study'], ['neutral', 'Not blocked'], ['blocked', 'Blocked']];

  const data = createLive();
  const live = data.live;
  const timer = $derived(live.timer);
  const settings = $derived(live.settings);
  let chosen = $state<string>('');
  let defaulted = $state(false);
  let site = $state<string | null>(null);
  let sites = $state<Sites>({});

  const open = $derived(live.todos.filter((t) => !t.done));
  const shown = $derived(data.shown());
  const toRate = $derived(pendingRating(live.today, live.now, timer));
  const blocksDone = $derived(live.today.filter((s) => s.phase === 'focus' && s.completed).length);
  const progress = $derived(timer.status !== 'stopped' && timer.plannedMs ? 1 - shown.ms / timer.plannedMs : 0);
  const rows = $derived(timetable({ timer, settings, sessions: live.today, todos: live.todos, now: live.now, chosen: chosen || null, keepDone: 2 }));

  let stop: (() => void) | undefined;
  let unwatchSites: (() => void) | undefined;
  onMount(async () => {
    unwatchSites = sitesItem.watch((v) => (sites = normalizeSites(v)));
    stop = await data.start();
    // The picker appears only once its default is set, so the default never lands on top of a choice.
    chosen = defaultTask(open, live.timer);
    defaulted = true;
    sites = normalizeSites(await sitesItem.getValue());
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    site = siteOf(tab?.url);
  });
  onDestroy(() => {
    stop?.();
    unwatchSites?.();
  });

  async function rate(r: 1 | 2 | 3 | 4 | 5 | 'skip') {
    if (!toRate) return;
    await rateSession(toRate.id, r);
    await data.loadToday();
  }
</script>

<main>
  <UpdateNotice />
  <PhasePlate phase={timer.phase} status={timer.status} note={plateNote(timer, settings)} />

  {#if defaulted && timer.status === 'stopped' && timer.phase === 'focus' && open.length > 0}
    <label class="field">
      <span>Work on</span>
      <select bind:value={chosen}>
        {#each open as t (t.id)}<option value={t.id}>{t.text}{t.course ? ` (${t.course})` : ''}</option>{/each}
        <option value="">No task</option>
      </select>
    </label>
  {/if}

  {#if toRate}
    <RatingCard onrate={(r) => rate(r)} onskip={() => rate('skip')} />
  {:else}
    <LedBoard text={capsuleText(shown.ms, shown.countsUp)} {progress} label={boardLabel(timer, settings)} paused={timer.status === 'paused'} />
    <section aria-labelledby="today-title">
      <h2 id="today-title">Today <span>{blocksDone} of {settings.dailyGoal} blocks</span></h2>
      <ul>
        {#each rows as r (r.key)}<TimetableRow state={r.state} time={r.time} task={r.task} duration={r.duration} isBreak={r.isBreak} />{/each}
      </ul>
    </section>
  {/if}

  <div class="actions">
    {#if timer.status === 'stopped'}
      <SignButton label="Start" icon={ICONS.play} onclick={() => send({ type: 'start', taskId: timer.phase === 'focus' && chosen ? chosen : null })} />
    {:else if timer.status === 'running'}
      <SignButton label="Pause" icon={ICONS.pause} onclick={() => send({ type: 'pause' })} />
    {:else}
      <SignButton label="Resume" icon={ICONS.play} onclick={() => send({ type: 'resume' })} />
    {/if}
    {#if timer.plannedMs === null && timer.status !== 'stopped'}
      <SignButton kind="secondary" label="Finish" icon={ICONS.check} onclick={() => send({ type: 'finish' })} />
    {:else}
      <SignButton kind="secondary" label={isBreak(timer.phase) ? 'Skip break' : 'Skip'} icon={ICONS.skip} onclick={() => send({ type: 'skip' })} />
    {/if}
  </div>

  <footer>
    {#if site}
      <section class="site" aria-label="This site">
        <p>This site: <strong>{site}</strong></p>
        <div role="group" aria-label="File {site} as">
          {#each SITE_CHOICES as [category, label] (category)}
            <button aria-pressed={categoryFor(site, sites) === category} onclick={() => fileSite(site!, category).catch(() => undefined)}>{label}</button>
          {/each}
        </div>
      </section>
    {/if}
    <nav aria-label="More">
      {#if timer.status !== 'stopped' && timer.plannedMs !== null}<button onclick={() => send({ type: 'extend', ms: 5 * 60_000 })}>+5 min</button>{/if}
      {#if timer.status !== 'stopped'}<button onclick={() => send({ type: 'reset' })}>Reset</button>{/if}
      <button onclick={() => browser.runtime.openOptionsPage()}>Settings</button>
    </nav>
  </footer>
</main>

<style>
  :global(body) { inline-size: 360px; }
  main { display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; padding: 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field span { font: 600 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  select {
    block-size: 44px; inline-size: 100%; padding: 0 36px 0 12px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui); text-overflow: ellipsis;
    appearance: none; cursor: pointer;
  }
  .field { position: relative; }
  /* Figma chevron instead of the native arrow */
  .field::after {
    content: ''; position: absolute; inset-inline-end: 16px; inset-block-end: 18px; inline-size: 8px; block-size: 8px;
    border-inline-end: 2px solid var(--color-text-primary); border-block-end: 2px solid var(--color-text-primary); transform: rotate(45deg); pointer-events: none;
  }
  select:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  h2 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; font: 700 20px/24px var(--font-family-ui); }
  h2 span { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  ul { margin: 0; padding: 0; }
  .actions { display: flex; gap: 12px; }
  footer { display: flex; flex-direction: column; gap: 12px; padding-block-start: 8px; border-block-start: 1px solid var(--color-border-subtle); }
  .site p { margin: 0 0 8px; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); overflow-wrap: anywhere; }
  .site strong { color: var(--color-text-primary); }
  .site div { display: flex; gap: 6px; flex-wrap: wrap; }
  .site button, nav button {
    padding: 6px 10px; border: 1px solid var(--color-border-control); border-radius: 2px; background: none; color: var(--color-text-primary);
    font: 600 12px/16px var(--font-family-ui); cursor: pointer;
  }
  .site button[aria-pressed='true'] { background: var(--color-bg-action); border-color: var(--color-bg-action); color: var(--color-text-on-action); }
  nav { display: flex; gap: 6px; flex-wrap: wrap; }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
