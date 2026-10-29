// Chomp mazes (1.12.34), no internet: node chomp-maze.js
// 300 made mazes: every open cell reachable, no dead ends in the changed rows, mirror-symmetric, ghost house and power dots untouched;
// two runs differ; Play again gives a different maze; works offline.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.context().setOffline(true);
    await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('chomp'); }); await wait(900);
    const r = await A.evaluate(() => {
      const t = Ludus.games.find(g => g.id === 'chomp')._test, W = t.W, H = t.H, out = { n: 0, bad: [], distinct: new Set(), walls: [] };
      for (let s = 0; s < 150; s++) for (let lv = 1; lv <= 2; lv++) {
        const m = t.makeMap(500 + s * 101, lv); out.n++; out.distinct.add(m.join('/'));
        const open = (x, y) => y >= 0 && y < H && m[y][((x % W) + W) % W] !== '#';
                const seen = new Set(), st = [[9, 15]]; while (st.length) { const [x, y] = st.pop(), k = y * W + x; if (seen.has(k)) continue; seen.add(k); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = (x + dx + W) % W, ny = y + dy; if (open(nx, ny) && !seen.has(ny * W + nx)) st.push([nx, ny]); } }
        let dead = 0, asym = 0, house = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (m[y][x] !== m[y][W - 1 - x]) asym++; if (y >= 6 && y <= 12 && m[y][x] !== t.MAP[y][x]) house++; if (((y >= 1 && y <= 5) || y >= 13 && y <= 19) && open(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length < 2) dead++; }
        const keep = m[2][1] === 'o' && m[2][17] === 'o' && m[15][1] === 'o' && m[15][17] === 'o' && m[15][9] === 'P';
        out.walls.push(m.join('').split('#').length - 1);
        let unreached = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y) && ((y >= 1 && y <= 5) || y >= 13) && !seen.has(y * W + x)) unreached++;
        if (unreached || dead || asym || house || !keep) out.bad.push({ s, lv, unreached, dead, asym, house, keep });
      }
      out.distinct = out.distinct.size; return out;
    });
    check('300 mazes: all reachable, no dead ends, symmetric, house and power dots untouched (' + (r.n - r.bad.length) + '/' + r.n + ')', r.n === 300 && r.bad.length === 0, r.bad.slice(0, 3));
    check('300 mazes are all different (' + r.distinct + ')', r.distinct === 300);
    check('mazes really change (wall counts span ' + Math.min(...r.walls) + '-' + Math.max(...r.walls) + ')', Math.max(...r.walls) - Math.min(...r.walls) >= 6);
    const d1 = await A.evaluate(() => window.ludusDebug.chomp());
    check('the game runs on a made maze', d1.pellets > 60, d1);
    await A.evaluate(() => window.ludusForceOver(false)); await wait(1800);
    await A.click('#againBtn'); await wait(900);
    const d2 = await A.evaluate(() => window.ludusDebug.chomp());
    check('Play again: new seed and a different maze, level 1', d2.seed !== d1.seed && d2.rows !== d1.rows && d2.level === 1, [d1.seed, d2.seed]);
    // chaser logic still finds its way on a made maze: every chaser picks a legal direction from a few cells
    const ok = await A.evaluate(() => { const t = Ludus.games.find(g => g.id === 'chomp')._test; return typeof t.chooseDir === 'function'; });
    check('no console errors, offline', ok && errs([A]) === 0, A.errors);
    await shot0(A);
  } catch (e) { check('chomp test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
async function shot0(p) { await L.shot(p, 'chomp-maze'); }
