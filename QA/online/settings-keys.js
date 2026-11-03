// Settings by keyboard: Up/Down glide a pill through every row (wrapping), Left/Right/Space/Return change it, typing is left alone.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      const A = await newPage(browser, null, { size: { width: 430, height: 780 }, dark });
      await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; document.getElementById('openSettings').click(); }); await wait(700);
      const st = () => A.evaluate(() => { const p = document.querySelector('.kbd-pill'), rows = [...document.querySelectorAll('#settingsBody .row')].filter(r => r.getClientRects().length && !r.closest('[hidden]')); if (!p) return { pill: false, n: rows.length }; const pr = p.getBoundingClientRect(); const i = rows.findIndex(r => { const q = r.getBoundingClientRect(); return Math.abs(q.top - pr.top) < 3; }); return { pill: true, i, n: rows.length, title: i >= 0 ? rows[i].querySelector('.row-title').textContent : '', op: p.style.opacity, sw: [...document.querySelectorAll('#settingsBody .switch')].map(s => s.getAttribute('aria-checked')).join(','), theme: document.documentElement.dataset.theme }; });
      await A.keyboard.press('ArrowDown'); await wait(700);
      let s = await st(); check(t + ': Down highlights the first row (' + s.title + ')', s.pill && s.i === 0 && s.op === '1', s);
      await A.keyboard.press('ArrowDown'); await A.keyboard.press('ArrowDown'); await wait(700); s = await st();
      check(t + ': Down moves through rows (' + s.title + ')', s.i === 2, s);
      await L.shot(A, 'settings-keys-' + t);
      await A.keyboard.press('ArrowUp'); await A.keyboard.press('ArrowUp'); await A.keyboard.press('ArrowUp'); await wait(700); s = await st();
      check(t + ': Up from the first row wraps to the last (' + s.title + ')', s.i === s.n - 1, s);
      await A.keyboard.press('ArrowDown'); await wait(500); s = await st(); check(t + ': Down from the last wraps to the first', s.i === 0, s);
      // Appearance is a segment: Right steps to the next option
      const th0 = await A.evaluate(() => document.querySelector('#settingsBody .seg button.is-on').textContent);
      await A.keyboard.press('ArrowRight'); await wait(400);
      const th1 = await A.evaluate(() => document.querySelector('#settingsBody .seg button.is-on').textContent);
      check(t + ': Right steps a segment (' + th0 + ' -> ' + th1 + ')', th0 !== th1);
      await A.keyboard.press('ArrowLeft'); await wait(400);
      check(t + ': Left steps it back', (await A.evaluate(() => document.querySelector('#settingsBody .seg button.is-on').textContent)) === th0);
      // a switch row: Space flips, Return flips back
      for (let k = 0; k < 4; k++) await A.keyboard.press('ArrowDown');   // Appearance, Accent, Panel size, Reduce motion, Raised -> index 4
      await wait(500); const before = (await st()).sw;
      await A.keyboard.press('Space'); await wait(400); const mid = (await st()).sw;
      await A.keyboard.press('Enter'); await wait(400); const after = (await st()).sw;
      check(t + ': Space flips a switch, Return flips it back (' + before + ' | ' + mid + ' | ' + after + ')', before !== mid && before === after, { before, mid, after });
      // More settings opens with Right and its rows join the cycle
      const n0 = (await st()).n;
      while ((await st()).title !== 'More settings') { await A.keyboard.press('ArrowDown'); await wait(120); }
      await A.keyboard.press('ArrowRight'); await wait(900); const n1 = (await st()).n;
      check(t + ': Right opens More settings and its rows join the cycle (' + n0 + ' -> ' + n1 + ')', n1 > n0);
      await A.keyboard.press('ArrowDown'); await wait(500); s = await st(); check(t + ': the pill steps into the opened rows (' + s.title + ')', /Invisible|Rename|Original/.test(s.title), s);
      await A.keyboard.press('Escape'); await wait(600);
      check(t + ': Esc goes back to the games', await A.evaluate(() => !document.getElementById('settings').classList.contains('is-active') && document.getElementById('home').classList.contains('is-active')));
      check(t + ': no console errors', errs([A]) === 0, A.errors);
      await A.context().close();
    }
  } catch (e) { check('settings keys test ran to the end', false, String(e.stack || e).slice(0, 700)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
