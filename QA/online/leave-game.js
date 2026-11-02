// Leave during a room game goes back to that party's lobby (still in the room), for the guest and for the host.
const L = require('./lib.js'); const { check, wait } = L;
const st = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; const sh = document.getElementById('lobbySheet');
  return { code: s && s.code, started: s && s.started, lobby: !!(sh && !sh.hidden), onlinePage: !!document.querySelector('#grid > .online-page:not([hidden])') && (!sh || sh.hidden) }; });
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const { pages: [A, B], code } = await L.party(browser, br, 'Air Hockey', 2);
  await wait(800);
  await B.click('#leaveBtn'); await wait(1500);
  const a1 = await st(A), b1 = await st(B);
  check('guest Leave: guest back in party lobby, same room', b1.lobby && b1.code === code && !b1.started, b1);
  check('guest Leave: host back in party lobby too', a1.lobby && a1.code === code && !a1.started, a1);
  await L.shot(B, 'leave-guest');
  await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await wait(800);
  await A.click('#leaveBtn'); await wait(1500);
  const a2 = await st(A), b2 = await st(B);
  check('host Leave: host back in party lobby, same room', a2.lobby && a2.code === code && !a2.started, a2);
  check('host Leave: guest back in party lobby too', b2.lobby && b2.code === code && !b2.started, b2);
  console.log(L.errs ? '' : ''); await browser.close(); br.stop && br.stop(); process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
