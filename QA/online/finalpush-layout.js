// Sword Duel layout (1.12.36): node finalpush-layout.js [--dir <web dir>]
// Tall: arena fills the height, five buttons in three zones inside the canvas, no overlap, hint short. Rotate button turns it wide (arena in the middle, walk left, spear+thrust right), choice persists, a pad press still moves the fighter.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
const a = process.argv.slice(2), di = a.indexOf('--dir'), DIR = di >= 0 ? a[di + 1] : undefined;
const inside = (p, w, h) => p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h;
const overlap = (p, q) => p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5;
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      for (const [nm, size] of [['tall', { width: 400, height: 640 }], ['tall-narrow', { width: 340, height: 560 }], ['large', { width: 520, height: 800 }]]) {
        const A = await newPage(browser, null, { size, dark, dir: DIR });
        await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; Ludus.state.orient = {}; window.ludusOpenGame('finalpush'); }); await A.waitForFunction(() => window.ludusDebug.finalpush && window.ludusDebug.botTest, null, { timeout: 8000 }); await wait(300);
        const g = await A.evaluate(() => window.ludusDebug.finalpush());
        const ok = !g.wide && g.pads.length === 5 && g.pads.every(p => inside(p, g.w, g.h)) && g.pads.every((p, i) => g.pads.every((q, j) => i === j || !overlap(p, q)));
        const ar = g.arena;
        check(t + ' ' + nm + ': five buttons inside, none overlap', ok, g.pads);
        check(t + ' ' + nm + ': arena fills (' + Math.round(ar[3]) + ' of ' + g.h + ' high), zoomed ' + g.s.toFixed(2), ar[3] > g.h * 0.36 && ar[0] >= 0 && ar[0] + ar[2] <= g.w + 0.5);
        check(t + ' ' + nm + ': arena clear of the buttons', ar[1] + ar[3] <= Math.min(...g.pads.map(p => p.y)) - 4);
        const hint = await A.evaluate(() => (document.getElementById('hint') || document.querySelector('.hint') || {}).textContent || '');
        check(t + ' ' + nm + ': hint short (' + hint.length + ' chars)', hint.length > 0 && hint.length < 110, hint);
        check(t + ' ' + nm + ': rotate button visible', await A.$eval('#orientBtn', e => !e.hidden));
        if (nm === 'tall') {
          // a Right pad press walks the fighter
          await A.keyboard.down('ArrowLeft'); await wait(150); await A.keyboard.up('ArrowLeft'); await wait(300);
          const x0 = await A.evaluate(() => window.ludusDebug.botTest.state().sig[2]);
          const cv = await A.$eval('#stage canvas', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; });
          const rp = g.pads.find(p => p.a === 'right');
          await A.mouse.move(cv.x + rp.x + rp.w / 2, cv.y + rp.y + rp.h / 2); await A.mouse.down(); let x1 = x0; for (let i = 0; i < 16 && x1 <= x0 + 5; i++) { await wait(500); x1 = await A.evaluate(() => window.ludusDebug.botTest.state().sig[2]); } await A.mouse.up();
          check(t + ' tall: pressing the Right button moves the fighter (' + Math.round(x0) + ' -> ' + Math.round(x1) + ')', x1 > x0 + 5, await A.evaluate(() => window.ludusDebug.botTest.state().sig));
          // rotate to wide
          await A.click('#orientBtn'); await wait(300);
          check(t + ': rotate button remembers wide', await A.evaluate(() => Ludus.state.orient.finalpush === true));
          await A.setViewportSize({ width: 760, height: 500 }); await wait(700);   // the app shell does this on the real panel
          const w = await A.evaluate(() => window.ludusDebug.finalpush());
          check(t + ': rotate gives the wide layout', w.wide === true, w);
          const left = w.pads.filter(p => p.a === 'left' || p.a === 'right'), rightZone = w.pads.filter(p => ['up', 'down', 'atk'].includes(p.a));
          check(t + ' wide: walk left of the arena, spear+thrust right of it', left.every(p => p.x + p.w <= w.arena[0] + 1) && rightZone.every(p => p.x >= w.arena[0] + w.arena[2] - 1) && w.pads.every(p => inside(p, w.w, w.h)));
          await L.shot(A, 'nidhogg-rotated-' + t);
          // choice persists: leave and reopen
          await A.evaluate(() => document.getElementById('backBtn').click()); await wait(400);
          await A.evaluate(() => { Ludus.state.saves = {}; window.ludusOpenGame('finalpush'); }); await wait(800);
          check(t + ': wide choice kept after reopening', await A.evaluate(() => Ludus.state.orient.finalpush === true && window.ludusDebug.finalpush().wide === true));
          await A.click('#orientBtn'); await A.setViewportSize({ width: 400, height: 640 }); await wait(700);
          check(t + ': rotate back gives tall again', (await A.evaluate(() => window.ludusDebug.finalpush())).wide === false);
        }
        check(t + ' ' + nm + ': no page errors', errs([A]) === 0, A.errors);
        await A.context().close();
      }
      // vs Friend (Sword Duel has no online mode)
      const B = await newPage(browser, null, { size: { width: 400, height: 640 }, dark, dir: DIR });
      await B.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; Ludus.state.orient = {}; window.ludusOpenGame('finalpush'); }); await wait(800);
      await B.locator('text=vs Friend').first().click(); await wait(500);
      const gf = await B.evaluate(() => window.ludusDebug.finalpush());
      check(t + ' vs Friend: layout same, five buttons inside', gf.pads.length === 5 && gf.pads.every(p => inside(p, gf.w, gf.h)));
      await L.shot(B, 'nidhogg-friend-' + t); await B.context().close();
    }
  } finally { await browser.close(); }
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
