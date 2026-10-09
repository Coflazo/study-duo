<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { sortTracks } from '@/core/library';
  import { loadFolder, loadThumb, loadTracks, type FolderRecord } from '@/core/library-db';
  import type { NoiseKind } from '@/core/noise';
  import { CAPS } from '@/core/embed-protocols';
  import { INITIAL_PLAYER, isStream, positionAt, streamAt, type PlayerCommand, type PlayerSource, type PlayerState, type StreamSource } from '@/core/player';
  import { parseStreamLink } from '@/core/stream-links-parse';
  import { panelSectionItem, playerItem } from '@/core/session-store';
  import { rememberLink, streamLinksItem } from '@/core/stream-links';
  import { canonicalYouTube, parseYouTubeLink } from '@/core/youtube';
  import { normalizeSettings } from '@/core/settings';
  import { settingsItem } from '@/core/store';
  import { clip } from '@/core/text';
  import { ICONS } from '@/ui/icons';
  import { LOGOS, serviceOf } from '@/ui/logos';
  import SeekLine from '@/ui/SeekLine.svelte';
  import SleeveArt from '@/ui/SleeveArt.svelte';
  import SourceMenu, { type SourcePick } from '@/ui/SourceMenu.svelte';

  /**
   * The popup's player card, Figma "Screens: Player (approved)", direction B (Sleeve): the record half out of its
   * sleeve. It shows whichever source the one player has: focus noise, or the music folder.
   */
  const NOISE: Record<NoiseKind, { name: string; title: string; sleeve: string; c: [string, string]; ink: string; ring: string; mark: string; tint: string; chip: string; chipInk: string }> = {
    white: { name: 'White', title: 'White noise', sleeve: 'WHITE\nNOISE', c: ['#FFFFFF', '#CDD1D5'], ink: '#17191C', ring: 'rgb(23 25 28 / 0.3)', mark: 'rgb(23 25 28 / 0.55)', tint: '#9AA3AD', chip: '#FFFFFF', chipInk: '#17191C' },
    pink: { name: 'Pink', title: 'Pink noise', sleeve: 'PINK\nNOISE', c: ['#F7C9D4', '#E28AA1'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#E28AA1', chip: '#F3C9D3', chipInk: '#17191C' },
    brown: { name: 'Brown', title: 'Brown noise', sleeve: 'BROWN\nNOISE', c: ['#A27757', '#5A3A28'], ink: '#FFFFFF', ring: 'rgb(255 255 255 / 0.6)', mark: 'rgb(255 255 255 / 0.9)', tint: '#8B6448', chip: '#8B6448', chipInk: '#FFFFFF' },
  };
  const KINDS: NoiseKind[] = ['white', 'pink', 'brown'];
  /** Folder songs without a cover get this colour, mixed with white for the label. */
  const NO_COVER = '#5876C2';
  /** Phosphor Bold on a 256 grid. */
  const SPEAKER = 'M157.27,21.22a12,12,0,0,0-12.64,1.31L75.88,76H32A20,20,0,0,0,12,96v64a20,20,0,0,0,20,20H75.88l68.75,53.47A12,12,0,0,0,164,224V32A12,12,0,0,0,157.27,21.22ZM36,100H68v56H36Zm104,99.46L92,162.13V93.87l48-37.33ZM212,128a44,44,0,0,1-11,29.11,12,12,0,1,1-18-15.88,20,20,0,0,0,0-26.43,12,12,0,0,1,18-15.86A43.94,43.94,0,0,1,212,128Zm40,0a83.87,83.87,0,0,1-21.39,56,12,12,0,0,1-17.89-16,60,60,0,0,0,0-80,12,12,0,1,1,17.88-16A83.87,83.87,0,0,1,252,128Z';
  /** Phosphor Bold link. */
  const LINK = 'M117.18,188.74a12,12,0,0,1,0,17l-5.12,5.12A58.26,58.26,0,0,1,70.6,228h0A58.62,58.62,0,0,1,29.14,127.92L63.89,93.17a58.64,58.64,0,0,1,98.56,28.11,12,12,0,1,1-23.37,5.44,34.65,34.65,0,0,0-58.22-16.58L46.11,144.89A34.62,34.62,0,0,0,70.57,204h0a34.41,34.41,0,0,0,24.49-10.14l5.11-5.12A12,12,0,0,1,117.18,188.74ZM226.83,45.17a58.65,58.65,0,0,0-82.93,0l-5.11,5.11a12,12,0,0,0,17,17l5.12-5.12a34.63,34.63,0,1,1,49,49L175.1,145.86A34.39,34.39,0,0,1,150.61,156h0a34.63,34.63,0,0,1-33.69-26.72,12,12,0,0,0-23.38,5.44A58.64,58.64,0,0,0,150.56,180h.05a58.28,58.28,0,0,0,41.47-17.17l34.75-34.75a58.62,58.62,0,0,0,0-82.91Z';

  let player = $state<PlayerState>(INITIAL_PLAYER);
  let folder = $state<FolderRecord | null>(null);
  let now = $state(Date.now());
  let loaded = $state(false);
  let cover = $state<string | null>(null);

  const view = $derived<'noise' | 'folder' | 'tab' | StreamSource>(player.active === 'folder' || player.active === 'tab' || isStream(player.active) ? player.active : 'noise');
  const streamView = $derived(isStream(view) ? view : null);
  const STREAM_NAMES: Record<StreamSource, string> = { youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', apple: 'Apple Music', tidal: 'Tidal' };
  const STREAM_LOGOS: Record<StreamSource, { color: string; path: string }> = { youtube: LOGOS.youtube, spotify: LOGOS.spotify, soundcloud: LOGOS.soundcloud, apple: LOGOS.apple, tidal: LOGOS.tidal };
  const name = $derived(streamView ? STREAM_NAMES[streamView] : '');
  const caps = $derived(streamView ? CAPS[streamView] : CAPS.apple);
  const tabMusic = $derived(view === 'tab' ? (player.tabs.find((t) => t.tabId === player.tab) ?? null) : null);
  const service = $derived(tabMusic ? serviceOf(tabMusic.host) : null);
  const stream = $derived(streamView && player.stream?.source === streamView ? player.stream : null);
  const ytLink = $derived.by(() => {
    const p = stream?.source === 'youtube' ? parseYouTubeLink(stream.url) : null;
    return p?.ok ? p.link : null;
  });
  let pasted = $state('');
  let linkProblem = $state('');
  /** A steady sleeve colour per video, from its title: streams have no cover Study Duo keeps. */
  const SLEEVES = ['#5B4B8A', '#2F6F73', '#3E5C9A', '#7A4E6E', '#2F5D50', '#6A5A2E'];
  const sleeveColor = (t: string) => SLEEVES[[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SLEEVES.length]!;
  const noise = $derived(NOISE[player.noise]);
  const track = $derived(view === 'folder' ? player.now : null);
  const playing = $derived(player.playing && (view === 'noise' ? player.active === 'noise' || player.active === null : player.active === view));
  const duration = $derived(player.duration ?? 0);
  const position = $derived(positionAt(player, now));
  const upNext = $derived(view === 'folder' ? player.upNext : null);
  const tint = $derived(view === 'folder' ? (track?.color ?? NO_COVER) : streamView ? STREAM_LOGOS[streamView].color : view === 'tab' ? (service?.color ?? NO_COVER) : noise.tint);
  const label = $derived(view === 'folder' ? 'FOLDER' : streamView ? name.toUpperCase() : view === 'tab' ? 'TAB' : 'SOUNDS');
  const sleeveText = $derived(track ? [track.artist, track.album].filter(Boolean).join('\n').toUpperCase() || 'YOUR\nFOLDER' : 'YOUR\nFOLDER');
  const send = (cmd: PlayerCommand) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);

  /** Settings, Spinning disc: "Always" turns it even when the computer asks for less motion. */
  let always = $state(false);
  const art = $derived(
    view === 'noise'
      ? { kind: 'noise' as const, c: noise.c, ring: noise.ring, mark: noise.mark, sleeve: noise.sleeve, ink: noise.ink }
      : view === 'tab'
        ? service
          ? { kind: 'cd' as const, color: service.color, cover: null, sleeve: service.name.toUpperCase(), logo: { path: service.path, grid: service.grid } }
          : { kind: 'empty' as const, sleeve: 'MUSIC IN\nA TAB' }
      : streamView
        ? !stream
          ? { kind: 'empty' as const, sleeve: 'PASTE A\nLINK' }
          : streamView === 'youtube'
            ? { kind: 'cd' as const, color: sleeveColor(stream.title ?? stream.url), cover: null, sleeve: (stream.title ?? 'YouTube').toUpperCase() }
            : { kind: 'cd' as const, color: STREAM_LOGOS[streamView].color, cover: null, sleeve: name.toUpperCase(), logo: { path: STREAM_LOGOS[streamView].path, grid: 24 } }
        : track
          ? { kind: 'cd' as const, color: track.color ?? NO_COVER, cover, sleeve: sleeveText }
          : { kind: 'empty' as const, sleeve: folder ? 'YOUR\nFOLDER' : 'CHOOSE A\nFOLDER' },
  );

  // The popup takes a light tint of what plays (the cover's colour for a song); it fades back when it stops.
  $effect(() => {
    const body = document.body;
    body.style.transition = 'background-color 600ms ease';
    body.style.backgroundColor = playing ? `color-mix(in oklab, var(--color-bg-canvas) 86%, ${tint})` : '';
  });

  // The song's place runs forward on screen only while the popup is open and the folder plays.
  $effect(() => {
    if (!(playing && view !== 'noise')) return;
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });

  // The cover thumbnail of the song on the card.
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

  function pick(p: SourcePick) {
    if ('tab' in p) return void send({ op: 'tab', tabId: p.tab, action: 'pick' });
    const source = p.source;
    // Links play in the full player: open it (straight from the click, as Chrome requires), on Streaming if none is set.
    // Without a link, nothing playing stops: the panel opens to paste one.
    const link = player.stream?.source === source;
    if (isStream(source) && !(link && player.panel)) return link ? openPanel(undefined, source) : openPanel('streaming');
    if (source !== player.active) void send({ op: 'source', source });
  }
  const openMusicPage = () => void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html#music') });
  /** Chrome opens a side panel only straight from a click, so the window is known before any click. */
  let windowId: number | undefined;
  function openPanel(on?: 'streaming', then?: PlayerSource) {
    if (on) void panelSectionItem.setValue(on);
    if (then && then !== player.active) void send({ op: 'source', source: then });
    const b = browser as unknown as { sidePanel?: { open(o: { windowId: number }): Promise<void> }; sidebarAction?: { open(): Promise<void> } };
    if (b.sidePanel && windowId !== undefined) void b.sidePanel.open({ windowId }).then(() => window.close()).catch(() => undefined);
    else void b.sidebarAction?.open().catch(() => undefined);
  }

  const FOOT = $derived<Record<StreamSource, string>>({
    youtube: ytLink?.list ? 'Next and previous move through the playlist.' : stream?.duration ? 'One long video: drag to any minute. Next and previous jump 30 s.' : 'A live stream: it plays from now, without seeking.',
    spotify: "Play, pause and seek work here. Skipping happens in Spotify's player in the side panel.",
    soundcloud: 'Drag to any minute. Next and previous move through a set.',
    apple: "Play and pause with Apple Music's own buttons in the side panel.",
    tidal: "Play and pause with Tidal's own buttons in the side panel.",
  });
  const LINK_PROBLEMS = {
    unknown: 'Study Duo plays links from YouTube, Spotify, SoundCloud, Apple Music and Tidal.',
    'short-link': 'Open the short link once, then copy the full address from the address bar.',
    'no-video': 'That link has no video or playlist in it.',
    'private-list': 'Watch later and Liked videos are private: only YouTube can play them.',
  } as const;
  /** Pasted in the card: it plays in the side panel, which opens straight from this click. */
  function playLink(e: SubmitEvent) {
    e.preventDefault();
    const parsed = parseStreamLink(pasted);
    if (!parsed.ok) return void (linkProblem = LINK_PROBLEMS[parsed.reason]);
    const { source, url, start } = parsed.link;
    linkProblem = '';
    void streamLinksItem.getValue().then((list) => streamLinksItem.setValue(rememberLink(list, { source, url }, Date.now())));
    void send({ op: 'stream', source, url, ...(start ? { at: start * 1000 } : {}) });
    if (!player.panel) openPanel();
  }

  async function playAll() {
    const tracks = sortTracks(await loadTracks());
    if (!tracks.length) return openMusicPage();
    void send({ op: 'folder', tracks: tracks.slice(0, 5_000).map((t) => ({ id: t.id, path: t.path, title: t.title, artist: t.artist, album: t.album, genre: t.genre, color: t.color, cover: t.cover })), start: 0, shuffle: false });
  }
  async function reconnect() {
    const h = folder?.handle as (FileSystemDirectoryHandle & { requestPermission?(d: { mode: 'read' }): Promise<PermissionState> }) | undefined;
    if (h?.requestPermission && (await h.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted') void send({ op: 'play' });
    else openMusicPage();
  }

  let unwatch: (() => void) | undefined;
  onMount(async () => {
    void browser.windows.getCurrent().then((w) => (windowId = w.id)).catch(() => undefined);
    // A change seen while the first read is on its way is newer than that read: it wins.
    let heard = false;
    const unwatchPlayer = playerItem.watch((v) => ((heard = true), (player = v ?? INITIAL_PLAYER)));
    const unwatchSettings = settingsItem.watch((v) => (always = normalizeSettings(v).discMotion === 'always'));
    unwatch = () => (unwatchPlayer(), unwatchSettings());
    let first: PlayerState;
    [first, always, folder] = await Promise.all([
      playerItem.getValue(),
      settingsItem.getValue().then((v) => normalizeSettings(v).discMotion === 'always'),
      loadFolder().catch(() => null),
    ]);
    if (!heard) player = first;
    loaded = true;
  });
  onDestroy(() => {
    unwatch?.();
    document.body.style.backgroundColor = '';
  });
</script>

{#snippet key(name: string, path: string, onclick: () => void, main = false, flip = false, disabled = false)}
  <button class="key" class:main class:flip aria-label={name} {disabled} {onclick}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={path} /></svg>
  </button>
{/snippet}

<section class="card" aria-label="Player">
  <div class="body">
    <SleeveArt {art} {playing} {always} live={loaded} />
    <div class="col">
      <SourceMenu {player} {folder} {label} onpick={pick} onopenpanel={() => openPanel()} />
      {#if view === 'noise'}
        <p class="title" title={noise.title}>{noise.title}</p>
        <p class="sub">Made in your browser</p>
        <label class="vol">
          <svg viewBox="0 0 256 256" aria-hidden="true"><path d={SPEAKER} /></svg>
          <input type="range" min="0" max="100" value={Math.round(player.volume * 100)} aria-label="Volume" style:--v="{Math.round(player.volume * 100)}%" oninput={(e) => send({ op: 'volume', volume: Number(e.currentTarget.value) / 100 })} />
        </label>
      {:else if view === 'tab'}
        {#if tabMusic && service}
          <p class="title" title={tabMusic.title}>{clip(tabMusic.title)}</p>
          <p class="sub" title={tabMusic.artist}>{[tabMusic.artist, `${service.name} tab`].filter(Boolean).join(' · ')}</p>
          <div class="keys">
            {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), false, true)}
            {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), true)}
            {@render key('Next', ICONS.skip, () => send({ op: 'next' }))}
          </div>
        {:else}
          <p class="title">No music in your tabs</p>
          <p class="sub wrap">Play something on a music site; it shows up here.</p>
        {/if}
      {:else if streamView}
        {#if stream?.problem === 'embed' || stream?.problem === 'gone'}
          <p class="title">{streamView === 'youtube' ? 'This video only plays on YouTube' : `This only plays on ${name}`}</p>
          <p class="sub wrap problem">{stream.problem === 'embed' ? 'Its owner turned off playing elsewhere.' : 'It is gone or private.'}{ytLink?.list ? ' Skipping to the next one in 5 s.' : ''}</p>
          <button class="action" onclick={() => browser.tabs.create({ url: ytLink ? canonicalYouTube(ytLink) : stream.url })}>Open on {name}</button>
        {:else if stream?.problem === 'preview'}
          <p class="title">Only 30 s previews</p>
          <p class="sub wrap problem">Sign in to Spotify in the side panel to hear full songs.</p>
          <button class="action" onclick={() => openPanel('streaming')}>Open side panel</button>
        {:else if stream}
          <p class="title" title={stream.title ?? ''}>{caps.title ? clip(stream.title ?? name) : 'Playing in the side panel'}</p>
          <p class="sub" class:wrap={!caps.title} title={stream.artist ?? ''}>
            {!player.panel ? 'Plays in the full player' : caps.title ? [stream.artist, ytLink?.list ? 'playlist' : stream.duration ? null : 'live'].filter(Boolean).join(' · ') || name : caps.play ? `${name} plays and seeks inside its own player there.` : `Use ${name}'s own buttons there.`}
          </p>
          {#if caps.play}
            <div class="keys">
              {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), false, true, !player.panel || !caps.skip)}
              {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => (player.panel ? send({ op: 'toggle' }) : (send({ op: 'play' }), openPanel())), true)}
              {@render key('Next', ICONS.skip, () => send({ op: 'next' }), false, false, !player.panel || !caps.skip)}
            </div>
          {:else if !player.panel}
            <button class="action" onclick={() => openPanel()}>Open side panel</button>
          {/if}
        {:else}
          <p class="title">Play a {name} link</p>
          <p class="sub wrap">{streamView === 'youtube' ? 'A public playlist, video or live stream.' : streamView === 'soundcloud' ? 'A public track or set.' : 'A playlist, album or song, with your account.'}</p>
        {/if}
      {:else if player.problem === 'reconnect'}
        <p class="title">Chrome asks again for your folder</p>
        <p class="sub wrap">After a restart, Chrome needs one click to read your music again.</p>
        <button class="action" onclick={reconnect}>Reconnect folder</button>
      {:else if !folder}
        <p class="title">No music folder yet</p>
        <p class="sub wrap">Pick a folder of songs; they stay on this computer.</p>
        <button class="action" onclick={openMusicPage}>Choose a folder</button>
      {:else if !track}
        <p class="title" title={folder.name}>{clip(folder.name)}</p>
        <p class="sub">{folder.count} {folder.count === 1 ? 'song' : 'songs'} on this computer</p>
        <button class="action" onclick={playAll}>Play all</button>
      {:else}
        <p class="title" title={track.title}>{clip(track.title)}</p>
        <p class="sub" title={track.artist}>{player.problem === 'missing' ? 'This file is gone from your folder' : track.artist || track.album || 'Your folder'}</p>
        <div class="keys">
          {@render key('Previous', ICONS.skip, () => send({ op: 'prev' }), false, true)}
          {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }), true)}
          {@render key('Next', ICONS.skip, () => send({ op: 'next' }), false, false, !upNext && player.queue?.repeat === 'off')}
        </div>
      {/if}
    </div>
  </div>

  {#if view === 'noise'}
    <div class="row">
      <div class="noises" role="radiogroup" aria-label="Noise colour">
        {#each KINDS as k (k)}
          <button role="radio" aria-checked={player.noise === k} style:background={NOISE[k].chip} style:color={NOISE[k].chipInk} onclick={() => send({ op: 'noise', noise: k })}>{NOISE[k].name}</button>
        {/each}
      </div>
      {@render key(playing ? 'Pause' : 'Play', playing ? ICONS.pause : ICONS.play, () => send({ op: 'toggle' }))}
    </div>
  {:else if tabMusic}
    <p class="foot wrap">{tabMusic.playing ? 'Playing' : 'Paused'} in another tab. Study Duo can pause it or skip.</p>
  {:else if streamView && !stream}
    <form class="paste" class:bad={linkProblem} onsubmit={playLink}>
      <svg viewBox="0 0 256 256" aria-hidden="true"><path d={LINK} /></svg>
      <input aria-label="{name} link" aria-describedby="paste-note" placeholder={streamView === 'youtube' ? 'Paste a playlist or video link' : `Paste a ${name} link`} autocomplete="off" spellcheck="false" bind:value={pasted} oninput={() => (linkProblem = '')} />
      <button type="submit">Play</button>
    </form>
    <p class="foot wrap" class:problem={linkProblem} id="paste-note" role={linkProblem ? 'alert' : undefined}>{linkProblem || 'Plays in the side panel. Links are kept on this computer.'}</p>
  {:else if stream && !stream.problem}
    {#if caps.seek}<SeekLine position={streamAt(player, now)} duration={stream.duration ?? 0} stamp={stream.at} onseek={(ms) => send({ op: 'seek', ms })} />{/if}
    <p class="foot wrap">{!player.panel ? 'Open the full player to play it.' : FOOT[stream.source]}</p>
  {:else if track}
    <SeekLine {position} {duration} stamp={player.at} onseek={(ms) => send({ op: 'seek', ms })} />
    {#if player.queue}
      <p class="foot">Your folder · {player.queue.at + 1} of {player.queue.order.length}{upNext ? ` · Up next: ${clip(upNext, 40)}` : ''}</p>
    {/if}
  {/if}

</section>


<style>
  .card {
    position: relative; display: grid; gap: 10px; padding: 12px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md);
    background: var(--color-bg-panel);
  }
  .body { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: center; }
  .col { display: grid; gap: 6px; align-content: center; min-inline-size: 0; }
  .title { margin: 0; font: 700 16px/20px var(--font-family-ui); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { margin: 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.wrap { white-space: normal; }
  .action {
    justify-self: start; padding: 8px 12px; border: 0; border-radius: 6px; background: var(--color-bg-action); color: var(--color-text-on-action);
    font: 700 13px/16px var(--font-family-ui); cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .vol { display: flex; align-items: center; gap: 8px; inline-size: 120px; }
  .vol svg { inline-size: 14px; block-size: 14px; flex: none; fill: var(--color-text-secondary); }
  .vol input { flex: 1; min-inline-size: 0; block-size: 16px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
  .vol input::-webkit-slider-runnable-track {
    block-size: 3px; border-radius: 2px;
    background: linear-gradient(var(--color-text-secondary), var(--color-text-secondary)) 0 / var(--v, 60%) 100% no-repeat, var(--color-bg-sunken);
  }
  .vol input::-webkit-slider-thumb { appearance: none; inline-size: 12px; block-size: 12px; margin-block-start: -4.5px; border-radius: 50%; background: var(--color-text-primary); box-shadow: 0 0 0 2px var(--color-bg-panel); }
  .vol input::-moz-range-track { block-size: 3px; border-radius: 2px; background: var(--color-bg-sunken); }
  .vol input::-moz-range-progress { block-size: 3px; border-radius: 2px; background: var(--color-text-secondary); }
  .vol input::-moz-range-thumb { inline-size: 12px; block-size: 12px; border: 0; border-radius: 50%; background: var(--color-text-primary); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; gap: 8px; align-items: center; }
  .noises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--color-border-control); border-radius: 6px; overflow: hidden; }
  .noises button { block-size: 34px; border: 0; font: 600 13px/16px var(--font-family-ui); cursor: pointer; transition: box-shadow 160ms ease; }
  .noises button + button { border-inline-start: 1px solid var(--color-border-control); }
  .noises button[aria-checked='true'] { font-weight: 700; box-shadow: inset 0 0 0 2px #17191c; }
  .keys { display: flex; align-items: center; gap: 2px; }
  .key {
    display: grid; place-items: center; inline-size: 32px; block-size: 32px; border: 0; border-radius: 6px; background: none; color: var(--color-text-primary);
    cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .row .key, .key.main { inline-size: 34px; block-size: 34px; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .key.main { inline-size: 40px; block-size: 40px; }
  .key:disabled { color: var(--color-text-disabled); cursor: default; }
  .key.flip svg { transform: rotate(180deg); }
  .key:active:not(:disabled), .action:active { transform: scale(0.97); }
  .key svg { inline-size: 16px; block-size: 16px; fill: currentColor; }
  .foot { margin: 0; font: 500 11px/14px var(--font-family-mono); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .foot.wrap { white-space: normal; }
  .problem { color: var(--color-text-focus); }
  .paste { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 4px 4px 4px 10px; border: 1px solid var(--color-border-control); border-radius: 6px; background: var(--color-bg-panel); }
  .paste.bad { border-color: var(--color-text-focus); box-shadow: 0 0 0 1px var(--color-text-focus); }
  .paste svg { inline-size: 16px; block-size: 16px; fill: var(--color-text-secondary); }
  .paste input { min-inline-size: 0; border: 0; background: none; color: var(--color-text-primary); font: 400 13px/18px var(--font-family-ui); outline: none; }
  .paste button { padding: 6px 12px; border: 0; border-radius: 4px; background: var(--color-bg-action); color: var(--color-text-on-action); font: 700 13px/16px var(--font-family-ui); cursor: pointer; }
  .paste:focus-within { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .noises button, .key, .action { transition: none; }
  }
</style>
