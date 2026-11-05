// Rejoin inside the party lobby: when the link drops, the room card shows Rejoin; pressing it opens the same party again.
const L = require('./lib.js'); const { check, wait } = L;
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
  const c = await L.flexCreate(A); await L.flexJoin(B, c);
  await B.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  const btns = p => p.$$eval('#lobbySheet button', e => e.map(x => x.textContent.trim()));
  check('online: no Rejoin button while connected', !(await btns(B)).includes('Rejoin'), await btns(B));
  await B.evaluate(() => { const o = window.ludusOnline(), s = o.session || Ludus.lobby.session; s.conn = 'offline'; s._emit ? s._emit('conn') : (s.emit && s.emit('conn')); });
  await wait(300);
  check('dropped: Rejoin button shows in the lobby', (await btns(B)).includes('Rejoin'), await btns(B));
  await B.evaluate(() => [...document.querySelectorAll('#lobbySheet button')].find(x => x.textContent.trim() === 'Rejoin').click());
  await B.waitForFunction(() => { const o = window.ludusOnline(), s = o && (o.session || Ludus.lobby.session); return s && s.conn === 'online' && s.count() === 2; }, null, { timeout: 12000 }).catch(() => {});
  const st = await B.evaluate(() => { const o = window.ludusOnline(), s = o && (o.session || Ludus.lobby.session); return { conn: s && s.conn, n: s && s.count(), code: s && s.code }; });
  check('rejoined: same room, both seats, connected', st.conn === 'online' && st.n === 2 && st.code === c, st);
  await L.shot(B, 'rejoin-lobby');
  console.log(L.results ? '' : ''); await browser.close(); br.close && br.close(); process.exit(0);
})();
