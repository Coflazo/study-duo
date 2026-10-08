<script lang="ts">
  /** Figma Dashboard / Your data: what Study Duo measures (one switch each), retention, export and delete. */
  import { onMount } from 'svelte';
  import type { StoreName } from '@/core/db';
  import { countAll, deleteAll, exportAll } from '@/core/log';
  import { normalizeSettings, type Measure, type TimerSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { listeningItem, soundItem, trackerItem } from '@/core/session-store';
  import type { createLive } from '@/ui/live.svelte';
  import NumberField from '@/ui/NumberField.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import Toggle from '@/ui/Toggle.svelte';
  import Move from './Move.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const s = $derived(data.live.settings);
  const save = async (patch: Partial<TimerSettings>) => settingsItem.setValue(normalizeSettings({ ...(await settingsItem.getValue()), ...patch }));

  const MEASURES: Array<[keyof Measure, string, string]> = [
    ['sites', 'Time on each kind of site', 'Study, Blocked, Not blocked or not filed yet.'],
    ['blocked', 'Blocked sites you try to open', 'And whether you opened one anyway. Never your reason.'],
    ['outcome', 'How blocks end', 'Finished or skipped, pauses and +5 stay in your timer history; off leaves them out of the focus signals.'],
    ['away', 'Time away from the browser', 'Another app, idle or locked. Counted as away, never as distraction.'],
    ['music', 'Songs you play', 'Title, artist and album from music sites and your own files, only while the timer runs.'],
    ['input', 'Keys, clicks and scrolls per minute', 'How many, never which key. Off until you turn it on.'],
  ];

  let counts = $state<Record<StoreName, number> | null>(null);
  let confirming = $state(false);
  let typed = $state('');
  let done = $state('');
  const refresh = async () => (counts = await countAll().catch(() => null));
  onMount(refresh);

  async function exportData() {
    const file = await exportAll(Date.now());
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `study-duo-data-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deleteData() {
    if (typed.trim().toLowerCase() !== 'delete') return;
    await deleteAll();
    // Records still open (the site in front, songs playing, a focus sound) start over now, so nothing older returns.
    const now = Date.now();
    const tracker = await trackerItem.getValue();
    await trackerItem.setValue({ ...tracker, open: tracker.open && { ...tracker.open, startedAt: now }, last: null });
    const listening = await listeningItem.getValue();
    await listeningItem.setValue(Object.fromEntries(Object.entries(listening).map(([k, l]) => [k, { ...l, startedAt: now }])));
    const sound = await soundItem.getValue();
    if (sound) await soundItem.setValue({ ...sound, startedAt: now });
    confirming = false;
    typed = '';
    done = 'Deleted. Study Duo starts learning again from your next block.';
    await refresh();
  }
  const n = (v: number) => v.toLocaleString();
</script>

<h1 class="screen-title">Your data</h1>

<div class="columns">
  <section aria-labelledby="measures-title">
    <h2 class="section-title" id="measures-title">What Study Duo measures</h2>
    <div class="row"><div class="text"><p class="label">During study blocks it counts. It never reads.</p><p class="help">Only site names, never full addresses, page text or what you type. No microphone or screenshots, and the camera only while you scan move codes. Everything stays in this browser, and each item has its own switch.</p></div></div>
    {#each MEASURES as [key, label, help] (key)}
      <div class="row">
        <div class="text"><p class="label">{label}</p><p class="help">{help}</p></div>
        <Toggle checked={s.measure[key]} {label} onchange={(v) => save({ measure: { ...s.measure, [key]: v } })} />
      </div>
    {/each}
  </section>

  <div>
  <section aria-labelledby="data-title">
    <h2 class="section-title" id="data-title">Your data</h2>
    <div class="row">
      <div class="text"><label class="label" for="retention">Keep history for</label><p class="help">Older blocks, songs and site time are deleted.</p></div>
      <NumberField id="retention" value={s.retentionDays} min={30} max={3650} unit="days" word="days" onsave={(retentionDays) => save({ retentionDays })} />
    </div>
    <div class="row">
      <div class="text">
        <p class="label">Stored in this browser</p>
        <p class="help">{counts ? `${n(counts.sessions)} blocks and breaks, ${n(counts.activity)} site records, ${n(counts.listens)} songs, ${n(counts.blocks)} blocked attempts.` : 'Counting…'}</p>
      </div>
    </div>
    <div class="row">
      <div class="text"><p class="label">Export my data</p><p class="help">One JSON file with everything above.</p></div>
      <SignButton label="Export" kind="secondary" onclick={exportData} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Delete everything</p><p class="help">Every block, song, site record and rating. Settings and to-dos stay.</p></div>
      {#if !confirming}<SignButton label="Delete…" kind="secondary" onclick={() => ((confirming = true), (done = ''))} />{/if}
    </div>
    {#if confirming}
      <form class="row" onsubmit={(e) => (e.preventDefault(), void deleteData())}>
        <div class="text"><label class="label" for="confirm-delete">Type delete to confirm</label></div>
        <input id="confirm-delete" bind:value={typed} autocomplete="off" />
        <SignButton type="submit" label="Delete everything" disabled={typed.trim().toLowerCase() !== 'delete'} />
        <SignButton label="Keep it" kind="secondary" onclick={() => ((confirming = false), (typed = ''))} />
      </form>
    {/if}
    {#if done}<p class="done" role="status">{done}</p>{/if}
  </section>
    <Move />
  </div>
</div>

<style>
  input {
    inline-size: 140px; box-sizing: border-box; block-size: 40px; padding: 0 10px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 500 16px/20px var(--font-family-ui);
  }
  input:focus-visible { outline: none; border: 4px solid var(--color-border-strong); padding: 0 8px; }
  .done { margin: 12px 0 0; font: 600 14px/20px var(--font-family-ui); }
</style>
