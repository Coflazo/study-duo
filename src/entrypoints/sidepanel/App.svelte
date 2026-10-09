<script lang="ts">
  /**
   * Chrome's side panel: the full player (Figma "Screens: Player (approved)", Side panel). Now playing with what comes
   * next, and the music folder's library. It drives the same player as the popup card.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { loadFolder, loadThumb, onLibraryChange, type FolderRecord } from '@/core/library-db';
  import type { NoiseKind } from '@/core/noise';
  import { INITIAL_PLAYER, isStream, positionAt, streamAt, type PlayerCommand, type PlayerState, type PlayerTrack, type StreamSource } from '@/core/player';
  import type { Repeat } from '@/core/queue';
  import { panelOwnerItem, panelSectionItem, playerItem, playerTracksItem } from '@/core/session-store';
  import { forgetLink, nameLink, rememberLink, streamLinksItem, type SavedLink } from '@/core/stream-links';
  import { CAPS } from '@/core/embed-protocols';
  import { parseStreamLink } from '@/core/stream-links-parse';
  import { parseYouTubeLink } from '@/core/youtube';
  import { normalizeSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { clip } from '@/core/text';
  import FolderLibrary from '@/ui/FolderLibrary.svelte';
  import { ICONS } from '@/ui/icons';
  import Segmented from '@/ui/Segmented.svelte';
  import SeekLine from '@/ui/SeekLine.svelte';
  import SleeveArt from '@/ui/SleeveArt.svelte';
  import SourceMenu, { type SourcePick } from '@/ui/SourceMenu.svelte';
  import StreamFrame from '@/ui/StreamFrame.svelte';
  import { LOGOS, serviceOf } from '@/ui/logos';

  const NOISE: Record<NoiseKind, { name: string; title: string; sleeve: string; c: [string, string]; ink: string; ring: string; mark: string; tint: string; chip: string; chipInk: string }> = {
    white: { name: 'White', title: 'White noise', sleeve: 'WHITE\nNOISE', c: ['#FFFFFF', '#CDD1D5'], ink: '#17191C', ring: 'rgb(23 25 28 / 0.3)', mark: 'rgb(23 25 28 / 0.55)', tint: '#9AA3AD', chip: '#FFFFFF', chipInk: '#17191C' },
    pink: { name: 'Pink', title: 'Pink noise', sleeve: 'PINK\nNOISE', c: ['#F7C9D4', '#E28AA1'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#E28AA1', chip: '#F3C9D3', chipInk: '#17191C' },
    brown: { name: 'Brown', title: 'Brown noise', sleeve: 'BROWN\nNOISE', c: ['#A27757', '#5A3A28'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#8B6448', chip: '#8B6448', chipInk: '#FFFFFF' },
  };
  const KINDS: NoiseKind[] = ['white', 'pink', 'brown'];
  const NO_COVER = '#5876C2';
  type Section = 'now' | 'library' | 'streaming' | 'tabs';
  const SECTIONS: Array<[Section, string]> = [['now', 'Now playing'], ['library', 'Library'], ['streaming', 'Streaming'], ['tabs', 'Tabs']];
  const LINK_PROBLEM = {
    unknown: 'Study Duo plays links from YouTube, Spotify, SoundCloud, Apple Music and Tidal.',
    'short-link': 'Open the short link once, then copy the full address from the address bar.',
    'no-video': 'That link has no video or playlist in it.',
    'private-list': 'Watch later and Liked videos are private: only YouTube can play them.',
  } as const;
  const SERVICES: Record<StreamSource, { name: string; logo: { color: string; path: string }; account: string; signIn: string | null }> = {
    youtube: { name: 'YouTube', logo: LOGOS.youtube, account: 'Any public link, no account', signIn: null },
    spotify: { name: 'Spotify', logo: LOGOS.spotify, account: 'Premium: full songs once you sign in', signIn: 'https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F' },
    apple: { name: 'Apple Music', logo: LOGOS.apple, account: 'Signs in in its own small window', signIn: 'https://music.apple.com/' },
    soundcloud: { name: 'SoundCloud', logo: LOGOS.soundcloud, account: 'Public tracks need no account', signIn: null },
    tidal: { name: 'Tidal', logo: LOGOS.tidal, account: 'Signs in in its own small window', signIn: 'https://listen.tidal.com/login' },
  };
  const ACCOUNTS: StreamSource[] = ['spotify', 'apple', 'tidal', 'soundcloud', 'youtube'];
  /** A link whose service sends no title: "Spotify playlist", "Apple Music album". */
  function linkName(url: string): string {
    const p = parseStreamLink(url);
    return p.ok ? `${SERVICES[p.link.source].name} ${p.link.kind}` : url;
  }
  /** Signs in on the service's own site, in a small window: the panel's player then plays full songs. */
  function signIn(s: StreamSource) {
    const url = SERVICES[s].signIn;
    if (url) void browser.windows.create({ url, type: 'popup', width: 480, height: 720 }).catch(() => undefined);
  }
  /** Phosphor Bold on a 256 grid: shuffle, repeat, speaker-high. */
  const SHUFFLE = 'M240.49,175.51a12,12,0,0,1,0,17l-24,24a12,12,0,0,1-17-17L203,196h-2.09a76.17,76.17,0,0,1-61.85-31.83L97.38,105.78A52.1,52.1,0,0,0,55.06,84H32a12,12,0,0,1,0-24H55.06a76.17,76.17,0,0,1,61.85,31.83l41.71,58.39A52.1,52.1,0,0,0,200.94,172H203l-3.52-3.51a12,12,0,0,1,17-17Zm-95.62-72.62a12,12,0,0,0,16.93-1.13A52,52,0,0,1,200.94,84H203l-3.52,3.51a12,12,0,0,0,17,17l24-24a12,12,0,0,0,0-17l-24-24a12,12,0,0,0-17,17L203,60h-2.09a76,76,0,0,0-57.2,26A12,12,0,0,0,144.87,102.89Zm-33.74,50.22a12,12,0,0,0-16.93,1.13A52,52,0,0,1,55.06,172H32a12,12,0,0,0,0,24H55.06a76,76,0,0,0,57.2-26A12,12,0,0,0,111.13,153.11Z';
  const REPEAT = 'M20,128A76.08,76.08,0,0,1,96,52h99l-3.52-3.51a12,12,0,1,1,17-17l24,24a12,12,0,0,1,0,17l-24,24a12,12,0,0,1-17-17L195,76H96a52.06,52.06,0,0,0-52,52,12,12,0,0,1-24,0Zm204-12a12,12,0,0,0-12,12,52.06,52.06,0,0,1-52,52H61l3.52-3.51a12,12,0,1,0-17-17l-24,24a12,12,0,0,0,0,17l24,24a12,12,0,1,0,17-17L61,204h99a76.08,76.08,0,0,0,76-76A12,12,0,0,0,224,116Z';
  const SPEAKER = 'M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z';
  const NEXT_REPEAT: Record<Repeat, Repeat> = { off: 'all', all: 'one', one: 'off' };
  const REPEAT_LABEL: Record<Repeat, string> = { off: 'Repeat: off', all: 'Repeat: all songs', one: 'Repeat: this song' };

  let section = $state<Section>('now');
  let links = $state<SavedLink[]>([]);
  let pasted = $state('');
  let linkProblem = $state('');
  let player = $state<PlayerState>(INITIAL_PLAYER);
  let tracks = $state<Record<string, PlayerTrack>>({});
  let folder = $state<FolderRecord | null>(null);
  let always = $state(false);
  let now = $state(Date.now());
  let loaded = $state(false);
  let cover = $state<string | null>(null);

  const view = $derived<'noise' | 'folder' | 'tab' | StreamSource>(player.active === 'folder' || player.active === 'tab' || isStream(player.active) ? player.active : 'noise');
  const streamView = $derived(isStream(view) ? view : null);
  const caps = $derived(streamView ? CAPS[streamView] : CAPS.apple);
  const tabMusic = $derived(view === 'tab' ? (player.tabs.find((t) => t.tabId === player.tab) ?? null) : null);
  const label = $derived(view === 'folder' ? 'FOLDER' : streamView ? SERVICES[streamView].name.toUpperCase() : view === 'tab' ? 'TAB' : 'SOUNDS');
  const stream = $derived(streamView && player.stream?.source === streamView ? player.stream : null);
  const ytList = $derived.by(() => {
    const p = stream?.source === 'youtube' ? parseYouTubeLink(stream.url) : null;
    return !!(p?.ok && p.link.list);
  });
  const noise = $derived(NOISE[player.noise]);
  const track = $derived(view === 'folder' ? player.now : null);
  const playing = $derived(player.playing && (view === 'noise' ? player.active === 'noise' || player.active === null : player.active === view));
  const duration = $derived(player.duration ?? 0);
  const position = $derived(positionAt(player, now));
  const repeat = $derived<Repeat>(player.queue?.repeat ?? 'off');
  /** The next songs in play order, with their place in the queue, for Up next. */
  const upNext = $derived.by(() => {
    const q = player.queue;
    if (!q) return [];
    const out: { at: number; track: PlayerTrack }[] = [];
    for (let at = q.at + 1; at < q.order.length && out.length < 20; at++) {
      const t = tracks[q.items[q.order[at]!]!];
      if (t) out.push({ at, track: t });
    }
    return out;
  });
  const art = $derived(
    view === 'noise'
      ? { kind: 'noise' as const, c: noise.c, ring: noise.ring, mark: noise.mark, sleeve: noise.sleeve, ink: noise.ink }
      : view === 'tab' && tabMusic
        ? (() => {
            const s = serviceOf(tabMusic.host);
            return { kind: 'cd' as const, color: s.color, cover: null, sleeve: s.name.toUpperCase(), logo: { path: s.path, grid: s.grid } };
          })()
      : track
        ? { kind: 'cd' as const, color: track.color ?? NO_COVER, cover, sleeve: [track.artist, track.album].filter(Boolean).join('\n').toUpperCase() || 'YOUR\nFOLDER' }
        : { kind: 'empty' as const, sleeve: streamView ? 'PASTE A\nLINK' : view === 'tab' ? 'MUSIC IN\nA TAB' : folder ? 'YOUR\nFOLDER' : 'CHOOSE A\nFOLDER' },
  );
  const streamPosition = $derived(stream ? streamAt(player, now) : 0);

  function pick(p: SourcePick) {
    if ('tab' in p) return void send({ op: 'tab', tabId: p.tab, action: 'pick' });
    // No link yet: show where to paste one, and let what plays keep playing.
    if (isStream(p.source) && player.stream?.source !== p.source) {
      section = 'streaming';
      // The source button is gone with Now playing: keep the keyboard in the place to paste.
      void tick().then(() => document.getElementById('stream-link')?.focus());
      return;
    }
    if (p.source !== player.active) void send({ op: 'source', source: p.source });
  }

  function playLink(e: SubmitEvent) {
    e.preventDefault();
    const parsed = parseStreamLink(pasted);
    if (!parsed.ok) return void (linkProblem = LINK_PROBLEM[parsed.reason]);
    linkProblem = '';
    pasted = '';
    playSaved(parsed.link.url);
  }
  function playSaved(url: string) {
    const p = parseStreamLink(url);
    if (!p.ok) return;
    const { source, start } = p.link;
    void streamLinksItem.setValue(rememberLink($state.snapshot(links), { source, url }, Date.now()));
    void panelOwnerItem.setValue(me);
    void send({ op: 'stream', source, url, ...(start ? { at: start * 1000 } : {}) });
    section = 'now';
  }

  const send = (cmd: PlayerCommand) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);
  async function reconnect() {
    const h = folder?.handle as (FileSystemDirectoryHandle & { requestPermission?(d: { mode: 'read' }): Promise<PermissionState> }) | undefined;
    if (h?.requestPermission && (await h.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted') void send({ op: 'play' });
  }

  $effect(() => {
    if (!(playing && view !== 'noise')) return;
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });
  const coverId = $derived(track?.cover ? track.id : null);
  $effect(() => {
    const id = coverId;
    let url: string | null = null;
    let gone = false;
    cover = null;
    if (id) void loadThumb(id).then((b) => !gone && b && (cover = url = URL.createObjectURL(b))).catch(() => undefined);
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  });
  $effect(() => {
    const body = document.body;
    body.style.transition = 'background-color 600ms ease';
    body.style.backgroundColor = playing ? `color-mix(in oklab, var(--color-bg-canvas) 88%, ${view === 'folder' ? (track?.color ?? NO_COVER) : streamView ? SERVICES[streamView].logo.color : view === 'tab' && tabMusic ? serviceOf(tabMusic.host).color : noise.tint})` : '';
  });

  // A saved link takes the title its player reports; unchanged names write nothing.
  $effect(() => {
    if (!stream?.title) return;
    const now = $state.snapshot(links);
    const named = nameLink(now, stream.url, stream.title, stream.artist);
    if (named !== now) void streamLinksItem.setValue(named);
  });

  // While the panel is open the background knows it, so a link it plays stops when it closes. The background may
  // sleep in between (an open port does not keep it awake): the next state it writes shows it is back, and the panel
  // connects again then, rather than waking it every 30 s.
  let port: ReturnType<typeof browser.runtime.connect> | null = null;
  let closing = false;
  function connect() {
    port = browser.runtime.connect({ name: 'player-panel' });
    port.onDisconnect.addListener(() => (port = null));
  }
  const me = crypto.randomUUID();
  let owner = $state<string | null>(null);

  const unwatch: Array<() => void> = [];
  let heardPlayer = false;
  let heardTracks = false;
  onMount(async () => {
    connect();
    void panelOwnerItem.setValue(me);
    unwatch.push(
      // The panel stays open: a folder picked, rescanned or forgotten anywhere shows here at once.
      onLibraryChange(() => void loadFolder().then((f) => (folder = f), () => undefined)),
      panelOwnerItem.watch((v) => (owner = v)),
      playerItem.watch(() => !port && !closing && connect()),
      streamLinksItem.watch((v) => (links = v ?? [])),
      playerItem.watch((v) => ((heardPlayer = true), (player = v ?? INITIAL_PLAYER))),
      playerTracksItem.watch((v) => ((heardTracks = true), (tracks = v ?? {}))),
      settingsItem.watch((v) => (always = normalizeSettings(v).discMotion === 'always')),
    );
    const [p, t, f, a] = await Promise.all([
      playerItem.getValue(),
      playerTracksItem.getValue(),
      loadFolder().catch(() => null),
      settingsItem.getValue().then((v) => normalizeSettings(v).discMotion === 'always'),
    ]);
    // A change seen while the first read was on its way is newer than that read: it wins.
    if (!heardPlayer) player = p;
    if (!heardTracks) tracks = t;
    folder = f;
    always = a;
    links = await streamLinksItem.getValue();
    const asked = await panelSectionItem.getValue();
    if (asked) {
      section = asked;
      void panelSectionItem.setValue(null);
    }
    loaded = true;
  });
  onDestroy(() => {
    closing = true;
    port?.disconnect();
    unwatch.forEach((u) => u());
  });
</script>

{#snippet key(name: string, path: string, onclick: () => void, opts: { main?: boolean; flip?: boolean; on?: boolean; grid?: number } = {})}
  <button class="key" class:main={opts.main} class:flip={opts.flip} class:on={opts.on} aria-label={name} aria-pressed={opts.on === undefined ? undefined : opts.on} {onclick}>
    <svg viewBox="0 0 {opts.grid ?? 20} {opts.grid ?? 20}" aria-hidden="true"><path d={path} /></svg>
  </button>
{/snippet}

<main>
  <header>
    <h1>Player</h1>
    <span class="brand">Study Duo</span>
  </header>
  <Segmented options={SECTIONS} value={section} label="Sections" onchange={(v) => (section = v)} />
  <!-- Only while YouTube is the source: nothing loads from YouTube while the folder or noise plays. -->
  {#if stream && streamView}
    {#if owner === me}
      <StreamFrame {player} {stream} onsignin={() => signIn(stream.source)} />
    {:else}
      <p class="elsewhere">{SERVICES[streamView].name} plays in the side panel of another window. <button class="link" onclick={() => panelOwnerItem.setValue(me)}>Play it here</button></p>
    {/if}
  {/if}

  {#if section === 'now'}
    <div class="now">
      {#if !(streamView && stream)}<div class="art"><SleeveArt {art} {playing} {always} live={loaded} size="large" /></div>{/if}
      <SourceMenu {player} {folder} {label} anchor="self" onpick={pick} />

      {#if view === 'noise'}
        <div class="song">
          <p class="title">{noise.title}</p>
          <p class="sub">Made in your browser. It keeps playing with every Study Duo page closed.</p>
        </div>
        <div class="row">
          <div class="noises" role="radiogroup" aria-label="Noise colour">
            {#each KINDS as k (k)}
              <button role="radio" aria-checked={player.noise === k} style:background={NOISE[k].chip} style:color={NOISE[k].chipInk} onclick={() => send({ op: 'noise', noise: k })}>{NOISE[k].name}</button>
            {/each}
          </div>
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
        </div>
      {:else if view === 'tab'}
        {#if tabMusic}
          <div class="song">
            <p class="title" title={tabMusic.title}>{clip(tabMusic.title)}</p>
            <p class="sub">{[tabMusic.artist, `${serviceOf(tabMusic.host).name} tab`].filter(Boolean).join(' · ')}</p>
          </div>
          <div class="transport">
            {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), { flip: true })}
            {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
            {@render key('Next', ICONS.skip, () => send({ op: 'next' }))}
          </div>
        {:else}
          <div class="song">
            <p class="title">No music in your tabs</p>
            <p class="sub">Play something on a music site; it shows up here and in Tabs.</p>
          </div>
        {/if}
      {:else if streamView}
        {#if stream}
          <div class="song">
            <p class="title" title={stream.title ?? ''}>{caps.title ? clip(stream.title ?? SERVICES[streamView].name) : SERVICES[streamView].name}</p>
            <p class="sub">{caps.title ? [stream.artist, ytList ? 'playlist' : null].filter(Boolean).join(' · ') || `In ${SERVICES[streamView].name}'s player, above` : caps.play ? `Play, pause and seek here; skip in ${SERVICES[streamView].name}'s player, above.` : `Use ${SERVICES[streamView].name}'s own buttons, above.`}</p>
          </div>
          {#if caps.seek}<SeekLine position={streamPosition} duration={stream.duration ?? 0} stamp={stream.at} size="large" onseek={(ms) => send({ op: 'seek', ms })} />{/if}
          {#if caps.play}
            <div class="transport">
              {#if caps.skip}{@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), { flip: true })}{/if}
              {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
              {#if caps.skip}{@render key('Next', ICONS.skip, () => send({ op: 'next' }))}{/if}
            </div>
          {/if}
        {:else}
          <div class="song">
            <p class="title">No {SERVICES[streamView].name} link yet</p>
            <p class="sub">Paste a link; it plays here, in {SERVICES[streamView].name}'s own player.</p>
            <button class="action" onclick={() => (section = 'streaming')}>Paste a link</button>
          </div>
        {/if}
      {:else if player.problem === 'reconnect'}
        <div class="song">
          <p class="title">Chrome asks again for your folder</p>
          <p class="sub">After a restart, Chrome needs one click to read your music again. Nothing was lost.</p>
          <button class="action" onclick={reconnect}>Reconnect folder</button>
        </div>
      {:else if !track}
        <div class="song">
          <p class="title">{folder ? clip(folder.name) : 'No music folder yet'}</p>
          <p class="sub">{folder ? `${folder.count} ${folder.count === 1 ? 'song' : 'songs'} on this computer` : 'Pick a folder of songs; they stay on this computer.'}</p>
          <button class="action" onclick={() => (section = 'library')}>{folder ? 'Open the library' : 'Choose a folder'}</button>
        </div>
      {:else}
        <div class="song">
          <p class="title" title={track.title}>{clip(track.title)}</p>
          <p class="sub">{player.problem === 'missing' ? 'This file is gone from your folder' : [track.artist, track.album].filter(Boolean).join(' · ') || 'Your folder'}</p>
        </div>
        <SeekLine {position} {duration} stamp={player.at} size="large" onseek={(ms) => send({ op: 'seek', ms })} />
        <div class="transport">
          {@render key('Shuffle', SHUFFLE, () => send({ op: 'shuffle' }), { on: !!player.queue?.shuffle, grid: 256 })}
          {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), { flip: true })}
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), { main: true })}
          {@render key('Next', ICONS.skip, () => send({ op: 'next' }))}
          <button class="key" class:on={repeat !== 'off'} aria-label={REPEAT_LABEL[repeat]} onclick={() => send({ op: 'repeat', repeat: NEXT_REPEAT[repeat] })}>
            <svg viewBox="0 0 256 256" aria-hidden="true"><path d={REPEAT} /></svg>{#if repeat === 'one'}<small>1</small>{/if}
          </button>
        </div>
      {/if}

      <!-- A tab keeps its own volume: Study Duo cannot set it. -->
      {#if view !== 'tab'}
        <label class="vol">
          <svg viewBox="0 0 256 256" aria-hidden="true"><path d={SPEAKER} /></svg>
          <input type="range" min="0" max="100" value={Math.round(player.volume * 100)} aria-label="Volume" style:--v="{Math.round(player.volume * 100)}%" oninput={(e) => send({ op: 'volume', volume: Number(e.currentTarget.value) / 100 })} />
          <span>{Math.round(player.volume * 100)}%</span>
        </label>
      {/if}

      {#if view === 'folder' && upNext.length && player.problem !== 'reconnect'}
        <section aria-labelledby="next-title">
          <h2 id="next-title" class="eyebrow">Up next</h2>
          <ol class="queue">
            {#each upNext as n (n.at)}
              <li><button onclick={() => send({ op: 'jump', at: n.at })}><span class="name">{clip(n.track.title)}</span><span class="meta">{n.track.artist}</span></button></li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>
  {:else if section === 'library'}
    <FolderLibrary />
  {:else if section === 'tabs'}
    <section class="tabs" aria-labelledby="tabs-title">
      <h2 id="tabs-title" class="visually-hidden">Music in your tabs</h2>
      <p class="sub">Music already playing in your tabs. Study Duo can play, pause and skip it; when you start something here, the tab pauses first.</p>
      {#if player.tabs.length}
        <ul class="tablist">
          {#each player.tabs as t (t.tabId)}
            {@const s = serviceOf(t.host)}
            {@const on = player.active === 'tab' && player.tab === t.tabId && player.playing}
            <li class:current={player.active === 'tab' && player.tab === t.tabId}>
              <svg class="svc" viewBox="0 0 {s.grid} {s.grid}" aria-hidden="true" style:fill={s.color}><path d={s.path} /></svg>
              <div class="info">
                <span class="name" title={t.title}>{clip(t.title)}</span>
                <span class="meta">{[t.artist, t.playing ? null : 'paused'].filter(Boolean).join(' · ')}</span>
                <span class="host">{t.host}</span>
              </div>
              {@render key(on ? `Pause ${t.title}` : `Play ${t.title}`, on ? ICONS.pause : ICONS.play, () => send({ op: 'tab', tabId: t.tabId, action: on ? 'pause' : 'play' }), { main: true })}
              {@render key(`Next in ${s.name}`, ICONS.skip, () => send({ op: 'tab', tabId: t.tabId, action: 'next' }))}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">No music site is playing in a tab right now.</p>
      {/if}
      <p class="note">Only music sites are listed, and only while they play or are paused. The page itself is never read.</p>
    </section>
  {:else}
    <section class="streaming" aria-labelledby="stream-title">
      <h2 id="stream-title">Links</h2>
      <p class="sub">A YouTube, Spotify, SoundCloud, Apple Music or Tidal link plays here, in that service's own player, and stops when this panel closes.</p>
      <form onsubmit={playLink}>
        <input id="stream-link" aria-label="Link to play" aria-describedby="stream-problem" placeholder="Paste a YouTube, Spotify or SoundCloud link" autocomplete="off" spellcheck="false" bind:value={pasted} />
        <button class="action" type="submit">Play</button>
      </form>
      <p class="error" id="stream-problem" role="alert">{linkProblem}</p>
      {#if links.length}
        <h2 class="eyebrow">Saved links</h2>
        <ul class="links">
          {#each links as l (l.url)}
            <li>
              <button class="open" onclick={() => playSaved(l.url)}>
                <svg class="svc" viewBox="0 0 24 24" aria-hidden="true" style:fill={SERVICES[l.source].logo.color}><path d={SERVICES[l.source].logo.path} /></svg>
                <span class="text"><span class="name" title={l.url}>{clip(l.title ?? linkName(l.url))}</span><span class="meta">{l.artist ?? SERVICES[l.source].name}</span></span>
              </button>
              <button class="forget" aria-label="Forget {l.title ?? 'this link'}" onclick={() => streamLinksItem.setValue(forgetLink($state.snapshot(links), l.url))}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.x} /></svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <h2 class="eyebrow">Your accounts</h2>
      <ul class="accounts">
        {#each ACCOUNTS as s (s)}
          <li>
            <svg class="svc" viewBox="0 0 24 24" aria-hidden="true" style:fill={SERVICES[s].logo.color}><path d={SERVICES[s].logo.path} /></svg>
            <span class="text"><span class="name">{SERVICES[s].name}</span><span class="meta">{SERVICES[s].account}</span></span>
            {#if SERVICES[s].signIn}<button class="ghost" onclick={() => signIn(s)}>Sign in</button>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  :global(body) { min-inline-size: 300px; }
  main { display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; padding: 16px; }
  header { display: flex; align-items: baseline; justify-content: space-between; }
  h1 { margin: 0; font: 800 20px/24px var(--font-family-ui); }
  .brand { font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); }
  .now { display: flex; flex-direction: column; gap: 16px; }
  .art { display: flex; justify-content: center; }
  .song { display: grid; gap: 4px; }
  .title { margin: 0; font: 700 20px/24px var(--font-family-ui); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { margin: 0; font: 400 14px/20px var(--font-family-ui); color: var(--color-text-secondary); }
  .action {
    justify-self: start; margin-block-start: 6px; padding: 10px 14px; border: 0; border-radius: 6px; background: var(--color-bg-action); color: var(--color-text-on-action);
    font: 700 14px/18px var(--font-family-ui); cursor: pointer;
  }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .noises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--color-border-control); border-radius: 6px; overflow: hidden; }
  .noises button { block-size: 40px; border: 0; font: 600 14px/18px var(--font-family-ui); cursor: pointer; }
  .noises button + button { border-inline-start: 1px solid var(--color-border-control); }
  .noises button[aria-checked='true'] { font-weight: 700; box-shadow: inset 0 0 0 2px #17191c; }
  .transport { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .key {
    position: relative; display: grid; place-items: center; inline-size: 40px; block-size: 40px; border: 0; border-radius: 6px; background: none;
    color: var(--color-text-primary); cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .key.main { inline-size: 52px; block-size: 52px; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .key.on { color: var(--color-text-focus); }
  .key.flip svg { transform: rotate(180deg); }
  .key svg { inline-size: 20px; block-size: 20px; fill: currentColor; }
  .key small { position: absolute; inset-block-start: 4px; inset-inline-end: 6px; font: 700 9px/1 var(--font-family-mono); }
  .key:active, .action:active { transform: scale(0.97); }
  .vol { display: grid; grid-template-columns: 16px minmax(0, 1fr) 40px; gap: 10px; align-items: center; font: 500 12px/16px var(--font-family-mono); color: var(--color-text-secondary); }
  .vol svg { inline-size: 16px; block-size: 16px; fill: var(--color-text-secondary); }
  .vol input { block-size: 16px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .vol input::-webkit-slider-runnable-track { block-size: 3px; border-radius: 2px; background: linear-gradient(var(--color-text-secondary), var(--color-text-secondary)) 0 / var(--v, 60%) 100% no-repeat, var(--color-bg-sunken); }
  .vol input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4.5px; border-radius: 50%; background: var(--color-text-primary); }
  .eyebrow { margin: 8px 0 4px; font: 600 11px/14px var(--font-family-mono); letter-spacing: 0.06em; color: var(--color-text-secondary); text-transform: uppercase; }
  .queue { margin: 0; padding: 0; list-style: none; }
  .queue button { inline-size: 100%; display: grid; gap: 1px; padding: 8px 10px; border: 0; border-radius: 4px; background: none; color: var(--color-text-primary); text-align: start; cursor: pointer; }
  .queue button:hover { background: var(--color-bg-sunken); }
  .name { font: 600 13px/18px var(--font-family-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font: 400 11px/14px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .streaming { display: grid; gap: 8px; }
  .elsewhere { margin: 0; font: 400 13px/18px var(--font-family-ui); color: var(--color-text-secondary); }
  .link { padding: 0; border: 0; background: none; color: var(--color-text-primary); font: 600 13px/18px var(--font-family-ui); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .tabs { display: grid; gap: 12px; }
  .tabs .sub { margin: 0; }
  .tablist { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .tablist li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-bg-panel); }
  .tablist li.current { border-color: var(--color-border-strong); }
  .tablist .key.main { inline-size: 40px; block-size: 40px; }
  .svc { inline-size: 22px; block-size: 22px; }
  .info { display: grid; min-inline-size: 0; }
  .host { font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); }
  .empty, .note { margin: 0; font: 400 13px/18px var(--font-family-ui); color: var(--color-text-secondary); }
  .note { font: 500 11px/16px var(--font-family-mono); }
  .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .streaming h2:first-child { margin: 0; font: 700 16px/20px var(--font-family-ui); }
  form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  form input { min-inline-size: 0; padding: 10px 12px; border: 1px solid var(--color-border-control); border-radius: 6px; background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 14px/18px var(--font-family-ui); }
  form .action { margin: 0; }
  .error { margin: 0; min-block-size: 18px; font: 400 13px/18px var(--font-family-ui); color: var(--color-text-focus); }
  .links { margin: 0; padding: 0; list-style: none; }
  .links li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .text { display: grid; gap: 1px; min-inline-size: 0; }
  .accounts { margin: 0; padding: 4px 0; list-style: none; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-bg-panel); }
  .accounts li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 12px; }
  .accounts .svc, .links .svc { inline-size: 18px; block-size: 18px; }
  .ghost { padding: 6px 10px; border: 1px solid var(--color-border-strong); border-radius: 6px; background: none; color: var(--color-text-primary); font: 600 12px/16px var(--font-family-ui); cursor: pointer; }
  .links .open { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; align-items: center; padding: 8px 10px; border: 0; border-radius: 4px; background: none; color: var(--color-text-primary); text-align: start; cursor: pointer; min-inline-size: 0; }
  .links .open:hover, .forget:hover { background: var(--color-bg-sunken); }
  .forget { display: grid; place-items: center; inline-size: 32px; block-size: 32px; border: 0; border-radius: 4px; background: none; color: var(--color-text-secondary); cursor: pointer; }
  .forget svg { inline-size: 14px; block-size: 14px; fill: currentColor; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .key, .action { transition: none; } }
</style>
