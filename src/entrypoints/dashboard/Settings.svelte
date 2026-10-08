<script lang="ts">
  import { playBell } from '@/core/bell';
  import { CORNER_POS, normalizeSettings, type Appearance, type DiscMotion, type OverlayCorner, type OverlayIdle, type TimerMode, type TimerSettings } from '@/core/settings';
  import { cornerOf } from '@/overlay/position';
  import { settingsItem } from '@/core/store';
  import type { createLive } from '@/ui/live.svelte';
  import NumberField from '@/ui/NumberField.svelte';
  import Segmented from '@/ui/Segmented.svelte';
  import Toggle from '@/ui/Toggle.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const s = $derived(data.live.settings);

  /** Every change goes through normalizeSettings, the same gate as stored or imported settings. */
  const save = async (patch: Partial<TimerSettings>) => settingsItem.setValue(normalizeSettings({ ...(await settingsItem.getValue()), ...patch }));

  const MODES: Array<[TimerMode, string]> = [['pomodoro', 'Pomodoro'], ['flowtime', 'Flowtime']];
  const CORNERS: Array<[OverlayCorner, string]> = [['top-right', 'Top right'], ['bottom-right', 'Bottom right']];
  const LOOKS: Array<[Appearance, string]> = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
  const DISC: Array<[DiscMotion, string]> = [['system', 'Follow the computer'], ['always', 'Always']];
  const IDLE: Array<[OverlayIdle, string]> = [['faint', 'Faint'], ['soft', 'Soft'], ['full', 'Full']];

  let audio: AudioContext | undefined;
  async function previewBell() {
    audio ??= new AudioContext();
    await audio.resume();
    playBell(audio, 'focusStart', s.bellVolume, audio.currentTime);
  }
</script>

<h1 class="screen-title">Settings</h1>

<div class="columns">
  <section aria-labelledby="timer-title">
    <h2 class="section-title" id="timer-title">Timer</h2>
    <div class="row">
      <div class="text"><p class="label">Mode</p><p class="help">Flowtime counts up and gives a break a fifth as long.</p></div>
      <Segmented options={MODES} value={s.mode} label="Mode" onchange={(mode) => save({ mode })} />
    </div>
    {#each [
      ['focusMin', 'Study block', 1, 180, 'min', 'minutes'],
      ['shortBreakMin', 'Short break', 1, 60, 'min', 'minutes'],
      ['longBreakMin', 'Long break', 1, 120, 'min', 'minutes'],
      ['longBreakEvery', 'Long break after', 1, 12, 'blocks', 'blocks'],
      ['dailyGoal', 'Daily goal', 1, 24, 'blocks', 'blocks'],
    ] as const as [key, label, min, max, unit, word] (key)}
      <div class="row">
        <label class="text label" for="f-{key}">{label}</label>
        <NumberField id="f-{key}" value={s[key]} {min} {max} {unit} {word} onsave={(v) => save({ [key]: v })} />
      </div>
    {/each}
    <div class="row">
      <div class="text"><p class="label">Start breaks on their own</p></div>
      <Toggle checked={s.autoStartBreaks} label="Start breaks on their own" onchange={(autoStartBreaks) => save({ autoStartBreaks })} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Start study blocks on their own</p><p class="help">Off by default, so you choose when to go back.</p></div>
      <Toggle checked={s.autoStartFocus} label="Start study blocks on their own" onchange={(autoStartFocus) => save({ autoStartFocus })} />
    </div>
  </section>

  <section aria-labelledby="bell-title">
    <h2 class="section-title" id="bell-title">Bell and clock</h2>
    <div class="row">
      <label class="text label" for="f-bell">Bell volume</label>
      <NumberField id="f-bell" value={Math.round(s.bellVolume * 100)} min={0} max={100} unit="%" word="percent" onsave={(v) => save({ bellVolume: v / 100 })} />
      <button class="play" onclick={previewBell}>Play the bell</button>
    </div>
    <div class="row">
      <div class="text"><p class="label">Clock in the corner of every page</p><p class="help">Fades out until your mouse comes near.</p></div>
      <Toggle checked={s.overlayEnabled} label="Clock in the corner of every page" onchange={(overlayEnabled) => save({ overlayEnabled })} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Clock position</p><p class="help">Drag the clock on any page to move it; every tab follows. These put it back in a corner.</p></div>
      <Segmented options={CORNERS} value={cornerOf(s.overlayPos)} label="Clock position" onchange={(corner) => save({ overlayPos: CORNER_POS[corner] })} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Clock when your mouse is away</p><p class="help">Faint is barely there, Soft stays readable, Full never fades. It always lights up when your mouse comes near.</p></div>
      <Segmented options={IDLE} value={s.overlayIdle} label="Clock when your mouse is away" onchange={(overlayIdle) => save({ overlayIdle })} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Appearance</p><p class="help">System follows your computer. The corner clock stays dark either way.</p></div>
      <Segmented options={LOOKS} value={s.appearance} label="Appearance" onchange={(appearance) => save({ appearance })} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Spinning disc</p><p class="help">The player's disc turns while music plays. If your computer is set to reduce motion, it stays still unless you choose Always.</p></div>
      <Segmented options={DISC} value={s.discMotion} label="Spinning disc" onchange={(discMotion) => save({ discMotion })} />
    </div>
  </section>

  <section aria-labelledby="calendar-title">
    <h2 class="section-title" id="calendar-title">Calendar</h2>
    <div class="row">
      <div class="text"><p class="label">List songs in calendar events</p><p class="help">Exported events show the task and your focus rating; this adds the songs that played.</p></div>
      <Toggle checked={s.calendarSongs} label="List songs in calendar events" onchange={(calendarSongs) => save({ calendarSongs })} />
    </div>
  </section>
</div>

<style>
  .play {
    padding: 6px 10px; border: 1px solid var(--color-border-control); border-radius: 2px; background: none; color: var(--color-text-primary);
    font: 600 12px/16px var(--font-family-ui); cursor: pointer;
  }
  .play:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
