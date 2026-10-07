<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Todo } from '@/core/todos';

  /** Figma List/Todo Row: a checkbox, the task, its course tag; the task of the running block carries the red rail and "On now". */
  let { todo, onNow = false, ontoggle, actions, content }: { todo: Todo; onNow?: boolean; ontoggle: () => void; actions?: Snippet; content?: Snippet } = $props();
</script>

<li class="row" class:now={onNow} class:done={todo.done}>
  <input type="checkbox" checked={todo.done} aria-label={todo.text} onchange={ontoggle} />
  {#if content}{@render content()}{:else}<span class="text">{todo.text}{#if todo.ifThen}<small>If I get stuck, I will {todo.ifThen}</small>{/if}</span>{/if}
  {#if onNow}<span class="now-label">On now</span>{/if}
  {#if todo.course}<span class="course">{todo.course}</span>{/if}
  {#if actions}{@render actions()}{/if}
</li>

<style>
  .row {
    display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-block-size: 40px; padding: 8px 12px;
    border-block-end: 1px solid var(--color-border-subtle); list-style: none;
  }
  .row.now { border-block-end: 0; border-inline-start: 3px solid var(--color-border-focus); background: var(--color-bg-sunken); padding-inline-start: 9px; }
  input {
    appearance: none; flex: none; inline-size: 18px; block-size: 18px; margin: 0; border: 2px solid var(--color-border-control); border-radius: 2px;
    background: var(--color-bg-panel); cursor: pointer; display: grid; place-items: center;
  }
  input:checked { background: var(--color-bg-action); border-color: var(--color-bg-action); }
  input:checked::after { content: ''; inline-size: 4px; block-size: 8px; margin-block-start: -2px; border: solid var(--color-text-on-action); border-width: 0 2px 2px 0; transform: rotate(45deg); }
  input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .text { flex: 1; min-inline-size: 0; overflow-wrap: anywhere; font: 400 14px/20px var(--font-family-ui); }
  .now .text { font-weight: 600; }
  small { display: block; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .done .text { color: var(--color-text-secondary); }
  .now-label { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-focus); white-space: nowrap; }
  .course { padding: 2px 6px; border-radius: 2px; background: var(--color-bg-sunken); font: 500 12px/16px var(--font-family-mono); white-space: nowrap; }
  .now .course { background: var(--color-bg-panel); }
</style>
