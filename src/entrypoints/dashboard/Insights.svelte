<script lang="ts">
  /** Figma Dashboard / Insights (16:572): best hours, music and focus, what to try next, and how sure the model is. */
  import { onMount } from 'svelte';
  import { recordsBetween } from '@/core/log';
  import { sessionsBetween } from '@/core/sessions';
  import { computeInsights, NEED, type Insights } from '@/ml/insights';
  import { BINS, DAYS, FIRST_HOUR } from '@/ml/features';
  import type { createLive } from '@/ui/live.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  let insights = $state<Insights | null>(null);
  let failed = $state(false);

  onMount(async () => {
    try {
      const now = Date.now() + 1;
      const [sessions, listens, activity, blocks] = await Promise.all([
        sessionsBetween(0, now), recordsBetween('listens', 0, now), recordsBetween('activity', 0, now), recordsBetween('blocks', 0, now),
      ]);
      await new Promise((r) => setTimeout(r, 0)); // paint the heading first; a year of blocks takes about half a second
      insights = computeInsights({ sessions, listens, activity, blocks, measure: data.live.settings.measure });
    } catch (e) {
      console.error(e);
      failed = true;
    }
  });

  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const LABELED = [1, 4, 7, 10, 13, 16]; // 07, 10, 13, 16, 19, 22 as in Figma
  /** Five steps of brightness across the cells that have enough data (the legend's Less to More focus). */
  const levels = $derived.by(() => {
    const shown = insights?.cells.filter((c) => c.enough).map((c) => c.rating) ?? [];
    const lo = Math.min(...shown);
    const hi = Math.max(...shown);
    return (rating: number) => (hi - lo < 1e-9 ? 2 : Math.min(4, Math.floor(((rating - lo) / (hi - lo)) * 5)));
  });
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
  /** Position on a scale from -1.2 to +1.2 rating points, as a percentage of the bar. */
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v + 1.2) / 2.4) * 100))}%`;
</script>

<header class="head">
  <h1 class="screen-title">Your best hours</h1>
  <p class="sub">
    {#if insights && !insights.learning}
      From {insights.blocks} study blocks, rated{insights.index.ready ? ' or filled in by your focus signals' : ''}. Small dots mean not enough data yet.
    {:else}
      Study Duo learns from your study blocks and how focused you felt. Nothing leaves this computer.
    {/if}
  </p>
</header>

{#if failed}
  <p class="sub" role="alert">The insights could not be worked out this time. Your data is safe; try again later.</p>
{:else if !insights}
  <p class="sub" aria-live="polite">Working it out…</p>
{:else}
  {#if insights.learning}
    <p class="learning" role="status">Insights start after {NEED} study blocks. {insights.learning.have} of {NEED} so far.</p>
  {/if}
  <div class="columns">
    <section aria-labelledby="map-title">
      <h2 class="section-title" id="map-title">Focus by hour</h2>
      <div class="board" role="img" aria-label="Expected focus by day and hour. {insights.windows.filter((w) => 'from' in w).map((w) => ('from' in w ? `${w.label}: ${hh(w.from)} to ${hh(w.to)}` : '')).join('. ') || 'No best hours yet.'}">
        <div class="hours" aria-hidden="true">
          <span></span>
          {#each Array.from({ length: BINS }, (_, b) => b) as b (b)}<span>{LABELED.includes(b) ? String(FIRST_HOUR + b).padStart(2, '0') : ''}</span>{/each}
        </div>
        {#each DAYS as day, d (day)}
          <div class="dayrow" class:gap={d === 5} aria-hidden="true">
            <span class="day">{day}</span>
            {#each insights.cells.filter((c) => c.day === d) as c (c.bin)}
              {#if c.enough}<span class="cell" data-level={levels(c.rating)} title="{day} {hh(FIRST_HOUR + c.bin)}: about {c.rating.toFixed(1)} of 5"></span>{:else}<span class="dot" title="{day} {hh(FIRST_HOUR + c.bin)}: not enough data yet"></span>{/if}
            {/each}
          </div>
        {/each}
        <div class="legend" aria-hidden="true">
          <span>Less focus</span>
          {#each [0, 1, 2, 3, 4] as l (l)}<span class="cell" data-level={l}></span>{/each}
          <span>More focus</span>
          <span class="dot"></span><span>Not enough data yet</span>
        </div>
      </div>
      <p class="note">Monday to Friday learn from each other, and so do Saturday and Sunday.</p>

      <div class="below">
        <section aria-labelledby="next-title">
          <h2 class="section-title" id="next-title">Try next</h2>
          <div class="row"><div class="text"><p class="label">Sound</p></div><p class="value">{insights.tryNext ?? 'After a few more blocks'}</p></div>
          <div class="row"><div class="text"><p class="label">Block length</p></div><p class="value">{insights.blockLength ? `${insights.blockLength} minutes for a week` : 'After a few more blocks'}</p></div>
        </section>
        <section aria-labelledby="sure-title">
          <h2 class="section-title" id="sure-title">How sure</h2>
          {#if insights.health}
            <div class="row"><div class="text"><p class="label">Predicts your ratings</p></div><p class="value">within {insights.health.modelMae.toFixed(1)} points</p></div>
            <div class="row"><div class="text"><p class="label">A plain average</p></div><p class="value">misses by {insights.health.baselineMae.toFixed(1)}</p></div>
          {:else}
            <div class="row"><div class="text"><p class="label">Accuracy</p><p class="help">Checked once there are 30 rated blocks.</p></div></div>
          {/if}
          <div class="row">
            <div class="text"><p class="label">Focus signals</p><p class="help">{insights.index.ready ? `Fill in blocks you skip (learned from ${insights.index.rated} rated blocks).` : insights.index.rated < 15 ? `Learning from your ratings: ${insights.index.rated} of 15 rated blocks.` : 'Not close enough to your ratings yet, so every block asks for one.'}</p></div>
          </div>
        </section>
      </div>
    </section>

    <div class="side">
      <section aria-labelledby="windows-title">
        <h2 class="section-title" id="windows-title">Best windows</h2>
        {#each insights.windows as w (w.label)}
          <div class="row">
            <div class="text"><p class="label">{w.label}</p></div>
            {#if 'from' in w}
              <p class="value mono">{hh(w.from)} to {hh(w.to)}</p><p class="help">{w.rating.toFixed(1)} of 5</p>
            {:else if 'learning' in w}
              <p class="value mono">Learning</p><p class="help">{w.learning.have} of {w.learning.need} blocks</p>
            {:else}
              <p class="value">No clear best time</p>
            {/if}
          </div>
        {:else}
          <div class="row"><div class="text"><p class="help">Best windows show once a few weeks of blocks are in.</p></div></div>
        {/each}
      </section>

      <section aria-labelledby="music-title">
        <h2 class="section-title" id="music-title">Music and focus</h2>
        <p class="help intro">Change in focus rating compared with silence. Bars show the likely range.</p>
        {#each insights.music as m (m.name)}
          <div class="row music" class:unclear={!m.claim}>
            <div class="text"><p class="label">{m.name}</p><p class="help">{m.detail}</p></div>
            <span class="range" aria-hidden="true">
              <span class="zero"></span>
              <span class="span" style="inset-inline-start: {at(m.lo)}; inset-inline-end: calc(100% - {at(m.hi)})"></span>
              <span class="point" style="inset-inline-start: {at(m.delta)}"></span>
            </span>
            <p class="value mono" aria-label="{m.claim ? `${signed(m.delta)} points` : 'unclear'}">{m.claim ? signed(m.delta) : 'unclear'}</p>
          </div>
        {:else}
          <div class="row"><div class="text"><p class="help">Songs show here after they have played in a few blocks.</p></div></div>
        {/each}
      </section>
    </div>
  </div>
{/if}

<style>
  .head .screen-title { margin-block-end: 4px; }
  .sub, .learning { margin: 0 0 24px; font: 400 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .learning { color: var(--color-text-primary); font-weight: 600; }
  .columns { grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); }
  @media (max-width: 1100px) { .columns { grid-template-columns: minmax(0, 1fr); } }
  .board {
    display: flex; flex-direction: column; gap: 4px; padding: 16px; overflow-x: auto; border-radius: var(--radius-md);
    background: var(--color-bg-board); color: var(--color-text-led); font: 600 11px/14px var(--font-family-ui);
  }
  .hours, .dayrow { display: grid; grid-template-columns: 36px repeat(17, minmax(14px, 1fr)); gap: 5px; align-items: center; min-inline-size: 420px; }
  .hours span { text-align: center; font-family: var(--font-family-mono); }
  .dayrow.gap { margin-block-start: 12px; }
  .day { font-weight: 700; }
  .cell { display: block; aspect-ratio: 1; border-radius: 2px; background: var(--color-text-led); }
  .cell[data-level='0'] { opacity: 0.15; }
  .cell[data-level='1'] { opacity: 0.35; }
  .cell[data-level='2'] { opacity: 0.55; }
  .cell[data-level='3'] { opacity: 0.78; }
  .cell[data-level='4'] { opacity: 1; }
  .dot { justify-self: center; inline-size: 6px; block-size: 6px; border-radius: 50%; background: var(--color-text-led); opacity: 0.45; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block-start: 12px; }
  .legend .cell { inline-size: 18px; }
  .note { margin: 8px 0 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .below { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 24px 32px; margin-block-start: 24px; }
  .side { display: flex; flex-direction: column; gap: 24px; }
  .value { margin: 0; font: 500 14px/20px var(--font-family-ui); }
  .mono { font-family: var(--font-family-mono); }
  .intro { margin: 0 0 4px; }
  .row.music { display: grid; grid-template-columns: minmax(0, 1fr) 120px 64px; flex-wrap: nowrap; }
  .music .value { text-align: end; }
  .music .range { position: relative; block-size: 12px; }
  .music .zero { position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 1px; background: var(--color-border-strong); }
  .music .span { position: absolute; inset-block-start: 4px; block-size: 4px; border-radius: 2px; background: var(--color-text-primary); opacity: 0.45; }
  .music .point { position: absolute; inset-block-start: 2px; inline-size: 8px; block-size: 8px; margin-inline-start: -4px; border-radius: 50%; background: var(--color-text-primary); }
  .music.unclear .label, .music.unclear .value { color: var(--color-text-secondary); }
  .music.unclear .span, .music.unclear .point { background: var(--color-text-secondary); }
</style>
