// Rejoin on a network where ONLY ntfy.sh works (ports 80/443): the MQTT relays swallow every connection and never answer.
// node rejoin5.js [only ...]   No internet needed: a small fake ntfy.sh (WebSocket listen + HTTPS POST, no history) runs in this file.
// quick:   Rejoin on an old party (nobody there, history gone) shows "Looking for room" at once and ends in a working room (host,
//          same code) within 16 s, though the code's own relay is a black hole
// guest:   a friend is really hosting the old code on ntfy: Rejoin joins that room (never a second room)
// dead:    ntfy unreachable too: a "Could not rejoin" card with Try again appears (never a silent button); Try again works once ntfy is back
// restart: the app is reopened with the party saved as live: it goes back into the room by itself
const L = require('./lib.js'); const { chromium } = require('playwright-core'); const net = require('net'); const path = require('path'), fs = require('fs');
const { check, wait } = L; const only = process.argv.slice(2), want = n => !only.length || only.includes(n);
const sess = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s ? { role: s.role, code: s.code, ready: s.ready, n: s.count(), url: s.client && s.client.url } : null; });
const waitReady = (p, code, ms) => p.waitForFunction(c => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return !!s && s.ready && s.code === c; }, code, { timeout: ms }).then(() => true, () => false);
const sheetUp = (p, ms) => p.waitForFunction(() => { const e = document.getElementById('lobbySheet'); return e && !e.hidden; }, null, { timeout: ms }).then(() => true, () => false);
function hub() {   // fake ntfy.sh
  const h = { up: true, topics: new Map(), posts: 0 };
  h.attach = async ctx => {
    await ctx.routeWebSocket(/^wss:\/\/ntfy\.sh\//, ws => {
      if (!h.up) { ws.close(); return; }
      const name = new URL(ws.url()).pathname.split('/')[1];
      if (!h.topics.has(name)) h.topics.set(name, new Set()); h.topics.get(name).add(ws);
      ws.send(JSON.stringify({ event: 'open', time: Math.floor(Date.now() / 1000) }));
      ws.onClose(() => h.topics.get(name) && h.topics.get(name).delete(ws));
    });
    await ctx.route(/^https:\/\/ntfy\.sh\//, async route => {
      const req = route.request();
      if (!h.up || req.method() !== 'POST') { await route.abort(); return; }
      h.posts++; const name = new URL(req.url()).pathname.split('/')[1], body = req.postData() || '';
      (h.topics.get(name) || new Set()).forEach(w => { try { w.send(JSON.stringify({ event: 'message', time: Math.floor(Date.now() / 1000) + 1, message: body })); } catch (e) {} });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  };
  return h;
}
(async () => {
  const hole = net.createServer(s => s.on('error', () => {})); await new Promise(r => hole.listen(0, '127.0.0.1', r));
  const holeUrl = 'ws://127.0.0.1:' + hole.address().port, urls = [holeUrl, holeUrl, holeUrl, 'ntfy://ntfy.sh'];   // 3 MQTT relays that never answer + ntfy
  const browser = await L.launch(); const H = hub();
  const mk = async (name, party, opt = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 600 } }); await H.attach(ctx);
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(String(e)));
    await page.addInitScript(([u, n, pt, noauto]) => {
      window.ludusDebug = {}; window.__LUDUS_BROKERS__ = u; if (noauto) window.__LUDUS_NO_AUTOREJOIN__ = true;
      try { if (!localStorage.getItem('ludus.v1')) { localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, onlineName: n, party: pt })); localStorage.setItem('ludus.relay', 'ntfy://ntfy.sh'); } } catch (e) {}
    }, [urls, name, party, !opt.auto]);
    await page.goto('file://' + path.join(L.WEB, 'index.html')); await page.waitForTimeout(400); return page;
  };
  const codeOf = async p => p.evaluate(() => Ludus.net.codeFor(0, 4));
  const oldParty = (code, role, live, at) => ({ role, code, mine: role === 'host', live, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at });
  try {
    if (want('quick')) {
      const A = await mk('Ann', null); const code = await codeOf(A);
      await A.evaluate(([p]) => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = p; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, [oldParty(code, 'host', false, Date.now() - 30 * 3600e3)]);
      await A.reload(); await A.waitForTimeout(400); await L.onlineTab(A);
      await A.click('#opRejoin'); const t0 = Date.now();
      check('quick: pressing Rejoin shows a "Looking for room" card within 1.5 s', await sheetUp(A, 1500), await sess(A));
      const ok = await waitReady(A, code, 30000), dt = (Date.now() - t0) / 1000;
      check('quick: ends in a working room with the old code, as host (' + dt.toFixed(1) + ' s)', ok && (await sess(A)).role === 'host' && (await sess(A)).url === 'ntfy://ntfy.sh', await sess(A));
      check('quick: ready within 16 s although the code\'s own relay is a black hole', ok && dt < 16, dt);
      check('quick: the room card shows the code', (await A.innerText('#lobbyCard')).replace(/\s/g, '').includes(code), await A.innerText('#lobbyCard'));
      check('quick: no page errors', A.errors.length === 0, A.errors);
      await A.context().close();
    }
    if (want('guest')) {
      const B = await mk('Bo', null); await L.onlineTab(B); await B.click('#opCreate');
      await B.waitForSelector('.code-ch', { timeout: 30000 }); const code = await L.code(B);
      const A = await mk('Ann', null);
      await A.evaluate(([p]) => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = p; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, [oldParty(code, 'guest', false, Date.now() - 3600e3)]);
      await A.reload(); await A.waitForTimeout(400); await L.onlineTab(A); await A.click('#opRejoin');
      const ok = await waitReady(A, code, 30000); await wait(800);
      const a = await sess(A), b = await sess(B);
      check('guest: Rejoin joins the room a friend is hosting (guest, same code)', ok && a.role === 'guest' && b.n === 2, [a, b]);
      await A.context().close(); await B.context().close();
    }
    if (want('dead')) {
      const A = await mk('Ann', null); const code = await codeOf(A);
      await A.evaluate(([p]) => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = p; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, [oldParty(code, 'host', false, Date.now() - 5 * 3600e3)]);
      await A.reload(); await A.waitForTimeout(400); await L.onlineTab(A);
      H.up = false; await A.click('#opRejoin');
      const card = await A.waitForFunction(() => /Could not rejoin/.test((document.getElementById('lobbyCard') || {}).innerText || ''), null, { timeout: 70000 }).then(() => true, () => false);
      check('dead: no relay reachable -> a "Could not rejoin" card with Try again (not a silent button)', card && /Try again/.test(await A.innerText('#lobbyCard')), await A.innerText('#lobbyCard').catch(() => ''));
      H.up = true; await A.evaluate(() => Array.from(document.querySelectorAll('#lobbyCard button')).find(b => b.textContent === 'Try again').click());
      const ok = await waitReady(A, code, 40000);
      check('dead: Try again, once ntfy is back, ends in the room with the old code', ok, await sess(A));
      await A.context().close();
    }
    if (want('restart')) {
      const A = await mk('Ann', null, { auto: true }); const code = await codeOf(A);
      await A.evaluate(([p]) => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = p; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, [oldParty(code, 'host', true, Date.now() - 2 * 3600e3)]);
      await A.reload();
      const ok = await waitReady(A, code, 30000);
      check('restart: reopening Ludus while the party was live goes back into it by itself', ok, await sess(A));
      await A.context().close();
    }
  } catch (e) { check('threw: ' + (e.stack || e).toString().slice(0, 300), false); }
  await browser.close(); hole.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
