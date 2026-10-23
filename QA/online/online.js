// Online tests (no internet): node online.js [scenario ...]   Scenarios: tournament tleave tleave2 party compat futurehost lag watch layout
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, code, lobbyText, title, rows, hasScore, shot, onlineTab, flexCreate, flexJoin, pick, waitCard, waitPlaying, playRound, party, hold } = L;

const S = {
  async tournament(browser) {
    const br = await broker.start();
    const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
    const c = await flexCreate(A); await flexJoin(B, c);
    check('host sees both players', (await rows(A)).length >= 2 && /Bo/.test(await lobbyText(A)), await lobbyText(A));
    await pick(A, ['Pong', 'Air Hockey'], 3); await wait(700);
    const gt = await lobbyText(B);
    check('guest sees the picked games and rounds live', /Pong, Air Hockey|Air Hockey, Pong/.test(gt) && /3 rounds per game/.test(gt), gt);
    check('guest has no pickers', (await B.$$('#lobbyCard .pick-chips')).length === 0);
    await A.click('#lobbyCard button.primary');
    const order = ['Pong', 'Air Hockey'], plan = [[0, 0, 1], [0, 1, 0]];
    let a = 0, b = 0;
    for (let g = 0; g < 2; g++) for (let r = 0; r < 3; r++) {
      await playRound([A, B], plan[g][r]); if (plan[g][r] === 0) a++; else b++;
      await Promise.all([waitCard(A, 'Wins so far'), waitCard(B, 'Wins so far')]);
      const last = g === 1 && r === 2, ng = r === 2 ? order[g + 1] : order[g], nr = r === 2 ? 1 : r + 2;
      const [ta, tb] = [await title(A), await title(B)];
      if (!last) check(`board g${g + 1}r${r + 1}: "Round ${nr} of 3 · Next: ${ng}" on both`, ta === tb && ta === `Round ${nr} of 3 · Next: ${ng}`, [ta, tb]);
      const [ra, rb] = [await rows(A), await rows(B)];
      check(`scoreboard ${a}-${b} on both after g${g + 1}r${r + 1}`, hasScore(ra, 'Ann', a) && hasScore(rb, 'Ann', a) && hasScore(ra, 'Bo', b) && hasScore(rb, 'Bo', b), [ra, rb]);
      if (g === 0 && r === 0) await shot(A, 'board');
      await A.click('#lobbyCard button:text-is("' + (last ? 'Show results' : 'Start now') + '")');
      if (!last) { await waitPlaying(A); await waitPlaying(B); const nm = await A.$eval('#gameName', e => e.textContent); check(`game screen shows ${ng}`, nm.includes(ng), nm); }
    }
    await Promise.all([waitCard(A, 'wins'), waitCard(B, 'wins')]);
    check('final: Ann wins 4-2 on both', (await title(A)) === 'Ann wins' && (await title(B)) === 'Ann wins' && hasScore(await rows(B), 'Ann', 4) && hasScore(await rows(B), 'Bo', 2), [await title(A), await rows(B)]);
    check('final: host has Rematch + Back to lobby, guest waits', /Rematch/.test(await lobbyText(A)) && /Back to lobby/.test(await lobbyText(A)) && !/Rematch/.test(await lobbyText(B)) && /Waiting for the host/.test(await lobbyText(B)));
    await shot(A, 'final');
    await A.click('#lobbyCard button:text-is("Rematch")'); await Promise.all([waitPlaying(A), waitPlaying(B)]);
    check('rematch resets the scores', (await B.evaluate(() => JSON.stringify(ludusOnline().session.ser.sc.map(e => e[2])))) === '[0,0]');
    check('no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
    br.close();
  },
  async tleave(browser) {
    const br = await broker.start();
    const [A, B, C] = [await newPage(browser, br, { name: 'Ann' }), await newPage(browser, br, { name: 'Bo' }), await newPage(browser, br, { name: 'Cy' })];
    const c = await flexCreate(A); await flexJoin(B, c); await flexJoin(C, c);
    await pick(A, ['Tag', 'Paper.io'], 1); await wait(500);
    await A.click('#lobbyCard button.primary');
    await playRound([A, B, C], 2);
    await Promise.all([A, B, C].map(p => waitCard(p, 'Wins so far')));
    check('3-player board: Cy has 1 win everywhere', (await Promise.all([A, B, C].map(rows))).every(r => hasScore(r, 'Cy', 1)));
    await C.evaluate(() => document.getElementById('leaveBtn').click()); await wait(2500);
    await A.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(A), waitPlaying(B)]);
    const nm = await A.$eval('#gameName', e => e.textContent);
    check('after Cy left the tournament goes on with 2 (Paper.io)', /Paper/.test(nm), nm);
    await playRound([A, B], 0); await Promise.all([waitCard(A, 'Wins so far|wins'), waitCard(B, 'Wins so far|wins')]);
    await A.click('#lobbyCard button.primary'); await Promise.all([waitCard(A, 'wins|tie'), waitCard(B, 'wins|tie')]);
    const fr = await rows(A);
    check('final standings keep the player who left', hasScore(fr, 'Cy', 1) && hasScore(fr, 'Ann', 1), [await title(A), fr]);
    check('no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
    br.close();
  },
  async tleave2(browser) {
    const br = await broker.start();
    const [A, B] = [await newPage(browser, br, { name: 'Ann' }), await newPage(browser, br, { name: 'Bo' })];
    const c = await flexCreate(A); await flexJoin(B, c);
    await pick(A, ['Pong', 'Air Hockey'], 3); await A.click('#lobbyCard button.primary');
    await playRound([A, B], 1); await Promise.all([waitCard(A, 'Wins so far'), waitCard(B, 'Wins so far')]);
    await A.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(A), waitPlaying(B)]);
    await B.evaluate(() => document.getElementById('leaveBtn').click());
    await waitCard(A, 'A player left', 14000);
    check('too few players: standings so far with a reason', (await title(A)) === 'Bo wins' && hasScore(await rows(A), 'Bo', 1), [await title(A), await lobbyText(A)]);
    await shot(A, 'left');
    check('no page errors (host)', A.errors.length === 0, A.errors);
    br.close();
  },
  async party(browser) {
    const br = await broker.start();
    const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
    const c = await flexCreate(A); await flexJoin(B, c); await pick(A, ['Pong', 'Air Hockey'], 5); await wait(800);
    const saved = await A.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).party);
    check('party saved: code, names, games, rounds', saved && saved.code === c && saved.names.length === 2 && saved.games.length === 2 && saved.n === 5, saved);
    await A.reload(); await wait(500); await onlineTab(A);
    const card = await A.$eval('.party-card', e => e.innerText).catch(() => '');
    check('after a restart the Online page offers Rejoin', /Rejoin/.test(card) && /Ann/.test(card) && /Pong/.test(card), card);
    await A.click('#opRejoin'); await A.waitForSelector('.code-ch', { timeout: 8000 }); await wait(900);
    const on = await A.$$eval('#lobbyCard .pick-chips .chip.is-on', els => els.map(e => e.textContent));
    check('Rejoin reopens a room with the same games and rounds', on.includes('Pong') && on.includes('Air Hockey') && on.includes('5'), on);
    await A.evaluate(() => document.getElementById('backBtn').click()); await wait(500); await onlineTab(A);
    check('leaving the room does not delete the party', (await A.$('.party-card')) !== null);
    await A.click('#opForget'); await wait(300);
    check('Forget removes it', (await A.$('.party-card')) === null && (await A.evaluate(() => JSON.parse(localStorage.getItem('ludus.v1')).party)) === null);
    check('no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
    br.close();
  },
  async compat(browser) {
    // the old pages (Ludus 1.6.0) still have the per-game Online button
    const oldOpen = async (p, id) => { await p.evaluate(i => ludusOpenGame(i), id); await p.waitForTimeout(500); await p.click('#vsToggle [data-vs="online"]'); await p.waitForSelector('#lobbySheet:not([hidden])'); };
    const oldCreate = async (p, id) => { await oldOpen(p, id); await p.click('text=Create room'); await p.waitForSelector('.code-ch', { timeout: 8000 }); return code(p); };
    const oldJoin = async (p, id, c) => { await oldOpen(p, id); await p.click('#lobbyCard >> text=Join room'); await p.fill('.code-input', c); await p.click('#lobbyCard button:text-is("Join")'); };
    const started = p => p.waitForFunction(() => { const o = window.ludusOnline && window.ludusOnline(); return o && o.started && o.session && o.session.active; }, null, { timeout: 12000 });
    const probe = async (X, Y, label) => {
      for (const P of [X, Y]) await P.evaluate(() => { window.__g = []; window.ludusOnline().session.active.on('cx', d => window.__g.push(d)); });
      await X.evaluate(() => window.ludusOnline().session.active.send('cx', 'x2y')); await Y.evaluate(() => window.ludusOnline().session.active.send('cx', 'y2x'));
      await wait(900);
      const [gx, gy] = [await X.evaluate(() => window.__g), await Y.evaluate(() => window.__g)];
      check(label + ': game messages arrive both ways', JSON.stringify(gx) === '["y2x"]' && JSON.stringify(gy) === '["x2y"]', [gx, gy]);
    };
    const seatsOn = (p, n) => p.waitForFunction(k => document.querySelectorAll('.seat.on').length >= k, n, { timeout: 9000 });
    // 1) old host, new guest joins from the Online section with only the code
    { const br = await broker.start(); const O = await newPage(browser, br, { name: 'Old', old: true }), N = await newPage(browser, br, { name: 'New' });
      const c = await oldCreate(O, 'fourup'); await onlineTab(N); await N.fill('#opCode', c); await N.click('#opJoin'); await seatsn(N);
      function seatsn(p) { return seatsOn(p, 2); }
      check('old host + new guest (Online section): guest lands in the host\'s game', /Connect Four/.test(await N.$eval('#gameName', e => e.textContent)), await N.$eval('#gameName', e => e.textContent));
      await O.click('#lobbyCard button.primary'); await Promise.all([started(O), started(N)]);
      await probe(O, N, 'old host + new guest');
      check('...no page errors', errs([O, N]) === 0, [O.errors, N.errors]); br.close(); }
    // 2) new host (Online section), old guest joins from the same game
    { const br = await broker.start(); const N = await newPage(browser, br, { name: 'New' }), O = await newPage(browser, br, { name: 'Old', old: true });
      const c = await flexCreate(N); await pick(N, ['Connect Four'], 1);
      await oldJoin(O, 'fourup', c); await seatsOn(N, 2); await wait(500);
      const t = await lobbyText(N);
      check('new host + old guest: pickers hidden, friendly note', (await N.$$('#lobbyCard .pick-chips')).length === 0 && /older Ludus/.test(t), t);
      await N.click('#lobbyCard button.primary'); await Promise.all([started(O), started(N)]);
      await probe(N, O, 'new host + old guest');
      check('...no page errors', errs([O, N]) === 0, [O.errors, N.errors]); br.close(); }
    // 3) new host with several games picked, old guest joins from Pong: the room becomes a Pong room
    { const br = await broker.start(); const N = await newPage(browser, br, { name: 'New' }), O = await newPage(browser, br, { name: 'Old', old: true });
      const c = await flexCreate(N); await pick(N, ['Connect Four', 'Pong'], 3);
      await oldJoin(O, 'pong', c); await seatsOn(N, 2); await wait(500);
      const t = await lobbyText(N);
      check('old guest naming another game: room drops to Pong only', (await N.$$('#lobbyCard .pick-chips')).length === 0 && /Pong only/.test(t), t);
      await N.click('#lobbyCard button.primary'); await Promise.all([started(O), started(N)]);
      check('...Pong runs on both', /Pong/.test(await N.$eval('#gameName', e => e.textContent)) && /Pong/.test(await O.$eval('#gameName', e => e.textContent)));
      await probe(N, O, 'Online-section host + old guest'); br.close(); }
    // 4) an old guest cannot join a running tournament; the host is told to say "update"
    { const br = await broker.start(); const [A, B] = [await newPage(browser, br, { name: 'Ann' }), await newPage(browser, br, { name: 'Bo' })];
      const c = await flexCreate(A); await flexJoin(B, c); await pick(A, ['Pong', 'Air Hockey'], 3); await A.click('#lobbyCard button.primary');
      await Promise.all([waitPlaying(A), waitPlaying(B)]);
      const O = await newPage(browser, br, { name: 'Old', old: true });
      await oldJoin(O, 'pong', c); await wait(300);
      const tt = await A.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
      check('old guest in a running tournament: usual "already started"', /begun/.test(await O.evaluate(() => document.body.innerText)));
      check('host is told the friend needs to update', /update Ludus/.test(tt), tt); br.close(); }
    // 5) new, new: three players, any game
    { const br = await broker.start(); const { pages } = await party(browser, br, 'Tag', 3);
      check('new + new (3 players) start the game', pages.length === 3 && errs(pages) === 0, pages.map(p => p.errors)); br.close(); }
  },
  async futurehost(browser) {
    const br = await broker.start(); const N = await newPage(browser, br, { name: 'New' });
    br.filter = (topic, payload) => { try { const m = JSON.parse(payload); if (m.t === 'join') { const out = { t: 'welcome', to: m.c, s: 1, p: [[0, 'Host', 'h0'], [1, 'You', m.c]], mx: 2, mn: 2, g: 'fourup', pv: 9, mp: 9, v: 1, c: 'h0' }; br.conns.forEach(o => { if (o.subs.has(topic)) o.send(br.rawFrame(topic, JSON.stringify(out))); }); } } catch (e) {} };
    await onlineTab(N); await N.fill('#opCode', 'ABCDE'); await N.click('#opJoin');
    await waitCard(N, 'update Ludus', 10000);
    check('a host from a newer Ludus: "Your friend needs to update Ludus"', /needs to update Ludus/.test(await lobbyText(N)), await lobbyText(N));
    br.close();
  },
};

// ---- real-time games under a slow relay (150-300 ms one way with jitter) ----
const GAMES = {
  pong:   { name: 'Pong', own: 'ArrowDown', other: 'w', mine: '() => [0, ludusDebug.pongNet().p2]', host: '() => [0, ludusDebug.pongNet().p2]', seen: '() => [0, ludusDebug.pongNet().p1]', tol: 10 },
  hockey: { name: 'Air Hockey', own: 'a', other: 'd', mine: '() => { const m = ludusDebug.hockey().m2; return [m.x, m.y]; }', host: '() => { const m = ludusDebug.hockey().m2; return [m.x, m.y]; }', seen: '() => { const m = ludusDebug.hockey().m1; return [m.x, m.y]; }', tol: 14 },
  tag:    { name: 'Tag', own: 'ArrowRight', other: 'd', start: 'enter', mine: "() => { const p = ludusDebug.tagMe(); return [p.x, p.y]; }", host: "() => { const p = ludusDebug.tagMe('p2'); return [p.x, p.y]; }", seen: "() => { const p = ludusDebug.tagMe('p1'); return [p.x, p.y]; }", tol: 20 },
  holeio: { name: 'Hole.io', own: 'd', other: 'd', start: 'wait', mine: "() => { const p = ludusDebug.holeMe(); return [p.x, p.y]; }", host: "() => { const p = ludusDebug.holeMe(2); return [p.x, p.y]; }", seen: "() => { const p = ludusDebug.holeMe(1); return [p.x, p.y]; }", tol: 30 },
};
async function lagGame(browser, id) {
  const G = GAMES[id], br = await broker.start();
  const { pages: [A, B] } = await party(browser, br, G.name, 2);
  if (G.start === 'enter') { await A.keyboard.press('Enter'); await wait(3200); } else if (G.start === 'wait') await wait(5000); else await wait(800);
  br.latency = { base: 150, jitter: 150 };
  // 1) the guest's own thing answers on the next frame
  await B.evaluate(src => { window.__p = eval(src); window.__s = []; window.__kd = null; addEventListener('keydown', () => { if (window.__kd === null) window.__kd = performance.now(); }, true); (function f() { window.__s.push({ t: performance.now(), p: window.__p() }); if (window.__s.length > 800) window.__s.shift(); requestAnimationFrame(f); })(); }, G.mine);
  await wait(300);
  await B.keyboard.down(G.own); await wait(180);
  const r = await B.evaluate(() => { const kd = window.__kd, p0 = window.__s.filter(s => s.t < kd).pop(); const hit = window.__s.find(s => s.t >= kd && Math.hypot(s.p[0] - p0.p[0], s.p[1] - p0.p[1]) > 0.4); return { ms: hit ? hit.t - kd : null }; });
  check(G.name + ': guest\'s own thing moves within 60 ms of the key (relay 150-300 ms)', r.ms !== null && r.ms < 60, r);
  await wait(700); await B.keyboard.up(G.own); await wait(3000);
  const [mine, theirs] = [await B.evaluate(() => window.__p()), await A.evaluate(src => eval(src)(), G.host)];
  check(G.name + ': guest and host agree on the guest\'s thing', Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]) < G.tol, { mine, theirs });
  // 2) the host's thing, seen on the guest: many different frames, no jumps
  await B.evaluate(src => { window.__w = eval(src); window.__ws = []; (function f() { window.__ws.push(window.__w()); requestAnimationFrame(f); })(); }, G.seen);
  await wait(300); await B.evaluate(() => { window.__ws = []; });
  await hold(A, G.other, 900); await wait(300);
  const ws = await B.evaluate(() => window.__ws), sum = p => p[0] + p[1];
  const distinct = new Set(ws.map(p => Math.round(sum(p) * 10))).size, span = Math.abs(sum(ws[ws.length - 1]) - sum(ws[0]));
  const js = []; for (let i = 1; i < ws.length; i++) js.push(Math.abs(sum(ws[i]) - sum(ws[i - 1]))); js.sort((a, b) => b - a); const jump = js[1] || 0;   // the biggest one may be a real reset (a goal, a respawn)
  check(G.name + ': guest sees the host moving on many frames (' + distinct + ' positions, ' + ws.length + ' frames)', distinct > 12 && span > 8, { distinct, frames: ws.length, span });
  check(G.name + ': no jumps between frames (apart from a game reset)', jump < Math.max(40, span * 0.5), { jump, span });
  check(G.name + ': no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
  br.close();
}
S.lag = async browser => { for (const id of Object.keys(GAMES)) await lagGame(browser, id); };
for (const id of Object.keys(GAMES)) S['lag_' + id] = b => lagGame(b, id);
S.watch = S.lag;

// ---- layout: Online page, room, scoreboard and in-game buttons at several sizes; no overlap, no squashed text ----
const overlap = page => page.evaluate(() => {
  const out = [];
  ['#lobbyCard', '.game-bar', '#overSheet', '.online-page', '.topbar'].forEach(sel => {
    const root = document.querySelector(sel); if (!root || !root.getClientRects().length) return;
    const els = [...root.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
    for (let i = 0; i < els.length; i++) {
      const a = els[i].getBoundingClientRect();
      if (els[i].scrollWidth > els[i].clientWidth + 1 && getComputedStyle(els[i]).textOverflow !== 'ellipsis' && getComputedStyle(els[i]).overflow !== 'visible') out.push('clipped:' + els[i].textContent.slice(0, 20));
      if (a.right > innerWidth + 1 || a.left < -1) out.push('offscreen:' + els[i].textContent.slice(0, 20));
      for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const b = els[j].getBoundingClientRect(), ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 1 && iy > 2) out.push(els[i].textContent.slice(0, 14) + ' x ' + els[j].textContent.slice(0, 14));
      }
    }
  });
  return out;
});
S.layout = async browser => {
  const sizes = { compact: { width: 400, height: 600 }, large: { width: 520, height: 740 }, wide: { width: 760, height: 500 } };
  for (const [sn, size] of Object.entries(sizes)) for (const dark of [false, true]) {
    const tag = sn + (dark ? '_dark' : '_light'), br = await broker.start();
    const A = await newPage(browser, br, { name: 'Alexandria', size, dark }), B = await newPage(browser, br, { name: 'Bartholome', size, dark });
    await onlineTab(A); await shot(A, 'online_page_' + tag);
    check(tag + ' Online page: no overlap', (await overlap(A)).length === 0, await overlap(A));
    const c = await flexCreate(A); await flexJoin(B, c); await pick(A, ['Pong', 'Air Hockey', 'Connect Four'], 3); await wait(500);
    await shot(A, 'room_host_' + tag); await shot(B, 'room_guest_' + tag);
    check(tag + ' room (host, guest): no overlap', (await overlap(A)).length === 0 && (await overlap(B)).length === 0, [await overlap(A), await overlap(B)]);
    await A.click('#lobbyCard button.primary'); await Promise.all([waitPlaying(A), waitPlaying(B)]); await wait(400);
    check(tag + ' in game (header with Leave): no overlap', (await overlap(A)).length === 0 && (await overlap(B)).length === 0, [await overlap(A), await overlap(B)]);
    await shot(B, 'game_guest_' + tag);
    await playRound([A, B], 0); await Promise.all([waitCard(A, 'Wins so far'), waitCard(B, 'Wins so far')]);
    await shot(A, 'board_host_' + tag); await shot(B, 'board_guest_' + tag);
    check(tag + ' scoreboard: no overlap', (await overlap(A)).length === 0 && (await overlap(B)).length === 0, [await overlap(A), await overlap(B)]);
    check(tag + ': no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
    // a plain game: rematch bar
    const br2 = await broker.start(); const { pages: [C, D] } = await party(browser, br2, 'Pong', 2, { size, dark });
    await Promise.all([C, D].map((p, k) => p.evaluate(w => ludusForceOver(w), k === 0)));
    await C.waitForSelector('#overSheet:not([hidden])', { timeout: 8000 }); await D.waitForSelector('#overSheet:not([hidden])', { timeout: 8000 });
    await shot(C, 'overbar_host_' + tag); await shot(D, 'overbar_guest_' + tag);
    check(tag + ' result bar (Rematch / Ask for rematch): no overlap', (await overlap(C)).length === 0 && (await overlap(D)).length === 0, [await overlap(C), await overlap(D)]);
    br.close(); br2.close();
  }
};

(async () => {
  const only = process.argv.slice(2), browser = await L.launch();
  for (const [name, fn] of Object.entries(S)) {
    if (name.startsWith('lag_') || name === 'watch') { if (!only.includes(name)) continue; }
    else if (only.length && !only.includes(name)) continue;
    console.log('--- ' + name);
    try { await fn(browser); } catch (e) { check(name + ' ran to the end', false, String(e.stack || e).slice(0, 500)); }
  }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
