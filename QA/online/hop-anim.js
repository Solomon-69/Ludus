// Opening animation (1.12.36): nothing grows. node hop-anim.js [--dir <web dir>] [--strip <out dir>]
// Samples the computed transform of the game view and the Welcome back card every frame while a game opens; the scale must stay 1 (old build: 0.985 / 0.94).
// With --strip: a screenshot about every 60 ms while Sky Hop opens (the filmstrip).
const L = require('./lib.js'), fs = require('fs'), path = require('path');
const { wait, check, newPage, errs } = L;
const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; }, DIR = opt('--dir'), STRIP = opt('--strip');
const SAMPLE = () => new Promise(res => {
  const out = { game: [], card: [], t0: performance.now() }, sc = el => { if (!el) return 1; const m = getComputedStyle(el).transform; if (!m || m === 'none') return 1; const v = m.match(/matrix\(([^)]+)\)/); return v ? Math.hypot(+v[1].split(',')[0], +v[1].split(',')[1]) : 1; };
  const f = () => { const g = document.getElementById('game'), c = document.querySelector('#pauseSheet .sheet-card'); out.game.push(sc(g)); out.card.push(sc(c)); if (performance.now() - out.t0 < 700) requestAnimationFrame(f); else res(out); };
  requestAnimationFrame(f);
});
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      const A = await newPage(browser, null, { size: { width: 430, height: 780 }, dark, dir: DIR });
      await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.reduceMotion = false; document.documentElement.classList.remove('reduce'); Ludus.state.saves = {}; window.ludusOpenGame('sparkhop'); }); await wait(600);
      await A.keyboard.press('ArrowLeft'); await wait(1500);
      await A.evaluate(() => document.getElementById('backBtn').click()); await wait(700);
      const done = A.evaluate(SAMPLE);
      if (STRIP && !dark) {
        fs.mkdirSync(STRIP, { recursive: true });
        await A.evaluate(() => window.ludusOpenGame('sparkhop'));
        for (let i = 0; i < 9; i++) { await A.screenshot({ path: path.join(STRIP, `strip-${String(i).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 430, height: 780 } }); await wait(40); }
      } else await A.evaluate(() => window.ludusOpenGame('sparkhop'));
      const r = await done;
      const dev = x => Math.max(...x.map(v => Math.abs(v - 1)));
      check(t + ': game view never scales while opening (max change ' + dev(r.game).toFixed(3) + ')', dev(r.game) < 0.001, dev(r.game));
      check(t + ': Welcome back card never scales (max change ' + dev(r.card).toFixed(3) + ')', dev(r.card) < 0.001, dev(r.card));
      await A.context().close();
    }
  } catch (e) { check('animation test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
