// Leader hand-over test, no internet: node promote.js
// The host makes a guest the leader, leaves, and the room goes on (same code, plan, scores); a host who just leaves hands over
// to the longest-present player; older Ludus in the room (1.12.12 and 1.6.0) turns the feature off and keeps the old behaviour.
const L = require('./lib.js');
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { broker, wait, check, newPage, errs, code, lobbyText, title, rows, hasScore, shot, flexCreate, flexJoin, pick, waitCard, waitPlaying, playRound } = L;
const PREV = path.join(__dirname, '.prev');   // Ludus 1.12.12 as shipped: tournaments, no hand-over
if (!fs.existsSync(PREV)) { fs.mkdirSync(PREV, { recursive: true }); cp.execSync('git archive v1.12.12 web | tar -x -C QA/online/.prev', { cwd: path.join(__dirname, '..', '..') }); }
const sess = p => p.evaluate(() => { const s = (window.ludusOnline() || {}).session || Ludus.lobby.session; return s ? { role: s.role, seat: s.seat, code: s.code, n: s.count(), over: s.over, plan: s.plan, he: s.he } : null; });
const toastText = p => p.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
const waitToast = (p, re) => p.waitForFunction(r => new RegExp(r).test((document.querySelector('.toast') || {}).textContent || ''), re, { timeout: 9000 });
const waitRole = (p, role) => p.waitForFunction(r => { const o = window.ludusOnline && window.ludusOnline(); const s = (o && o.session) || Ludus.lobby.session; return s && s.role === r; }, role, { timeout: 12000 });
const st = p => p.evaluate(() => window.ludusDebug.chess());
const mv = (p, u) => p.evaluate(x => window.ludusDebug.chessMove(x), u);
const waitSide = (p, side, ms = 9000) => p.waitForFunction(s => { const c = window.ludusDebug.chess && window.ludusDebug.chess(); return c && c.side === s && c.phase === 'play'; }, side, { timeout: ms });

(async () => {
  const browser = await L.launch();
  try {
    // ---- 1) host makes Bo the leader, then leaves; Bo and Cy keep the room and play Chess
    for (const dark of [false, true]) {
      const tag = dark ? 'dark' : 'light', br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann', dark }), B = await newPage(browser, br, { name: 'Bo', dark }), C = await newPage(browser, br, { name: 'Cy', dark });
      const c = await flexCreate(A); await flexJoin(B, c); await flexJoin(C, c);
      await pick(A, ['Tag', 'Land Claim'], 3); await wait(900);
      const acts = await A.$$eval('#lobbyCard .seat .seat-act', els => els.map(e => [e.textContent, e.disabled]));
      check(tag + ': host sees "Make leader" on both other players, enabled', acts.length === 2 && acts.every(a => a[0] === 'Make leader' && !a[1]), acts);
      check(tag + ': guests see no "Make leader"', (await B.$$('#lobbyCard .seat-act')).length === 0 && (await C.$$('#lobbyCard .seat-act')).length === 0);
      await A.locator('#lobbyCard .seat', { hasText: 'Bo' }).locator('.seat-act').click();
      const conf = await A.locator('#lobbyCard .seat', { hasText: 'Bo' }).locator('.seat-act').allTextContents();
      check(tag + ': inline confirm (Confirm / Cancel) on Bo, nothing changed yet', conf.join() === 'Confirm,Cancel' && (await sess(B)).role === 'guest', conf);
      const planBefore = JSON.stringify((await sess(A)).plan);
      await shot(A, 'promote_confirm_' + tag);
      const colors = await A.$eval('#lobbyCard .seat-act.is-yes', e => { const cs = getComputedStyle(e); return [cs.backgroundColor, cs.color]; });
      await A.click('#lobbyCard .seat-act:text-is("Cancel")');
      check(tag + ': Cancel goes back to "Make leader"', (await A.$$eval('#lobbyCard .seat-act', els => els.map(e => e.textContent))).every(t => t === 'Make leader'));
      await A.locator('#lobbyCard .seat', { hasText: 'Bo' }).locator('.seat-act').click();
      await A.click('#lobbyCard .seat-act.is-yes');
      await waitRole(B, 'host');
      await Promise.all([waitToast(A, 'Bo is now the leader'), waitToast(C, 'Bo is now the leader'), waitToast(B, 'You are now the leader')]);
      check(tag + ': toast on everyone', true);
      const [sa, sb, sc] = [await sess(A), await sess(B), await sess(C)];
      check(tag + ': Bo is host at seat 0, Ann is a guest, same code', sb.role === 'host' && sb.seat === 0 && sa.role === 'guest' && sa.seat > 0 && sc.role === 'guest' && sb.code === c && sa.code === c, [sa, sb, sc]);
      check(tag + ': the plan carried over', JSON.stringify(sb.plan) === planBefore && sb.plan.n === 3, [planBefore, sb.plan]);
      await wait(600);
      check(tag + ': Bo now has the host controls (Start, picker, Make leader)', /Your room/.test(await title(B)) && (await B.$$('#lobbyCard .mode-tab')).length === 2 && (await B.$$('#lobbyCard .seat-act')).length === 2 && !!(await B.$('#lobbyCard button.primary:has-text("Start")')), await lobbyText(B));
      check(tag + ': Ann now sees the guest view', /In room/.test(await title(A)) && (await A.$$('#lobbyCard .seat-act')).length === 0, await lobbyText(A));
      const host0 = await C.$$eval('#lobbyCard .seat', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
      check(tag + ': Cy sees Bo with the Host badge', /Bo HOST|Bo Host/i.test(host0[0] || ''), host0);
      await shot(B, 'promote_newhost_' + tag); await shot(C, 'promote_guest_' + tag);
      // Ann leaves: the room stays
      await A.click('#lobbyCard button:text-is("Leave")');
      await B.waitForFunction(() => Ludus.lobby.session && Ludus.lobby.session.count() === 2, null, { timeout: 9000 });
      await wait(1500);
      const [sb2, sc2] = [await sess(B), await sess(C)];
      check(tag + ': after Ann leaves, Bo and Cy are still in the room', sb2.n === 2 && sc2.n === 2 && !sb2.over && !sc2.over && sb2.code === c, [sb2, sc2]);
      check(tag + ': Cy did not get a "room closed" card', !/Room closed|Lost the host/.test(await lobbyText(C)), await lobbyText(C));
      // the new host picks a game and starts: a turn-based game (Chess)
      await pick(B, ['Chess'], 1); await wait(700);
      check(tag + ': Cy sees the new host\'s pick', (await sess(C)).plan.g.join() === 'chess', (await sess(C)).plan);
      await B.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(B), waitPlaying(C)]); await wait(900);
      const [h, g] = [await st(B), await st(C)];
      check(tag + ': Chess opens on both, opposite colours', h && g && h.mode === 'online' && h.my === -g.my, [h, g]);
      const W = h.my === 1 ? B : C, Bk = W === B ? C : B;
      for (const [i, u] of ['e2e4', 'e7e5', 'g1f3'].entries()) { const p = i % 2 ? Bk : W; await waitSide(p, i % 2 ? -1 : 1); check(tag + ': move ' + u, await mv(p, u)); }
      await wait(900);
      const [w1, b1] = [await st(W), await st(Bk)];
      check(tag + ': both boards agree after 3 moves', w1.fen === b1.fen && w1.plies.length === 3, [w1.fen, b1.fen]);
      check(tag + ': no page errors', errs([A, B, C]) === 0, [A.errors, B.errors, C.errors, colors]);
      for (const p of [A, B, C]) await p.context().close();
      br.close();
    }
    // ---- 2) the host just leaves the waiting room: the longest-present player takes over
    { const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' }), C = await newPage(browser, br, { name: 'Cy' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(300); await flexJoin(C, c);
      await pick(A, ['Tag'], 3); await wait(800);
      await A.click('#lobbyCard button:text-is("Leave")');
      await waitRole(B, 'host');
      await Promise.all([waitToast(C, 'Bo is now the leader'), waitToast(B, 'You are now the leader')]);
      await wait(1200);
      const [sb, sc] = [await sess(B), await sess(C)];
      check('host leaves without choosing: Bo (joined first) runs the room, Cy stays', sb.role === 'host' && sb.n === 2 && sc.role === 'guest' && sc.n === 2 && sb.code === c && !sc.over, [sb, sc]);
      check('...plan kept (Tag, 3 rounds)', sb.plan.g.join() === 'tag' && sb.plan.n === 3, sb.plan);
      await B.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(B), waitPlaying(C)]);
      check('...the new host starts the game for both', true);
      await playRound([B, C], 1); await Promise.all([waitCard(B, 'Wins so far'), waitCard(C, 'Wins so far')]);
      check('...the round result reaches the new host', hasScore(await rows(B), 'Cy', 1), await rows(B));
      check('...no page errors', errs([A, B, C]) === 0, [A.errors, B.errors, C.errors]);
      for (const p of [A, B, C]) await p.context().close(); br.close(); }
    // ---- 3) mid-tournament: the host leaves at the scoreboard; scores carry on with the new host
    { const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' }), C = await newPage(browser, br, { name: 'Cy' });
      const c = await flexCreate(A); await flexJoin(B, c); await wait(300); await flexJoin(C, c);
      await pick(A, ['Tag', 'Land Claim'], 1); await wait(600);
      await A.click('#lobbyCard button.primary');
      await playRound([A, B, C], 2);
      await Promise.all([A, B, C].map(p => waitCard(p, 'Points')));
      await A.evaluate(() => document.getElementById('leaveBtn').click());
      await waitRole(B, 'host'); await wait(800);
      check('scoreboard: the new host gets "Start now"', /Start now/.test(await lobbyText(B)) && !/Start now/.test(await lobbyText(C)), [await lobbyText(B), await lobbyText(C)]);
      await B.click('#lobbyCard button:text-is("Start now")'); await Promise.all([waitPlaying(B), waitPlaying(C)]);
      const nm = await B.$eval('#gameName', e => e.textContent);
      check('the tournament goes on with the second game', /Land/.test(nm), nm);
      await playRound([B, C], 0); await Promise.all([waitCard(B, 'wins|tie|Points'), waitCard(C, 'wins|tie|Points')]);
      if (/Show results/.test(await lobbyText(B))) await B.click('#lobbyCard button:text-is("Show results")');
      await Promise.all([waitCard(B, 'wins|tie'), waitCard(C, 'wins|tie')]);
      const fr = await rows(C);
      check('final standings keep the scores from before the hand-over (Cy 1, Bo 1, Ann 0)', hasScore(fr, 'Cy', 1) && hasScore(fr, 'Bo', 1) && hasScore(fr, 'Ann', 0), [await title(C), fr]);
      check('...no page errors', errs([B, C]) === 0, [B.errors, C.errors]);
      for (const p of [A, B, C]) await p.context().close(); br.close(); }
    // ---- 4) an older Ludus in the room (1.12.12, then 1.6.0): Make leader is greyed out with a reason; leaving closes the room as before
    for (const [label, opts] of [['1.12.12', { dir: path.join(PREV, 'web') }], ['1.6.0', { old: true }]]) {
      const br = await broker.start();
      const A = await newPage(browser, br, { name: 'Ann' }), O = await newPage(browser, br, Object.assign({ name: 'Old' }, opts));
      const c = await flexCreate(A);
      if (label === '1.6.0') {
        await pick(A, ['Four in a Row'], 1);
        await O.evaluate(() => ludusOpenGame('fourup')); await O.waitForTimeout(500); await O.click('#vsToggle [data-vs="online"]'); await O.waitForSelector('#lobbySheet:not([hidden])');
        await O.click('#lobbyCard >> text=Join room'); await O.fill('.code-input', c); await O.click('#lobbyCard button:text-is("Join")');
      } else await flexJoin(O, c);
      await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 }); await wait(600);
      const act = await A.$$eval('#lobbyCard .seat-act', els => els.map(e => [e.textContent, e.disabled, e.title]));
      check(label + ' guest: "Make leader" greyed out with a reason', act.length === 1 && act[0][1] === true && /newest Ludus/.test(act[0][2]) && /Make leader needs everyone on the newest Ludus/.test(await lobbyText(A)), [act, await lobbyText(A)]);
      await shot(A, 'promote_old_' + label);
      check(label + ': promote() refuses', (await A.evaluate(() => { const s = Ludus.lobby.session || (window.ludusOnline() || {}).session; return s ? s.promote(s.rosterList()[1].cid) : "no session"; })) === false);
      await A.evaluate(() => { const b = Array.from(document.querySelectorAll('#lobbyCard button')).find(x => x.textContent === 'Leave' && x.offsetParent); (b || document.getElementById('leaveBtn')).click(); });   // a full 1.6 room starts by itself: then Leave is in the header
      await O.waitForFunction(() => /Room closed|left/i.test((document.getElementById('lobbyCard') || {}).innerText || ''), null, { timeout: 9000 });
      check(label + ': host leaving still closes the room for the older player (old behaviour)', true);
      check(label + ': no page errors', errs([A, O]) === 0, [A.errors, O.errors]);
      for (const p of [A, O]) await p.context().close(); br.close();
    }
  } finally { await browser.close(); }
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
