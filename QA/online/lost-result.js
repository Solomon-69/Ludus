// A guest's round result or the scoreboard gets lost on the way: the guest must never sit on a stopped board with nothing to press.
const L = require('./lib.js'); const { check, wait } = L;
const DROP = n => { const s = window.ludusOnline().session, pub = s._pub; window.__dropped = 0; s._pub = function (m) { if (m.t === 'tr' && window.__dropped < n) { window.__dropped++; return; } return pub.call(this, m); }; };
const LEAVE = () => { const sh = document.getElementById('lobbySheet'); if (sh.hidden) return false; return [...sh.querySelectorAll('button')].some(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return /Leave/.test(b.textContent) && e && (e === b || b.contains(e)); }); };
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
  const c = await L.flexCreate(A); await L.flexJoin(B, c);
  await L.pick(A, ['Air Hockey'], 3);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await wait(600);
  await B.evaluate(DROP, 2); await B.evaluate(() => ludusForceOver(true));
  await A.waitForFunction(() => { const s = window.ludusOnline().session; return s.ser && s.ser.st === 'board'; }, null, { timeout: 14000 });
  check('two lost reports: the third gets through and the round ends', true);
  check('guest was told too, with a Leave button', await B.waitForFunction(LEAVE, null, { timeout: 4000 }).then(() => true, () => false));
  await Promise.all([A, B].map(L.waitPlaying)); await wait(600);
  await B.evaluate(DROP, 999); await B.evaluate(() => ludusForceOver(true));
  check('every report lost: guest still gets a card with Leave', await B.waitForFunction(LEAVE, null, { timeout: 10000 }).then(() => true, () => false));
  await B.evaluate(() => [...document.querySelectorAll('#lobbySheet button')].find(b => /Leave/.test(b.textContent)).click()); await wait(500);
  check('Leave works', await B.evaluate(() => { const o = window.ludusOnline(); return document.getElementById('lobbySheet').hidden && !(o && o.session); }));
  await browser.close(); await br.stop?.();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
