// Diagnostic (not part of the test suite): Rejoin against the REAL relays (public MQTT brokers, then ntfy.sh).
// node diag-real.js [waitSeconds]   Uses only codes this script makes itself. Silent headless pages.
const L = require('./lib.js');
const path = require('path');
const WAIT = (+process.argv[2] || 150) * 1000;
const t0 = Date.now(), ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const log = (...a) => console.log(ts(), ...a);
async function realPage(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 600 } });
  const page = await ctx.newPage(); page.errors = []; page.tag = name;
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('response', r => { const u = r.url(); if (/ntfy\.sh\/lds-/.test(u) && r.request().method() === 'POST') { if (r.status() !== 200) log(name, 'ntfy POST', r.status(), u.split('/').pop()); } });
  await page.addInitScript(([n]) => {
    window.ludusDebug = {}; window.__LUDUS_NO_AUTOREJOIN__ = true;
    try { if (!localStorage.getItem('ludus.v1')) localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, onlineName: n })); } catch (e) {}
  }, [name]);
  await page.goto('file://' + path.join(L.WEB, 'index.html')); await page.waitForTimeout(300);
  // watch: session state + toasts, log on change
  let last = '';
  page.watch = setInterval(async () => {
    try {
      const st = await page.evaluate(() => {
        const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || (Ludus.lobby && Ludus.lobby.session);
        const t = Array.from(document.querySelectorAll('.toast')).map(e => e.textContent).join('|');
        const card = (document.getElementById('lobbyCard') || {}).innerText || '';
        return JSON.stringify({ s: s ? { role: s.role, code: s.code, cand: s.candidate, ready: s.ready, over: s.over, conn: s.conn, url: s.client && s.client.url, n: s.count() } : null, toast: t, err: /No such room|gone|offline/i.test(card) ? card.slice(0, 80).replace(/\s+/g, ' ') : '', party: !!document.getElementById('opRejoin') });
      });
      if (st !== last) { last = st; log(name, st); }
    } catch (e) {}
  }, 400);
  return page;
}
(async () => {
  const browser = await L.launch();
  try {
    const A = await realPage(browser, 'Ann'), B = await realPage(browser, 'Bo');
    if (process.argv[3] === 'home0') {   // an old party whose code belongs to relay 0 (made on a network where the MQTT relays work)
      const code = await A.evaluate(() => Ludus.net.codeFor(0, 4));
      await A.evaluate(c => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = { role: 'host', code: c, mine: true, live: false, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at: Date.now() - 5 * 3600e3 }; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, code);
      await A.reload(); await A.waitForTimeout(400);
      log('--- Ann presses Rejoin on old party', code); const tr = Date.now();
      await L.onlineTab(A); await A.click('#opRejoin');
      const ok = await A.waitForFunction(c => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s && s.ready && s.code === c; }, code, { timeout: 120000 }).then(() => true, () => false);
      log('Ann rejoin ready:', ok, 'after', (Date.now() - tr) / 1000, 's');
      if (ok) { await L.wait(1500); log('--- Bo joins by code'); const tb = Date.now(); await L.onlineTab(B); await B.fill('#opCode', code); await B.click('#opJoin'); const okb = await B.waitForSelector('.plan', { timeout: 90000 }).then(() => true, () => false); log('Bo joined:', okb, (Date.now() - tb) / 1000, 's'); await L.wait(3000); }
      for (const P of [A, B]) { await P.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); if (b) b.click(); }).catch(() => {}); clearInterval(P.watch); }
      await L.wait(1500); return;
    }
    log('--- Ann creates a room on the real relays');
    const c = await L.flexCreate(A).catch(async () => { await L.onlineTab(A); await A.click('#opCreate'); await A.waitForSelector('.code-ch', { timeout: 60000 }); return L.code(A); });
    log('code', c);
    log('--- Bo joins'); await L.onlineTab(B); await B.fill('#opCode', c); await B.click('#opJoin');
    await B.waitForSelector('.plan', { timeout: 60000 }).catch(e => log('Bo join failed', e.message));
    await L.wait(4000);
    log('--- both leave');
    for (const P of [B, A]) { await P.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); (b || document.getElementById('leaveBtn')).click(); }); await L.wait(800); }
    log('--- waiting', WAIT / 1000, 's (real time)'); await L.wait(WAIT);
    log('--- Ann presses Rejoin'); const tr = Date.now();
    await L.onlineTab(A); await A.click('#opRejoin');
    const ok = await A.waitForFunction(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s && s.ready; }, null, { timeout: 90000 }).then(() => true, () => false);
    log('Ann rejoin ready:', ok, 'after', (Date.now() - tr) / 1000, 's');
    await L.wait(3000);
    if (ok) { log('--- Bo rejoins too'); await L.onlineTab(B); await B.click('#opRejoin'); const okb = await B.waitForFunction(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s && s.ready; }, null, { timeout: 90000 }).then(() => true, () => false); log('Bo rejoin ready:', okb); await L.wait(5000); }
    log('errors', A.errors, B.errors);
    for (const P of [A, B]) { await P.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); if (b) b.click(); }).catch(() => {}); clearInterval(P.watch); }
    await L.wait(1500);
  } finally { await browser.close(); }
})();
