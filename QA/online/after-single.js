// One game, one round (no scoreboard): the result bar. Every button there must do something, for host and guest.
const L = require('./lib.js'); const { check, wait } = L;
const st = p => p.evaluate(() => { const o = window.ludusOnline && window.ludusOnline(), s = o && (o.session || Ludus.lobby.session); const b = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && !!h && (h === e || e.contains(h)); };
  return { over: !document.getElementById('overSheet').hidden, sheet: !document.getElementById('lobbySheet').hidden, started: !!(s && s.started), active: !!(s && s.active), again: b('againBtn'), quit: b('overQuitBtn'), gen: s && s.gen, ser: !!(s && s.ser) }; });
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const { pages: [A, B] } = await L.party(browser, br, 'Air Hockey', 2); await wait(600);
  const round = async () => { await Promise.all([A, B].map((p, k) => p.evaluate(w => ludusForceOver(w), k === 0))); await wait(2600); };
  await round(); let a = await st(A), b = await st(B); console.log('over', JSON.stringify(a), JSON.stringify(b));
  check('result bar up, buttons take clicks', a.over && a.again && b.over && b.again, { a, b });
  await A.click('#againBtn'); await wait(1500); a = await st(A); b = await st(B); console.log('rematch', JSON.stringify(a), JSON.stringify(b));
  check('host Rematch starts a new round for both', !a.over && !b.over && a.gen === b.gen, { a, b });
  await wait(600); await round();
  await B.click('#againBtn'); await wait(800); await A.click('#againBtn'); await wait(1500); a = await st(A); b = await st(B); console.log('ask+rematch', JSON.stringify(a), JSON.stringify(b));
  check('guest asks, host rematch: new round', !a.over && !b.over, { a, b });
  await wait(600); await round();
  await B.click('#overQuitBtn'); await wait(1500); a = await st(A); b = await st(B); console.log('guest quit', JSON.stringify(a), JSON.stringify(b));
  check('guest Quit on the result bar: both back in the lobby', a.sheet && b.sheet && !a.over && !b.over, { a, b });
  await browser.close(); br.stop && br.stop(); process.exit(0);
})().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
