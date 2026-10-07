<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { capsuleText } from '@/core/capsule';
  import { localDayRange, pendingRating, rateSession, sessionsBetween, type SessionRecord } from '@/core/sessions';
  import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
  import { fileSite } from '@/core/site-store';
  import { categoryFor, normalizeSites, siteOf, type SiteCategory, type Sites } from '@/core/sites';
  import { settingsItem, sitesItem, timerItem } from '@/core/store';
  import { displayMs, initialState, isBreak, nextPhase, phaseLengthMs, type Phase, type TimerEvent } from '@/core/timer';
  import { normalizeTodos, todosItem, type Todo } from '@/core/todos';
  import { ICONS } from '@/ui/icons';
  import LedBoard from '@/ui/LedBoard.svelte';
  import PhasePlate from '@/ui/PhasePlate.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import TimetableRow from '@/ui/TimetableRow.svelte';
  import RatingCard from './RatingCard.svelte';

  const PHASE_NAME: Record<Phase, string> = { focus: 'Study block', shortBreak: 'Short break', longBreak: 'Long break' };
  const SITE_CHOICES: Array<[SiteCategory, string]> = [['study', 'Study'], ['neutral', 'Not blocked'], ['blocked', 'Blocked']];

  let timer = $state(initialState());
  let settings = $state(DEFAULT_SETTINGS);
  let todos = $state<Todo[]>([]);
  let today = $state<SessionRecord[]>([]);
  let now = $state(Date.now());
  let chosen = $state<string>('');
  let site = $state<string | null>(null);
  let sites = $state<Sites>({});

  const send = (event: TimerEvent) => browser.runtime.sendMessage({ kind: 'timer', event });
  const open = $derived(todos.filter((t) => !t.done));
  const taskText = (id: string | null) => (id ? (todos.find((t) => t.id === id)?.text ?? null) : null);
  const shown = $derived(displayMs(timer, settings, now));
  const toRate = $derived(pendingRating(today, now));
  const blocksDone = $derived(today.filter((s) => s.phase === 'focus' && s.completed).length);
  const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const minutes = (ms: number | null) => (ms === null ? '' : ms < 60_000 ? '<1 min' : `${Math.round(ms / 60_000)} min`);

  const plateNote = $derived(
    timer.status === 'stopped' ? 'Up next'
    : timer.status === 'paused' ? 'Paused'
    : isBreak(timer.phase) ? minutes(timer.plannedMs)
    : timer.plannedMs === null ? 'Counting up'
    : `Block ${timer.cycle + 1} of ${settings.longBreakEvery}`,
  );
  const boardLabel = $derived(
    timer.status === 'paused' ? 'Paused'
    : timer.status === 'stopped' ? `${minutes(phaseLengthMs(timer.phase, settings, timer)) || 'Open-ended'} ${isBreak(timer.phase) ? 'break' : 'study'}`
    : timer.endsAt !== null ? `Ends ${clock(timer.endsAt)}`
    : 'Counting up',
  );
  const progress = $derived(timer.status !== 'stopped' && timer.plannedMs ? 1 - shown.ms / timer.plannedMs : 0);

  /** Today as a departures board: the last two finished blocks, the current one, and what comes next. */
  const rows = $derived.by(() => {
    const done = today.slice(-2).map((s) => ({
      key: s.id, state: (s.completed ? 'done' : 'skipped') as 'done' | 'skipped', time: clock(s.startedAt),
      task: (s.phase === 'focus' && taskText(s.taskId)) || PHASE_NAME[s.phase], duration: minutes(s.activeMs), isBreak: isBreak(s.phase),
    }));
    const label = (phase: Phase, taskId: string | null) => (phase === 'focus' && taskText(taskId)) || PHASE_NAME[phase];
    if (timer.status === 'stopped') {
      return [...done, { key: 'next', state: 'planned' as const, time: clock(now), task: label(timer.phase, chosen || null), duration: minutes(phaseLengthMs(timer.phase, settings, timer)), isBreak: isBreak(timer.phase) }];
    }
    const current = { key: 'now', state: 'current' as const, time: clock(timer.startedAt ?? now), task: label(timer.phase, timer.taskId), duration: '', isBreak: isBreak(timer.phase) };
    const after = nextPhase(timer, settings, true);
    const next = { key: 'next', state: 'planned' as const, time: timer.endsAt ? clock(timer.endsAt) : '--:--', task: PHASE_NAME[after], duration: minutes(phaseLengthMs(after, settings, timer)), isBreak: isBreak(after) };
    return [...done, current, next];
  });

  async function loadToday() {
    const [from, to] = localDayRange(Date.now());
    today = await sessionsBetween(from, to).catch(() => today);
  }

  let ticker: ReturnType<typeof setInterval> | undefined;
  let refresher: ReturnType<typeof setInterval> | undefined;
  const unwatch: Array<() => void> = [];
  onMount(async () => {
    // Watch first, then read, so nothing changes unseen in between.
    unwatch.push(timerItem.watch((v) => {
      timer = v ?? initialState();
      setTimeout(loadToday, 300); // the background logs the finished block right after saving the timer
    }));
    unwatch.push(settingsItem.watch((v) => (settings = normalizeSettings(v))));
    unwatch.push(todosItem.watch((v) => (todos = normalizeTodos(v))));
    unwatch.push(sitesItem.watch((v) => (sites = normalizeSites(v))));
    [timer, settings, todos, sites] = await Promise.all([
      timerItem.getValue(), settingsItem.getValue().then(normalizeSettings), todosItem.getValue().then(normalizeTodos), sitesItem.getValue().then(normalizeSites),
    ]);
    chosen = open[0]?.id ?? '';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    site = siteOf(tab?.url);
    await loadToday();
    ticker = setInterval(() => {
      now = Date.now();
      if (timer.status === 'running' && timer.endsAt !== null && now >= timer.endsAt) void send({ type: 'tick' });
    }, 250);
    refresher = setInterval(loadToday, 5_000);
  });
  onDestroy(() => {
    clearInterval(ticker);
    clearInterval(refresher);
    unwatch.forEach((u) => u());
  });

  async function rate(r: 1 | 2 | 3 | 4 | 5 | 'skip') {
    if (!toRate) return;
    await rateSession(toRate.id, r);
    await loadToday();
  }
</script>

<main>
  <PhasePlate phase={timer.phase} status={timer.status} note={plateNote} />

  {#if timer.status === 'stopped' && timer.phase === 'focus' && open.length > 0}
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
    <LedBoard text={capsuleText(shown.ms, shown.countsUp)} {progress} label={boardLabel} paused={timer.status === 'paused'} />
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
