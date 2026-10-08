<script lang="ts">
  /** Figma Dashboard / Music: songs in your tabs, focus sounds, your own files, today's listens. */
  import { onDestroy, onMount } from 'svelte';
  import type { ListenRecord } from '@/core/db';
  import { addRecords, recordsBetween } from '@/core/log';
  import { foldListen, type OpenListen } from '@/core/music';
  import { NOISES, type NoiseKind } from '@/core/noise';
  import { localDayRange, sessionId } from '@/core/sessions';
  import { listeningItem, soundItem } from '@/core/store';
  import { readTags, tagsOrName, type Tags } from '@/core/tags';
  import { clockTime } from '@/core/today-view';
  import type { createLive } from '@/ui/live.svelte';
  import NumberField from '@/ui/NumberField.svelte';
  import Segmented from '@/ui/Segmented.svelte';
  import SignButton from '@/ui/SignButton.svelte';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const live = $derived(data.live);

  const NOISE_NAMES: Array<[NoiseKind, string]> = [['white', 'White'], ['pink', 'Pink'], ['brown', 'Brown']];
  let tabs = $state<OpenListen[]>([]);
  let sound = $state<{ noise: NoiseKind; volume: number } | null>(null);
  let noise = $state<NoiseKind>('brown');
  let volume = $state(40);
  let today = $state<ListenRecord[]>([]);

  const unwatch: Array<() => void> = [];
  onMount(async () => {
    unwatch.push(listeningItem.watch((v) => (tabs = Object.values(v ?? {}))), soundItem.watch((v) => (sound = v)));
    tabs = Object.values(await listeningItem.getValue());
    sound = await soundItem.getValue();
    if (sound) [noise, volume] = [sound.noise, Math.round(sound.volume * 100)];
    await loadToday();
  });
  onDestroy(() => {
    unwatch.forEach((u) => u());
    stopFile();
  });

  async function loadToday() {
    const [from, to] = localDayRange(Date.now());
    today = (await recordsBetween('listens', from, to).catch(() => [])).slice(-20);
  }

  const sendSound = (cmd: object) => browser.runtime.sendMessage({ kind: 'sound', ...cmd }).then(() => setTimeout(loadToday, 300));
  const play = () => sendSound({ op: 'play', noise, volume: volume / 100 });
  const pickNoise = (n: NoiseKind) => {
    noise = n;
    if (sound) void play();
  };
  const setVolume = (v: number) => {
    volume = v;
    if (sound) void sendSound({ op: 'volume', volume: v / 100 });
  };

  // Your own files: picked for this visit, played here, never copied anywhere.
  let input: HTMLInputElement;
  let queue = $state<Array<{ file: File; tags: Tags }>>([]);
  let index = $state(0);
  let playing = $state(false);
  const audio = new Audio();
  let url: string | null = null;
  let open: OpenListen | null = null;

  function current() {
    const t = live.timer;
    return t.status !== 'stopped' && t.startedAt !== null ? sessionId({ phase: t.phase, startedAt: t.startedAt }) : null;
  }
  function log(isPlaying: boolean) {
    const item = queue[index];
    const r = foldListen(open, item ? { ...item.tags, playing: isPlaying } : null, Date.now(), 'file', current());
    open = r.open;
    // Kept only if it played while the timer ran, like songs in tabs.
    if (r.closed && live.settings.measure.music && (r.closed.sessionId !== null || current() !== null)) void addRecords('listens', [{ ...r.closed, genre: queue.find((q) => q.tags.title === r.closed!.title)?.tags.genre || undefined }]).then(loadToday);
  }
  audio.addEventListener('play', () => ((playing = true), log(true)));
  audio.addEventListener('pause', () => ((playing = false), log(false)));
  audio.addEventListener('ended', () => next());
  // Closing the dashboard mid-song still saves what played.
  window.addEventListener('pagehide', () => playing && log(false));

  async function choose() {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    queue = await Promise.all(files.map(async (file) => ({ file, tags: tagsOrName(readTags(await file.slice(0, 1 << 19).arrayBuffer()), file.name) })));
    start(0);
    input.value = '';
  }
  function start(i: number) {
    if (url) URL.revokeObjectURL(url);
    index = i;
    url = URL.createObjectURL(queue[i]!.file);
    audio.src = url;
    void audio.play().catch(() => (playing = false));
  }
  function next() {
    log(false);
    if (index + 1 < queue.length) start(index + 1);
    else playing = false;
  }
  function stopFile() {
    audio.pause();
    if (url) URL.revokeObjectURL(url);
  }
  const where = (l: ListenRecord) => (l.host === 'sound' ? 'Focus sound' : l.host === 'file' ? 'Your file' : l.host);
  const during = (l: ListenRecord) => (l.sessionId === null ? '' : l.sessionId.endsWith('-focus') ? ' · Study block' : ' · Break');
</script>

<h1 class="screen-title">Music</h1>

<div class="columns">
  <div>
    <section aria-labelledby="now-title">
      <h2 class="section-title" id="now-title">Now playing</h2>
      {#each tabs as t (t.host + t.startedAt)}
        <div class="row"><div class="text"><p class="label">{t.title}</p><p class="help">{[t.artist, t.album, t.host].filter(Boolean).join(' · ')}</p></div></div>
      {:else}
        <div class="row"><div class="text"><p class="label">Nothing is playing in your tabs</p></div></div>
      {/each}
      <div class="row"><div class="text"><p class="label">How this works</p><p class="help">Study Duo notices songs on YouTube Music, Spotify, Apple Music, SoundCloud and other music sites, from what the site tells your browser. It keeps the title, artist and album, never the address, and only while the timer runs. Spotify's web player is shown here but never used for your insights, as Spotify's rules ask.</p></div></div>
    </section>

    <section aria-labelledby="sounds-title">
      <h2 class="section-title" id="sounds-title">Focus sounds</h2>
      <div class="row">
        <div class="text"><p class="label">Sound</p><p class="help">Generated here, no files. It keeps playing with every Study Duo page closed.</p></div>
        <Segmented options={NOISE_NAMES} value={noise} label="Sound" onchange={pickNoise} />
      </div>
      <div class="row">
        <div class="text"><label class="label" for="noise-volume">Volume</label></div>
        <NumberField id="noise-volume" value={volume} min={0} max={100} unit="%" word="percent" onsave={setVolume} />
      </div>
      <div class="row">
        <div class="text"><p class="label" aria-live="polite">{sound ? `${NOISE_NAMES.find(([k]) => k === sound!.noise)?.[1]} noise is playing` : 'Silence'}</p></div>
        {#if sound}<SignButton label="Stop" kind="secondary" onclick={() => sendSound({ op: 'stop' })} />{:else}<SignButton label="Play" kind="secondary" onclick={play} />{/if}
      </div>
    </section>
  </div>

  <div>
    <section aria-labelledby="files-title">
      <h2 class="section-title" id="files-title">Your files</h2>
      <div class="row">
        <div class="text"><p class="label">Songs on this computer</p><p class="help">Pick MP3 or FLAC files. They play here and never leave this computer.</p></div>
        <input bind:this={input} type="file" multiple accept=".mp3,.flac,.m4a,.ogg,.wav,audio/*" hidden onchange={choose} />
        <SignButton label="Choose files" kind="secondary" onclick={() => input.click()} />
      </div>
      {#each queue as q, i (i)}
        <div class="row"><div class="text"><p class="label">{q.tags.title}</p><p class="help">{[q.tags.artist, i === index && playing ? 'playing' : ''].filter(Boolean).join(' · ')}</p></div></div>
      {/each}
      {#if queue.length}
        <div class="row">
          <div class="text"><p class="label">{queue.length} {queue.length === 1 ? 'song' : 'songs'}</p></div>
          {#if playing}<SignButton label="Pause" kind="secondary" onclick={() => audio.pause()} />{:else}<SignButton label="Play" kind="secondary" onclick={() => void audio.play()} />{/if}
          <SignButton label="Next" kind="secondary" disabled={index + 1 >= queue.length} onclick={next} />
        </div>
      {/if}
    </section>

    <section aria-labelledby="listens-title">
      <h2 class="section-title" id="listens-title">Today's listens</h2>
      {#each today as l (l.id)}
        <div class="row"><div class="text"><p class="label"><span class="mono">{clockTime(l.startedAt)}</span> {l.title}</p><p class="help">{[l.artist, where(l)].filter(Boolean).join(' · ')}{during(l)}</p></div></div>
      {:else}
        <div class="row"><div class="text"><p class="help">Songs and focus sounds you play today show up here.</p></div></div>
      {/each}
    </section>
  </div>
</div>

<style>
  section + section { margin-block-start: 32px; }
  .mono { font-family: var(--font-family-mono); margin-inline-end: 6px; }
</style>
