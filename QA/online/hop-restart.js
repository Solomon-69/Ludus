// Sky Hop (Doodle Jump) Restart from "Welcome back" (1.12.36), no internet: node hop-restart.js [--dir <web dir>]
// After Restart the board stands still (score 0, nothing moving, "Move to start" showing) while the mode picker is up, even if the mouse moves; a key press starts it.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
const a = process.argv.slice(2), di = a.indexOf('--dir'), DIR = di >= 0 ? a[di + 1] : undefined;
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      const A = await newPage(browser, null, { size: { width: 430, height: 780 }, dark, dir: DIR });
      await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('sparkhop'); }); await wait(700);
      await A.keyboard.down('ArrowRight'); await wait(2500); await A.keyboard.up('ArrowRight');
      const sc1 = +(await A.$eval('#scoreNow', e => e.textContent));
      await A.evaluate(() => document.getElementById('backBtn').click()); await wait(400);
      await A.evaluate(() => window.ludusOpenGame('sparkhop')); await wait(800);
      check(t + ': Welcome back card shows after a played run (score ' + sc1 + ')', await A.$eval('#pauseSheet', e => !e.hidden && e.classList.contains('welcome')) && sc1 > 0);
      await L.shot(A, 'hop-1-welcome-' + t);
      await A.click('#restartBtn'); await wait(300);
      await L.shot(A, 'hop-2-picker-' + t);
      // the mouse wanders over the board (no click): nothing may start
      const box = await A.$eval('#stage canvas', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      for (let i = 0; i < 12; i++) { await A.mouse.move(box.x + 40 + i * 20, box.y + box.h * 0.6 + (i % 2) * 30); await wait(40); }
      const s0 = await A.evaluate(() => ({ score: document.getElementById('scoreNow').textContent, hint: (document.getElementById('waitHint') || {}).textContent || '', over: !document.getElementById('overSheet').hidden }));
      await wait(1200);
      const s1 = await A.evaluate(() => ({ score: document.getElementById('scoreNow').textContent, hint: (document.getElementById('waitHint') || {}).textContent || '' }));
      check(t + ': after Restart nothing runs behind the picker (score ' + s0.score + ' -> ' + s1.score + ')', +s0.score <= 3 && s1.score === s0.score, [s0, s1]);
      await L.shot(A, 'hop-3-still-' + t);
      // choose Classic: still waits
      const cw = await A.evaluate(() => { const c = document.querySelector('#stage canvas').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width }; });
      await A.mouse.click(cw.x + cw.w / 2 - 55, cw.y + 44 + 18 * (cw.w / 400)); await wait(300);
      const s2 = await A.$eval('#scoreNow', e => e.textContent); await wait(800);
      check(t + ': picking a mode does not start the run', +s2 <= 3 && (await A.$eval('#scoreNow', e => e.textContent)) === s2);
      await L.shot(A, 'hop-4-classic-' + t);
      await A.keyboard.press('ArrowLeft'); await wait(1500);
      check(t + ': a key press starts the run', +(await A.$eval('#scoreNow', e => e.textContent)) > 0);
      await L.shot(A, 'hop-5-running-' + t);
      check(t + ': no console errors', errs([A]) === 0, A.errors);
      await A.context().close();
    }
  } catch (e) { check('hop restart test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
