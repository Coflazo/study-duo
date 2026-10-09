<script lang="ts">
  /**
   * The service's own player in the side panel (YouTube for now). Study Duo drives it through YouTube's postMessage
   * API and tells the background what it plays, so the popup card and the panel show and control the same thing.
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import { streamAt, type PlayerState, type StreamState } from '@/core/player';
  import { canonicalYouTube, parseYouTubeLink, type YouTubeLink } from '@/core/youtube';
  import { embedSrc, readYouTube, ytCommand, YT_ORIGIN, type YouTubeNews } from '@/core/youtube-embed';

  let { player, stream, shown }: { player: PlayerState; stream: StreamState; shown: boolean } = $props();

  let frame: HTMLIFrameElement | undefined = $state();
  let src = $state('');
  let link = $state<YouTubeLink | null>(null);
  let heard = false;
  let listening: ReturnType<typeof setInterval> | undefined;
  let skipping: ReturnType<typeof setTimeout> | undefined;
  /** What the player last said, built up from its partial messages. */
  let news: YouTubeNews = {};
  let sent = { state: '', title: '', position: 0, at: 0, problem: '' };
  let problem = $state<'embed' | 'gone' | null>(null);

  const post = (func: string, args: unknown[] = []) => frame?.contentWindow?.postMessage(ytCommand(func, args), YT_ORIGIN);
  const playingNow = () => news.state === 'playing' || news.state === 'buffering';

  // A new link loads the player again, from where the state says, playing if it plays.
  // The address only: the stream object is new on every player write, and the player must not reload for those.
  const url = $derived(stream.url);
  $effect(() => {
    const parsed = parseYouTubeLink(url);
    const l = parsed.ok ? parsed.link : null;
    untrack(() => {
      link = l;
      if (!l) return;
      const from = Math.floor(streamAt(player, Date.now()) / 1000);
      src = embedSrc({ ...l, start: l.video ? from || l.start : 0 }, location.origin, player.playing && player.active === 'youtube');
    });
    news = {};
    heard = false;
    problem = null;
    sent = { state: '', title: '', position: 0, at: 0, problem: '' };
  });

  function loaded() {
    clearInterval(listening);
    // The player answers once it hears that someone listens; ask until it does.
    let tries = 0;
    listening = setInterval(() => {
      if (heard || ++tries > 40) return clearInterval(listening);
      frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN);
    }, 250);
  }

  function report(force = false) {
    const state = playingNow() ? 'playing' : (news.state ?? '');
    const position = news.position ?? 0;
    const expected = sent.state === 'playing' ? sent.position + (Date.now() - sent.at) : sent.position;
    const moved = Math.abs(position - expected) > 3_000;
    const title = news.title ?? '';
    const p = problem ?? '';
    if (!force && state === sent.state && title === sent.title && p === sent.problem && !moved) return;
    // Nothing worth telling yet: the player is still setting up.
    if (['', 'cued', 'unstarted'].includes(state) && !title && !p) return;
    sent = { state, title, position, at: Date.now(), problem: p };
    void browser.runtime
      .sendMessage({ kind: 'player', op: 'stream-report', url: stream.url, title: news.title ?? null, artist: news.artist ?? null, position, duration: news.duration ?? null, playing: state === 'playing', problem })
      .catch(() => undefined);
  }

  function hear(e: MessageEvent) {
    if (e.source !== frame?.contentWindow) return;
    const n = readYouTube(e.origin, e.data);
    if (!n) return;
    if (!heard) {
      heard = true;
      post('setVolume', [Math.round(player.volume * 100)]);
      post('unMute');
      // The state may have said "play" before this player could hear it.
      if (player.playing && player.active === stream.source) post('playVideo');
    }
    if (n.problem) {
      problem = n.problem;
      // In a playlist, one video that will not play here is skipped after a moment.
      if (link?.list) skipping = setTimeout(() => post('nextVideo'), 5_000);
    } else if (n.video && news.video && n.video !== news.video) problem = null; // the playlist moved on
    news = { ...news, ...n };
    report();
  }

  /** The background's commands: play, pause, next, previous, seek, volume, or the same link again. */
  function command(raw: unknown) {
    const m = raw as { target?: unknown; type?: unknown; op?: unknown; at?: unknown; volume?: unknown; url?: unknown };
    if (!m || m.target !== 'panel') return;
    const at = typeof m.at === 'number' ? m.at / 1000 : 0;
    const here = news.position !== undefined ? news.position / 1000 : 0;
    if (m.type === 'panel-load' && m.url === stream.url) {
      post('seekTo', [at, true]);
      post('playVideo');
    } else if (m.type === 'panel-seek') post('seekTo', [at, true]);
    else if (m.type === 'panel-volume' && typeof m.volume === 'number') post('setVolume', [Math.round(m.volume * 100)]);
    else if (m.type === 'panel' && m.op === 'play') post('playVideo');
    else if (m.type === 'panel' && m.op === 'pause') post('pauseVideo');
    // A playlist moves between videos; one long video jumps 30 seconds.
    else if (m.type === 'panel' && m.op === 'next') link?.list ? post('nextVideo') : post('seekTo', [here + 30, true]);
    else if (m.type === 'panel' && m.op === 'prev') link?.list && here < 3 ? post('previousVideo') : post('seekTo', [link?.list ? 0 : Math.max(0, here - 30), true]);
  }

  // Now and then while it plays, so the place shown elsewhere stays right after a long stretch.
  const beat = setInterval(() => playingNow() && report(), 15_000);
  onMount(() => {
    window.addEventListener('message', hear);
    browser.runtime.onMessage.addListener(command);
  });
  onDestroy(() => {
    clearInterval(beat);
    clearInterval(listening);
    clearTimeout(skipping);
    window.removeEventListener('message', hear);
    browser.runtime.onMessage.removeListener(command);
  });
</script>

<div class="stream" class:shown>
  {#if src}
    <iframe bind:this={frame} {src} title="YouTube player" allow="autoplay; encrypted-media; picture-in-picture" onload={loaded}></iframe>
  {/if}
  {#if problem}
    <p class="problem" role="status">
      {problem === 'embed' ? 'Its owner lets it play only on YouTube.' : 'This video is gone or private.'}
      <a href={link ? canonicalYouTube(link) : stream.url} target="_blank" rel="noreferrer">Open on YouTube</a>
    </p>
  {/if}
</div>

<style>
  .stream { display: none; }
  .stream.shown { display: grid; gap: 8px; }
  /* YouTube asks for a visible player of at least 200 by 200 px; the panel is at least 300 px wide. */
  iframe { inline-size: 100%; aspect-ratio: 16 / 9; min-block-size: 200px; border: 0; border-radius: 6px; background: #000; }
  .problem { margin: 0; font: 400 13px/18px var(--font-family-ui); color: var(--color-text-secondary); }
  .problem a { color: var(--color-text-primary); font-weight: 600; }
</style>
