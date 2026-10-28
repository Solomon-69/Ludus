// Party fixes (1.12.17), no internet: node party2.js [only ...]
// duplicate codes, Rejoin always as a guest, old host rejoins and sees the new host, reopening comes back to the party lobby,
// a quiet player keeps their seat, seat kept for a returning player, suggestion card corners, empty join tiles,
// Air Hockey: mouse control, own goal at the bottom when tall, Rotate button.
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, lobbyText, shot, onlineTab, flexCreate, flexJoin, pick, waitPlaying } = L;
const sess = p => p.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s ? { role: s.role, seat: s.seat, code: s.code, n: s.count(), over: s.over, ready: s.ready, host: (s.rosterList()[0] || {}).name, names: s.rosterList().map(p => p.seat + ':' + p.name), wait: !!s.waitRound } : null; });
const waitSess = (p, fnSrc, ms = 15000) => p.waitForFunction(src => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return !!s && eval(src)(s); }, fnSrc, { timeout: ms });
const leaveRoom = p => p.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); (b || document.getElementById('leaveBtn')).click(); });
const rejoin = async p => { await onlineTab(p); await p.click('#opRejoin'); };
const only = process.argv.slice(2), want = n => !only.length || only.includes(n);

(async () => {
  const browser = await L.launch();
  try {
    if (want('dup')) { // ---- 1) a code already hosted is never claimed a second time (also when the host does not answer "hq", like Ludus 1.12.16)
      for (const quiet of [false, true]) {
        const br = await broker.start(), tag = quiet ? 'old host (no hq answer)' : 'new host';
        const A = await newPage(browser, br, { name: 'Ann' }), D = await newPage(browser, br, { name: 'Dup' });
        const c = await flexCreate(A);
        if (quiet) br.filter = (t, payload) => !/"t":"hq"/.test(payload);
        const got = await D.evaluate(code => new Promise(res => { const s = Ludus.net.createRoom({ gameId: 'pong', min: 2, max: 4, name: 'Dup', code }); s.on('ready', e => { res((e && e.code || s.code) + ':' + s.role); s.leave(); }); setTimeout(() => res('timeout'), 20000); }), c);
        // 1.12.19: reopening a code somebody really hosts joins their room as a guest (no second host, no stray new code)
        check('dup ' + tag + ': a second claim of ' + c + ' never makes two hosts (joins as a guest)', got === c + ':guest', got);
        br.filter = null;
        // a guest joining while two players claim the same code at once: one room only
        for (const p of [A, D]) await p.context().close(); br.close();
      }
      // two players claim the same fresh code at the same moment: the one still alone joins the other room
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), D = await newPage(browser, br, { name: 'Dup' });
      await Promise.all([A, D].map(p => p.evaluate(() => { window.__s = Ludus.net.createRoom({ gameId: 'pong', min: 2, max: 4, name: document.title ? 'x' : 'x', code: 'HFHF4' }); })));
      await wait(9000);
      const st = await Promise.all([A, D].map(p => p.evaluate(() => ({ role: __s.role, code: __s.code, n: __s.count(), ready: __s.ready }))));
      const hosts = st.filter(x => x.role === 'host' && x.code === 'HFHF4');
      check('dup race: never two hosts of the same code', hosts.length <= 1 && (st.every(x => x.code === 'HFHF4') ? st.some(x => x.role === 'guest' && x.ready) : true), st);
      for (const p of [A, D]) await p.context().close(); br.close();
    }

    if (want('guest')) { // ---- 2) Rejoin always joins as a guest: a promoted friend never hosts the code alone
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(800);
      await A.evaluate(() => { const s = Ludus.lobby.session; s.promote(s.rosterList()[1].cid); });
      await waitSess(B, '(s => s.role === "host")');
      await leaveRoom(B);   // Bo (now the leader) leaves: Ann takes the room back
      await waitSess(A, '(s => s.role === "host" && s.count() === 1)');
      const party = await B.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).party);
      check('guest: Bo\'s saved party is not "his" code', party && party.code === c && party.mine === false, party);
      await rejoin(B); await waitSess(B, '(s => s.ready)');
      await wait(1200);
      const [sa, sb] = [await sess(A), await sess(B)];
      check('guest: Rejoin puts Bo in Ann\'s room as a guest (one room, 2 players)', sb.role === 'guest' && sa.role === 'host' && sa.n === 2 && sb.n === 2 && sb.host === 'Ann', [sa, sb]);
      // the room is gone (1.12.19): the code is free, so Bo's Rejoin opens the same code again as host
      await leaveRoom(B); await wait(300); await leaveRoom(A); await wait(500);
      await rejoin(B); await waitSess(B, '(s => s.ready && s.role === "host")', 40000);
      const s3 = await sess(B);
      check('guest: with nobody hosting, Bo\'s Rejoin reopens ' + c + ' as host', s3 && s3.role === 'host' && s3.code === c, s3);
      check('guest: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const p of [A, B]) await p.context().close(); br.close();
    }

    if (want('oldhost')) { // ---- 3) the old host leaves (Bo takes over), comes back with Rejoin: a guest in Bo's room, sees Bo
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' }), C = await newPage(browser, br, { name: 'Cy' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(300); await flexJoin(C, c); await wait(800);
      await leaveRoom(A);
      await waitSess(B, '(s => s.role === "host")');
      await rejoin(A); await waitSess(A, '(s => s.ready)'); await wait(1500);
      const [sa, sb, sc] = [await sess(A), await sess(B), await sess(C)];
      check('oldhost: Ann rejoins as a guest of Bo\'s room (3 players everywhere)', sa.role === 'guest' && sa.code === c && sa.host === 'Bo' && sa.n === 3 && sb.n === 3 && sc.n === 3, [sa, sb, sc]);
      check('oldhost: Ann sees Bo in the room', /Bo/.test(await lobbyText(A)), await lobbyText(A));
      await shot(A, 'party2_oldhost_rejoined');
      // Ann made the code: with the whole room gone, her Rejoin opens it again as host
      await leaveRoom(A); await wait(300); await leaveRoom(C); await wait(300); await leaveRoom(B); await wait(600);
      await rejoin(A); await waitSess(A, '(s => s.ready && s.role === "host")', 40000);
      check('oldhost: the maker of the code reopens it when nobody hosts it', (await sess(A)).code === c, await sess(A));
      check('oldhost: no page errors', errs([A, B, C]) === 0, [A.errors, B.errors, C.errors]);
      for (const p of [A, B, C]) await p.context().close(); br.close();
    }

    if (want('reopen')) { // ---- 4) closing and opening the panel keeps the party; restarting Ludus rejoins the party lobby, not the game
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(600);
      await B.evaluate(() => { ludusClosed(); ludusOpened(); });
      await wait(500);
      const sb0 = await sess(B);
      check('reopen: panel closed and opened in the room: still in it, room showing', sb0 && !sb0.over && sb0.n === 2 && await B.evaluate(() => !document.getElementById('lobbySheet').hidden), sb0);
      await pick(A, ['Paddle Duel'], 1); await wait(400);
      await A.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(A), waitPlaying(B)]);
      const seat0 = (await sess(B)).seat;
      await B.reload(); await B.waitForTimeout(300);   // Ludus restarts on Bo's Mac mid-round
      await waitSess(B, '(s => s.ready)', 20000); await wait(1200);
      const [sa, sb] = [await sess(A), await sess(B)];
      const view = await B.evaluate(() => ({ lobby: !document.getElementById('lobbySheet').hidden, playing: !!(window.ludusOnline() && window.ludusOnline().started), text: (document.getElementById('lobbyCard') || {}).innerText || '' }));
      check('reopen: after a restart Bo is back in the party (same code, same seat, 2 players)', sb.code === c && sb.seat === seat0 && sa.n === 2 && sb.n === 2, [sa, sb, seat0]);
      check('reopen: Bo sees the room lobby, not the game', view.lobby && !view.playing && /next one/.test(view.text), view);
      await shot(B, 'party2_reopen_lobby');
      check('reopen: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const p of [A, B]) await p.context().close(); br.close();
    }

    if (want('quiet')) { // ---- 5) 30 s without a word from a player: still seated; a seat kept after a drop comes back
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' }), C = await newPage(browser, br, { name: 'Cy' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(300); await flexJoin(C, c); await wait(800);
      const bcid = await B.evaluate(() => Ludus.lobby.session.cid), bseat = (await sess(B)).seat;
      br.filter = (t, payload) => payload.indexOf('"c":"' + bcid + '"') < 0;   // Bo's messages are lost for 30 s
      await wait(30000);
      br.filter = null; await wait(5000);
      const [sa, sb] = [await sess(A), await sess(B)];
      check('quiet: after 30 s of silence Bo still has his seat', sa.n === 3 && sa.names.includes(bseat + ':Bo') && !sb.over && sb.seat === bseat, [sa, sb]);
      // the host timed Bo out (forced here): Bo comes back within 2 minutes and gets the same seat back
      await A.evaluate(seat => Ludus.lobby.session._removeSeat(seat, 'timeout'), bseat);
      await wait(300);
      await B.reload(); await B.waitForTimeout(300);
      await waitSess(B, '(s => s.ready)', 20000); await wait(800);
      const [sa2, sb2] = [await sess(A), await sess(B)];
      check('quiet: a returning player gets the same seat back', sb2.seat === bseat && sa2.names.includes(bseat + ':Bo') && sa2.n === 3, [sa2, sb2, bseat]);
      check('quiet: no page errors', errs([A, B, C]) === 0, [A.errors, B.errors, C.errors]);
      for (const p of [A, B, C]) await p.context().close(); br.close();
    }

    if (want('ui')) { // ---- 6) suggestion card corners; join tiles never show a code
      for (const dark of [false, true]) {
        const tag = dark ? 'dark' : 'light', br = await broker.start();
        const A = await newPage(browser, br, { name: 'Ann', dark }), B = await newPage(browser, br, { name: 'Bo', dark });
        const c = await flexCreate(A); await flexJoin(B, c); await wait(800);
        await B.evaluate(() => Ludus.lobby.session.suggest({ m: 's', g: ['pong'], n: 3 }));
        await A.waitForSelector('#lobbyCard .sug-card', { timeout: 9000 });
        const r = await A.$eval('#lobbyCard .sug-card', e => { const cs = getComputedStyle(e), b = e.querySelector('.sug-actions .btn'), bs = getComputedStyle(b), card = e.getBoundingClientRect(), br_ = b.getBoundingClientRect(); return { cr: parseFloat(cs.borderTopLeftRadius), br: parseFloat(bs.borderTopLeftRadius), padL: br_.left - card.left, padB: card.bottom - br_.bottom }; });
        check(tag + ' ui: suggestion buttons have corners concentric with the card (card radius = button radius + gap)', Math.abs(r.cr - r.br - r.padL) <= 1 && Math.abs(r.cr - r.br - r.padB) <= 1, r);
        await A.$eval('#lobbyCard .sug-card', e => e.scrollIntoView());
        await A.locator('#lobbyCard .sug-card').screenshot({ path: require('path').join(L.SHOTS, 'party2_sugcard_' + tag + '.png') });
        await leaveRoom(B); await wait(400);
        await onlineTab(B);
        const tiles = await B.$$eval('.code-tile', els => els.map(e => e.textContent));
        const ph = await B.$eval('#opCode', e => e.placeholder);
        check(tag + ' ui: join tiles are empty even with a last party (' + c + ')', tiles.length === 5 && tiles.every(t => t === '') && ph === '', [tiles, ph]);
        await shot(B, 'party2_online_page_' + tag);
        check(tag + ' ui: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
        for (const p of [A, B]) await p.context().close(); br.close();
      }
    }

    if (want('hockey')) { // ---- 7) Air Hockey: tall view puts your own goal at the bottom, mouse control, Rotate button
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(600);
      await pick(A, ['Air Hockey'], 1); await wait(400);
      await A.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(A), waitPlaying(B)]); await wait(1500);
      // rink point -> screen point on that player's view
      const scr = (h, x, y) => { let X = h.lay.flip ? h.W - x : x, Y = h.lay.flip ? h.H - y : y; const [sx, sy] = h.lay.side ? [h.H - Y, X] : [X, Y]; return [h.lay.ox + sx * h.lay.s, h.lay.oy + sy * h.lay.s]; };
      const hk = P => P.evaluate(() => ludusDebug.hockey());
      let [ha, hb] = [await hk(A), await hk(B)];
      check('hockey: side-on (wide) by default, even in a tall panel', ha.flat && hb.flat, [ha.flat, hb.flat]);
      check('hockey: wide: the host\'s own mallet is on the left', scr(ha, ha.m1.x, ha.m1.y)[0] < scr(ha, ha.m2.x, ha.m2.y)[0], ha);
      check('hockey: wide: the guest\'s own mallet (and goal) is on the left too', scr(hb, hb.m2.x, hb.m2.y)[0] < scr(hb, hb.m1.x, hb.m1.y)[0] && scr(hb, hb.W / 2, 0)[0] < scr(hb, hb.W / 2, hb.H)[0], hb);
      await shot(B, 'party2_hockey_guest_wide');
      // Rotate (both players): tall, own goal at the bottom
      for (const P of [A, B]) { await P.click('#orientBtn'); }
      await wait(400);
      [ha, hb] = [await hk(A), await hk(B)];
      check('hockey: after Rotate the rink is tall', !ha.flat && !hb.flat, [ha.flat, hb.flat]);
      check('hockey: tall: the host\'s own mallet is at the bottom', scr(ha, ha.m1.x, ha.m1.y)[1] > scr(ha, ha.m2.x, ha.m2.y)[1], ha);
      check('hockey: tall: the guest\'s own mallet (and goal) is at the bottom', scr(hb, hb.m2.x, hb.m2.y)[1] > scr(hb, hb.m1.x, hb.m1.y)[1] && scr(hb, hb.W / 2, 0)[1] > scr(hb, hb.W / 2, hb.H)[1], hb);
      const saved = await A.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).orient);
      check('hockey: Rotate button in the header, choice remembered', saved && saved.hockey === false, saved);
      await shot(B, 'party2_hockey_guest_tall');
      // guest: up arrow moves his mallet up the screen (towards the middle)
      const y0 = (await B.evaluate(() => ludusDebug.hockey())).m2.y;
      await B.keyboard.down('ArrowUp'); await wait(350); await B.keyboard.up('ArrowUp'); await wait(150);
      const y1 = (await B.evaluate(() => ludusDebug.hockey())).m2.y;
      check('hockey: guest\'s Up key moves his mallet up his screen', y1 > y0 + 5, [y0, y1]);
      // mouse: the guest points at a spot in his half; his mallet goes there, on his screen and on the host's
      const box = await B.$eval('#stage canvas', e => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
      const hb2 = await B.evaluate(() => ludusDebug.hockey());
      const tx = 90, ty = hb2.H * 0.3;   // rink spot in the guest's half (rink y < H/2)
      const [sx0, sy0] = scr(hb2, tx, ty), sx = box[0] + sx0, sy = box[1] + sy0;
      await B.mouse.move(sx, sy, { steps: 4 }); await wait(1400);
      const [g1, h1] = [await B.evaluate(() => ludusDebug.hockey().m2), await A.evaluate(() => ludusDebug.hockey().m2)];
      check('hockey: guest\'s mallet follows the mouse on his screen', Math.hypot(g1.x - tx, g1.y - ty) < 10, [g1, tx, ty]);
      check('hockey: ...and on the host\'s screen', Math.hypot(h1.x - tx, h1.y - ty) < 14, [h1, tx, ty]);
      // host mouse
      const boxA = await A.$eval('#stage canvas', e => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
      const tA = [200, ha.H * 0.8];
      const pA = scr(ha, tA[0], tA[1]); await A.mouse.move(boxA[0] + pA[0], boxA[1] + pA[1], { steps: 4 }); await wait(1200);
      const a1 = await A.evaluate(() => ludusDebug.hockey().m1);
      check('hockey: host\'s mallet follows the mouse', Math.hypot(a1.x - tA[0], a1.y - tA[1]) < 10, [a1, tA]);
      // the mouse cannot take a mallet over the centre line
      const pB = scr(ha, 150, 40); await A.mouse.move(boxA[0] + pB[0], boxA[1] + pB[1], { steps: 4 }); await wait(1000);
      const a2 = await A.evaluate(() => ludusDebug.hockey());
      check('hockey: mouse control stays in the own half', a2.m1.y >= a2.H / 2, a2.m1);
      check('hockey: no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
      for (const p of [A, B]) await p.context().close(); br.close();
    }
  } finally { await browser.close(); }
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
