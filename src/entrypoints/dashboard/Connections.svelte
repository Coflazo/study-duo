<script lang="ts">
  /** Figma Dashboard / Connections (82:153): course deadlines from a calendar link, listening history, the phone QR. */
  import { onDestroy, onMount } from 'svelte';
  import qrcode from 'qrcode-generator';
  import { connectionsItem, DEFAULT_CONNECTIONS, feedUrl, lastfmKey, loadConnections, normalizeConnections, saveConnections, userName, type Connections } from '@/core/connections';
  import { clockTime } from '@/core/today-view';
  import type { createLive } from '@/ui/live.svelte';
  import SignButton from '@/ui/SignButton.svelte';
  import { helperItem, type HelperState } from '@/core/helper';

  let { data }: { data: ReturnType<typeof createLive> } = $props();
  const live = $derived(data.live);

  const PHONE_PAGE = 'https://coflazo.github.io/study-duo/phone';
  type Kind = keyof Connections;

  let conn = $state<Connections>(DEFAULT_CONNECTIONS);
  let feed = $state('');
  let lbUser = $state('');
  let fmUser = $state('');
  let fmKey = $state('');
  let busy = $state<Record<Kind, boolean>>({ deadlines: false, listenbrainz: false, lastfm: false });
  let invalid = $state<Record<Kind, string>>({ deadlines: '', listenbrainz: '', lastfm: '' });

  let helper = $state<HelperState>({ on: false, app: null, error: null });
  let helperNote = $state('');

  const unwatch: Array<() => void> = [];
  onMount(async () => {
    unwatch.push(connectionsItem.watch((v) => (conn = normalizeConnections(v))), helperItem.watch((v) => v && (helper = v)));
    conn = normalizeConnections(await connectionsItem.getValue());
    helper = await helperItem.getValue();
  });
  onDestroy(() => unwatch.forEach((u) => u()));

  // Desktop apps: the permission is asked for at the click (browsers require it) and handed back when turned off.
  async function helperOn() {
    helperNote = '';
    const granted = await browser.permissions.request({ permissions: ['nativeMessaging'] }).catch(() => false);
    if (!granted) {
      helperNote = 'Study Duo needs your permission to talk to the desktop helper.';
      return;
    }
    await helperItem.setValue({ on: true, app: null, error: null });
  }
  async function helperOff() {
    await helperItem.setValue({ on: false, app: null, error: null });
    await browser.permissions.remove({ permissions: ['nativeMessaging'] }).catch(() => false);
  }

  /** Saves a change on top of the stored connections, secrets included (they never pass through this page's state). */
  async function save(change: (c: Connections) => Connections) {
    await saveConnections(change(await loadConnections()));
  }
  async function check(kind: Kind) {
    busy[kind] = true;
    try {
      await browser.runtime.sendMessage({ kind: 'connections', op: 'sync', which: kind });
    } finally {
      busy[kind] = false;
    }
  }
  const fresh = { lastSync: null, count: 0, error: null };

  async function connectFeed() {
    const url = feedUrl(feed);
    invalid.deadlines = url ? '' : 'Paste the https link from your course calendar. It usually ends in .ics.';
    if (!url) return;
    await save((c) => ({ ...c, deadlines: { ...c.deadlines, ...fresh, url } }));
    feed = '';
    await check('deadlines');
  }
  async function connectLb() {
    const user = userName(lbUser);
    invalid.listenbrainz = user ? '' : 'Type your ListenBrainz user name, without spaces.';
    if (!user) return;
    await save((c) => ({ ...c, listenbrainz: { ...fresh, user } }));
    lbUser = '';
    await check('listenbrainz');
  }
  async function connectFm() {
    const user = userName(fmUser);
    const key = lastfmKey(fmKey);
    invalid.lastfm = !user ? 'Type your Last.fm user name, without spaces.' : !key ? 'The API key is 32 letters and digits, from last.fm/api.' : '';
    if (!user || !key) return;
    await save((c) => ({ ...c, lastfm: { ...fresh, user, key } }));
    fmUser = '';
    fmKey = '';
    await check('lastfm');
  }
  const disconnect = (kind: Kind) =>
    save((c) =>
      kind === 'deadlines' ? { ...c, deadlines: { ...c.deadlines, ...fresh, url: null } }
      : kind === 'listenbrainz' ? { ...c, listenbrainz: { ...fresh, user: null } }
      : { ...c, lastfm: { ...fresh, user: null, key: null } },
    );

  const checked = (kind: Kind) => {
    const c = conn[kind];
    if (busy[kind]) return 'Checking now…';
    if (c.lastSync === null) return 'Not checked yet.';
    return `Checked at ${clockTime(c.lastSync)}. It checks again every ${kind === 'deadlines' ? '6 hours' : '30 minutes'}.`;
  };

  // The phone page's address as a QR code, drawn here: nothing is fetched to make it.
  const qr = (() => {
    const q = qrcode(0, 'M');
    q.addData(PHONE_PAGE);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  })();
</script>

<h1 class="screen-title">Connections</h1>
<div class="columns">
  <div>
    <section aria-labelledby="deadlines-title">
      <h2 class="section-title" id="deadlines-title">Course deadlines</h2>
      {#if conn.deadlines.host}
        <div class="row">
          <div class="text">
            <p class="label">{conn.deadlines.count} {conn.deadlines.count === 1 ? 'deadline' : 'deadlines'} in your to-do list</p>
            <p class="help" aria-live="polite">From {conn.deadlines.host}. {checked('deadlines')}</p>
            {#if conn.deadlines.error}<p class="help error" role="status">Last check failed: {conn.deadlines.error}</p>{/if}
          </div>
          <SignButton label="Check now" kind="secondary" disabled={busy.deadlines} onclick={() => check('deadlines')} />
          <SignButton label="Disconnect" kind="secondary" onclick={() => disconnect('deadlines')} />
        </div>
      {:else}
        <div class="row">
          <div class="text">
            <label class="label" for="feed">Calendar link</label>
            <p class="help" id="feed-help">In Canvas: Calendar, then Calendar feed. Copy the link and paste it here. Any calendar link that ends in .ics works.</p>
          </div>
        </div>
        <form class="row fields" onsubmit={(e) => (e.preventDefault(), connectFeed())}>
          <input id="feed" class="mono" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/calendar.ics" aria-describedby="feed-help feed-error" bind:value={feed} />
          <SignButton label="Import" kind="secondary" type="submit" disabled={busy.deadlines} />
          {#if invalid.deadlines}<p class="help error" id="feed-error" role="alert">{invalid.deadlines}</p>{/if}
        </form>
      {/if}
      <div class="row">
        <div class="text"><p class="help">Study Duo asks that link for your calendar and adds what is due in the next 8 weeks as to-dos with their due date. It sends nothing else. Disconnecting stops the checks; the to-dos stay.</p></div>
      </div>
    </section>
    <section aria-labelledby="sends-title">
      <h2 class="section-title" id="sends-title">What these send</h2>
      <div class="row">
        <div class="text"><p class="help">Each connection only asks for your own data, straight from this browser to that service. While all of them are off, Study Duo makes no internet requests.</p></div>
      </div>
    </section>
  </div>
  <div>
    <section aria-labelledby="listening-title">
      <h2 class="section-title" id="listening-title">Listening history</h2>
      {#if !live.settings.measure.music}
        <div class="row"><div class="text"><p class="help" role="status">Songs you play is off in Your data, so nothing is brought in.</p></div></div>
      {/if}
      {#if conn.listenbrainz.user}
        <div class="row">
          <div class="text">
            <p class="label">ListenBrainz: {conn.listenbrainz.user}</p>
            <p class="help" aria-live="polite">{checked('listenbrainz')} {conn.listenbrainz.count} {conn.listenbrainz.count === 1 ? 'song' : 'songs'} counted in your blocks so far.</p>
            {#if conn.listenbrainz.error}<p class="help error" role="status">Last check failed: {conn.listenbrainz.error}</p>{/if}
          </div>
          <SignButton label="Check now" kind="secondary" disabled={busy.listenbrainz} onclick={() => check('listenbrainz')} />
          <SignButton label="Disconnect" kind="secondary" onclick={() => disconnect('listenbrainz')} />
        </div>
      {:else}
        <div class="row">
          <div class="text">
            <p class="label" id="lb-title">ListenBrainz</p>
            <p class="help" id="lb-help">Free, no key. Songs your phone and desktop apps send to ListenBrainz count for the study blocks they played in.</p>
          </div>
        </div>
        <form class="row fields" onsubmit={(e) => (e.preventDefault(), connectLb())}>
          <input aria-labelledby="lb-title" aria-describedby="lb-help lb-error" autocomplete="off" spellcheck="false" placeholder="Username" bind:value={lbUser} />
          <SignButton label="Connect" kind="secondary" type="submit" disabled={busy.listenbrainz} />
          {#if invalid.listenbrainz}<p class="help error" id="lb-error" role="alert">{invalid.listenbrainz}</p>{/if}
        </form>
      {/if}
      {#if conn.lastfm.user}
        <div class="row">
          <div class="text">
            <p class="label">Last.fm: {conn.lastfm.user}</p>
            <p class="help" aria-live="polite">{checked('lastfm')} {conn.lastfm.count} {conn.lastfm.count === 1 ? 'song' : 'songs'} counted in your blocks so far.</p>
            {#if conn.lastfm.error}<p class="help error" role="status">Last check failed: {conn.lastfm.error}</p>{/if}
          </div>
          <SignButton label="Check now" kind="secondary" disabled={busy.lastfm} onclick={() => check('lastfm')} />
          <SignButton label="Disconnect" kind="secondary" onclick={() => disconnect('lastfm')} />
        </div>
      {:else}
        <div class="row">
          <div class="text">
            <p class="label" id="fm-title">Last.fm</p>
            <p class="help" id="fm-help">Needs your Last.fm username and a free API key from last.fm/api.</p>
          </div>
        </div>
        <form class="row fields" onsubmit={(e) => (e.preventDefault(), connectFm())}>
          <input aria-label="Last.fm username" aria-describedby="fm-help fm-error" autocomplete="off" spellcheck="false" placeholder="Username" bind:value={fmUser} />
          <input aria-label="Last.fm API key" aria-describedby="fm-help fm-error" class="mono" autocomplete="off" spellcheck="false" placeholder="API key" bind:value={fmKey} />
          <SignButton label="Connect" kind="secondary" type="submit" disabled={busy.lastfm} />
          {#if invalid.lastfm}<p class="help error" id="fm-error" role="alert">{invalid.lastfm}</p>{/if}
        </form>
      {/if}
    </section>
    <section aria-labelledby="desktop-title">
      <h2 class="section-title" id="desktop-title">Desktop apps</h2>
      <div class="row">
        <div class="text">
          <p class="label">Songs from desktop players</p>
          <p class="help">With the desktop helper, songs from Music, VLC and other desktop players count too, like the songs in your tabs. Install it with the same install line plus --helper (on Windows, -Helper). Spotify's app shows here but stays out of your insights, as Spotify's rules ask.</p>
          {#if helper.on && !helper.error}<p class="help" aria-live="polite">{helper.app ? `On. Last heard from ${helper.app}.` : 'On. Nothing heard from your desktop players yet.'}</p>{/if}
          {#if helper.on && helper.error}<p class="help error" role="status">{helper.error}</p>{/if}
          {#if helperNote}<p class="help error" role="alert">{helperNote}</p>{/if}
        </div>
        {#if helper.on}<SignButton label="Turn off" kind="secondary" onclick={helperOff} />{:else}<SignButton label="Turn on" kind="secondary" onclick={helperOn} />{/if}
      </div>
    </section>
    <section aria-labelledby="phone-title">
      <h2 class="section-title" id="phone-title">Your phone</h2>
      <div class="row">
        <div class="text">
          <p class="label">Scan to set it up</p>
          <p class="help">Opens a page on your phone that shows how to send what you play to ListenBrainz or Last.fm. The code holds only that page address: <span class="mono">coflazo.github.io/study-duo/phone</span></p>
        </div>
        <svg class="qr" viewBox="-4 -4 {qr.n + 8} {qr.n + 8}" role="img" aria-label="QR code for coflazo.github.io/study-duo/phone">
          <rect x="-4" y="-4" width={qr.n + 8} height={qr.n + 8} fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
      </div>
    </section>
  </div>
</div>

<style>
  section + section { margin-block-start: 32px; }
  /* Buttons keep their width and wrap below the text when the column is narrow. */
  .row :global(button) { flex: 0 0 auto; }
  input {
    flex: 1 1 140px; min-inline-size: 0; box-sizing: border-box; block-size: 44px; padding: 0 12px;
    border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 14px/20px var(--font-family-ui);
  }
  input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .mono { font-family: var(--font-family-mono); }
  .error { flex-basis: 100%; color: var(--color-text-focus); }
  /* A QR code needs dark on light to scan, so it stays black on white in dark mode too. */
  .qr { flex: none; inline-size: 148px; block-size: 148px; border-radius: 4px; }
</style>
