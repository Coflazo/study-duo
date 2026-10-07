<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { formatClock } from '@/core/format';
  import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
  import { settingsItem, timerItem } from '@/core/store';
  import { displayMs, initialState, type TimerEvent } from '@/core/timer';

  const LABELS = { focus: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' } as const;

  let timer = $state(initialState());
  let settings = $state(DEFAULT_SETTINGS);
  let now = $state(Date.now());

  const shown = $derived(displayMs(timer, settings, now));
  const send = (event: TimerEvent) => browser.runtime.sendMessage({ kind: 'timer', event });

  let ticker: ReturnType<typeof setInterval> | undefined;
  const unwatch: Array<() => void> = [];

  onMount(async () => {
    timer = await timerItem.getValue();
    settings = normalizeSettings(await settingsItem.getValue());
    unwatch.push(timerItem.watch((v) => (timer = v ?? initialState())));
    unwatch.push(settingsItem.watch((v) => (settings = normalizeSettings(v))));
    ticker = setInterval(() => {
      now = Date.now();
      if (timer.status === 'running' && timer.endsAt !== null && now >= timer.endsAt) void send({ type: 'tick' });
    }, 250);
  });

  onDestroy(() => {
    clearInterval(ticker);
    unwatch.forEach((u) => u());
  });
</script>

<main>
  <p>{LABELS[timer.phase]}{timer.status === 'paused' ? ' (paused)' : ''}</p>
  <p role="timer" aria-live="off">{formatClock(shown.ms, shown.countsUp)}</p>
  <div>
    {#if timer.status === 'stopped'}
      <button onclick={() => send({ type: 'start' })}>Start</button>
    {:else if timer.status === 'running'}
      <button onclick={() => send({ type: 'pause' })}>Pause</button>
    {:else}
      <button onclick={() => send({ type: 'resume' })}>Resume</button>
    {/if}
    {#if timer.status !== 'stopped' && timer.plannedMs !== null}
      <button onclick={() => send({ type: 'extend', ms: 5 * 60_000 })}>+5 min</button>
    {/if}
    {#if timer.plannedMs === null && timer.status !== 'stopped'}
      <button onclick={() => send({ type: 'finish' })}>Finish</button>
    {/if}
    <button onclick={() => send({ type: 'skip' })}>Skip</button>
    <button onclick={() => send({ type: 'reset' })}>Reset</button>
  </div>
</main>
