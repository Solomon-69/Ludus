// Chess online screenshots (host and guest, light and dark) through the local relay: node chess-shots.js <out dir>
const L = require('./lib.js'), fs = require('fs'), path = require('path');
const { wait } = L, OUT = process.argv[2] || L.SHOTS; fs.mkdirSync(OUT, { recursive: true });
const snap = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
const clickClock = async (p, i) => { const c = (await p.evaluate(() => window.ludusDebug.chessChips())).find(x => x.time && x.i === i); if (c) { await p.mouse.click(c.x, c.y); await wait(200); } };
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  for (const dark of [false, true]) {
    const t = dark ? 'dark' : 'light', size = { width: 430, height: 800 };
    const A = await L.newPage(browser, br, { name: 'Ann', dark, size }), B = await L.newPage(browser, br, { name: 'Bo', dark, size });
    const c = await L.flexCreate(A); await wait(500); await snap(A, `chess-online-1-lobby-waiting-host-${t}`);
    await L.flexJoin(B, c);
    await L.pick(A, ['Chess'], 1);
    await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 }); await wait(500);
    await snap(A, `chess-online-2-lobby-ready-host-${t}`); await snap(B, `chess-online-2-lobby-ready-guest-${t}`);
    await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await wait(900);
    await snap(A, `chess-online-3-start-host-${t}`);
    await clickClock(A, 3); await wait(700);   // host picks 5 min
    const st = p => p.evaluate(() => window.ludusDebug.chess());
    const hs = await st(A), W = hs.my === 1 ? A : B, Bk = W === A ? B : A;
    for (const [p, u] of [[W, 'e2e4'], [Bk, 'e7e5'], [W, 'g1f3'], [Bk, 'b8c6'], [W, 'f1c4']]) { await p.waitForFunction(() => { const c = window.ludusDebug.chess(); return c.phase === 'play'; }, null, { timeout: 8000 }).catch(() => {}); await p.evaluate(x => window.ludusDebug.chessMove(x), u); await wait(700); }
    await wait(1500);
    await snap(A, `chess-online-4-midgame-host-${t}`); await snap(B, `chess-online-4-midgame-guest-${t}`);
    console.log(t, 'host', JSON.stringify((await st(A)).rem), 'guest', JSON.stringify((await st(B)).rem), 'errors', A.errors.length + B.errors.length);
    await A.context().close(); await B.context().close();
  }
  await browser.close(); br.stop && br.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
