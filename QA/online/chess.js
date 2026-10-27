// Chess test, no internet: node chess.js  (bot game + friend switch + 2-page online game through the in-memory broker)
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, party, shot } = L;
const st = p => p.evaluate(() => window.ludusDebug.chess());
const mv = (p, u) => p.evaluate(x => window.ludusDebug.chessMove(x), u);
const waitSide = (p, side, ms = 9000) => p.waitForFunction(s => { const c = window.ludusDebug.chess && window.ludusDebug.chess(); return c && c.side === s && c.phase === 'play'; }, side, { timeout: ms });
(async () => {
  const browser = await L.launch();
  try {
    // ---- vs bot
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.evaluate(() => { Ludus.state.chessLevel = 2; Ludus.state.chessNextSide = 1; window.ludusOpenGame('chess'); });
    await wait(2000);
    let s = await st(A);
    check('bot game opens, you are White, Hard', s.mode === 'bot' && s.my === 1 && s.level === 2 && s.side === 1, s);
    // real mouse drag e2-e4
    const g1 = await A.evaluate(() => window.ludusDebug.chessGeo(0x14)), g2 = await A.evaluate(() => window.ludusDebug.chessGeo(0x34));
    await A.mouse.move(g1.x, g1.y); await A.mouse.down(); await A.mouse.move(g1.x, g1.y - 30, { steps: 4 }); await A.mouse.move(g2.x, g2.y, { steps: 6 }); await A.mouse.up();
    await wait(100);
    s = await st(A);
    check('drag e2-e4 played', s.plies[0] === 'e2e4', s.plies);
    await waitSide(A, 1);
    s = await st(A);
    check('bot answered (opening book)', s.plies.length === 2, s);
    // click-to-move g1-f3
    const k1 = await A.evaluate(() => window.ludusDebug.chessGeo(0x06)), k2 = await A.evaluate(() => window.ludusDebug.chessGeo(0x25));
    await A.mouse.click(k1.x, k1.y); await wait(80); await shot(A, 'chess-selected'); await A.mouse.click(k2.x, k2.y);
    await wait(60);
    s = await st(A);
    check('click-to-move g1-f3 played', s.plies[2] === 'g1f3', s.plies);
    // UI smooth while Expert thinks: measure frame gaps
    await waitSide(A, 1);
    await A.evaluate(() => { Ludus.state.chessLevel = 3; });
    await A.keyboard.press('4'); // Expert chip shortcut
    const idle = await A.evaluate(async () => { let last = performance.now(), worst = 0; const t0 = last; await new Promise(r => { const f = now => { worst = Math.max(worst, now - last); last = now; if (now - t0 < 1200) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return Math.round(worst); });
    const frames = await A.evaluate(async () => {
      const ok = window.ludusDebug.chessMove(window.ludusDebug.chess().plies.length === 4 ? 'f1c4' : 'd2d4');
      let last = performance.now(), worst = 0; const t0 = last;
      await new Promise(r => { const f = now => { worst = Math.max(worst, now - last); last = now; if (now - t0 < 1800) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      return { ok, worst: Math.round(worst) };
    });
    check('Expert thinks without freezing the page (worst frame < 120 ms or no worse than idle)', frames.ok && (frames.worst < 120 || frames.worst <= idle * 1.5), [frames, idle]);
    await waitSide(A, 1, 12000);
    s = await st(A);
    check('Expert answered from the worker', s.plies.length === 6 && s.level === 3 && s.worker && !s.workerBroken, s);
    await shot(A, 'chess-bot');
    // promotion picker + castling from a crafted game: play a quick legal sequence via debug
    check('no console errors (bot)', errs([A]) === 0, A.errors);
    // ---- friend mode then pick a bot level from it
    await A.evaluate(() => { document.querySelector('#vsToggle [data-vs="friend"]').click(); });
    await wait(800);
    s = await st(A);
    check('friend mode: both sides on one screen', s.mode === 'friend' && s.plies.length === 0, s);
    for (const u of ['e2e4', 'd7d5', 'e4d5', 'g8f6', 'f1b5', 'c7c6']) { await mv(A, u); await wait(260); }
    s = await st(A);
    check('friend: six moves played both colours', s.plies.length === 6, s.plies);
    await shot(A, 'chess-friend');
    // tap the Medium chip under the board -> bot mode at Medium
    await A.keyboard.press('2');
    await wait(900);
    s = await st(A);
    check('level chip in friend mode switches to the bot', s.mode === 'bot' && s.level === 1, s);
    check('no console errors (friend)', errs([A]) === 0, A.errors);
    await A.context().close();
    // ---- promotion, en passant, castling, mate via a friend game
    const B = await newPage(browser, null, {});
    await B.evaluate(() => window.ludusOpenGame('chess')); await wait(700);
    await B.evaluate(() => document.querySelector('#vsToggle [data-vs="friend"]').click()); await wait(800);
    const seq = ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6', 'a6a5', 'd6c7', 'a5a4', 'g1f3', 'a4a3', 'f1e2', 'a3b2', 'e1g1'];
    for (const u of seq) { await mv(B, u); await wait(260); }
    s = await st(B);
    check('en passant and castling legal', s.plies.length === 13 && s.sans.includes('exd6') && s.sans[12] === 'O-O', s.sans);
    // c7xd8 promotion via the picker: click c7 then d8 (white at bottom) then pick Knight
    const c7 = await B.evaluate(() => window.ludusDebug.chessGeo(0x62)), d8 = await B.evaluate(() => window.ludusDebug.chessGeo(0x73));
    // black to move: play b2xa1=Q first through debug (also a promotion, via uci)
    await mv(B, 'b2a1q'); await wait(300);
    await B.mouse.click(c7.x, c7.y); await wait(60); await B.mouse.click(d8.x, d8.y); await wait(100);
    await shot(B, 'chess-promo');
    // picker: Queen, Knight, Rook, Bishop downward from d8 -> Knight is 2nd box
    await B.mouse.click(d8.x, d8.y + d8.s); await wait(300);
    s = await st(B);
    check('promotion picker: chose a knight', /cxd8=N/.test(s.sans[s.sans.length - 1]) && s.sans[13] === 'bxa1=Q', s.sans.slice(-3));
    check('no console errors (rules)', errs([B]) === 0, B.errors);
    await B.context().close();
    // ---- online
    const br = await broker.start();
    const { pages } = await party(browser, br, 'Chess', 2, { size: { width: 520, height: 740 } });
    const [H, G] = pages;
    await wait(600);
    const h0 = await st(H), g0 = await st(G);
    check('online: colours opposite on the two screens', h0.mode === 'online' && h0.my === -g0.my, [h0.my, g0.my]);
    const W = h0.my === 1 ? H : G, Bk = h0.my === 1 ? G : H;
    check('black may not move first', !(await mv(Bk, 'e7e5')), null);
    const game = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    for (let i = 0; i < game.length; i++) { const p = i % 2 ? Bk : W; await waitSide(p, i % 2 ? -1 : 1); check('online move ' + game[i], await mv(p, game[i])); }
    await wait(2600);
    const w1 = await st(W), b1 = await st(Bk);
    check('online: both screens agree (fool\'s mate)', w1.fen === b1.fen && w1.phase === 'end' && b1.phase === 'end', [w1.fen, b1.fen, w1.phase, b1.phase]);
    const t = await Promise.all([W, Bk].map(p => p.$eval('#overTitle', e => e.textContent).catch(() => '')));
    check('online titles: Black wins / You win', /wins/.test(t[0]) && /You win/.test(t[1]), t);
    await shot(W, 'chess-online-white'); await shot(Bk, 'chess-online-black');
    check('no console errors (online)', errs(pages) === 0, pages.map(p => p.errors));
    // a lost move: the relay drops White's move once, then the link drops; after reconnecting both screens agree again
    const two = await party(browser, br, 'Chess', 2, {});
    const [H2, G2] = two.pages; await wait(600);
    const W2 = (await st(H2)).my === 1 ? H2 : G2, B2 = W2 === H2 ? G2 : H2;
    let dropped = 0;
    br.filter = (topic, payload) => { if (!dropped && /"mv"/.test(String(payload))) { dropped++; return false; } };
    await mv(W2, 'd2d4'); await wait(800);
    const lost = await st(B2);
    br.filter = null; br.dropAll();
    await B2.waitForFunction(() => window.ludusDebug.chess().plies.length === 1, null, { timeout: 25000 }).catch(() => {});
    const r1 = await st(B2), r0 = await st(W2);
    check('lost move recovered after reconnect', dropped === 1 && lost.plies.length === 0 && r1.fen === r0.fen && r1.plies.length === 1, [dropped, lost.plies, r1.plies, r0.plies]);
    check('game goes on after recovery', await mv(B2, 'g8f6'));
    await wait(1500);
    check('both screens agree after the next move', (await st(W2)).fen === (await st(B2)).fen);
    check('no console errors (resync)', errs(two.pages) === 0, two.pages.map(p => p.errors));
    br.close && br.close();
  } catch (e) { check('chess test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
