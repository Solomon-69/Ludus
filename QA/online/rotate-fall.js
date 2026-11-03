// Turn Room falls as fast as the original Rotate: turn the room, time the drop, check it lands and nothing errors.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      const A = await newPage(browser, null, { size: { width: 430, height: 780 }, dark });
      await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('rotate'); }); await wait(900);
      await A.evaluate(() => window.ludusDebug.rotateLoad(1)); await wait(600);
      const samples = await A.evaluate(async () => {
        const d = window.ludusDebug, out = []; d.rotateAct('cw'); const t0 = performance.now();
        while (performance.now() - t0 < 2500) { const r = d.rotate(); out.push({ t: Math.round(performance.now() - t0), fx: r.fx, fy: r.fy, busy: r.busy, k: r.k }); await new Promise(r => setTimeout(r, 30)); }
        return out;
      });
      const moving = samples.filter((s, i) => i && (s.fx !== samples[i - 1].fx || s.fy !== samples[i - 1].fy));
      const first = moving[0], last = moving[moving.length - 1];
      const cells = Math.abs(last.fx - samples[0].fx) + Math.abs(last.fy - samples[0].fy);
      const dur = last.t - first.t;
      check(t + ': turn then drop settles in time (' + cells.toFixed(1) + ' cells in ' + dur + ' ms, turn+fall done by ' + last.t + ' ms)', cells > 0 && last.t < 1500 && !samples[samples.length - 1].busy, { first, last });
      await L.shot(A, 'rotate-fall-' + t);
      check(t + ': no console errors', errs([A]) === 0, A.errors);
      await A.context().close();
    }
  } catch (e) { check('rotate fall test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
