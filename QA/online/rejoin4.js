// Rejoin (1.12.21), no internet: node rejoin4.js [only ...]
// Real relays keep or replay old messages (MQTT retained, ntfy.sh's since=8s) and some networks cannot reach a code's own relay.
// retained: a stale retained heartbeat of a host that has gone never blocks reopening the party (same code, host, no "No such room")
// replay:   leave and Rejoin at once with the last seconds replayed (ntfy-like): host again with the same code, a friend joins
// relay:    the code's own relay cannot be reached (only ports 80/443 open): Rejoin reopens the code on the fallback relay and a
//           friend who can reach both relays still finds the room there
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, onlineTab, flexCreate, flexJoin } = L;
const sess = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s ? { role: s.role, code: s.code, n: s.count(), over: s.over, ready: s.ready, url: s.client && s.client.url } : null; });
const waitSess = (p, fnSrc, ms = 15000) => p.waitForFunction(src => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return !!s && eval(src)(s); }, fnSrc, { timeout: ms }).then(() => true, () => false);
const leaveRoom = p => p.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); (b || document.getElementById('leaveBtn')).click(); });
const rejoin = async p => { await onlineTab(p); await p.click('#opRejoin'); };
const setParty = (p, obj) => p.evaluate(o => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = o; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, obj);
const party = p => p.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).party);
const deadEnd = p => p.evaluate(() => /No such room/.test(((document.getElementById('lobbyCard') || {}).innerText || '') + Array.from(document.querySelectorAll('.toast')).map(e => e.textContent).join(' ')));
const only = process.argv.slice(2), want = n => !only.length || only.includes(n);

(async () => {
  const browser = await L.launch();
  try {
    if (want('retained')) {
      const br = await broker.start();
      const code = 'XJ4AU', dead = 'deadbeef0001';
      br.retain('ludus/v1/' + code + '/m', JSON.stringify({ v: 1, c: dead, t: 'hb', q: 3, p: [[0, 'Zed', dead], [1, 'Cy', 'deadbeef0002']], mx: 8, mn: 2, g: '', gen: 0, sd: 0, pv: 2, hx: 1, ca: Date.now() - 5 * 3600e3 }));
      const A = await newPage(browser, br, { name: 'Ann' });
      await setParty(A, { role: 'guest', code, mine: false, live: false, name: 'Ann', names: ['Zed', 'Ann', 'Cy'], games: [], n: 1, at: Date.now() - 5 * 3600e3 });
      await A.reload(); await A.waitForTimeout(400);
      await rejoin(A);
      const ok = await waitSess(A, '(s => s.ready && s.role === "host" && s.code === "' + code + '")', 40000); await wait(600);
      check('retained: a stale retained heartbeat does not stop Rejoin reopening ' + code + ' as host', ok, await sess(A));
      check('retained: no "No such room" dead end', !(await deadEnd(A)));
      const p = await party(A);
      check('retained: Last party keeps code and names', p && p.code === code && ['Zed', 'Cy'].every(n => p.names.includes(n)), p);
      const B = await newPage(browser, br, { name: 'Bo' }); await flexJoin(B, code); await wait(800);
      check('retained: a friend joins the reopened room', (await sess(A)).n === 2 && (await sess(B)).code === code, [await sess(A), await sess(B)]);
      check('retained: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const x of [A, B]) await x.context().close(); br.close();
    }

    if (want('replay')) {
      const br = await broker.start(); br.replayMs = 8000;
      const A = await newPage(browser, br, { name: 'Ann' });
      const c = await flexCreate(A); await wait(4500);   // at least one heartbeat sent, still inside the replay window
      await leaveRoom(A); await wait(300);
      await rejoin(A);
      const ok = await waitSess(A, '(s => s.ready && s.role === "host" && s.code === "' + c + '")', 40000); await wait(600);
      check('replay: leave and Rejoin at once (last seconds replayed) -> host of ' + c + ' again', ok, await sess(A));
      check('replay: no "No such room" dead end', !(await deadEnd(A)));
      const B = await newPage(browser, br, { name: 'Bo' }); await flexJoin(B, c); await wait(800);
      check('replay: a friend joins, one room of 2', (await sess(A)).n === 2 && (await sess(B)).code === c, [await sess(A), await sess(B)]);
      check('replay: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const x of [A, B]) await x.context().close(); br.close();
    }

    if (want('relay')) {
      const b0 = await broker.start(), b1 = await broker.start();
      const u0 = 'ws://127.0.0.1:' + b0.port, u1 = 'ws://127.0.0.1:' + b1.port;
      const A = await newPage(browser, b0, { name: 'Ann' }), B = await newPage(browser, b0, { name: 'Bo' });
      await A.addInitScript(u => { window.__LUDUS_BROKERS__ = ['ws://127.0.0.1:9', u]; }, u1);           // Ann's network cannot reach relay 0
      await B.addInitScript(([x, y]) => { window.__LUDUS_BROKERS__ = [x, y]; }, [u0, u1]);
      await B.reload(); await B.waitForTimeout(300);
      const code = await B.evaluate(() => Ludus.net.codeFor(0, 2));   // a code that belongs to relay 0
      await setParty(A, { role: 'host', code, mine: true, live: false, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at: Date.now() - 3 * 3600e3 });
      await A.reload(); await A.waitForTimeout(400);
      await rejoin(A);
      const ok = await waitSess(A, '(s => s.ready && s.role === "host" && s.code === "' + code + '")', 45000);
      const sa = await sess(A);
      check('relay: own relay unreachable -> Rejoin reopens ' + code + ' on the fallback relay', ok && sa.url === u1, sa);
      const p = await party(A);
      check('relay: the Last party card is kept with the same code', p && p.code === code, p);
      await flexJoin(B, code); await wait(1000);
      const sb = await sess(B);
      check('relay: a friend who reaches both relays finds the room on the fallback', sb && sb.ready && sb.role === 'guest' && sb.code === code && (await sess(A)).n === 2, [await sess(A), sb]);
      A.errors = A.errors.filter(e => !/WebSocket connection to 'ws:\/\/127\.0\.0\.1:9\//.test(e));   // the blocked relay itself
      check('relay: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const x of [A, B]) await x.context().close(); b0.close(); b1.close();
    }
  } catch (e) { check('threw: ' + (e.stack || e).toString().slice(0, 300), false); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
