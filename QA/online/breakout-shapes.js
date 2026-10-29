// Brick Break (1.12.34), no internet: node breakout-shapes.js
// Brick shapes come from the run's seed: ten shapes, mirrored, never empty; two runs differ; Play again gives new shapes; offline.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.context().setOffline(true);
    await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('breakout'); }); await wait(900);
    const r = await A.evaluate(() => {
      const R = Ludus.games.find(g => g.id === 'breakout')._rules, out = { n: 0, bad: 0, sets: new Set(), a: [], b: [] };
      for (let s = 0; s < 40; s++) { const sig = []; for (let lv = 1; lv <= 8; lv++) { const m = R.shapeMask(900 + s * 13, lv); out.n++; const sym = m.every(row => row.length === 8 && row.every((v, i) => v === row[7 - i])); if (!sym || !m.some(row => row.some(Boolean))) out.bad++; sig.push(m.map(x => x.map(v => +v).join('')).join('/')); } out.sets.add(sig.join('|')); if (s === 0) out.a = sig; if (s === 1) out.b = sig; }
      out.sets = out.sets.size; out.same = out.a.filter(x => out.b.includes(x)).length; return out;
    });
    check('320 shapes: mirrored and never empty (' + (r.n - r.bad) + '/' + r.n + ')', r.n === 320 && r.bad === 0);
    check('40 runs of 8 levels are all different sets (' + r.sets + ')', r.sets === 40);
    check('two runs share no level shape', r.same === 0, r.same);
    const d1 = await A.evaluate(() => window.ludusDebug.breakout());
    await A.evaluate(() => window.ludusForceOver(false)); await wait(1800);
    await A.click('#againBtn'); await wait(900);
    const d2 = await A.evaluate(() => window.ludusDebug.breakout());
    check('Play again: new seed, level 1, new bricks', d2.seed !== d1.seed && d2.levelNo === 1 && d2.rows !== d1.rows, [d1.seed, d2.seed]);
    check('no console errors, offline', errs([A]) === 0, A.errors);
    await L.shot(A, 'breakout-shapes');
  } catch (e) { check('breakout test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
