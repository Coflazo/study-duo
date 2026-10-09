// The install page: works out the computer and the browser, builds the one install line for the browsers picked, shows
// the clicks each browser still needs (with real screenshots when they exist), and notices when Study Duo arrived.
// Nothing here talks to any server but this site.
(() => {
  'use strict';

  const EXT_ID = 'bcggiingdefmehpjcalkfpdnehpcieon';
  const RAW = 'https://raw.githubusercontent.com/Coflazo/study-duo/main/';
  const NAMES = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave', arc: 'Arc', opera: 'Opera', vivaldi: 'Vivaldi', firefox: 'Firefox' };
  const CHROMIUM = ['chrome', 'edge', 'brave', 'arc', 'opera', 'vivaldi'];
  const OS = {
    mac: {
      label: 'a Mac', terminal: 'Terminal', enter: 'Return', script: 'install.sh',
      line: (b) => `curl -fsSL ${RAW}install.sh | sh -s -- --browsers ${b}`,
      open: 'Press Command and Space together, type Terminal, press Return. Then paste with Command and V.',
      folder: ['Go to the folder', 'Press Command, Shift and G, paste with Command and V, press Return, then click Select. The address is already copied.'],
    },
    windows: {
      label: 'Windows', terminal: 'PowerShell', enter: 'Enter', script: 'install.ps1',
      line: (b) => `powershell -c "& ([scriptblock]::Create((irm ${RAW}install.ps1))) -Browsers ${b}"`,
      open: 'Press the Windows key, type PowerShell, press Enter. Then paste with Ctrl and V.',
      folder: ['Paste the folder address', 'Click the address bar at the top of that window, paste with Ctrl and V, press Enter, then click Select Folder. The address is already copied.'],
    },
    linux: {
      label: 'Linux', terminal: 'a terminal', enter: 'Enter', script: 'install.sh',
      line: (b) => `curl -fsSL ${RAW}install.sh | sh -s -- --browsers ${b}`,
      open: 'Press Ctrl, Alt and T together on most systems. Then paste with Ctrl, Shift and V.',
      folder: ['Paste the folder address', 'Press Ctrl and L in that window, paste, press Enter, then click Select. The address is already copied.'],
    },
  };
  // Where each browser keeps Developer mode on its extensions page.
  const DEVMODE = { edge: 'In the left column of the page.', opera: 'Top right corner of the page.' };
  // How each browser keeps an extension in sight, as its toolbar shows it.
  const PUZZLE = 'Pin it so the timer stays in sight: click the puzzle piece next to the address bar, then the pin beside Study Duo.';
  const PIN = {
    chrome: PUZZLE, edge: PUZZLE, brave: PUZZLE,
    opera: 'Pin it so the timer stays in sight: click the cube next to the address bar, then the pin beside Study Duo.',
    vivaldi: 'Vivaldi already shows Study Duo at the right of the address bar.',
    arc: 'Pin it from the extensions button so the timer stays in sight.',
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: the page still works */ } },
  };

  // What this computer and browser look like. Arc says it is Chrome; its page colours give it away.
  function detect() {
    const ua = navigator.userAgent;
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ua;
    const os = /win/i.test(platform) ? 'windows' : /linux|x11|cros/i.test(platform) && !/android/i.test(ua) ? 'linux' : 'mac';
    const brands = ((navigator.userAgentData && navigator.userAgentData.brands) || []).map((b) => b.brand);
    let browser = 'chrome';
    if (/Firefox\//.test(ua)) browser = 'firefox';
    else if (brands.includes('Microsoft Edge') || /Edg\//.test(ua)) browser = 'edge';
    else if (navigator.brave) browser = 'brave';
    else if (brands.includes('Opera') || /OPR\//.test(ua)) browser = 'opera';
    else if (brands.includes('Vivaldi') || /Vivaldi/.test(ua)) browser = 'vivaldi';
    else if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) browser = 'arc';
    const phone = (navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod/.test(ua);
    return { os, browser, phone };
  }

  const found = detect();
  // What this tab remembered, taken only when it is a system and browsers this page knows: every page on
  // coflazo.github.io shares this storage, and the browser names go into the line people paste into a terminal.
  const known = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
  const savedOs = store.get('os');
  let os = known(OS, savedOs) ? savedOs : found.os;
  const savedPicked = store.get('picked');
  let picked = Array.isArray(savedPicked) && savedPicked.every((b) => known(NAMES, b)) && savedPicked.length ? savedPicked : [found.browser];
  let shown = null; // the Chromium browser whose screenshots are on screen
  let marks = {};

  function joinNames(list) {
    const names = list.map((b) => NAMES[b]);
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  /** A screenshot with its ring and arrow, from shots/marks.json; nothing at all when the shot does not exist yet. */
  function fillShot(el, name) {
    // Most specific first: this system and browser, then the browser's own page (the same everywhere), then the system.
    const b = shown || 'chrome';
    const m = marks[`${os}-${b}-${name}`] || marks[`${b}-${name}`] || marks[`${os}-${name}`] || marks[name];
    el.textContent = '';
    if (!m) return;
    const img = new Image();
    img.src = `shots/${m.file}`;
    img.alt = m.alt;
    img.width = m.w;
    img.height = m.h;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => (el.textContent = ''));
    el.append(img);
    const ring = document.createElement('span');
    ring.className = m.box ? 'ring box' : 'ring'; // a box for long things like a line of text, a ring otherwise
    Object.assign(ring.style, { left: `${(m.ring[0] / m.w) * 100}%`, top: `${(m.ring[1] / m.h) * 100}%`, width: `${(m.ring[2] / m.w) * 100}%`, height: `${(m.ring[3] / m.h) * 100}%` });
    el.append(ring);
    if (m.arrow) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'arrow');
      svg.setAttribute('viewBox', `0 0 ${m.w} ${m.h}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const [x1, y1, x2, y2] = m.arrow;
      const a = Math.atan2(y2 - y1, x2 - x1);
      const len = m.w * 0.035; // the head grows with the picture; the line keeps 2.5 px at any size
      const head = (t) => `${x2 - len * Math.cos(a + t)},${y2 - len * Math.sin(a + t)}`;
      svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#D52B1E" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/><polygon points="${x2},${y2} ${head(0.45)} ${head(-0.45)}" fill="#D52B1E"/>`;
      el.append(svg);
    }
  }

  function render() {
    store.set('os', os);
    store.set('picked', picked);
    const o = OS[os];
    const chromium = CHROMIUM.filter((b) => picked.includes(b));
    if (!chromium.includes(shown)) shown = chromium[0] || null;

    // Step 1: what was found, and the other two systems as links.
    $$('.chip input').forEach((i) => (i.checked = picked.includes(i.value)));
    $('[data-found]').textContent = `This looks like ${NAMES[found.browser]} on ${OS[found.os].label}.${os !== found.os ? ` Showing ${o.label}.` : ''}`;
    const others = Object.keys(OS).filter((k) => k !== os);
    $$('[data-os-switch]').forEach((a, i) => {
      a.textContent = `On ${OS[others[i]].label}?`;
      a.dataset.os = others[i];
    });
    $('[data-none]').hidden = picked.length > 0;

    // Which steps apply, numbered in order.
    $('#step-installer').hidden = chromium.length === 0;
    $('#step-chromium').hidden = chromium.length === 0;
    $('#step-firefox').hidden = !picked.includes('firefox');
    let n = 0;
    $$('.step').forEach((s) => { if (!s.hidden) $('[data-num]', s).textContent = String(++n); });

    // Step 2: the line for this computer and these browsers.
    if (chromium.length) {
      $('#command').textContent = o.line(picked.join(','));
      $$('[data-terminal]').forEach((s) => (s.textContent = o.terminal));
      $('[data-enter]').textContent = o.enter;
      $('[data-open-terminal]').textContent = o.open;
      $('[data-script]').href = `https://github.com/Coflazo/study-duo/blob/main/${o.script}`;
      fillShot($('[data-shot=terminal]'), 'terminal');
    }

    // Step 3: the clicks, per browser.
    if (chromium.length) {
      $('[data-chromium-names]').textContent = joinNames(chromium);
      $('[data-each-browser]').textContent = chromium.length > 1 ? 'Each browser opens its extensions page by itself.' : `${NAMES[chromium[0]]} opens its extensions page by itself.`;
      const tabs = $('[data-browser-tabs]');
      tabs.hidden = chromium.length < 2;
      tabs.textContent = '';
      for (const b of chromium) {
        const t = document.createElement('button');
        t.type = 'button';
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(b === shown));
        t.textContent = NAMES[b];
        t.addEventListener('click', () => { shown = b; render(); });
        tabs.append(t);
      }
      $('[data-devmode-where]').textContent = DEVMODE[shown] || 'Top right corner of the page.';
      $('[data-folder-title]').textContent = o.folder[0];
      $('[data-folder-how]').textContent = o.folder[1];
      for (const s of ['devmode', 'unpacked', 'folder', 'pin']) fillShot($(`[data-shot=${s}]`), s);
      const here = CHROMIUM.includes(found.browser) && chromium.includes(found.browser) ? found.browser : chromium[0];
      $('[data-waiting]').textContent = `Waiting for Study Duo in ${NAMES[here]}. This page notices when it arrives.`;
      $('[data-arrived]').textContent = `Study Duo is in ${NAMES[here]}.`;
      $('[data-pin-how]').textContent = PIN[here] || PUZZLE;
    }
    if (picked.includes('firefox')) fillShot($('[data-shot=firefox]'), 'firefox');
  }

  // Study Duo answers this page only (wxt.config.ts, externally_connectable). The browser gives a page that channel
  // when it loads, so after an install the page looks again on its own when you come back to it.
  function check() {
    const rt = window.chrome && window.chrome.runtime;
    if (!rt || !rt.sendMessage) return;
    try {
      rt.sendMessage(EXT_ID, { kind: 'hello' }, (answer) => {
        if (rt.lastError || !answer || answer.app !== 'study-duo') return;
        $('#status').classList.add('done');
        $('.waiting').hidden = true;
        $('.arrived').hidden = false;
        store.set('arrived', true);
      });
    } catch { /* not installed yet */ }
  }
  function lookAgain() {
    // Only a picked Chromium browser can see Study Duo from this page; in any other, a reload would find nothing.
    if (!store.get('copied') || store.get('arrived') || !CHROMIUM.includes(found.browser) || !picked.includes(found.browser)) return;
    const last = store.get('reloaded') || 0;
    if (Date.now() - last < 5000) return check();
    store.set('reloaded', Date.now());
    location.reload();
  }

  // Firefox: the button works once Mozilla has signed the add-on and it is on this site.
  function firefoxReady() {
    fetch('study-duo.xpi', { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok, () => false).then((ok) => {
      $('[data-firefox-ready]').hidden = !ok;
      $('[data-firefox-later]').hidden = ok;
      const b = $('[data-firefox-button]');
      if (!ok) { b.setAttribute('aria-disabled', 'true'); b.removeAttribute('href'); }
    });
  }

  // Wiring.
  if (found.phone) {
    $('#phone').hidden = false;
    $('#desktop').hidden = true;
  }
  $$('.chip input').forEach((i) => i.addEventListener('change', () => {
    picked = $$('.chip input').filter((x) => x.checked).map((x) => x.value);
    render();
  }));
  $$('[data-os-switch]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    os = a.dataset.os;
    render();
  }));
  $('#copy').addEventListener('click', async () => {
    const copy = $('#copy');
    try {
      await navigator.clipboard.writeText($('#command').textContent);
      copy.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren($('#command'));
      copy.textContent = os === 'mac' ? 'Press Cmd+C' : 'Press Ctrl+C';
    }
    store.set('copied', true);
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });
  $('#check').addEventListener('click', () => { store.set('reloaded', 0); lookAgain(); check(); });
  $$('[data-copy-link]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('https://coflazo.github.io/study-duo/'); b.textContent = 'Copied'; } catch { b.textContent = 'coflazo.github.io/study-duo'; }
  }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lookAgain());

  fetch('shots/marks.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {}), () => ({})).then((m) => { marks = m || {}; render(); });
  render();
  check();
  firefoxReady();
})();
