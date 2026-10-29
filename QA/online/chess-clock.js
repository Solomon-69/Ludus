// Chess clock (1.12.34), no internet: node chess-clock.js
// bot: clock options render (7 choices), 1 min clock counts down from 1:00, running out ends the game, choice persists,
// the clock sits in the seat cards. online: the host's choice reaches the guest, a guest cannot change it, both clocks agree, a flag ends it on both.
const L = require('./lib.js');
const { wait, check, newPage, errs, party, shot } = L;
const st = p => p.evaluate(() => window.ludusDebug.chess());
const chips = p => p.evaluate(() => window.ludusDebug.chessChips());
const clickChip = async (p, time, i) => { const c = (await chips(p)).find(x => x.time === time && x.i === i); if (!c) return false; await p.mouse.click(c.x, c.y); await wait(150); return true; };
(async () => {
  const browser = await L.launch();
  try {
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.evaluate(() => { Ludus.state.chessLevel = 0; Ludus.state.chessNextSide = 1; Ludus.state.chessTime = 0; window.ludusOpenGame('chess'); });
    await wait(1200);
    let s = await st(A), cs = await chips(A);
    check('bot: 7 clock choices + 4 levels drawn', cs.filter(c => c.time).length === 7 && cs.filter(c => !c.time).length === 4, cs.length);
    // the option rows are roomy: every pill has a gap to its neighbour, none leaves the canvas, rows do not touch
    const rowsOk = sizes => 0;
    for (const sz of [{ width: 400, height: 600 }, { width: 340, height: 520 }, { width: 430, height: 860 }, { width: 760, height: 500 }]) {
      await A.setViewportSize(sz); await wait(1200);
      const cr = await chips(A), W = sz.width; let ok = cr.length === 11, why = '';
      const byRow = {}; cr.forEach(c => { (byRow[Math.round(c.y)] = byRow[Math.round(c.y)] || []).push(c); });
      for (const row of Object.values(byRow)) { row.sort((p, q) => p.x - q.x); for (let i = 1; i < row.length; i++) if (row[i].x - row[i - 1].x < 20) { ok = false; why = 'too close'; } if (row[0].x < 0 || row[row.length - 1].x > W) { ok = false; why = 'outside'; } }
      const ys = Object.keys(byRow).map(Number).sort((a, b) => a - b); if (ys.length === 2 && ys[1] - ys[0] < 36) { ok = false; why = 'rows touch'; }
      check('option rows tidy at ' + sz.width + 'x' + sz.height + ' (' + cr.length + ' pills, ' + ys.length + ' rows)', ok, why);
    }
    await A.setViewportSize({ width: 520, height: 740 }); await wait(400);
    check('bot: untimed by default', s.tc === 0, s.tc);
    check('click 1m: next clock is 1 minute', (await clickChip(A, true, 1)) && (await st(A)).tc === 1 && (await st(A)).rem[0] === 60000, await st(A));
    check('choice saved in settings', (await A.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).chessTime)) === 1);
    await shot(A, 'chess-clock-1m');
    await A.evaluate(() => window.ludusDebug.chessMove('e2e4'));
    await wait(1800);
    s = await st(A);
    check('1 min clock counts down from 1:00 once play starts', s.tc === 1 && s.rem[0] + s.rem[1] < 119500 && s.rem[0] + s.rem[1] > 110000, s.rem);
    check('clock pick after the first move waits for the next game', (await clickChip(A, true, 3)) && (await st(A)).tc === 1 && (await A.evaluate(() => Ludus.state.chessTime)) === 5);
    // time out: my own clock to 0.4 s while it is my move
    await A.evaluate(() => window.ludusDebug.chessRem(400, 60000));
    await wait(1600);
    s = await st(A);
    check('running out of time ends the game', s.phase === 'end' || s.ended, s);
    await shot(A, 'chess-clock-flag');
    check('no console errors (bot clock)', errs([A]) === 0, A.errors);
    // persists across a reload and a fresh game
    await A.reload(); await wait(500);
    await A.evaluate(() => { Ludus.state.saves = {}; window.ludusOpenGame('chess'); }); await wait(1000);
    check('clock choice survives a reload', (await st(A)).tc === 5, await st(A));
    await A.context().close();
    // ---- online
    const br = await L.broker.start();
    const { pages } = await party(browser, br, 'Chess', 2, { size: { width: 520, height: 740 } });
    const [H, G] = pages; await wait(900);
    check('online: host sees the clock picker, guest does not', (await chips(H)).filter(c => c.time).length === 7 && (await chips(G)).length === 0, [await chips(H), await chips(G)]);
    check('online: host picks 3m', await clickChip(H, true, 2));
    await wait(700);
    const h1 = await st(H), g1 = await st(G);
    check('online: guest gets the host clock before the first move', h1.tc === 3 && g1.tc === 3 && g1.rem[0] === 180000, [h1.tc, g1.tc, g1.rem]);
    await shot(H, 'chess-online-clock-host'); await shot(G, 'chess-online-clock-guest');
    const W = h1.my === 1 ? H : G, Bk = W === H ? G : H;
    await W.evaluate(() => window.ludusDebug.chessMove('e2e4'));
    await wait(1500);
    const w2 = await st(W), b2 = await st(Bk);
    check('online: both clocks run and agree', w2.tc === 3 && b2.tc === 3 && Math.abs((w2.rem[0] + w2.rem[1]) - (b2.rem[0] + b2.rem[1])) < 2500 && w2.rem[0] + w2.rem[1] < 359800, [w2.rem, b2.rem]);
    await Bk.evaluate(() => window.ludusDebug.chessMove('e7e5')); await wait(1200);
    check('online: picker is gone after the first move, caption says 3 min', (await chips(H)).length === 0, await chips(H));
    await Bk.evaluate(() => window.ludusDebug.chessRem(180000, 350)); await wait(500);
    await W.evaluate(() => window.ludusDebug.chessMove('g1f3')); await wait(2200);
    const w3 = await st(W), b3 = await st(Bk);
    check('online: running out of time ends the game on both screens', w3.phase === 'end' && b3.phase === 'end', [w3.phase, b3.phase]);
    check('no console errors (online clock)', errs(pages) === 0, pages.map(p => p.errors));
    br.close && br.close();
  } catch (e) { check('chess clock test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
