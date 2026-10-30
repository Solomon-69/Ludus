// Wake test, no internet: node wake.js  (sockets die in "sleep"; ludusWake must bring a room back at once)
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, party } = L;
(async () => {
  const browser = await L.launch();
  try {
    const br = await broker.start();
    const A = await newPage(browser, br, { name: 'Ann' });
    const live = () => A.evaluate(() => [...Ludus.net.live].map(m => m.state + ':' + (m.ws ? m.ws.readyState : 'x')));
    await A.evaluate(() => { window.__s = Ludus.net.createRoom({ name: 'Ann', game: 'chess' }); });
    await wait(1500);
    let s = await live();
    check('room online before sleep', s.length > 0 && s.every(x => x.startsWith('online')), s);
    // "sleep": kill every socket silently (no close event reaches the page)
    await A.evaluate(() => { Ludus.net.live.forEach(m => { const w = m.ws; if (w) { w.onclose = null; w.onerror = null; try { w.close(); } catch (e) {} } }); });
    await wait(300);
    await A.evaluate(() => window.ludusWake());
    await wait(1500);
    s = await live();
    check('room online again right after wake', s.length > 0 && s.every(x => x.startsWith('online:1')), s);
    check('no page errors', errs([A]) === 0, A.errors);
  } finally { await browser.close(); process.exit(0); }
})();
