<script lang="ts">
  /**
   * A streaming service's own player in the side panel: YouTube, Spotify, SoundCloud, Apple Music or Tidal. Study Duo
   * drives the ones that publish a postMessage channel (src/core/embed-protocols.ts) and tells the background what
   * they play, so the popup card and the panel show and control the same thing. Apple Music and Tidal play with their
   * own buttons here.
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import { CAPS, EMBED_ORIGIN, embedCommand, embedHello, readEmbed, type EmbedNews, type EmbedOp } from '@/core/embed-protocols';
  import { streamAt, type PlayerState, type StreamState } from '@/core/player';
  import { parseStreamLink, type StreamLink } from '@/core/stream-links-parse';
  import { parseYouTubeLink } from '@/core/youtube';
  import { embedSrc } from '@/core/youtube-embed';

  let { player, stream, onsignin }: { player: PlayerState; stream: StreamState; onsignin: () => void } = $props();

  const NAMES = { youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', apple: 'Apple Music', tidal: 'Tidal' } as const;

  let frame: HTMLIFrameElement | undefined = $state();
  let src = $state('');
  let link = $state<StreamLink | null>(null);
  /** YouTube: the link plays a playlist, so next and previous move through it. */
  let list = false;
  let heard = false;
  let listening: ReturnType<typeof setInterval> | undefined;
  let skipping: ReturnType<typeof setTimeout> | undefined;
  /** What the player last said, built up from its partial messages. */
  let news: EmbedNews = {};
  let sent = { state: '', title: '', position: 0, at: 0, problem: '' };
  let problem = $state<'embed' | 'gone' | 'preview' | null>(null);

  const source = $derived(stream.source);
  const name = $derived(NAMES[stream.source]);
  const post = (msgs: unknown[]) => {
    for (const m of msgs) frame?.contentWindow?.postMessage(m, EMBED_ORIGIN[stream.source]);
  };
  const run = (op: EmbedOp) => post(embedCommand(stream.source, op, { list, here: news.position ?? 0 }));
  const wanted = () => player.playing && player.active === stream.source;
  const playingNow = () => news.state === 'playing' || news.state === 'buffering';

  // A new link loads the player again, from where the state says, playing if it plays. The address only: the stream
  // object is new on every player write, and the player must not reload for those.
  const url = $derived(stream.url);
  $effect(() => {
    const parsed = parseStreamLink(url);
    const l = parsed.ok ? parsed.link : null;
    untrack(() => {
      link = l;
      if (!l) return;
      const play = wanted();
      if (l.source === 'youtube') {
        const yt = parseYouTubeLink(l.url);
        if (!yt.ok) return;
        list = !!yt.link.list;
        const from = Math.floor(streamAt(player, Date.now()) / 1000);
        src = embedSrc({ ...yt.link, start: yt.link.video ? from || yt.link.start : 0 }, location.origin, play);
      } else {
        list = false;
        src = l.source === 'soundcloud' ? `${l.embed}&auto_play=${play}` : l.embed;
      }
    });
    problem = null;
    sent = { state: '', title: '', position: 0, at: 0, problem: '' };
    clearTimeout(skipping);
  });

  function loaded() {
    // A new page in the frame: whatever the last one said no longer counts.
    heard = false;
    news = {};
    clearTimeout(skipping);
    clearInterval(listening);
    if (stream.source !== 'youtube') return; // SoundCloud and Spotify say "ready" first; Apple Music and Tidal say nothing
    // YouTube answers once it hears that someone listens; ask until it does.
    let tries = 0;
    listening = setInterval(() => {
      if (heard || ++tries > 40) return clearInterval(listening);
      post(embedHello('youtube'));
    }, 250);
  }

  /** The player is up: match the state (play or pause, volume, place). */
  function settle() {
    heard = true;
    if (stream.source === 'spotify') post([{ command: 'load_complete_ack' }]);
    if (stream.source === 'soundcloud') post(embedHello('soundcloud'));
    if (CAPS[stream.source].volume) run({ op: 'volume', volume: player.volume });
    if (stream.source === 'youtube') post([JSON.stringify({ event: 'command', func: 'unMute', args: [], id: 1, channel: 'widget' })]);
    if (CAPS[stream.source].play) run({ op: wanted() ? 'play' : 'pause' });
  }

  function report() {
    const state = playingNow() ? 'playing' : (news.state ?? '');
    const position = news.position ?? 0;
    const expected = sent.state === 'playing' ? sent.position + (Date.now() - sent.at) : sent.position;
    const moved = Math.abs(position - expected) > 3_000;
    const title = news.title ?? '';
    const p = problem ?? '';
    if (state === sent.state && title === sent.title && p === sent.problem && !moved) return;
    // Nothing worth telling yet: the player is still setting up.
    if (['', 'cued', 'unstarted'].includes(state) && !title && !p) return;
    sent = { state, title, position, at: Date.now(), problem: p };
    void browser.runtime
      .sendMessage({ kind: 'player', op: 'stream-report', url: stream.url, title: news.title ?? null, artist: news.artist ?? null, position, duration: news.duration ?? null, playing: state === 'playing', problem })
      .catch(() => undefined);
  }

  function hear(e: MessageEvent) {
    if (e.source !== frame?.contentWindow) return;
    const n = readEmbed(stream.source, e.origin, e.data);
    if (!n) return;
    if (n.ready || (!heard && stream.source === 'youtube')) settle();
    if (n.newSound) post(['{"method":"getCurrentSound"}']);
    if (n.problem) {
      problem = n.problem;
      // In a playlist, one video that will not play here is skipped after a moment.
      clearTimeout(skipping);
      if (list) skipping = setTimeout(() => run({ op: 'next' }), 5_000);
    } else if (n.video && news.video && n.video !== news.video) problem = null; // the playlist moved on
    if (n.preview !== undefined || n.duration !== undefined) problem = n.preview ? 'preview' : problem === 'preview' ? null : problem;
    news = { ...news, ...n };
    report();
  }

  /** The background's commands: play, pause, next, previous, seek, volume, or the same link again. */
  function command(raw: unknown, sender: { tab?: unknown; url?: string }) {
    if (sender.tab && !sender.url?.startsWith(location.origin)) return; // never from a web page's script
    const m = raw as { target?: unknown; type?: unknown; op?: unknown; at?: unknown; volume?: unknown; url?: unknown };
    if (!m || m.target !== 'panel') return;
    const at = typeof m.at === 'number' ? m.at : 0;
    if (m.type === 'panel-load' && m.url === stream.url) {
      run({ op: 'seek', ms: at });
      run({ op: 'play' });
    } else if (m.type === 'panel-seek') run({ op: 'seek', ms: at });
    else if (m.type === 'panel-volume' && typeof m.volume === 'number') run({ op: 'volume', volume: m.volume });
    else if (m.type === 'panel' && (m.op === 'play' || m.op === 'pause' || m.op === 'next' || m.op === 'prev')) run({ op: m.op });
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

<div class="stream">
  {#if src}
    <iframe bind:this={frame} {src} class="{source} {link?.kind ?? ''}" title="{name} player" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" onload={loaded}></iframe>
  {/if}
  {#if problem === 'preview'}
    <p class="problem" role="status">Only 30 s previews: sign in to Spotify to hear full songs. <button class="link" onclick={onsignin}>Sign in</button></p>
  {:else if problem}
    <p class="problem" role="status">
      {problem === 'embed' ? 'Its owner lets it play only on ' + name + '.' : 'This is gone or private.'}
      <a href={link?.url ?? stream.url} target="_blank" rel="noreferrer">Open on {name}</a>
    </p>
  {:else if !CAPS[source].play}
    <p class="note">Play and pause with {name}'s own buttons, above. It stops when you pick something else.</p>
  {/if}
</div>

<style>
  .stream { display: grid; gap: 8px; }
  /* Each service's own player at its own height; YouTube asks for a visible player of at least 200 by 200 px. */
  iframe { inline-size: 100%; block-size: 352px; border: 0; border-radius: 6px; background: var(--color-bg-sunken); }
  iframe.youtube { block-size: auto; aspect-ratio: 16 / 9; min-block-size: 200px; background: #000; }
  iframe.spotify.track, iframe.spotify.episode { block-size: 152px; }
  iframe.soundcloud { block-size: 166px; }
  iframe.soundcloud.playlist { block-size: 300px; }
  iframe.apple { block-size: 450px; }
  iframe.apple.track { block-size: 175px; }
  .problem, .note { margin: 0; font: 400 13px/18px var(--font-family-ui); color: var(--color-text-secondary); }
  .problem a, .link { color: var(--color-text-primary); font-weight: 600; }
  .link { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
