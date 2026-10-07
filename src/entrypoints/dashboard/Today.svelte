<script lang="ts">
  import { capsuleText } from '@/core/capsule';
  import { isBreak } from '@/core/timer';
  import { boardLabel, defaultTask, plateNote, timetable } from '@/core/today-view';
  import { toggleTodo, updateTodos } from '@/core/todos';
  import { ICONS } from '@/ui/icons';
  import LedBoard from '@/ui/LedBoard.svelte';
  import type { createLive } from '@/ui/live.svelte';
  import { send } from '@/ui/live.svelte';
  import PhasePlate from '@/ui/PhasePlate.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import TimetableRow from '@/ui/TimetableRow.svelte';
  import TodoRow from '@/ui/TodoRow.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const live = $derived(data.live);

  let chosen = $state('');
  const open = $derived(live.todos.filter((t) => !t.done));
  const doneToday = $derived(live.todos.filter((t) => t.done && t.doneAt !== null && new Date(t.doneAt).toDateString() === new Date(live.now).toDateString()));
  const shown = $derived(data.shown());
  const progress = $derived(live.timer.status !== 'stopped' && live.timer.plannedMs ? 1 - shown.ms / live.timer.plannedMs : 0);
  const rows = $derived(timetable({ timer: live.timer, settings: live.settings, sessions: live.today, todos: live.todos, now: live.now, chosen: chosen || null }));
  const blocksDone = $derived(live.today.filter((s) => s.phase === 'focus' && s.completed).length);
  const onNow = $derived(live.timer.status !== 'stopped' && live.timer.phase === 'focus' ? live.timer.taskId : null);
  const date = $derived(new Date(live.now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }));

  // Default once, after all the data loads; the picker appears only then, so the default never lands on top of a choice.
  let defaulted = $state(false);
  $effect(() => {
    if (defaulted || !live.ready) return;
    chosen = defaultTask(open, live.timer);
    defaulted = true;
  });
</script>

<header><h1>Today</h1><span>{date}</span></header>

<div class="grid">
  <section class="clock" aria-label="Timer">
    <PhasePlate phase={live.timer.phase} status={live.timer.status} note={plateNote(live.timer, live.settings)} />
    {#if defaulted && live.timer.status === 'stopped' && live.timer.phase === 'focus' && open.length > 0}
      <label class="field">
        <span>Work on</span>
        <select bind:value={chosen}>
          {#each open as t (t.id)}<option value={t.id}>{t.text}{t.course ? ` (${t.course})` : ''}</option>{/each}
          <option value="">No task</option>
        </select>
      </label>
    {/if}
    <LedBoard text={capsuleText(shown.ms, shown.countsUp)} {progress} label={boardLabel(live.timer, live.settings)} paused={live.timer.status === 'paused'} />
    <div class="actions">
      {#if live.timer.status === 'stopped'}
        <SignButton label="Start" icon={ICONS.play} onclick={() => send({ type: 'start', taskId: live.timer.phase === 'focus' && chosen ? chosen : null })} />
      {:else if live.timer.status === 'running'}
        <SignButton label="Pause" icon={ICONS.pause} onclick={() => send({ type: 'pause' })} />
      {:else}
        <SignButton label="Resume" icon={ICONS.play} onclick={() => send({ type: 'resume' })} />
      {/if}
      {#if live.timer.plannedMs === null && live.timer.status !== 'stopped'}
        <SignButton kind="secondary" label="Finish" icon={ICONS.check} onclick={() => send({ type: 'finish' })} />
      {:else}
        <SignButton kind="secondary" label={isBreak(live.timer.phase) ? 'Skip break' : 'Skip'} icon={ICONS.skip} onclick={() => send({ type: 'skip' })} />
      {/if}
    </div>
  </section>

  <div class="lists">
    <section aria-labelledby="timetable-title">
      <h2 id="timetable-title">Timetable <span>{blocksDone} of {live.settings.dailyGoal} blocks, goal {live.settings.dailyGoal}</span></h2>
      <ul>
        {#each rows as r (r.key)}<TimetableRow state={r.state} time={r.time} task={r.task} duration={r.duration} isBreak={r.isBreak} />{/each}
      </ul>
    </section>

    <section aria-labelledby="todo-title">
      <h2 id="todo-title">To-do <span>{open.length} left today</span></h2>
      {#if open.length + doneToday.length === 0}
        <p class="empty">Nothing here yet. Add what you want to work on in <a href="#todo">To-do</a>, then pick one before a study block.</p>
      {:else}
        <ul>
          {#each [...open, ...doneToday] as t (t.id)}
            <TodoRow todo={t} onNow={t.id === onNow} ontoggle={() => updateTodos((list) => toggleTodo(list, t.id, Date.now()))} />
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  header { display: flex; align-items: baseline; gap: 12px; margin-block-end: 24px; }
  h1 { margin: 0; font: 800 28px/32px var(--font-family-ui); }
  header span { font: 400 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .grid { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 24px 32px; align-items: start; }
  .clock { display: flex; flex-direction: column; gap: 16px; }
  .clock :global(.board) { inline-size: 100%; }
  .actions { display: flex; gap: 12px; }
  .lists { display: flex; flex-direction: column; gap: 24px; min-inline-size: 0; }
  h2 { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; font: 700 20px/24px var(--font-family-ui); }
  h2 span { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  ul { margin: 0; padding: 0; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field span { font: 600 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  select {
    block-size: 44px; inline-size: 100%; padding: 0 12px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui);
  }
  select:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .empty { margin: 8px 0 0; padding: 16px; border: 1px dashed var(--color-border-control); border-radius: var(--radius-md); color: var(--color-text-secondary); }
  .empty a { color: var(--color-text-primary); }
  @media (max-width: 899px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
