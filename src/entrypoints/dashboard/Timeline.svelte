<script lang="ts">
  /** Figma Dashboard / Timeline (76:137): every block and break by day or week, and export to any calendar app. */
  import { onDestroy, onMount } from 'svelte';
  import { toICS } from '@/core/ics';
  import { recordsBetween } from '@/core/log';
  import { sessionsBetween, type SessionRecord } from '@/core/sessions';
  import { logVersionItem } from '@/core/store';
  import { dayItems, startOfWeek, VISIBLE_FROM, VISIBLE_TO } from '@/core/timeline';
  import { clockTime } from '@/core/today-view';
  import type { createLive } from '@/ui/live.svelte';
  import Segmented from '@/ui/Segmented.svelte';
  import SignButton from '@/ui/SignButton.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const live = $derived(data.live);
  const DAY = 86_400_000;
  const PX_PER_MIN = 44 / 60;

  let view = $state<'day' | 'week'>(matchMedia('(max-width: 700px)').matches ? 'day' : 'week');
  let anchor = $state(new Date().setHours(0, 0, 0, 0));
  let sessions = $state<SessionRecord[]>([]);

  /** Local midnights of the days on screen (DST-safe: by calendar date, not by adding 24 hours). */
  const days = $derived.by(() => {
    const first = view === 'week' ? startOfWeek(anchor) : anchor;
    return Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      return d.getTime();
    });
  });
  const range = $derived.by(() => {
    const fmt = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString([], opts);
    if (view === 'day') return fmt(days[0]!, { weekday: 'long', day: 'numeric', month: 'long' });
    const a = days[0]!;
    const b = days[6]!;
    return new Date(a).getMonth() === new Date(b).getMonth() ? `${fmt(a, { day: 'numeric' })} to ${fmt(b, { day: 'numeric', month: 'long' })}` : `${fmt(a, { day: 'numeric', month: 'long' })} to ${fmt(b, { day: 'numeric', month: 'long' })}`;
  });

  async function load() {
    const from = days[0]!;
    const end = new Date(days.at(-1)!);
    end.setDate(end.getDate() + 1);
    sessions = await sessionsBetween(from - DAY, end.getTime() + DAY).catch(() => []); // a day either side: blocks across midnight
  }
  let unwatch: (() => void) | undefined;
  onMount(() => (unwatch = logVersionItem.watch(() => void load())));
  onDestroy(() => unwatch?.());
  $effect(() => {
    void days;
    void load();
  });

  function move(step: number) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + step * (view === 'week' ? 7 : 1));
    anchor = d.getTime();
  }

  const taskName = (id: string | null) => (id ? live.todos.find((t) => t.id === id)?.text : undefined);
  const describe = (s: SessionRecord) =>
    `${s.phase === 'focus' ? `Study${taskName(s.taskId) ? `, ${taskName(s.taskId)}` : ''}` : 'Break'}, ${clockTime(s.startedAt)} to ${clockTime(s.endedAt)}${s.rating ? `, focus ${s.rating} of 5` : ''}${s.completed ? '' : ', ended early'}`;
  const hours = Array.from({ length: VISIBLE_TO - VISIBLE_FROM }, (_, i) => VISIBLE_FROM + i);
  const blocksShown = $derived(days.reduce((n, d) => n + dayItems(sessions, d).filter((i) => i.session.phase === 'focus').length, 0));

  let exporting = $state(false);
  async function exportCalendar() {
    exporting = true;
    try {
      const now = Date.now();
      const all = await sessionsBetween(0, now + 1);
      let songs: Map<string, string[]> | undefined;
      if (live.settings.calendarSongs) {
        songs = new Map();
        for (const l of await recordsBetween('listens', 0, now + 1)) {
          if (!l.sessionId) continue;
          songs.set(l.sessionId, [...(songs.get(l.sessionId) ?? []), [l.title, l.artist].filter(Boolean).join(', ')]);
        }
      }
      const ics = toICS(all, { tasks: new Map(live.todos.map((t) => [t.id, t.text])), now, songs });
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      Object.assign(document.createElement('a'), { href: url, download: `study-duo-${new Date(now).toISOString().slice(0, 10)}.ics` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      exporting = false;
    }
  }
</script>

<h1 class="screen-title">Timeline</h1>

<div class="toolbar">
  <Segmented options={[['day', 'Day'], ['week', 'Week']]} value={view} label="Show" onchange={(v) => (view = v)} />
  <h2 class="range" aria-live="polite">{range}</h2>
  <SignButton label="Previous" kind="secondary" onclick={() => move(-1)} />
  <SignButton label="Next" kind="secondary" onclick={() => move(1)} />
  <SignButton label={exporting ? 'Exporting…' : 'Export to calendar'} kind="secondary" disabled={exporting} onclick={exportCalendar} />
</div>
<p class="help">Export makes one file with every block and break, for Google Calendar, Apple Calendar or Outlook. Importing it again updates the same events instead of adding copies.</p>

<div class="grid" class:single={view === 'day'} style="--minutes: {(VISIBLE_TO - VISIBLE_FROM) * 60}; --px: {PX_PER_MIN}">
  <div class="axis" aria-hidden="true">
    {#each hours as h (h)}<span style="top: {(h - VISIBLE_FROM) * 60 * PX_PER_MIN}px">{String(h).padStart(2, '0')}:00</span>{/each}
  </div>
  {#each days as d (d)}
    {@const items = dayItems(sessions, d)}
    <section class="day" aria-label={new Date(d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}>
      <h3>{new Date(d).toLocaleDateString([], view === 'week' ? { weekday: 'short', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      <ol class="lane">
        {#each items as it (it.session.id)}
          <li
            class="item" class:break={it.session.phase !== 'focus'} class:early={!it.session.completed}
            style="top: {it.top * PX_PER_MIN}px; height: {Math.max(4, it.height * PX_PER_MIN - 1)}px"
            aria-label={describe(it.session)} title={describe(it.session)}
          >
            {#if it.session.phase === 'focus' && it.height >= 20}<span>{taskName(it.session.taskId) ?? 'Study'}{view === 'day' && it.session.rating ? ` · ${it.session.rating} of 5` : ''}</span>{/if}
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>
{#if blocksShown === 0}<p class="help empty">No study blocks {view === 'week' ? 'this week' : 'this day'}.</p>{/if}

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  .toolbar :global(button) { flex: 0 0 auto; } /* wrap to a new line rather than squeeze a label */
  .range { flex: 1 1 200px; margin: 0; font: 700 18px/24px var(--font-family-ui); }
  .help { margin: 12px 0 16px; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .empty { margin-top: 8px; }
  .grid {
    display: grid; grid-template-columns: 48px repeat(7, minmax(72px, 1fr)); max-block-size: 70vh; overflow: auto;
    border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-bg-panel);
  }
  .grid.single { grid-template-columns: 48px minmax(0, 1fr); }
  .axis { position: relative; margin-block-start: 32px; block-size: calc(var(--minutes) * var(--px) * 1px); }
  .axis span { position: absolute; inset-inline-start: 6px; transform: translateY(-50%); font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); }
  .day { border-inline-start: 1px solid var(--color-border-subtle); min-inline-size: 0; }
  h3 { position: sticky; inset-block-start: 0; z-index: 1; margin: 0; padding: 8px; block-size: 32px; box-sizing: border-box; font: 600 12px/16px var(--font-family-ui); color: var(--color-text-secondary); background: var(--color-bg-panel); border-block-end: 1px solid var(--color-border-subtle); }
  .lane {
    position: relative; margin: 0; padding: 0; list-style: none; block-size: calc(var(--minutes) * var(--px) * 1px);
    background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(60 * var(--px) * 1px - 1px), var(--color-border-subtle) calc(60 * var(--px) * 1px - 1px), var(--color-border-subtle) calc(60 * var(--px) * 1px));
  }
  .item { position: absolute; inset-inline: 4px; overflow: hidden; border-radius: 2px; background: var(--color-bg-plate-focus); color: var(--color-text-on-plate); }
  .item.break { background: var(--color-bg-plate-break); }
  .item.early { opacity: 0.6; }
  .item span { display: block; padding: 2px 4px; font: 600 10px/14px var(--font-family-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
