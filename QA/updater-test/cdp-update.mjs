// Real in-app update test, driven from outside the app (no clicks, nothing on screen needed).
// The installed Ludus runs with WebView2 remote debugging on; this script talks to its page over the
// Chrome DevTools Protocol, asks the page's own updater to check, then install, and records every state
// and the highest download percentage it reached. It ends when the app quits to swap in the new version.
// usage: node cdp-update.mjs <port> <logFile> <timeoutSec>
import { appendFileSync, writeFileSync } from 'node:fs';

const [port = '9333', logFile = 'update-log.txt', timeoutSec = '240'] = process.argv.slice(2);
const t0 = Date.now();
const log = line => { const s = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`; console.log(s); appendFileSync(logFile, s + '\n'); };
writeFileSync(logFile, '');
const deadline = t0 + Number(timeoutSec) * 1000;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function findPage() {
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
      if (page) return page;
    } catch { /* app still starting */ }
    await wait(500);
  }
  throw new Error('no Ludus page on the debugging port');
}

const page = await findPage();
log('page: ' + page.url);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); let closed = false;
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
ws.onclose = () => { closed = true; for (const f of pending.values()) f({ closed: true }); pending.clear(); };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('socket error')); });
const evaluate = expr => new Promise(res => {
  if (closed) return res(null);
  const n = ++id; pending.set(n, m => res(m.closed ? null : m.result?.result?.value));
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
});

const STATE = `(() => { const U = window.Ludus && Ludus.update; return U ? JSON.stringify({ s: U.state, p: U.pct, l: U.latest, v: U.version() }) : null; })()`;
let st = null;
while (!st && Date.now() < deadline) { st = await evaluate(STATE); if (!st) await wait(300); }
if (!st) { log('FAIL updater never appeared in the page'); process.exit(1); }
log('start ' + st);
await evaluate('Ludus.update.check()');

let maxPct = 0, last = '', sawAvailable = false, installed = false, result = 'timeout';
while (Date.now() < deadline) {
  const raw = await evaluate(STATE);
  if (raw === null && closed) { result = 'app-quit'; break; }
  if (raw && raw !== last) { log('state ' + raw); last = raw; }
  const u = raw ? JSON.parse(raw) : {};
  if (typeof u.p === 'number' && u.s === 'progress') maxPct = Math.max(maxPct, u.p);
  if (u.s === 'available' && !installed) { sawAvailable = true; await evaluate('Ludus.update.askInstall()'); }
  if (u.s === 'confirm' && !installed) { installed = true; log('install pressed'); await evaluate('Ludus.update.install()'); }
  if (u.s === 'uptodate') { result = 'already-newest'; break; }
  if (u.s === 'error' || u.s === 'cantcheck') { result = u.s; break; }
  await wait(250);
}
log(`RESULT ${result} available=${sawAvailable} maxPct=${maxPct}`);
writeFileSync(logFile + '.json', JSON.stringify({ result, sawAvailable, maxPct, seconds: (Date.now() - t0) / 1000 }));
try { ws.close(); } catch { /* already gone */ }
process.exit(result === 'app-quit' && maxPct > 0 ? 0 : 1);
