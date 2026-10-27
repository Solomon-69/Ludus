// 27 Oct re-check (no relay needed): More settings + Original names, Same laptop tab, Continue per tab, tabs open at top,
// vs Bot default, Air Hockey upright and wide, connection light, Privacy blur with a fake camera, Mosaic Hunt layouts, photo
// and offline fallback.  node rerun27.js
const { chromium } = require('playwright-core');
const L = require('./lib.js'), path = require('path');
const { wait, check, shot } = L;
const CHROME_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--allow-file-access-from-files'];   // the Mac app allows file reads too (App.swift allowFileAccessFromFileURLs)
async function page(browser, size, opts = {}) {
  const ctx = await browser.newContext({ viewport: size || { width: 400, height: 600 }, deviceScaleFactor: 1, permissions: ['camera'], offline: !!opts.offline });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e.stack || e)));
  p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_INTERNET|ERR_NAME|TensorFlow Lite/.test(m.text())) p.errors.push(m.text()); });
  await p.addInitScript(() => { window.ludusDebug = window.ludusDebug || {}; try { if (!localStorage.getItem('ludus.v1')) localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, theme: 'light' })); } catch (e) {} });
  await p.goto('file://' + path.join(L.WEB, 'index.html')); await p.waitForTimeout(400);
  return p;
}
const chip = (p, t) => p.click(`#filters .chip:text-is("${t}")`);
const cards = p => p.$$eval('#grid .card', els => els.map(e => e.dataset.id));
(async () => {
  const fs = require('fs'), dir = path.join(process.env.HOME, 'Library/Caches/ms-playwright'), hs = fs.readdirSync(dir).find(x => x.startsWith('chromium_headless_shell'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || path.join(dir, hs, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), args: CHROME_ARGS });
  try {
    const A = await page(browser, { width: 520, height: 740 });
    // ---- More settings: Original names
    await A.click('#openSettings'); await wait(400); await A.click('#moreToggle'); await wait(500);
    const sub = await A.evaluate(() => { const r = [...document.querySelectorAll('.row')].find(x => x.querySelector('.row-title')?.textContent === 'Original names'); return r ? r.querySelector('.row-sub').textContent : null; });
    check('Original names row is in More settings', sub !== null, sub);
    check('Original names shows only the short description (no path, no "No file found")', !!sub && !/[\\/]|No file found|\.json/i.test(sub), sub);
    await A.evaluate(() => { const r = [...document.querySelectorAll('.row')].find(x => x.querySelector('.row-title')?.textContent === 'Original names'); r.querySelector('.switch').click(); });
    await A.click('#settingsBack'); await wait(300); await chip(A, 'All'); await wait(200);
    const nm = await A.evaluate(() => document.querySelector('.card[data-id="fiveletters"] .card-name')?.textContent);
    check('Original names on: Five Letters shows as Wordle', nm === 'Wordle', nm);
    const found = await A.evaluate(async () => { const s = document.getElementById('search'); if (!s) return null; s.value = 'tetris'; s.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 200)); const id = document.querySelector('#grid .card')?.dataset.id; s.value = ''; s.dispatchEvent(new Event('input')); return id; });
    check('search finds a game by its original name (tetris -> Blocks)', found === 'blocks', found);
    await A.evaluate(() => { Ludus.state.originalNames = false; });
    // ---- tabs
    check('2 Player tab is called "Same laptop"', await A.$('#filters .chip:text-is("Same laptop")') !== null);
    await chip(A, 'Same laptop'); await wait(200); const same = await cards(A);
    await chip(A, 'Duel'); await wait(200); const duel = await cards(A);
    const overlap = same.filter(x => duel.includes(x));
    check('Same laptop and Duel suggest different games', same.length > 0 && duel.length > 0 && overlap.length === 0, { same, duel, overlap });
    await A.evaluate(() => { document.getElementById('grid').scrollTop = 600; }); await chip(A, 'Arcade'); await wait(200);
    check('Arcade tab opens at the top', await A.evaluate(() => document.getElementById('grid').scrollTop) === 0);
    await A.evaluate(() => window.ludusOpenGame('snake')); await wait(1200); await A.click('#backBtn'); await wait(500);
    await chip(A, 'Puzzle'); await wait(150); await chip(A, 'Arcade'); await wait(200);
    const first = await A.evaluate(() => { const c = document.querySelector('#grid .card'); return c && [c.dataset.id, c.classList.contains('feature'), c.querySelector('.tag')?.textContent]; });
    check('Arcade tab leads with the last game as Continue', first && first[0] === 'snake' && first[1] && /Continue/.test(first[2]), first);
    await chip(A, 'Puzzle'); await wait(200);
    check('Puzzle tab does not show an Arcade game as Continue', !(await A.evaluate(() => [...document.querySelectorAll('#grid .card')].some(c => c.dataset.id === 'snake'))));
    // ---- vs Bot default
    await A.evaluate(() => { Ludus.state.vs = Ludus.state.vs || {}; Ludus.state.vs.fourup = 'friend'; window.ludusOpenGame('fourup'); }); await wait(1200);
    const vs = await A.evaluate(() => Ludus.state.vs.fourup);
    check('Four in a Row opens vs Bot', /bot/i.test(vs), vs);
    await A.click('#backBtn'); await wait(400);
    // ---- connection light
    const dot = () => A.evaluate(() => { const c = document.querySelector('.net-dot .core'); if (!c) return null; const s = getComputedStyle(c); return [s.backgroundColor, s.opacity, getComputedStyle(document.querySelector('.net-dot .halo') || c).display]; });
    const d1 = await dot();
    check('connection light is solid green from the start', d1 && /rgb\(46, 139, 87\)/.test(d1[0]) && d1[1] === '1', d1);
    await A.context().setOffline(true); await A.evaluate(() => dispatchEvent(new Event('offline'))); await wait(3400);
    const d2 = await dot();
    check('connection light turns solid red offline', d2 && /rgb\(209, 73, 91\)/.test(d2[0]) && d2[1] === '1', d2);
    await A.context().setOffline(false); await A.evaluate(() => dispatchEvent(new Event('online'))); await wait(300);
    await shot(A, 'rerun27-home');
    // ---- Privacy blur (fake camera)
    await A.click('#openSettings'); await wait(400); await A.click('#moreToggle'); await wait(400);
    await A.evaluate(() => document.querySelector('#privacyRow .switch').click());
    await shot(A, 'rerun27-privacy');
    const idle = async ms => { for (let i = 0; i < ms / 300; i++) { if (!(await A.evaluate(() => window.LudusPrivacy.running()))) return true; await wait(300); } return false; };
    check('Privacy blur: switch on asks for the camera, then lets it go outside a game', await idle(20000));
    await A.click('#settingsBack'); await wait(300); await A.evaluate(() => window.ludusOpenGame('snake'));
    let run = false; for (let i = 0; i < 60 && !run; i++) { await wait(300); run = await A.evaluate(() => !!(window.LudusPrivacy.running() && window.LudusPrivacy.engine())); }
    const pv = await A.evaluate(() => ({ on: Ludus.state.privacyBlur, engine: window.LudusPrivacy.engine && window.LudusPrivacy.engine(), sub: (document.querySelector('#privacyRow .row-sub') || {}).textContent }));
    check('Privacy blur watches the (fake) camera during a game', run && pv.on === true, pv);
    await A.click('#backBtn'); await wait(500);
    check('Privacy blur lets the camera go back on the home screen', await idle(6000));
    await A.evaluate(() => { Ludus.state.privacyBlur = false; });
    check('no page errors (shell)', A.errors.length === 0, A.errors);
    await A.context().close();
    // ---- Air Hockey upright and wide
    for (const [size, want] of [[{ width: 400, height: 600 }, false], [{ width: 760, height: 500 }, true]]) {
      const H = await page(browser, size); await H.evaluate(() => window.ludusOpenGame('hockey')); await wait(1500);
      const h = await H.evaluate(() => ludusDebug.hockey()); await shot(H, 'rerun27-hockey-' + (want ? 'wide' : 'upright'));
      check('Air Hockey ' + (want ? 'wide (horizontal)' : 'upright (vertical)') + ' rink', h.flat === want, { W: h.W, H: h.H, flat: h.flat });
      check('Air Hockey ' + (want ? 'wide' : 'upright') + ': no errors', H.errors.length === 0, H.errors);
      await H.context().close();
    }
    // ---- Mosaic Hunt: light and dark, 390px and wide: card follows the theme, small fixed map, pin + Guess + result
    for (const theme of ['light', 'dark']) for (const size of [{ width: 390, height: 700 }, { width: 900, height: 640 }]) {
      const tag = theme + ' ' + size.width + 'px';
      const M = await page(browser, size);
      await M.evaluate(t => { Ludus.state.theme = t; document.documentElement.dataset.theme = t; Ludus.save && Ludus.save(); window.ludusOpenGame('invhunt'); }, theme); await wait(1500);
      await M.keyboard.press('Enter'); await wait(500);
      let ih = null; for (let i = 0; i < 30; i++) { ih = await M.evaluate(() => ludusDebug.invhunt && ludusDebug.invhunt()); if (ih && ih.photo && ih.phase === 'play') break; await wait(400); }
      check('Mosaic Hunt ' + tag + ': live photo', !!(ih && ih.photo && /invader-spotter/.test(ih.photo)), ih && { phase: ih.phase, photo: ih.photo });
      const look = await M.evaluate(() => { const card = document.querySelector('.ih-photo')?.closest('[class*=ih-]')?.parentElement || document.querySelector('.ih'); const c = document.querySelector('.ih-clue, .ih-card, .ih-head') || card; const bg = getComputedStyle(c).backgroundColor, m = bg.match(/\d+/g) || [255, 255, 255]; const box = document.querySelector('.ih-mini').getBoundingClientRect(); return { lum: (+m[0] + +m[1] + +m[2]) / 3, alpha: m[3], bg, box: [Math.round(box.width), Math.round(box.height)], themeAttr: document.documentElement.dataset.theme }; });
      check('Mosaic Hunt ' + tag + ': clue card matches the theme', theme === 'dark' ? look.lum < 110 : look.lum > 150, look);
      const mini = await M.$('.ih-mini'); const bx = await mini.boundingBox();
      await M.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await wait(600);
      const b2 = await mini.boundingBox();
      check('Mosaic Hunt ' + tag + ': map stays the same size on hover', Math.abs(b2.width - bx.width) < 2 && Math.abs(b2.height - bx.height) < 2, [bx, b2]);
      await M.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await wait(600);
      const b3 = await mini.boundingBox(), g1 = (await M.evaluate(() => ludusDebug.invhunt())).guess;
      check('Mosaic Hunt ' + tag + ': click drops a pin, map does not grow', !!g1 && Math.abs(b3.width - bx.width) < 2 && Math.abs(b3.height - bx.height) < 2, { g1, bx, b3 });
      check('Mosaic Hunt ' + tag + ': map fits the window', b3.x >= 0 && b3.x + b3.width <= size.width + 1 && b3.y + b3.height <= size.height + 1, b3);
      const gb = await M.evaluate(() => { const b = [...document.querySelectorAll('.ih button')].find(x => /guess/i.test(x.textContent) && !x.disabled); if (b) b.click(); return !!b; });
      await wait(1500);
      const r = await M.evaluate(() => ludusDebug.invhunt());
      check('Mosaic Hunt ' + tag + ': Guess shows the result', gb && (r.revealed || /result|reveal|done/.test(String(r.phase))), { gb, phase: r.phase, revealed: r.revealed, score: r.score });
      await shot(M, 'rerun27-mosaic-' + theme + '-' + size.width);
      check('Mosaic Hunt ' + tag + ': no page errors', M.errors.length === 0, M.errors);
      await M.context().close();
    }
    const O = await page(browser, { width: 520, height: 740 }, { offline: true });
    await O.evaluate(() => window.ludusOpenGame('invhunt')); await wait(1500); await O.keyboard.press('Enter'); await wait(4000);
    const io = await O.evaluate(() => ludusDebug.invhunt && ludusDebug.invhunt()); await shot(O, 'rerun27-mosaic-offline');
    check('Mosaic Hunt offline: still playable (drawn picture / bundled tiles)', !!(io && io.offline), io && { phase: io.phase, offline: io.offline });
    check('Mosaic Hunt offline: no page errors', O.errors.length === 0, O.errors);
    await O.context().close();
  } finally { await browser.close(); }
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
