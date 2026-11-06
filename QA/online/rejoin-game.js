// Coming back to a party during a game: straight into the same game, same position, and both players can move. node rejoin-game.js [chess|moves|setup|smoke]
const L = require('./lib.js'); const { check, wait } = L;
const what = process.argv[2] || 'all';
const FEN = 'r2qk2r/p2npbbp/1p4Q1/1B1p1p2/P2pnB1P/8/1PP3P1/R3K1NR b KQkq - 0 1';
const dbg = p => p.evaluate(() => window.ludusDebug.chess && window.ludusDebug.chess());
const mv = (p, u) => p.evaluate(x => window.ludusDebug.chessMove(x), u);
const inGame = p => p.evaluate(() => { const o = window.ludusOnline && window.ludusOnline(); return { game: !!document.querySelector('#stage canvas, #game canvas'), lobby: !document.getElementById('lobbySheet').hidden, ready: !!(o && o.session && o.session.ready), started: !!(o && o.session && o.session.started), wait: !!(o && o.session && o.session.waitRound), id: o && o.session && o.session.gameId }; });
async function party(browser, br, games) {
  const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
  const c = await L.flexCreate(A); await L.flexJoin(B, c);
  await L.pick(A, games, 1);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await wait(700);
  return { A, B };
}
async function backIn(B) { await B.reload(); await wait(400); await B.waitForFunction(() => { const o = window.ludusOnline && window.ludusOnline(); return o && o.session && o.session.ready && o.session.started; }, null, { timeout: 20000 }); await wait(1500); }
async function chess(browser, br) {
  const { A, B } = await party(browser, br, ['Chess']);
  const a0 = await dbg(A), W = a0.my === 1 ? A : B, K = a0.my === 1 ? B : A;
  for (const [p, u] of [[W, 'e2e4'], [K, 'e7e5'], [W, 'g1f3']]) { await mv(p, u); await wait(700); }
  const before = await dbg(A);
  await backIn(B);
  const b = await dbg(B), s = await inGame(B);
  check('chess: guest is back in the game, not the lobby', s.started && !s.lobby && !s.wait, JSON.stringify(s));
  check('chess: same position', b && b.fen === before.fen, JSON.stringify([b && b.fen, before.fen]));
  check('chess: same colour', b && (await dbg(A)).my === -b.my);
  await mv(K, 'b8c6'); await wait(900); await mv(W, 'f1c4'); await wait(900);
  const x = await dbg(A), y = await dbg(B);
  check('chess: both moved after the rejoin', x.plies.length === 5 && x.fen === y.fen, JSON.stringify([x.plies, y.plies]));
  await A.context().close(); await B.context().close();
}
async function lobbyBack(browser, br) {
  const { A, B } = await party(browser, br, ['Chess']);
  const a0 = await dbg(A), W = a0.my === 1 ? A : B, K = a0.my === 1 ? B : A;
  await mv(W, 'd2d4'); await wait(700); await mv(K, 'd7d5'); await wait(700);
  const fen = (await dbg(A)).fen;
  await B.addInitScript(() => { window.ludusDebug = window.ludusDebug || {}; window.ludusDebug.stayInLobby = true; });
  await B.reload(); await wait(400);
  const shown = await B.waitForSelector('#lobbyBack', { timeout: 20000 }).then(() => true, () => false);
  check('lobby: shows the way back while the game runs', shown);
  check('lobby: it names the game', /Back to Chess/.test(await B.textContent('#lobbyBack').catch(() => '')));
  await L.shot(B, 'lobby-back-light');
  await B.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset.theme = 'dark'; }); await wait(200); await L.shot(B, 'lobby-back-dark');
  await B.click('#lobbyBack'); await wait(2000);
  const b = await dbg(B), s = await inGame(B);
  check('lobby: the button goes straight to the same position', b && b.fen === fen && !s.lobby, JSON.stringify([b && b.fen, fen, s]));
  await mv(W, 'c2c4'); await wait(900); await mv(K, 'e7e6'); await wait(900);
  const x = await dbg(A), y = await dbg(B);
  check('lobby: both move afterwards', x.plies.length === 4 && x.fen === y.fen, JSON.stringify([x.plies, y.plies]));
  await A.context().close(); await B.context().close();
  const C = await L.newPage(browser, br, { name: 'Ann' }), D = await L.newPage(browser, br, { name: 'Bo' });
  const c = await L.flexCreate(C); await L.flexJoin(D, c); await wait(800);
  check('lobby: hidden when no game is running', !(await C.$('#lobbyBack')) && !(await D.$('#lobbyBack')));
  await C.context().close(); await D.context().close();
}
async function setup(browser, br) {
  const A = await L.newPage(browser, br, { name: 'Solomon' }), B = await L.newPage(browser, br, { name: 'Friend' });
  await A.evaluate(() => window.ludusCarryOnChess('W7KQB')); await wait(2500);
  await B.evaluate(() => window.ludusJoin('W7KQB')); await Promise.all([A, B].map(L.waitPlaying)); await wait(900);
  const a = await dbg(A), b = await dbg(B);
  check('carry on: position exact on both', a.fen.split(' ').slice(0, 4).join(' ') === FEN.split(' ').slice(0, 4).join(' ') && a.fen === b.fen, JSON.stringify([a.fen, b.fen]));
  check('carry on: host White, friend Black, Black to move', a.my === 1 && b.my === -1 && a.side === -1);
  await L.shot(A, 'carry-host'); await L.shot(B, 'carry-friend');
  await mv(B, 'f7g6'); await wait(900); await mv(A, 'b5d7'); await wait(900);
  const x = await dbg(A), y = await dbg(B);
  check('carry on: both can move', x.plies.length === 2 && x.fen === y.fen, JSON.stringify([x.plies, y.plies]));
  await backIn(B); const z = await dbg(B);
  check('carry on: rejoin keeps the position', z.fen === x.fen && z.my === -1, JSON.stringify([z.fen, x.fen]));
  await mv(B, 'd8d7'); await wait(900);
  check('carry on: move after rejoin reaches host', (await dbg(A)).plies.length === 3);
  await A.context().close(); await B.context().close();
}
const pic = p => p.evaluate(() => { const c = document.querySelector('#game canvas, #stage canvas') || document.querySelector('canvas'); const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let on = 0; const hist = {}; for (let i = 0; i < d.length; i += 4 * 97) { const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4); hist[k] = (hist[k] || 0) + 1; } return hist; });
const same = (a, b) => { let diff = 0, n = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { diff += Math.abs((a[k] || 0) - (b[k] || 0)); n += (a[k] || 0); } return diff / Math.max(1, n); };
async function replay(browser, br) {
  const name = await (async () => { const p = await L.newPage(browser, br, {}); const n = await p.evaluate(() => Ludus.games.find(g => g.id === 'fourup').name); await p.context().close(); return n; })();
  const { A, B } = await party(browser, br, [name]);
  const box = await A.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const cols = [0.5, 0.36, 0.64, 0.5];
  const before0 = await pic(B);
  for (let i = 0; i < cols.length; i++) { const p = i % 2 ? B : A; await p.mouse.click(box[0] + box[2] * cols[i], box[1] + box[3] * 0.5); await wait(1100); }
  const before = await pic(B);
  check(`${name}: moves changed the board`, same(before0, before) > 0.002, same(before0, before));
  await L.shot(B, 'four-before');
  await backIn(B); await wait(2500);
  await L.shot(B, 'four-after');
  const after = await pic(B), d = same(before, after);
  check(`${name}: board the same after rejoin (difference ${d.toFixed(4)})`, d < 0.002, d);
  await A.mouse.click(box[0] + box[2] * 0.78, box[1] + box[3] * 0.5); await wait(1200);
  await B.mouse.click(box[0] + box[2] * 0.22, box[1] + box[3] * 0.5); await wait(1200);
  const x = same(await pic(A), await pic(B));
  check(`${name}: both moved after rejoin, boards agree (difference ${x.toFixed(4)})`, same(after, await pic(B)) > 0.001, x);
  await A.context().close(); await B.context().close();
}
async function others(browser, br) {
  const p0 = await L.newPage(browser, br, {}); const list = await p0.evaluate(() => Ludus.games.filter(g => g.online && g.online.min <= 2).map(g => [g.id, g.name, !!g.online.fresh])); await p0.context().close();
  for (const [id, name] of list) {
    if (id === 'chess') continue;
    try {
      const { A, B } = await party(browser, br, [name]);
      await backIn(B); const s = await inGame(B), a = await inGame(A);
      check(`${name}: back in the round`, s.started && !s.wait && !s.lobby, JSON.stringify([s, a]));
      check(`${name}: no page errors`, L.errs([A, B]) === 0, A.errors.concat(B.errors).slice(0, 2));
      await A.context().close(); await B.context().close();
    } catch (e) { check(`${name}: ran`, false, String(e.message).slice(0, 160)); }
  }
}
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  try {
    if (what === 'all' || what === 'chess') await chess(browser, br);
    if (what === 'all' || what === 'lobby') await lobbyBack(browser, br);
    if (what === 'all' || what === 'setup') await setup(browser, br);
    if (what === 'all' || what === 'moves') await replay(browser, br);
    if (what === 'all' || what === 'smoke') await others(browser, br);
  } catch (e) { check('test ran to the end', false, String(e.stack || e).slice(0, 500)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
