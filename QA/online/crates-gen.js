// Crate Push level maker (1.12.34), no internet: node crates-gen.js
// 300 made levels are solvable (the recorded solution replayed with a second, independent implementation, and a breadth-first solver on the small ones),
// two runs with different seeds share no level, the dots start blank and reset for each block, Play again after the end is level 1 with a new seed,
// and it all works with the network switched off.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], CH = 'UDLR';
function parseRows(rows) { const H = rows.length, W = Math.max(...rows.map(r => r.length)); const wall = new Set(), goal = new Set(), boxes = []; let p = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = rows[y][x] || ' ', i = y * W + x; if (c === '#') wall.add(i); if ('.*+'.includes(c)) goal.add(i); if ('$*'.includes(c)) boxes.push(i); if ('@+'.includes(c)) p = i; } return { W, H, wall, goal, boxes, p }; }
function replay(rows, sol) { const m = parseRows(rows), bx = m.boxes.slice(); let p = m.p; for (const ch of sol) { const d = CH.indexOf(ch), dl = DY[d] * m.W + DX[d], to = p + dl; if (m.wall.has(to)) return false; const bi = bx.indexOf(to); if (bi >= 0) { const nb = to + dl; if (m.wall.has(nb) || bx.includes(nb)) return false; bx[bi] = nb; } p = to; } return bx.every(b => m.goal.has(b)) && !m.boxes.every(b => m.goal.has(b)); }
function bfs(rows, cap) { const m = parseRows(rows), key = (p, b) => p + ':' + [...b].sort((x, y) => x - y).join(','); let cur = [[m.p, m.boxes]]; const seen = new Set([key(m.p, m.boxes)]); let n = 0; for (let d0 = 0; cur.length; d0++) { const nx = []; for (const [p, b] of cur) { if (b.every(x => m.goal.has(x))) return d0; for (let d = 0; d < 4; d++) { const dl = DY[d] * m.W + DX[d], to = p + dl; if (m.wall.has(to)) continue; let nb = b; const bi = b.indexOf(to); if (bi >= 0) { const q = to + dl; if (m.wall.has(q) || b.includes(q)) continue; nb = b.slice(); nb[bi] = q; } const k = key(to, nb); if (seen.has(k)) continue; if (++n > cap) return -1; seen.add(k); nx.push([to, nb]); } } cur = nx; } return -2; }
const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
(async () => {
  const browser = await L.launch();
  try {
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.context().setOffline(true);
    await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('crates'); }); await wait(700);
    // 300 levels from 12 seeds
    const lv = await A.evaluate(() => { const g = Ludus.games.find(x => x.id === 'crates'), out = []; for (let s = 0; s < 12; s++) for (let b = 0; b < 2; b++) for (let i = 0; i < g._blockLen(b) && out.length < 300; i++) { const l = g._make(1000 + s * 7919, b, i); out.push({ s, b, i, m: l.m, sol: l.sol, par: l.par }); } return out; });
    const okReplay = lv.filter(l => replay(l.m, l.sol)).length;
    check('300 made levels: recorded solution solves them all (' + okReplay + '/' + lv.length + ')', lv.length === 300 && okReplay === 300);
    const small = lv.filter(l => l.m.join('').split('').filter(c => c === '$').length <= 2);
    const bf = small.map(l => bfs(l.m, 60000)), solvedBf = bf.filter(x => x > 0).length, capped = bf.filter(x => x === -1).length;
    check('breadth-first solver: every small level solved within the cap (' + solvedBf + '/' + small.length + ', ' + capped + ' over the cap, 0 unsolvable)', bf.filter(x => x === -2).length === 0 && solvedBf + capped === small.length && solvedBf > 20, bf.filter(x => x < 0).length);
    const bigger = lv.filter(l => !small.includes(l)); const bf2 = bigger.slice(0, 60).map(l => bfs(l.m, 150000));
    check('breadth-first solver on bigger levels: none unsolvable (' + bf2.filter(x => x > 0).length + ' solved, ' + bf2.filter(x => x === -1).length + ' over the cap)', bf2.every(x => x !== -2));
    const sizes = lv.map(l => l.m.join('').split('').filter(c => '$*'.includes(c)).length);
    check('difficulty ramps up inside a block (crates 1 early, 3+ late)', Math.max(...sizes) >= 3 && sizes.slice(0, 3).every(x => x <= 2), [Math.min(...sizes), Math.max(...sizes)]);
    check('par is never above the recorded solution', lv.every(l => l.par <= l.sol.length), lv.filter(l => l.par > l.sol.length).length);
    // the ramp: over 400 seeds, crates never drop and the difficulty score (pushes + 3 * crates + floor cells / 4) never drops, level by level
    const ramp = await A.evaluate(() => {
      const g = Ludus.games.find(x => x.id === 'crates'), o = { runs: 0, boxOk: 0, dOk: 0, falls: 0, harder: 0, stairs: 0, lines: [] }, per = {};
      const carry = {}; for (let s = 0; s < 400; s++) for (let b = 0; b < 2; b++) {
        const n = g._blockLen(b); let prev = b ? carry[s] : null, bo = true, dd = true, first = null, last = null, steps = new Set();
        for (let i = 0; i < n; i++) { const l = g._make(31 + s * 104729, b, i); if (!l.sol) o.falls++; steps.add(l.boxes); const p = per[b + ':' + i] = per[b + ':' + i] || []; p.push(l.diff); if (prev) { if (l.boxes < prev.boxes) bo = false; if (l.diff < prev.diff) dd = false; } if (i === 0) first = l; last = l; prev = l; }
        carry[s] = prev;
        o.runs++; if (bo) o.boxOk++; if (dd) o.dOk++; if (last.diff >= first.diff + 40 && last.boxes >= first.boxes + (b ? 2 : 3)) o.harder++; if (steps.size >= (b ? 3 : 4)) o.stairs++;
      }
      o.lines = Object.entries(per).map(([k, v]) => k + ' D ' + Math.min(...v) + '/' + (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) + '/' + Math.max(...v));
      return o;
    });
    check('ramp over 400 seeds, across the 10 to 15 boundary too: crates never drop (' + ramp.boxOk + '/' + ramp.runs + ')', ramp.runs === 800 && ramp.boxOk === 800);
    check('ramp over 400 seeds: difficulty score never drops (' + ramp.dOk + '/' + ramp.runs + ')', ramp.dOk === 800);
    check('every block ends clearly harder (+40 score, +2/+3 crates) and climbs in steps', ramp.harder === 800 && ramp.stairs === 800, [ramp.harder, ramp.stairs]);
    check('no level fell back to a hand-made one', ramp.falls === 0, ramp.falls);
    const uniq = new Set(lv.map(l => l.m.join('/'))).size;
    check('300 levels are all different (' + uniq + ')', uniq === 300);
    // two runs share no level
    const two = await A.evaluate(() => { const g = Ludus.games.find(x => x.id === 'crates'), set = sd => { const o = []; for (let b = 0; b < 2; b++) for (let i = 0; i < g._blockLen(b); i++) o.push(g._make(sd, b, i).m.join('/')); return o; }, a = set(111), b = set(222); return { n: a.length, same: a.filter(x => b.includes(x)).length }; });
    check('two runs with different seeds: ' + two.n + ' levels each, none the same', two.n === 25 && two.same === 0, two);
    // play a real run with the keyboard
    await A.evaluate(() => { document.getElementById('backBtn').click(); Ludus.state.saves = {}; window.ludusOpenGame('crates'); }); await wait(700);   // fresh start (the long checks above idle the page)
    const dbg = () => A.evaluate(() => window.ludusDebug.crates());
    let d = await dbg();
    check('a run starts at level 1 of 10 with blank dots', d.lvl === 0 && d.n === 10 && d.solvedN === 0 && d.block === 0, d);
    const seen = new Set(), seed1 = d.seed, level1 = d.rows;
    for (let b = 0; b < 2; b++) for (let i = 0; i < (b ? 15 : 10); i++) {
      d = await dbg();
      if (d.lvl !== i || d.block !== b || d.solvedN !== i) { check(`run reaches block ${b + 1} level ${i + 1}`, false, d); break; }
      seen.add(d.rows);
      for (const c of d.sol) await A.keyboard.press(KEY[c]);
      await wait(b === 1 && i === 14 ? 900 : 1500);
      if (b === 0 && i === 9) { d = await dbg(); check('after block 1: new set of 15, dots blank again', d.block === 1 && d.n === 15 && d.lvl === 0 && d.solvedN === 0, d); }
    }
    check('a whole run of 25 different levels played with the recorded solutions', seen.size === 25, seen.size);
    await wait(1200);
    check('finished screen shows Play again', await A.$eval('#againBtn', e => e.textContent.trim() === 'Play again' && !!e.offsetParent), null);
    await A.click('#againBtn'); await wait(800);
    d = await dbg();
    check('Play again: level 1, blank dots, score 0, new seed, new levels', d.lvl === 0 && d.block === 0 && d.solvedN === 0 && d.score === 0 && d.seed !== seed1 && d.rows !== level1, d);
    // retry-this-level / undo keep the same level
    await A.keyboard.press('ArrowLeft'); await A.keyboard.press('r'); await wait(200);
    check('R replays the same level (not a new one)', (await dbg()).rows === d.rows);
    // saved game resumes the same run
    await A.keyboard.press('ArrowRight'); await wait(200);
    await A.evaluate(() => document.getElementById('backBtn').click()); await wait(300);
    await A.evaluate(() => window.ludusOpenGame('crates')); await wait(600);
    check('leaving and coming back resumes the same run and level', (await dbg()).seed === d.seed, await dbg());
    check('no console errors, offline', errs([A]) === 0, A.errors);
  } catch (e) { check('crates test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
