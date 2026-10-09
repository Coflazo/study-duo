<script lang="ts">
  /**
   * Figma "Screens: Player (approved)", Side panel / Library: the music folder, played like Spotify. Choose a folder,
   * search, Songs / Artists / Albums, Play all, Shuffle, a song to play from, and Reconnect after a Chrome restart.
   */
  import { onDestroy, onMount } from 'svelte';
  import { groupTracks, searchTracks, sortTracks, type Track } from '@/core/library';
  import { forgetLibrary, loadFolder, loadTracks, onLibraryChange, type FolderRecord } from '@/core/library-db';
  import { INITIAL_PLAYER, type PlayerState, type PlayerTrack } from '@/core/player';
  import { playerItem } from '@/core/session-store';
  import { clip } from '@/core/text';
  import { scanFolder } from '@/ui/library-scan';
  import Segmented from '@/ui/Segmented.svelte';
  import SignButton from '@/ui/SignButton.svelte';

  const VIEWS: Array<['songs' | 'artists' | 'albums', string]> = [['songs', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums']];
  /** Long lists show this many rows (and groups); the search narrows the rest. */
  const SHOWN = 300;
  const GROUPS = 100;
  /** The player's queue holds at most this many songs: a window of the list around the song picked. */
  const QUEUE = 5_000;

  let folder = $state<FolderRecord | null>(null);
  let tracks = $state<Track[]>([]);
  let query = $state('');
  let view = $state<'songs' | 'artists' | 'albums'>('songs');
  let scanning = $state<{ done: number; total: number } | null>(null);
  let needsReconnect = $state(false);
  let error = $state('');
  let player = $state<PlayerState>(INITIAL_PLAYER);

  const found = $derived(sortTracks(searchTracks(tracks, query)));
  const groups = $derived(view === 'songs' ? [] : groupTracks(found, view === 'artists' ? 'artist' : 'album'));
  const nowId = $derived(player.active === 'folder' ? player.now?.id : undefined);
  const canPick = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const toPlayer = (t: Track): PlayerTrack => ({ id: t.id, path: t.path, title: t.title, artist: t.artist, album: t.album, genre: t.genre, color: t.color, cover: t.cover });
  const send = (cmd: object) => browser.runtime.sendMessage({ kind: 'player', ...cmd }).catch(() => undefined);

  function playList(list: Track[], start: number, shuffle = false) {
    if (!list.length) return;
    // Shuffle starts on a random song, not always the first title.
    if (shuffle) start = Math.floor(Math.random() * list.length);
    const from = Math.max(0, Math.min(start - QUEUE / 2, list.length - QUEUE));
    void send({ op: 'folder', tracks: list.slice(from, from + QUEUE).map(toPlayer), start: start - from, shuffle });
  }

  type Handle = FileSystemDirectoryHandle & { queryPermission?(d: { mode: 'read' }): Promise<PermissionState>; requestPermission?(d: { mode: 'read' }): Promise<PermissionState> };
  async function checkPermission() {
    const h = folder?.handle as Handle | undefined;
    needsReconnect = !!h?.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted';
  }

  async function choose() {
    error = '';
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ id: 'study-duo-music', mode: 'read' });
    } catch {
      return; // closed the picker
    }
    // The queue's songs live in the old folder: stop before reading a new one.
    if (player.active === 'folder' && player.playing) await send({ op: 'pause' });
    scanning = { done: 0, total: 0 };
    try {
      tracks = await scanFolder(handle, (done, total) => (scanning = { done, total }));
      folder = await loadFolder();
      needsReconnect = false;
    } catch {
      error = 'Study Duo could not read that folder. Pick it again, or another one.';
    } finally {
      scanning = null;
    }
  }

  async function reconnect() {
    const h = folder?.handle as Handle | undefined;
    if (!h?.requestPermission) return;
    if ((await h.requestPermission({ mode: 'read' })) === 'granted') {
      needsReconnect = false;
      if (player.problem === 'reconnect') void send({ op: 'play' });
    }
  }

  async function forget() {
    if (player.active === 'folder' && player.playing) await send({ op: 'pause' });
    await forgetLibrary();
    folder = null;
    tracks = [];
  }

  let unwatch: (() => void) | undefined;
  let unlisten: (() => void) | undefined;
  onMount(async () => {
    unwatch = playerItem.watch((v) => (player = v ?? INITIAL_PLAYER));
    // Picked or forgotten on another page (the Music page, or the panel's own library): show the same folder here.
    unlisten = onLibraryChange(() => void Promise.all([loadFolder(), loadTracks()]).then(([f, t]) => ((folder = f), (tracks = t)), () => undefined));
    [player, folder, tracks] = await Promise.all([playerItem.getValue(), loadFolder().catch(() => null), loadTracks().catch(() => [])]);
    await checkPermission();
  });
  onDestroy(() => {
    unwatch?.();
    unlisten?.();
  });
  $effect(() => {
    if (player.problem === 'reconnect') needsReconnect = true;
  });
</script>

{#snippet song(t: Track, list: Track[], i: number)}
  <li>
    <button class="song" class:now={t.id === nowId} aria-current={t.id === nowId ? 'true' : undefined} onclick={() => playList(list, i)}>
      <span class="name" title={t.title}>{clip(t.title)}</span>
      <span class="meta">{[t.artist, t.album].filter(Boolean).join(' · ')}</span>
    </button>
  </li>
{/snippet}

<section aria-labelledby="folder-title">
  <h2 class="section-title" id="folder-title">Your music folder</h2>
  {#if !canPick}
    <div class="row"><div class="text"><p class="help">This browser cannot open a folder. Choose songs under Your files instead.</p></div></div>
  {:else if !folder}
    <div class="row">
      <div class="text"><p class="label">Play a folder like a music app</p><p class="help">Study Duo reads the songs' names and covers to list them. The music stays on this computer.</p></div>
      <SignButton label={scanning ? 'Reading…' : 'Choose a folder'} kind="secondary" disabled={!!scanning} onclick={choose} />
    </div>
  {:else}
    {#if needsReconnect}
      <div class="reconnect" role="status">
        <p class="label">Chrome asks again for your folder</p>
        <p class="help">After Chrome restarts it needs one click to read "{folder.name}" again. Nothing was lost.</p>
        <SignButton label="Reconnect folder" onclick={reconnect} />
      </div>
    {/if}
    <div class="tools">
      <input class="search" type="search" placeholder="Search {tracks.length} songs" aria-label="Search your folder" bind:value={query} />
      <Segmented options={VIEWS} value={view} label="Group by" onchange={(v) => (view = v)} />
    </div>
    <div class="actions">
      <SignButton label="Play all" disabled={!found.length} onclick={() => playList(found, 0)} />
      <SignButton label="Shuffle" kind="secondary" disabled={!found.length} onclick={() => playList(found, 0, true)} />
    </div>
    <p class="help info">{folder.name} · {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · on this computer ·
      <button class="link" onclick={choose} disabled={!!scanning}>{scanning ? `Reading ${scanning.done} of ${scanning.total}` : 'Change folder'}</button> ·
      <button class="link" onclick={forget}>Forget folder</button>
    </p>
    {#if error}<p class="help error" role="alert">{error}</p>{/if}
    {#if view === 'songs'}
      <ul class="songs" class:faded={needsReconnect}>
        {#each found.slice(0, SHOWN) as t, i (t.id)}{@render song(t, found, i)}{/each}
      </ul>
      {#if found.length > SHOWN}<p class="help">{found.length - SHOWN} more: search to find them.</p>{/if}
      {#if !found.length}<p class="help">{query ? `No song matches "${query}".` : 'No songs found in this folder.'}</p>{/if}
    {:else}
      {#each groups.slice(0, GROUPS) as g (g.name)}
        <div class="group">
          <h3>{g.name} <span>{g.tracks.length}</span></h3>
          <ul class="songs" class:faded={needsReconnect}>{#each g.tracks.slice(0, SHOWN) as t, i (t.id)}{@render song(t, g.tracks, i)}{/each}</ul>
          {#if g.tracks.length > SHOWN}<p class="help">{g.tracks.length - SHOWN} more: search to find them.</p>{/if}
        </div>
      {/each}
      {#if groups.length > GROUPS}<p class="help">{groups.length - GROUPS} more {view === 'artists' ? 'artists' : 'albums'}: search to find them.</p>{/if}
    {/if}
  {/if}
  {#if scanning && !folder}<p class="help" aria-live="polite">Reading {scanning.done} of {scanning.total} songs…</p>{/if}
</section>

<style>
  /* The page's own spacing between sections does not reach into this component. */
  section { margin-block-end: 32px; }
  .tools { display: grid; gap: 12px; margin-block: 12px; }
  .search {
    block-size: 40px; padding: 0 12px; border: 1px solid var(--color-border-control); border-radius: var(--radius-md); background: var(--color-bg-panel);
    color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui);
  }
  .actions { display: flex; gap: 12px; }
  .info { margin: 12px 0 4px; }
  .link { padding: 0; border: 0; background: none; color: var(--color-text-primary); font: inherit; text-decoration: underline; cursor: pointer; }
  .link:disabled { color: var(--color-text-secondary); text-decoration: none; cursor: default; }
  .songs { margin: 0; padding: 0; list-style: none; }
  .songs.faded { opacity: 0.55; }
  .song {
    inline-size: 100%; display: grid; gap: 2px; padding: 8px 10px; border: 0; border-radius: 4px; background: none; color: var(--color-text-primary);
    text-align: start; cursor: pointer;
  }
  .song:hover { background: var(--color-bg-sunken); }
  .song.now { background: var(--color-bg-sunken); box-shadow: inset 3px 0 0 var(--color-text-focus); }
  .name { font: 600 14px/20px var(--font-family-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song.now .name { font-weight: 700; }
  .meta { font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .group h3 { margin: 16px 0 4px; font: 700 14px/20px var(--font-family-ui); }
  .group h3 span { font: 400 12px/16px var(--font-family-mono); color: var(--color-text-secondary); }
  .reconnect { display: grid; gap: 8px; margin-block: 12px; padding: 12px; border: 2px solid var(--color-text-focus); border-radius: var(--radius-md); background: var(--color-bg-panel); }
  .reconnect p { margin: 0; }
  .error { color: var(--color-text-focus); }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
