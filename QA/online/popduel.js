// Pop Duel (Bloons TD Battles) online test, no internet: node popduel.js [--dark]
// Two pages through the in-memory broker: both tracks run, towers and balloons show up on the rival's copy,
// sent balloons land on the other screen, and when one track falls both screens agree on the winner.
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, party, shot } = L;
const dark = process.argv.includes('--dark');
const st = p => p.evaluate(() => window.ludusDebug.popduel());
const ctl = (p, fn, arg) => p.evaluate(([f, a]) => { const C = window.ludusDebug.popduelCtl; return new Function('C', 'a', f)(C, a); }, [fn, arg]);

(async () => {
  const browser = await L.launch();
  try {
    const br = await broker.start();
    const wide = { width: 760, height: 500 };
    const { pages } = await party(browser, br, 'Bloons TD Battles', 2, { size: wide, dark });
    const [A, B] = pages;
    await wait(600);
    const a0 = await st(A), b0 = await st(B);
    check('both screens start the duel at once', a0.phase === 'play' && b0.phase === 'play' && a0.mode === 'duel' && b0.mode === 'duel', [a0.phase, b0.phase]);
    // host (seat 0) builds on the left track, guest (seat 1) on the right one
    await ctl(A, "const b = C.boards()[0]; b.build('dart', 3, 3); b.build('tack', 8, 4); return b.towers.length");
    await ctl(B, "const b = C.boards()[1]; b.build('sniper', 13, 4); return b.towers.length");
    await ctl(A, "C.setClock(30)"); await ctl(B, "C.setClock(30)");
    await wait(1200);
    const a1 = await st(A), b1 = await st(B);
    check('host sees the guest\'s tower on the rival track', a1.boards[1].towers.join() === 'sniper:000', a1.boards[1].towers);
    check('guest sees the host\'s towers on the rival track', b1.boards[0].towers.join() === 'dart:000,tack:000', b1.boards[0].towers);
    check('both tracks reached the same wave', a1.boards[0].wave >= 2 && Math.abs(a1.boards[0].wave - b1.boards[1].wave) <= 1, [a1.boards[0].wave, b1.boards[1].wave]);
    check('the rival copy follows lives and wave', a1.boards[1].lives === b1.boards[1].lives && Math.abs(a1.boards[1].wave - b1.boards[1].wave) <= 1, [a1.boards[1], b1.boards[1]]);
    // host sends 8 red at the guest
    const q0 = await ctl(B, 'return C.boards()[1].queue.length');
    await ctl(A, 'const b = C.boards()[0]; b.cash += 500; b.sendCd = 0; b.send(0); return b.cash');
    await wait(700);
    const q1 = await ctl(B, 'return C.boards()[1].queue.length + C.boards()[1].bl.length');
    check('balloons sent by the host land on the guest\'s track', q1 >= q0 + 8, [q0, q1]);
    // guest sends back
    const p0 = await ctl(A, 'return C.boards()[0].queue.length + C.boards()[0].bl.length');
    await ctl(B, 'const b = C.boards()[1]; b.cash += 500; b.sendCd = 0; b.send(1); return b.cash');
    await wait(700);
    const p1 = await ctl(A, 'return C.boards()[0].queue.length + C.boards()[0].bl.length'), pm = await ctl(A, 'return C.boards()[0].msg');
    check('balloons sent by the guest land on the host\'s track', /^6 Blue incoming$/.test(pm) && p1 > p0, [p0, p1, pm]);
    await shot(A, 'popduel-host'); await shot(B, 'popduel-guest');
    // the guest's track falls: both screens must agree the host won
    await ctl(B, 'C.boards()[1].lives = 0');
    await wait(3200);
    const a2 = await st(A), b2 = await st(B);
    check('both screens agree the host won', a2.winner === 0 && b2.winner === 0 && a2.phase === 'over' && b2.phase === 'over', [a2.winner, b2.winner, a2.phase, b2.phase]);
    const hdr = await Promise.all(pages.map(p => p.$eval('#overTitle', e => e.textContent).catch(() => '')));
    check('end titles: host wins, guest loses', /You win/.test(hdr[0]) && /wins/.test(hdr[1]) && !/You win/.test(hdr[1]), hdr);
    await shot(A, 'popduel-over');
    check('no console errors on either screen', errs(pages) === 0, pages.map(p => p.errors));
    // a dead heat: both tracks fall in the same moment, the results cross on the wire, both screens still agree
    const two = await party(browser, br, 'Bloons TD Battles', 2, { size: { width: 400, height: 600 }, dark });
    const [C1, C2] = two.pages; await wait(600);
    await Promise.all([ctl(C1, 'C.boards()[0].lives = 0'), ctl(C2, 'C.boards()[1].lives = 0')]);
    await wait(3200);
    const c1 = await st(C1), c2 = await st(C2);
    check('dead heat: both screens name the same winner', c1.phase === 'over' && c2.phase === 'over' && c1.winner === c2.winner && c1.winner >= 0, [c1.winner, c2.winner]);
    await shot(C2, 'popduel-compact-guest');
    check('no console errors in the dead heat', errs(two.pages) === 0, two.pages.map(p => p.errors));
    await br.close && br.close();
  } catch (e) { check('popduel online ran to the end', false, String(e.stack || e).slice(0, 500)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
