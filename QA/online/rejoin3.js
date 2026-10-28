// Rejoin (1.12.19), no internet: node rejoin3.js [only ...]
// host leaves and rejoins -> host again with the same code; an hours-old party -> reopened with the same code and names;
// a live host -> joined as a guest (one room); a failed Rejoin keeps the Last party card; room codes never repeat a character.
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, onlineTab, flexCreate, flexJoin } = L;
const sess = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s ? { role: s.role, code: s.code, n: s.count(), over: s.over, ready: s.ready, host: (s.rosterList()[0] || {}).name } : null; });
const waitSess = (p, fnSrc, ms = 15000) => p.waitForFunction(src => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return !!s && eval(src)(s); }, fnSrc, { timeout: ms });
const leaveRoom = p => p.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); (b || document.getElementById('leaveBtn')).click(); });
const rejoin = async p => { await onlineTab(p); await p.click('#opRejoin'); };
const party = p => p.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).party);
const setParty = (p, obj) => p.evaluate(o => { const s = JSON.parse(localStorage.getItem('ludus.v1')); s.party = o; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, obj);
const only = process.argv.slice(2), want = n => !only.length || only.includes(n);

(async () => {
  const browser = await L.launch();
  try {
    if (want('codes')) {
      const P = await newPage(browser, null, { name: 'Ann' });
      const r = await P.evaluate(() => {
        let rep = 0, bad = 0; const seen = new Set();
        for (let i = 0; i < 10000; i++) { const c = Ludus.net.newCode(); if (new Set(c).size !== 5) rep++; if (!Ludus.net.validCode(c)) bad++; seen.add(c); }
        let rep2 = 0; for (let i = 0; i < 2000; i++) { const c = Ludus.net.codeFor(i % 3, 3); if (new Set(c).size !== 5) rep2++; }
        return { rep, bad, distinct: seen.size, rep2, oldValid: Ludus.net.validCode('HFHF4') && Ludus.net.extractCode('Room code: AAAAA') === 'AAAAA' && Ludus.net.extractCode('ludus://join/J8AU8') === 'J8AU8' };
      });
      check('codes: 10k new codes, none repeats a character, all valid', r.rep === 0 && r.bad === 0 && r.distinct > 9990, r);
      check('codes: relay-matched codes never repeat a character either', r.rep2 === 0, r);
      check('codes: older codes with a repeated character still count as codes', r.oldValid, r);
      await P.context().close();
    }

    if (want('hostback')) { // the video: host makes a room, goes back, presses Rejoin -> same code, host again
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' });
      const c = await flexCreate(A); await wait(500);
      await leaveRoom(A); await wait(600);
      check('hostback: Last party card shown after leaving', await A.$('#opRejoin') !== null);
      await rejoin(A); await waitSess(A, '(s => s.ready && s.role === "host")', 40000);
      const sa = await sess(A), toasts = await A.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
      check('hostback: Rejoin after leaving makes Ann host of the same code ' + c, sa.code === c && sa.role === 'host', sa);
      check('hostback: no "No such room"', !/No such room/.test(toasts), toasts);
      // a friend can join the reopened room
      const B = await newPage(browser, br, { name: 'Bo' }); await flexJoin(B, c); await wait(800);
      check('hostback: a friend joins the reopened room', (await sess(A)).n === 2 && (await sess(B)).code === c, [await sess(A), await sess(B)]);
      check('hostback: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const p of [A, B]) await p.context().close(); br.close();
    }

    if (want('old')) { // an hours-old party Ann did not make: nobody there, so she reopens it with the same code and names
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' });
      await setParty(A, { role: 'guest', code: 'XJ4AU', mine: false, live: false, name: 'Ann', names: ['Zed', 'Ann', 'Cy'], games: ['pong'], n: 1, at: Date.now() - 7 * 3600e3 });
      await A.reload(); await A.waitForTimeout(400);
      await rejoin(A); await waitSess(A, '(s => s.ready && s.role === "host")', 40000); await wait(600);
      const sa = await sess(A), p = await party(A);
      check('old: Rejoin of an hours-old empty party reopens XJ4AU as host', sa.code === 'XJ4AU' && sa.role === 'host', sa);
      check('old: the party keeps its code and the players\' names', p && p.code === 'XJ4AU' && ['Zed', 'Cy'].every(n => p.names.includes(n)), p);
      await leaveRoom(A); await wait(500); await onlineTab(A);
      check('old: the Last party card is still there after leaving', !!(await A.$('#opRejoin')) && /Zed/.test(await A.$eval('.party-card', e => e.innerText)));
      check('old: no page errors', errs([A]) === 0, A.errors);
      await A.context().close(); br.close();
    }

    if (want('live')) { // a live host exists (Bo took over the code): Ann's Rejoin joins as a guest, never a second room
      const br = await broker.start();
      const B = await newPage(browser, br, { name: 'Bo' }), A = await newPage(browser, br, { name: 'Ann' });
      const c = await flexCreate(B); await wait(500);
      await setParty(A, { role: 'host', code: c, mine: true, live: false, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at: Date.now() - 3600e3 });
      await A.reload(); await A.waitForTimeout(400);
      await rejoin(A); await waitSess(A, '(s => s.ready)', 30000); await wait(1200);
      const [sa, sb] = [await sess(A), await sess(B)];
      check('live: Rejoin with a live host joins as a guest (one room, 2 players)', sa.role === 'guest' && sa.code === c && sb.role === 'host' && sb.n === 2 && sa.n === 2, [sa, sb]);
      check('live: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const p of [A, B]) await p.context().close(); br.close();
    }

    if (want('offline')) { // Rejoin cannot reach the internet: it fails, but the Last party card stays
      const A = await newPage(browser, null, { name: 'Ann' });
      await setParty(A, { role: 'host', code: 'Q7WMK', mine: true, live: false, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at: Date.now() - 600e3 });
      await A.reload(); await A.waitForTimeout(400);
      await rejoin(A); await wait(36000);
      await A.evaluate(() => { const b = document.getElementById('backBtn'); if (b && b.offsetParent) b.click(); }); await wait(300);
      const p = await party(A);
      check('offline: a failed Rejoin keeps the Last party (same code, names)', p && p.code === 'Q7WMK' && p.names.includes('Bo'), p);
      await A.context().close();
    }
  } catch (e) { check('threw: ' + (e.stack || e).toString().slice(0, 300), false); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
