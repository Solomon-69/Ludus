// Online Tag screenshots, compact tall / compact wide / large, light and dark: node tagshots.js [prefix]
const L = require('./lib.js');
const pre = process.argv[2] || 'tag';
const SIZES = { tall: { width: 400, height: 600 }, wide: { width: 760, height: 500 }, large: { width: 900, height: 600 } };
(async () => {
  const browser = await L.launch();
  for (const dark of [false, true]) for (const [sz, size] of Object.entries(SIZES)) {
    const br = await L.broker.start();
    const A = await L.newPage(browser, br, { name: 'Solomon', size, dark }), B = await L.newPage(browser, br, { name: 'Raper932', size, dark });
    const c = await L.flexCreate(A); await L.flexJoin(B, c); await L.pick(A, ['Tag'], 1);
    await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
    await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await L.wait(1200);
    for (let i = 0; i < 6 && await A.evaluate(() => window.ludusDebug.tag().phase) === 'menu'; i++) { await A.keyboard.press('Enter'); await L.wait(500); }
    await L.wait(3500);
    await B.screenshot({ path: L.SHOTS + '/' + pre + '-' + sz + (dark ? '-dark' : '-light') + '.png' });
    const ov = await B.evaluate(() => { const r = e => e && e.getBoundingClientRect(); const els = Array.from(document.querySelectorAll('#gameBar *, .topbar *, header *')).filter(e => e.offsetParent && e.children.length === 0 && e.textContent.trim()); return els.map(e => { const b = r(e); return [e.id || e.className, e.textContent.trim().slice(0, 20), Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }); });
    if (!dark) console.log(sz, JSON.stringify(ov).slice(0, 1500));
    for (const p of [A, B]) await p.context().close(); br.close();
  }
  await browser.close(); process.exit(0);
})();
