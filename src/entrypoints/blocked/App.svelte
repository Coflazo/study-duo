<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { blockKeyItem, lockActive, unlockedItem } from '@/background/site-lock';
  import { parseBlockedHash } from '@/core/blocked';
  import { capsuleText } from '@/core/capsule';
  import { clockTime } from '@/core/today-view';
  import { DEFAULT_SETTINGS, normalizeSettings } from '@/core/settings';
  import { settingsItem, timerItem } from '@/core/store';
  import { displayMs, initialState } from '@/core/timer';
  import { addRecords } from '@/core/log';
  import type { BlockedAttempt } from '@/core/db';
  import { ICONS } from '@/ui/icons';
  import LedBoard from '@/ui/LedBoard.svelte';

  const WAIT_S = 10;
  const target = parseBlockedHash(location.hash);
  const opened = Date.now();

  let timer = $state(initialState());
  let settings = $state(DEFAULT_SETTINGS);
  let now = $state(Date.now());
  let asking = $state(false);
  let reason = $state('');
  let opening = $state(false);

  const active = $derived(lockActive(timer));
  const shown = $derived(displayMs(timer, settings, now));
  const progress = $derived(timer.plannedMs ? 1 - shown.ms / timer.plannedMs : 0);
  const label = $derived(
    timer.status === 'paused' ? 'Paused' : timer.endsAt ? `Ends ${clockTime(timer.endsAt)}` : '',
  );
  const waitLeft = $derived(Math.max(0, WAIT_S - Math.floor((now - opened) / 1000)));
  const site = target?.domain ?? 'This site';
  /** Tabs the block itself closed carry ?swept: going back would only reopen the closed site. */
  const swept = new URLSearchParams(location.search).has('swept');
  /** Only Study Duo's own redirects carry the session key. */
  const key = new URLSearchParams(location.search).get('k');

  let ticker: ReturnType<typeof setInterval> | undefined;
  const unwatch: Array<() => void> = [];
  onMount(async () => {
    unwatch.push(timerItem.watch((v) => (timer = v ?? initialState())));
    unwatch.push(settingsItem.watch((v) => (settings = normalizeSettings(v))));
    timer = await timerItem.getValue();
    settings = normalizeSettings(await settingsItem.getValue());
    ticker = setInterval(() => (now = Date.now()), 250);
    // One attempt per visit during a block; tabs the block itself closed are not attempts. Real redirects are
    // top-level and carry the session key: a page that frames or opens this one must not be able to write attempts.
    if (target && !swept && key && window.top === window && lockActive(timer) && settings.measure.blocked && key === (await blockKeyItem.getValue())) {
      attempt = { id: `${opened}-${target.domain}`, at: opened, domain: target.domain, unlocked: false, reasonGiven: false };
      await addRecords('blocks', [attempt]).catch(console.error);
    }
  });
  let attempt: BlockedAttempt | null = null;
  onDestroy(() => {
    clearInterval(ticker);
    unwatch.forEach((u) => u());
  });

  async function backToWork() {
    if (!swept && history.length > 1) return history.back();
    const tab = await browser.tabs.getCurrent();
    const siblings = await browser.tabs.query({ windowId: tab?.windowId });
    if (tab?.id !== undefined && siblings.length > 1) return browser.tabs.remove(tab.id);
    location.replace(browser.runtime.getURL('/dashboard.html')); // the window's last tab: keep the window
  }

  /** The rules change in the background; wait until they let this site through, or the redirect would loop. */
  async function waitForAllow(domain: string) {
    for (let i = 0; i < 30; i++) {
      const rules = await browser.declarativeNetRequest.getSessionRules();
      if (rules.some((r) => r.action.type === 'allow' && (r.priority ?? 0) >= 1000 && r.condition.requestDomains?.includes(domain))) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function openAnyway(e: SubmitEvent) {
    e.preventDefault();
    if (!target || reason.trim().length < 3 || opening) return;
    opening = true;
    const list = await unlockedItem.getValue();
    await unlockedItem.setValue([...new Set([...list, target.domain])]);
    await waitForAllow(target.domain);
    // Only that a reason was given; the words themselves stay on this page.
    if (attempt) await addRecords('blocks', [{ ...attempt, unlocked: true, reasonGiven: true }]).catch(console.error);
    location.replace(target.url);
  }
</script>

<main>
  {#if active}
    <section class="plate">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.lock} /></svg>
      <h1>{target ? `${site} is closed` : 'This site is closed'}</h1>
      <p>until this study block ends.</p>
    </section>

    <LedBoard text={capsuleText(shown.ms, shown.countsUp)} {progress} {label} paused={timer.status === 'paused'} />

    <div class="actions">
      <button class="primary" onclick={backToWork}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.book} /></svg>
        Back to work
      </button>
      {#if target && !settings.hardLock && !asking}
        <button class="secondary" disabled={waitLeft > 0} onclick={() => (asking = true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS.lock} /></svg>
          {waitLeft > 0 ? `Open anyway in ${waitLeft} s` : 'Open anyway'}
        </button>
      {/if}
    </div>

    {#if asking && target}
      <form onsubmit={openAnyway}>
        <label for="reason">Why open {site} now?</label>
        <input id="reason" bind:value={reason} maxlength="200" autocomplete="off" placeholder="A few words is enough" />
        <button class="secondary" type="submit" disabled={reason.trim().length < 3 || opening}>Open {site}</button>
      </form>
    {/if}

    <p class="note">
      {settings.hardLock
        ? 'Hard lock is on, so this site opens when the block ends.'
        : 'Opening it anyway asks you why first. A short wait makes people open distracting sites far less often (Grüning et al., 2023).'}
    </p>
  {:else}
    <section class="plate idle">
      <h1>Your study block is over.</h1>
      <p>{target ? `${site} is open again.` : 'Every site is open again.'}</p>
    </section>
    {#if target}
      <div class="actions"><button class="primary" onclick={() => location.replace(target.url)}>Open {site}</button></div>
    {/if}
  {/if}
</main>

<style>
  :global(html) { color-scheme: light dark; }
  :global(body) {
    margin: 0; min-block-size: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: var(--color-bg-canvas); color: var(--color-text-primary); font-family: var(--font-family-ui);
  }
  main { display: flex; flex-direction: column; align-items: center; gap: 24px; inline-size: 100%; max-inline-size: 560px; text-align: center; }
  .plate {
    display: flex; flex-direction: column; align-items: center; gap: 16px; box-sizing: border-box; max-inline-size: 100%;
    padding: 32px 48px; border-radius: 8px; background: var(--color-bg-plate-focus); color: var(--color-text-on-plate);
  }
  .plate.idle { background: var(--color-bg-plate-idle); }
  .plate svg { inline-size: 40px; block-size: 40px; fill: currentColor; }
  h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 800; overflow-wrap: anywhere; }
  .plate p { margin: 0; font-size: 14px; line-height: 20px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; block-size: 48px; padding: 12px 20px;
    border-radius: var(--radius-md); font: 700 20px/24px var(--font-family-ui); cursor: pointer; transition: transform 120ms ease;
  }
  button svg { inline-size: 20px; block-size: 20px; fill: currentColor; }
  button:active:not(:disabled) { transform: scale(0.97); }
  button:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .primary { border: 0; background: var(--color-bg-action); color: var(--color-text-on-action); }
  .secondary { border: 2px solid var(--color-border-strong); background: transparent; color: var(--color-text-primary); }
  button:disabled { cursor: not-allowed; background: var(--color-bg-disabled); border-color: transparent; color: var(--color-text-disabled); }
  form { display: flex; flex-direction: column; align-items: stretch; gap: 8px; inline-size: 100%; max-inline-size: 440px; text-align: start; }
  label { font: 600 14px/20px var(--font-family-ui); }
  input {
    block-size: 44px; padding: 0 12px; border: 2px solid var(--color-border-control); border-radius: var(--radius-md);
    background: var(--color-bg-panel); color: var(--color-text-primary); font: 400 16px/24px var(--font-family-ui);
  }
  input:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
  .note { margin: 0; max-inline-size: 440px; font-size: 12px; line-height: 16px; color: var(--color-text-secondary); }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
