<script lang="ts">
  import { tick } from 'svelte';
  import { addTodo, editTodo, moveTodo, removeTodo, toggleTodo, updateTodos, type Todo } from '@/core/todos';
  import { ICONS } from '@/ui/icons';
  import type { createLive } from '@/ui/live.svelte';
  import { send } from '@/ui/live.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import TodoRow from '@/ui/TodoRow.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const live = $derived(data.live);

  let text = $state('');
  let course = $state('');
  let ifThen = $state('');
  let planOpen = $state(false);
  let menuFor = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let draft = $state('');
  let deleted = $state<{ todo: Todo; index: number } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  const open = $derived(live.todos.filter((t) => !t.done));
  const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
  const doneToday = $derived(live.todos.filter((t) => t.done && t.doneAt !== null && sameDay(t.doneAt, live.now)));
  const onNow = $derived(live.timer.status !== 'stopped' && live.timer.phase === 'focus' ? live.timer.taskId : null);
  const canStart = $derived(live.timer.status === 'stopped' && live.timer.phase === 'focus');

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await updateTodos((list) => addTodo(list, { text, course, ifThen: planOpen ? ifThen : null }, crypto.randomUUID()));
    text = '';
    ifThen = '';
    planOpen = false;
  }

  async function openMenu(id: string) {
    menuFor = menuFor === id ? null : id;
    await tick();
    document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')?.focus();
  }
  function closeMenu(e: MouseEvent | KeyboardEvent) {
    if (menuFor === null) return;
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && (e.target as HTMLElement).closest('.more-wrap')) return;
    const id = menuFor;
    menuFor = null;
    if (e instanceof KeyboardEvent) document.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus();
  }
  async function act(id: string, fn: () => Promise<unknown>) {
    menuFor = null;
    await fn();
    await tick();
    document.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus();
  }
  async function startEdit(t: Todo) {
    menuFor = null;
    editing = t.id;
    draft = t.text;
    await tick();
    document.querySelector<HTMLInputElement>(`[data-edit="${t.id}"]`)?.focus();
  }
  async function saveEdit(id: string) {
    await updateTodos((list) => editTodo(list, id, { text: draft }));
    editing = null;
  }
  async function remove(t: Todo) {
    menuFor = null;
    const index = live.todos.findIndex((x) => x.id === t.id);
    await updateTodos((list) => removeTodo(list, t.id));
    deleted = { todo: t, index };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (deleted = null), 8_000);
  }
  async function undo() {
    if (!deleted) return;
    const { todo, index } = deleted;
    deleted = null;
    await updateTodos((list) => [...list.slice(0, index), todo, ...list.slice(index)]);
  }
</script>

<svelte:window onclick={closeMenu} onkeydown={closeMenu} />

<header><h1>To-do</h1><span>{open.length} left, {doneToday.length} done today</span></header>

<form class="add" onsubmit={add}>
  <div class="inputs">
    <input class="task" aria-label="Add something to work on" placeholder="Add something to work on" maxlength="200" autocomplete="off" bind:value={text} />
    <input class="course" aria-label="Course" placeholder="Course" maxlength="12" autocomplete="off" bind:value={course} />
    <SignButton type="submit" label="Add" icon={ICONS.plus} disabled={!text.trim()} />
  </div>
  {#if planOpen}
    <label class="plan">
      <span>If I get stuck, I will</span>
      <input maxlength="160" autocomplete="off" placeholder="skim the worked examples first" bind:value={ifThen} />
    </label>
  {:else}
    <button type="button" class="plan-toggle" aria-expanded="false" onclick={() => (planOpen = true)}>+ Add an if-then plan</button>
  {/if}
</form>

{#if deleted}
  <p class="undo" role="status">Deleted "{deleted.todo.text}". <button onclick={undo}>Undo</button></p>
{/if}

{#if open.length + doneToday.length === 0}
  <div class="empty">
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.listChecks} /></svg>
    <p><strong>Nothing here yet.</strong></p>
    <p>Add what you want to work on, then pick one before a study block.</p>
  </div>
{:else}
  <ul>
    {#each open as t, i (t.id)}
      <TodoRow todo={t} onNow={t.id === onNow} ontoggle={() => updateTodos((list) => toggleTodo(list, t.id, Date.now()))}>
        {#snippet content()}
          {#if editing === t.id}
            <input
              class="edit" data-edit={t.id} aria-label="Edit {t.text}" maxlength="200" bind:value={draft}
              onkeydown={(e) => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') editing = null; }}
              onblur={() => editing === t.id && saveEdit(t.id)}
            />
          {:else}
            <span class="text">{t.text}{#if t.ifThen}<small>If I get stuck, I will {t.ifThen}</small>{/if}</span>
          {/if}
        {/snippet}
        {#snippet actions()}
          {#if canStart}<button class="small" aria-label="Start a study block on {t.text}" onclick={() => send({ type: 'start', taskId: t.id })}>Start</button>{/if}
          <span class="more-wrap">
            <button class="small" data-more={t.id} aria-label="More for {t.text}" aria-haspopup="menu" aria-expanded={menuFor === t.id} onclick={() => openMenu(t.id)}>•••</button>
            {#if menuFor === t.id}
              <span class="menu" role="menu" aria-label="Actions for {t.text}">
                <button role="menuitem" disabled={i === 0} onclick={() => act(t.id, () => updateTodos((list) => moveTodo(list, t.id, list.findIndex((x) => x.id === t.id) - 1)))}>Move up</button>
                <button role="menuitem" disabled={i === open.length - 1} onclick={() => act(t.id, () => updateTodos((list) => moveTodo(list, t.id, list.findIndex((x) => x.id === t.id) + 1)))}>Move down</button>
                <button role="menuitem" onclick={() => startEdit(t)}>Edit</button>
                <button role="menuitem" onclick={() => remove(t)}>Delete</button>
              </span>
            {/if}
          </span>
        {/snippet}
      </TodoRow>
    {/each}
  </ul>

  {#if doneToday.length > 0}
    <section aria-labelledby="done-title">
      <h2 id="done-title">Done today</h2>
      <ul>
        {#each doneToday as t (t.id)}
          <TodoRow todo={t} ontoggle={() => updateTodos((list) => toggleTodo(list, t.id, Date.now()))} />
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  header { display: flex; align-items: baseline; gap: 12px; margin-block-end: 24px; }
  h1 { margin: 0; font: 800 28px/32px var(--font-family-ui); }
  header span { font: 400 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .add { display: flex; flex-direction: column; gap: 8px; margin-block-end: 24px; }
  .inputs { display: flex; flex-wrap: wrap; gap: 8px; }
  .inputs :global(button) { flex: 0 0 auto; }
  input {
    box-sizing: border-box; block-size: 44px; padding: 0 12px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui);
  }
  .task { flex: 1 1 260px; min-inline-size: 0; }
  .course { flex: 0 1 140px; min-inline-size: 0; font-family: var(--font-family-mono); text-transform: uppercase; }
  .course::placeholder { font-family: var(--font-family-ui); text-transform: none; }
  input:focus-visible, button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .plan { display: flex; flex-direction: column; gap: 6px; max-inline-size: 560px; }
  .plan span { font: 600 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .plan-toggle { align-self: flex-start; padding: 2px 0; border: 0; background: none; color: var(--color-text-secondary); font: 600 12px/16px var(--font-family-ui); cursor: pointer; }
  ul { margin: 0; padding: 0; }
  h2 { margin: 24px 0 4px; font: 600 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .text { flex: 1; min-inline-size: 0; overflow-wrap: anywhere; font: inherit; }
  small { display: block; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .edit { flex: 1; block-size: 32px; }
  .small {
    padding: 4px 8px; border: 1px solid var(--color-border-subtle); border-radius: 2px; background: var(--color-bg-panel);
    color: var(--color-text-primary); font: 600 12px/16px var(--font-family-ui); cursor: pointer;
  }
  .more-wrap { position: relative; }
  .menu {
    position: absolute; inset-block-start: calc(100% + 4px); inset-inline-end: 0; z-index: 1; display: flex; flex-direction: column;
    min-inline-size: 180px; padding: 4px; border: 1px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  }
  .menu button { padding: 8px 10px; border: 0; border-radius: 2px; background: none; color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui); text-align: start; cursor: pointer; }
  .menu button:hover:not(:disabled) { background: var(--color-bg-sunken); }
  .menu button:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
  .undo { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 8px 12px; border-radius: var(--radius-md); background: var(--color-bg-sunken); }
  .undo button { padding: 0; border: 0; background: none; color: var(--color-text-primary); font: 700 14px/20px var(--font-family-ui); text-decoration: underline; cursor: pointer; }
  .empty { display: flex; flex-direction: column; gap: 4px; max-inline-size: 328px; padding: 20px; border: 1px dashed var(--color-border-control); border-radius: var(--radius-md); }
  .empty p { margin: 0; color: var(--color-text-secondary); }
  .empty strong { color: var(--color-text-primary); }
  .empty svg { inline-size: 20px; block-size: 20px; fill: currentColor; margin-block-end: 8px; }
</style>
