// Ludus always opens on All games (1.12.28). node openall.js
// lobby:  a party waiting in its room: every open/close shows All at the top, the party stays joined (the friend still sees
//         both seats) and Rejoin on the Last party card goes straight back to the same room, no second join
// round:  a round being played: every open/close stays in the round
// start:  the host starts while a guest is behind All games: the guest goes into the round
// none:   no party: every open shows All at the top
// light and dark, screenshots in shots/openall-*.png
const L = require('./lib.js');
const { check, wait } = L;
const state = p => p.evaluate(() => {
  const act = ['home', 'game', 'settings'].find(v => document.getElementById(v).classList.contains('is-active'));
  const o = window.ludusOnline && window.ludusOnline(), s = o && (o.session || Ludus.lobby.session);
  const chip = document.querySelector('#filters .chip.is-on .chip-lab, #filters .chip[aria-pressed="true"] .chip-lab');
  return { view: act, filter: Ludus.state.filter, chip: chip ? chip.textContent : '', sheet: !document.getElementById('lobbySheet').hidden,
    alive: !!(s && !s.over), started: !!(o && o.started), code: s ? s.code : '', n: s && s.count ? s.count() : 0, parked: window.ludusParked(), top: (document.getElementById('grid') || {}).scrollTop || 0 };
});
const cycle = async (p, times) => { const out = []; for (let i = 0; i < times; i++) { await p.evaluate(() => window.ludusClosed()); await wait(120); await p.evaluate(() => window.ludusOpened()); await wait(250); out.push(await state(p)); } return out; };
const onAll = s => s.view === 'home' && s.filter === 'All' && !s.sheet && s.top === 0;

(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  for (const dark of [false, true]) {
    const t = dark ? 'dark' : 'light';
    // --- lobby
    const A = await L.newPage(browser, br, { name: 'Ann', dark }), B = await L.newPage(browser, br, { name: 'Bo', dark });
    const c = await L.flexCreate(A); await L.flexJoin(B, c);
    await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
    const ra = await cycle(A, 6);
    check(t + ' lobby: host opens on All every time', ra.every(onAll), ra);
    check(t + ' lobby: host stays in the party', ra.every(s => s.alive && s.code === c && s.n === 2 && s.parked), ra);
    const rb = await cycle(B, 6);
    check(t + ' lobby: guest opens on All every time', rb.every(onAll), rb);
    check(t + ' lobby: guest stays in the party', rb.every(s => s.alive && s.code === c && s.n === 2), rb);
    await L.shot(A, 'openall-' + t + '-home');
    // opened without the close first (the app can call open twice)
    await A.evaluate(() => window.ludusOpened()); await wait(200);
    check(t + ' lobby: open twice still All', onAll(await state(A)));
    // right-click open goes to Settings, party kept
    await A.evaluate(() => window.ludusClosed()); await A.evaluate(() => window.ludusOpenedSettings()); await wait(250);
    const st = await state(A);
    check(t + ' lobby: settings open keeps party', st.view === 'settings' && st.alive && !st.sheet, st);
    await A.evaluate(() => window.ludusClosed()); await A.evaluate(() => window.ludusOpened()); await wait(250);
    // Rejoin brings back the same room
    await L.onlineTab(A); await A.click('#opRejoin'); await wait(500);
    const rj = await state(A);
    check(t + ' lobby: Rejoin shows the same room at once', rj.view === 'game' && rj.sheet && rj.code === c && rj.n === 2 && !rj.parked, rj);
    check(t + ' lobby: friend still sees 2 seats', (await B.$$eval('.seat.on', e => e.length).catch(() => 0)) === 2 || (await state(B)).n === 2);
    await L.shot(A, 'openall-' + t + '-rejoin');
    // --- start while the guest is behind All
    const H = (await A.evaluate(() => { const o = window.ludusOnline(); const s = o && (o.session || Ludus.lobby.session); return s && s.role; })) === 'host' ? A : B;
    if (H === B) { await L.onlineTab(B).catch(() => {}); await B.click('#opRejoin'); await wait(400); }
    await L.pick(H, [await H.$eval('#lobbyCard .pick-chips .chip', e => e.textContent)], 1);
    if (H === B) await A.evaluate(() => { window.ludusClosed(); window.ludusOpened(); }); else await B.evaluate(() => { window.ludusClosed(); window.ludusOpened(); });
    await wait(200);
    await H.click('#lobbyCard button.primary');
    let started = true; try { await Promise.all([A, B].map(L.waitPlaying)); } catch (e) { started = false; }
    check(t + ' start: parked guest goes into the round', started, [await state(A), await state(B)]);
    // --- round running
    const rr = await cycle(B, 5), rh = await cycle(A, 5);
    check(t + ' round: guest stays in the round', rr.every(s => s.view === 'game' && s.started && !s.parked), rr);
    check(t + ' round: host stays in the round', rh.every(s => s.view === 'game' && s.started), rh);
    await L.shot(B, 'openall-' + t + '-round');
    // --- no party
    const C = await L.newPage(browser, br, { name: 'Cy', dark });
    await L.onlineTab(C);
    const rc = await cycle(C, 5);
    check(t + ' none: opens on All every time', rc.every(onAll), rc);
    check(t + ' no page errors', L.errs([A, B, C]) === 0, [A, B, C].map(p => p.errors));
    for (const p of [A, B, C]) await p.context().close();
  }
  await browser.close(); br.stop && br.stop();
  const ok = L.results.every(Boolean);
  console.log(ok ? 'ALL PASS (' + L.results.length + ')' : 'FAILED ' + L.results.filter(x => !x).length + '/' + L.results.length);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
