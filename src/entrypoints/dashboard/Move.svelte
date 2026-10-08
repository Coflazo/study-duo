<script lang="ts">
  /**
   * Figma Dashboard / Your data, move (83:308) with the panels Move / Showing codes (84:222) and Move / Scanning
   * (84:233): settings, site lists and to-dos to another computer, as a file or as QR codes. History and connections
   * stay here. The camera runs only while the Scan panel is open; frames are read in memory and never kept.
   */
  import { onDestroy } from 'svelte';
  import { normalizeSettings } from '@/core/settings';
  import { normalizeSites } from '@/core/sites';
  import { settingsItem, sitesItem } from '@/core/store';
  import { normalizeTodos, todosItem } from '@/core/todos';
  import { HardLockError, moveIn as applyMove } from '@/core/site-store';
  import { buildBundle, decodeBundle, encodeBundle, FrameCollector, parseBundle, toFrames, type MoveBundle } from '@/core/transfer';
  import { clockTime } from '@/core/today-view';
  import { qrPath } from '@/ui/qr';
  import SignButton from '@/ui/SignButton.svelte';

  const MAX_FILE = 1_000_000;
  let mode = $state<'idle' | 'showing' | 'scanning'>('idle');
  let frames = $state<string[]>([]);
  let shown = $state(0);
  let progress = $state({ have: 0, of: 0 });
  let preview = $state<MoveBundle | null>(null);
  let message = $state('');
  let fileInput = $state<HTMLInputElement>();
  let video = $state<HTMLVideoElement>();
  let cycle: ReturnType<typeof setInterval> | undefined;
  let scanLoop: ReturnType<typeof setInterval> | undefined;
  let stream: MediaStream | null = null;
  /** Each Scan press is one run; a stream that arrives for an old run (Cancel during the camera prompt) is stopped at once. */
  let scanRun = 0;

  const code = $derived(frames.length ? qrPath(frames[shown] ?? '') : null);

  async function current(): Promise<MoveBundle> {
    const [settings, sites, todos] = await Promise.all([settingsItem.getValue(), sitesItem.getValue(), todosItem.getValue()]);
    return buildBundle({ settings: normalizeSettings(settings), sites: normalizeSites(sites), todos: normalizeTodos(todos) }, Date.now());
  }

  async function saveFile() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(await current(), null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `study-duo-move-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function showCodes() {
    message = '';
    const id = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    frames = toFrames(await encodeBundle(await current()), id);
    shown = 0;
    mode = 'showing';
    clearInterval(cycle);
    cycle = setInterval(() => (shown = (shown + 1) % frames.length), 900);
  }
  function stopShowing() {
    clearInterval(cycle);
    frames = [];
    if (mode === 'showing') mode = 'idle';
  }

  async function loadFile() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    message = '';
    try {
      preview = file.size <= MAX_FILE ? parseBundle(JSON.parse(await file.text())) : null;
    } catch {
      preview = null;
    }
    if (!preview) message = 'That file is not a Study Duo move file. Nothing changed.';
  }

  async function scan() {
    message = '';
    preview = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      message = 'This browser cannot use a camera here. Use a move file instead.';
      return;
    }
    const collector = new FrameCollector();
    progress = collector.progress();
    mode = 'scanning';
    const run = ++scanRun;
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    } catch {
      if (run === scanRun) stopScan();
      message = 'The camera is off or not allowed. Use a move file instead.';
      return;
    }
    if (run !== scanRun) return s.getTracks().forEach((t) => t.stop()); // cancelled while the browser asked
    stream = s;
    video!.srcObject = s;
    await video!.play().catch(() => undefined);
    const { default: jsQR } = await import('jsqr'); // only loaded when someone scans
    if (run !== scanRun) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    clearInterval(scanLoop);
    scanLoop = setInterval(async () => {
      if (!video?.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (!found) return;
      collector.add(found.data);
      progress = collector.progress();
      const text = collector.text();
      if (text === null) return;
      stopScan();
      preview = await decodeBundle(text);
      if (!preview) message = 'Those codes are not a Study Duo move. Nothing changed.';
    }, 200);
  }
  function stopScan() {
    scanRun++;
    clearInterval(scanLoop);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    if (mode === 'scanning') mode = 'idle';
  }

  async function moveIn() {
    const b = preview;
    if (!b) return;
    try {
      const added = await applyMove($state.snapshot(b) as MoveBundle);
      preview = null;
      message = `Moved in: your settings and site lists, and ${added} ${added === 1 ? 'to-do' : 'to-dos'} added.`;
    } catch (e) {
      message = e instanceof HardLockError ? 'Hard lock is on until this study block ends. Nothing changed; move in after the block.' : 'Moving in failed. Nothing changed.';
    }
  }
  const blockedCount = (b: MoveBundle) => Object.values(b.sites).filter((c) => c === 'blocked').length;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const madeWhen = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? `today at ${clockTime(t)}` : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'long' }));

  // Leaving the page, the screen or the tab always turns the camera off.
  const onHide = () => stopScan();
  const onVisibility = () => document.hidden && stopScan();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onVisibility);
  onDestroy(() => {
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onVisibility);
    stopScan();
    stopShowing();
  });
</script>

<section aria-labelledby="move-title">
  <h2 class="section-title" id="move-title">Move to another computer</h2>
  {#if mode === 'showing' && code}
    <div class="panel">
      <svg class="qr" viewBox="-4 -4 {code.n + 8} {code.n + 8}" role="img" aria-label="Move code {shown + 1} of {frames.length}">
        <rect x="-4" y="-4" width={code.n + 8} height={code.n + 8} fill="#fff" />
        <path d={code.d} fill="#000" />
      </svg>
      <p class="count" aria-live="off">Code {shown + 1} of {frames.length}</p>
      <p class="help">Hold this screen up to the other computer's camera, in Your data, Scan QR codes. The codes repeat until it has read them all.</p>
      <div><SignButton label="Done" kind="secondary" onclick={stopShowing} /></div>
    </div>
  {:else if mode === 'scanning'}
    <div class="panel">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} class="camera" muted playsinline aria-label="Camera view, used only to read the move codes"></video>
      <p class="label" role="status">{progress.of ? `${progress.have} of ${progress.of} codes read` : 'Looking for the first code…'}</p>
      <p class="help">The camera is on only while this panel is open. Nothing it sees is kept or sent.</p>
      <div><SignButton label="Cancel" kind="secondary" onclick={stopScan} /></div>
    </div>
  {:else}
    <div class="row"><div class="text"><p class="help">Settings, site lists and to-dos. Your history and connections stay on this computer.</p></div></div>
    <div class="row">
      <div class="text"><p class="label">Save a move file</p><p class="help">One small file. Open it on the other computer with Load a move file.</p></div>
      <SignButton label="Save file" kind="secondary" onclick={saveFile} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Show as QR codes</p><p class="help">For a computer with a camera: read them there with Scan QR codes.</p></div>
      <SignButton label="Show codes" kind="secondary" onclick={showCodes} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Load a move file</p><p class="help">Replaces settings and site lists here, and adds the to-dos.</p></div>
      <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={loadFile} />
      <SignButton label="Load file" kind="secondary" onclick={() => fileInput?.click()} />
    </div>
    <div class="row">
      <div class="text"><p class="label">Scan QR codes</p><p class="help">Uses the camera only while you scan. No picture is kept.</p></div>
      <SignButton label="Scan" kind="secondary" onclick={scan} />
    </div>
  {/if}
  {#if preview}
    <div class="panel" role="region" aria-label="Ready to move in">
      <p class="label">Ready to move in</p>
      <p class="help">From another computer, made {madeWhen(preview.at)}: your settings, {plural(Object.keys(preview.sites).length, 'site', 'sites')} ({blockedCount(preview)} blocked) and {plural(preview.todos.length, 'to-do', 'to-dos')}. Study blocks will {preview.settings.siteMode === 'allowOnlyStudy' ? 'allow only Study sites' : 'close Blocked sites'}, and hard lock will be {preview.settings.hardLock ? 'on' : 'off'}.</p>
      <p class="help">Settings and site lists here will be replaced and the to-dos added to yours. Your history, how long it is kept and what Study Duo measures stay as they are here.</p>
      <div class="buttons"><SignButton label="Move in" onclick={moveIn} /><SignButton label="Cancel" kind="secondary" onclick={() => (preview = null)} /></div>
    </div>
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
</section>

<style>
  section { margin-block-start: 32px; }
  .row :global(button) { flex: 0 0 auto; }
  .panel { display: flex; flex-direction: column; gap: 12px; margin-block-start: 12px; padding: 24px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-bg-panel); }
  /* A QR code needs dark on light to scan, so it stays black on white in dark mode too. */
  .qr { inline-size: min(100%, 320px); aspect-ratio: 1; border-radius: 4px; }
  .camera { inline-size: 100%; aspect-ratio: 16 / 9; border-radius: 4px; background: var(--color-bg-board); object-fit: cover; }
  .count { margin: 0; font: 500 16px/20px var(--font-family-mono); }
  .label { margin: 0; font: 600 14px/20px var(--font-family-ui); }
  .help { margin: 0; font: 400 12px/16px var(--font-family-ui); color: var(--color-text-secondary); }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  .message { margin: 12px 0 0; font: 600 14px/20px var(--font-family-ui); }
</style>
