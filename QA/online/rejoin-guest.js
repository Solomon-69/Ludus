// A player who joined leaves the party lobby and presses Rejoin: they come back into the host's room (one room, both see 2).
const L = require('./lib.js'); const { check, wait } = L;
const sess = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s ? { role: s.role, code: s.code, ready: s.ready, n: s.count() } : null; });
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
  const code = await L.flexCreate(A); await L.flexJoin(B, code); await wait(1500);
  for (let round = 1; round <= 3; round++) {
    await B.evaluate(() => { const b = [...document.querySelectorAll('#lobbyCard button')].find(x => /^Leave$/.test(x.textContent.trim())); b && b.click(); });
    await wait(2500);
    await B.evaluate(() => { const b = document.getElementById('opRejoin'); b && b.click(); });
    await B.waitForFunction(c => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s && s.ready && s.code === c; }, code, { timeout: 30000 }).catch(() => {});
    await wait(2500);
    const a = await sess(A), b = await sess(B);
    check(`round ${round}: joined player back as guest in the same room`, b && b.role === 'guest' && b.code === code && b.n === 2, b);
    check(`round ${round}: host sees 2 players`, a && a.role === 'host' && a.n === 2, a);
  }
  await browser.close(); br.stop && br.stop(); process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
