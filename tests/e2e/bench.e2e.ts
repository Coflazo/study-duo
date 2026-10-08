import { chromium, test, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromePath, EXT_ID } from './extension';

/**
 * Measures Study Duo against the free versions of other blockers, each alone in a throwaway Chrome for Testing
 * profile. Their code runs only there. Run with:
 *   npm run build:test && sh bench/fetch.sh && BENCH=1 npx playwright test tests/e2e/bench.e2e.ts
 * Writes bench/results/<date>.json and .md. Method notes are in the .md. BENCH_ONLY=baseline,study-duo-timer measures
 * just those (the baseline is always kept) and writes <date>-<BENCH_TAG or "partial">.json and .md beside the full run.
 */
test.skip(!process.env.BENCH, 'measures Study Duo against other blockers only when asked (BENCH=1)');

const IDLE_MS = Number(process.env.BENCH_IDLE_MS ?? 120_000);
const CACHE = path.resolve('bench/.cache');
const OUT = path.resolve('bench/results');

type Subject = { id: string; name: string; dir?: string; crx?: string; timer?: boolean };
const SUBJECTS: Subject[] = [
  { id: 'baseline', name: 'No extension' },
  { id: 'study-duo', name: 'Study Duo', dir: path.resolve('.test-build/chrome-mv3') },
  { id: 'study-duo-timer', name: 'Study Duo, timer running', dir: path.resolve('.test-build/chrome-mv3'), timer: true },
  ...(['leechblock:LeechBlock NG', 'blocksite:BlockSite', 'forest:Forest'] as const).map((s) => {
    const [id, name] = s.split(':') as [string, string];
    return { id, name, dir: `${CACHE}/${id}/unpacked`, crx: `${CACHE}/${id}/ext.crx` };
  }),
];

/* ------------------------------------------------------------ the pages -- */

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{margin:40px auto;max-width:760px;font:16px/1.6 Georgia,serif;color:#1f2328}</style></head><body>${body}</body></html>`;
const PAGES: Record<string, string> = {
  '/notes': page('Lecture notes', `<h1>Eigenvalues</h1>${'<p>A non-zero vector v is an eigenvector of A when A only stretches it. The eigenvalues are the roots of det(A - λI) = 0.</p>'.repeat(30)}`),
  '/videos': page('Videos', `<h1>Watch</h1>${Array.from({ length: 24 }, (_, i) => `<div style="display:inline-block;width:170px;height:96px;margin:6px;background:hsl(${i * 15} 30% 40%)"></div>`).join('')}`),
  '/article': page('Article', `<h1>Why sleep matters</h1>${'<p>Sleep consolidates memory. Students who sleep after studying remember more the next day than those who stay up.</p>'.repeat(40)}`),
};

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port)));
}

/* ---------------------------------------------------- the network log -- */

type Conn = { at: number; host: string; up: number; down: number };

/** An HTTP proxy that lets traffic through and writes down every connection: host, bytes up, bytes down. */
function proxy(log: Conn[]): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '');
    const c: Conn = { at: Date.now(), host: url.host, up: 0, down: 0 };
    log.push(c);
    const up = http.request(url, { method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.on('data', (d: Buffer) => (c.down += d.length));
      r.pipe(res);
    });
    up.on('error', () => res.destroy());
    req.on('data', (d: Buffer) => (c.up += d.length));
    req.pipe(up);
  });
  server.on('connect', (req: http.IncomingMessage, sock: net.Socket, head: Buffer) => {
    const [host, port] = (req.url ?? '').split(':');
    const c: Conn = { at: Date.now(), host: req.url ?? '', up: head.length, down: 0 };
    log.push(c);
    const remote = net.connect(Number(port) || 443, host ?? '', () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      remote.write(head);
      sock.pipe(remote);
      remote.pipe(sock);
    });
    sock.on('data', (d: Buffer) => (c.up += d.length));
    remote.on('data', (d: Buffer) => (c.down += d.length));
    remote.on('error', () => sock.destroy());
    sock.on('error', () => remote.destroy());
  });
  return server;
}

/* ------------------------------------------------------- the processes -- */

type Proc = { pid: number; ppid: number; rssKb: number; cmd: string };

/** The browser launched on this profile and every process under it. */
function browserProcs(profile: string): Proc[] {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), cmd: m[4]! }));
  const root = rows.find((r) => r.cmd.includes(`--user-data-dir=${profile}`) && !r.cmd.includes('--type='));
  if (!root) return [];
  const mine = new Set([root.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (!mine.has(r.pid) && mine.has(r.ppid)) (mine.add(r.pid), (grew = true));
  }
  return rows.filter((r) => mine.has(r.pid));
}

/** Cumulative CPU seconds and idle wake-ups per process, from macOS top. */
function cpuStats(pids: number[]): Map<number, { cpu: number; wakeups: number }> {
  const out = execFileSync('top', ['-l', '1', '-stats', 'pid,idlew,time', ...pids.flatMap((p) => ['-pid', String(p)])], { encoding: 'utf8' });
  const stats = new Map<number, { cpu: number; wakeups: number }>();
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\+?\s+([\d:.]+)/.exec(line);
    if (!m) continue;
    const cpu = m[3]!.split(':').reduce((s, part) => s * 60 + Number(part), 0);
    stats.set(Number(m[1]), { cpu, wakeups: Number(m[2]) });
  }
  return stats;
}

function dirBytes(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += fs.statSync(path.join(e.parentPath, e.name)).size;
  }
  return total;
}

/** The download size: the store's CRX, or for Study Duo a zip of the build, the shape it ships in. */
function packedBytes(s: Subject): number {
  if (s.crx) return fs.statSync(s.crx).size;
  const zip = path.join(os.tmpdir(), `study-duo-bench-${process.pid}.zip`);
  execFileSync('zip', ['-qr9X', zip, '.'], { cwd: s.dir });
  const size = fs.statSync(zip).size;
  fs.unlinkSync(zip);
  return size;
}

/* ------------------------------------------------------------- one run -- */

async function measure(s: Subject, pagesPort: number) {
  const log: Conn[] = [];
  const prx = proxy(log);
  const proxyPort = await listen(prx);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'study-duo-bench-'));
  const exe = chromePath();
  const args = [`--proxy-server=http://127.0.0.1:${proxyPort}`];
  if (s.dir) args.push(`--disable-extensions-except=${s.dir}`, `--load-extension=${s.dir}`);
  const ctx: BrowserContext = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
    args,
    viewport: { width: 1280, height: 800 },
  });
  const started = Date.now();
  try {
    // Install: whatever the extension opens by itself in its first 15 seconds, then those tabs close.
    await new Promise((r) => setTimeout(r, 15_000));
    const opened = ctx.pages().map((p) => p.url()).filter((u) => u !== 'about:blank');
    for (const p of ctx.pages()) if (p.url() !== 'about:blank') await p.close();
    const installEnd = Date.now();

    if (s.timer) {
      const popup = await ctx.newPage();
      await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
      await popup.getByRole('button', { name: 'Start' }).click();
      await popup.waitForTimeout(500);
      await popup.close();
    }

    // The session: three pages in three tabs, each watched for scripts the extension puts into it.
    const injected: { page: string; scripts: number; kb: number; heapKb: number }[] = [];
    const tabs = [];
    for (const route of Object.keys(PAGES)) {
      const tab = await ctx.newPage();
      const cdp = await ctx.newCDPSession(tab);
      const seen = new Map<string, number>();
      cdp.on('Debugger.scriptParsed', (e) => {
        if (e.url.startsWith('chrome-extension://')) seen.set(`${e.url}#${e.scriptId}`, e.length ?? 0);
      });
      await cdp.send('Debugger.enable');
      await tab.goto(`http://127.0.0.1:${pagesPort}${route}`);
      await tab.waitForTimeout(4000);
      // The tab's JS heap holds the page and every extension script running in it; the pages carry no JS of their own.
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('Performance.enable');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
      injected.push({ page: route, scripts: seen.size, kb: [...seen.values()].reduce((a, b) => a + b, 0) / 1024, heapKb: heap / 1024 });
      await cdp.detach();
      tabs.push(tab);
    }
    await tabs[0]!.bringToFront();
    const version = await (await ctx.newCDPSession(tabs[0]!)).send('Browser.getVersion');

    // Idle: the reading tab in front for IDLE_MS, as a student reading notes would leave it.
    await new Promise((r) => setTimeout(r, 5000));
    const before = cpuStats(browserProcs(profile).map((p) => p.pid));
    await new Promise((r) => setTimeout(r, IDLE_MS));
    const procs = browserProcs(profile);
    const after = cpuStats(procs.map((p) => p.pid));
    let cpu = 0;
    let wakeups = 0;
    for (const [pid, b] of after) {
      const a = before.get(pid) ?? { cpu: 0, wakeups: 0 };
      cpu += b.cpu - a.cpu;
      wakeups += b.wakeups - a.wakeups;
    }
    const ext = procs.filter((p) => p.cmd.includes('--extension-process'));
    const perMin = 60_000 / IDLE_MS;
    const net = (from: number, to: number) => {
      const conns = log.filter((c) => c.at >= from && c.at < to);
      return {
        connections: conns.length,
        hosts: [...new Set(conns.map((c) => c.host))].sort(),
        kbUp: Math.round(conns.reduce((a, c) => a + c.up, 0) / 1024),
        kbDown: Math.round(conns.reduce((a, c) => a + c.down, 0) / 1024),
        upKbByHost: Object.fromEntries([...new Set(conns.map((c) => c.host))].map((h) => [h, conns.filter((c) => c.host === h).reduce((a, c) => a + c.up, 0) / 1024])),
      };
    };
    return {
      id: s.id,
      name: s.name,
      browser: version.product,
      version: s.dir ? JSON.parse(fs.readFileSync(path.join(s.dir, 'manifest.json'), 'utf8')).version : null,
      packedKb: s.dir ? Math.round(packedBytes(s) / 1024) : 0,
      unpackedKb: s.dir ? Math.round(dirBytes(s.dir) / 1024) : 0,
      openedOnInstall: opened,
      injected,
      memoryMb: Math.round(procs.reduce((a, p) => a + p.rssKb, 0) / 1024),
      extensionProcessMb: Math.round(ext.reduce((a, p) => a + p.rssKb, 0) / 1024),
      cpuSecPerMin: Number((cpu * perMin).toFixed(3)),
      wakeupsPerMin: Math.round(wakeups * perMin),
      networkInstall: net(started, installEnd),
      networkSession: net(installEnd, Date.now()),
    };
  } finally {
    await ctx.close();
    prx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------- report -- */

type Result = Awaited<ReturnType<typeof measure>>;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const avg = (r: Result, f: (i: Result['injected'][number]) => number) => mean(r.injected.map(f));

function report(runs: Result[][], date: string): string {
  const all = runs.flat();
  const byId = (id: string) => all.filter((r) => r.id === id);
  const base = byId('baseline');
  const chromeHosts = new Set(base.flatMap((r) => [...r.networkInstall.hosts, ...r.networkSession.hosts]));
  const baseHeap = mean(base.map((r) => avg(r, (i) => i.heapKb)));
  const baseCpu = mean(base.map((r) => r.cpuSecPerMin));
  const baseWake = mean(base.map((r) => r.wakeupsPerMin));
  const size = (k: number) => (k >= 1024 ? `${(k / 1024).toFixed(1)} MB` : `${Math.round(k)} KB`);
  const spread = (xs: number[], fmt: (n: number) => string) => {
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return xs.length > 1 && fmt(lo) !== fmt(hi) ? `${fmt(mean(xs))} (${fmt(lo)} to ${fmt(hi)})` : fmt(mean(xs));
  };
  const own = (hosts: string[]) => hosts.filter((h) => !chromeHosts.has(h));
  const ids = [...new Set(all.map((r) => r.id))].filter((id) => id !== 'baseline');
  const rows = ids.map((id) => {
    const rs = byId(id);
    const r = rs[0]!;
    const hosts = new Set(rs.flatMap((x) => own([...x.networkInstall.hosts, ...x.networkSession.hosts])));
    const sentBy = (x: Result) => Object.entries({ ...x.networkInstall.upKbByHost }).concat(Object.entries(x.networkSession.upKbByHost));
    const sent = mean(rs.map((x) => sentBy(x).filter(([h]) => !chromeHosts.has(h)).reduce((a, [, kb]) => a + kb, 0)));
    return `| ${r.name} | ${r.version} | ${size(r.packedKb)} | ${size(r.unpackedKb)} | ${size(avg(r, (i) => i.kb))} | ${spread(rs.map((x) => avg(x, (i) => i.heapKb) - baseHeap), (n) => `${(n / 1024).toFixed(1)} MB`)} | ${spread(rs.map((x) => x.extensionProcessMb), (n) => `${Math.round(n)} MB`)} | ${spread(rs.map((x) => x.cpuSecPerMin - baseCpu), (n) => `${n.toFixed(2)} s`)} | ${spread(rs.map((x) => x.wakeupsPerMin - baseWake), (n) => `${Math.round(n)}`)} | ${hosts.size} | ${size(sent)} |`;
  });
  const where = (u: string) => (u.startsWith('chrome-extension://') ? `its own page ${new URL(u).pathname}` : new URL(u).host + new URL(u).pathname);
  const notes = ids.map((id) => {
    const rs = byId(id);
    const tabs = [...new Set(rs.flatMap((x) => x.openedOnInstall.map(where)))].join(', ') || 'nothing';
    const install = [...new Set(rs.flatMap((x) => own(x.networkInstall.hosts)))].sort();
    const session = [...new Set(rs.flatMap((x) => own(x.networkSession.hosts)))].sort();
    const list = (h: string[]) => (h.length ? h.map((x) => x.replace(/:443$/, '')).join(', ') : 'nothing');
    return `- **${rs[0]!.name}.** Opened on install: ${tabs}. Contacted during install (${install.length}): ${list(install)}. During the session (${session.length}): ${list(session)}.`;
  });
  return `# Study Duo against other blockers, ${date}

Each extension ran alone in a fresh Chrome for Testing profile (${base[0]!.browser}, headless) on ${os.cpus()[0]?.model} with ${Math.round(os.totalmem() / 2 ** 30)} GB of memory, ${runs.length} times each in alternating order. Where two runs differ, the range is in brackets. Raw numbers: [${date}.json](${date}.json).

| Extension | Version | Download | Installed | Script in every page | JS memory added per tab | Extension's own processes | CPU per idle minute | Wake-ups per idle minute | Outside hosts contacted | Data sent out |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Per-tab memory, CPU and wake-ups are over the same browser with no extension (per idle minute: ${baseCpu.toFixed(2)} s of CPU and ${Math.round(baseWake)} wake-ups). Outside hosts leave out the ones Chrome contacts with no extension at all (${[...chromeHosts].map((h) => h.replace(/:443$/, '')).sort().join(', ')}). A negative number means the difference is smaller than the run-to-run noise.

## Where each one connected

${notes.join('\n')}

## Method

1. Install: the extension loads unpacked from the store's own package (\`bench/fetch.sh\`) and runs alone for 15 seconds. Tabs it opens by itself are written down, then closed, and their traffic counts as install traffic.
2. Session: three local pages (lecture notes, a video grid, an article) open in three tabs, served from 127.0.0.1 with no scripts of their own, so they make no traffic and hold no JS. Chrome's debugger counts every \`chrome-extension://\` script parsed into each page, and the tab's JS heap after garbage collection shows the memory those scripts hold.
3. Idle: the notes tab stays in front for ${IDLE_MS / 60_000} minutes (the "timer running" row starts a 25-minute block first). CPU time and idle wake-ups come from macOS \`top\` for every process of that browser, before and after. The extension's own processes are the ones Chrome starts with \`--extension-process\` (service worker, offscreen and background pages), measured as resident memory at the end.
4. Network: every connection goes through a local proxy that writes down host and bytes and lets it through. Encrypted traffic shows where data went and how much, not what it was.
5. Free versions only, default settings, no sign-in. Paid tiers are not measured, because buying them would break the project's $0 rule.

One machine, ${runs.length} runs per extension: read small differences as noise.
`;
}

test('measure Study Duo against other blockers', async () => {
  const RUNS = Number(process.env.BENCH_RUNS ?? 2);
  test.setTimeout(RUNS * SUBJECTS.length * (IDLE_MS + 90_000));
  for (const s of SUBJECTS) {
    if (s.dir && !fs.existsSync(path.join(s.dir, 'manifest.json'))) throw new Error(`${s.name}: missing ${s.dir} (npm run build:test, sh bench/fetch.sh)`);
  }
  const site = http.createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body ?? '');
  });
  const port = await listen(site);
  const runs: Result[][] = [];
  try {
    const only = process.env.BENCH_ONLY?.split(',');
    const chosen = only ? SUBJECTS.filter((s) => s.id === 'baseline' || only.includes(s.id)) : SUBJECTS;
    for (let run = 0; run < RUNS; run++) {
      const order = run % 2 ? [...chosen].reverse() : chosen; // alternate, so drift over time does not favour anyone
      const results: Result[] = [];
      for (const s of order) {
        results.push(await measure(s, port));
        console.log(`run ${run + 1}: ${s.name} done`);
      }
      runs.push(results);
    }
  } finally {
    site.close();
  }
  const date = new Date().toISOString().slice(0, 10) + (process.env.BENCH_ONLY ? `-${process.env.BENCH_TAG ?? 'partial'}` : '');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${date}.json`), JSON.stringify({ date, idleMs: IDLE_MS, runs }, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, `${date}.md`), report(runs, date));
});
