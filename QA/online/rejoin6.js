// Rejoin works on the first press (1.12.48), no internet: node rejoin6.js
// stuck:  a party kept behind All games whose connection is stuck reconnecting (a Mac that slept, an old party) and whose
//         host has gone: one press of Rejoin leaves the stuck room and ends in a working room with the same code
// live:   a healthy party behind All games: Rejoin still goes straight back to the same room (no second join)
const L = require('./lib.js');
const { check, wait } = L;
const sess = p => p.evaluate(() => { const o = window.ludusOnline && window.ludusOnline(), s = o && (o.session || Ludus.lobby.session); return s ? { id: s.cid, role: s.role, code: s.code, ready: s.ready, over: s.over, conn: s.conn, n: s.count() } : null; });
const sheetUp = p => p.evaluate(() => { const e = document.getElementById('lobbySheet'); return !!e && !e.hidden; });
const park = async p => { await p.evaluate(() => window.ludusClosed()); await wait(120); await p.evaluate(() => window.ludusOpened()); await wait(300); };

(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  try {
    // --- stuck
    {
      const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
      const c = await L.flexCreate(A); await L.flexJoin(B, c);
      await B.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
      await park(B);
      await A.close();                                       // the host is gone without a word
      const before = await sess(B);
      await B.evaluate(() => { const o = window.ludusOnline(), s = o.session || Ludus.lobby.session; s._conn('offline'); });   // stuck reconnecting
      await L.onlineTab(B);
      await B.click('#opRejoin');                             // one press only
      const ok = await B.waitForFunction(([c, old]) => { const o = window.ludusOnline && window.ludusOnline(), s = o && (o.session || Ludus.lobby.session); return !!s && s.ready && !s.over && s.code === c && s.cid !== old && s.conn === 'online'; }, [c, before.id], { timeout: 25000 }).then(() => true, () => false);
      const after = await sess(B);
      check('stuck: one Rejoin press ends in a working room with the same code', ok, { before, after });
      check('stuck: the room is shown', await sheetUp(B));
      check('stuck: no page errors', !(B.errors || []).length, B.errors);
      await B.close();
    }
    // --- live
    {
      const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
      const c = await L.flexCreate(A); await L.flexJoin(B, c);
      await B.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
      await park(B); await wait(1500);
      const before = await sess(B);
      await L.onlineTab(B); await B.click('#opRejoin'); await wait(600);
      const after = await sess(B);
      check('live: Rejoin goes straight back to the same room (same session)', after && after.id === before.id && after.code === c && after.ready && !after.over, { before, after });
      check('live: the room is shown', await sheetUp(B));
      check('live: still two players', after && after.n === 2, after);
      await A.close(); await B.close();
    }
  } catch (e) { check('threw: ' + (e.stack || e).toString().slice(0, 300), false); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
