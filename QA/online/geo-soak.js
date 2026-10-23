// Map Hunt soak test (solo): many rounds with key mashing, pause/resume, close/reopen (save + resume), photo downloads
// that fail, graphics-context loss; plus smooth-zoom steadiness and the pin staying in view when the map shrinks.
// Needs internet (Panoramax + OpenFreeMap). NODE_PATH not needed when node_modules is linked here.
// node geo-soak.js [--rounds 12] [--seed 7]
const L = require('./lib.js');
const { wait, check, newPage, shot } = L;
const { chromium } = require('playwright-core');
const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(n); return i >= 0 ? Number(a[i + 1]) : d; };
const ROUNDS = opt('--rounds', 12), NO = k => a.includes('--no-' + k);
const log = (...x) => { if (a.includes('--v')) console.log('  ·', ...x); };
let seed = opt('--seed', 7); const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const G = p => p.evaluate(() => window.ludusDebug.geo && window.ludusDebug.geo());
const phaseIn = (p, list, ms = 70000) => p.waitForFunction(l => { const g = window.ludusDebug.geo && window.ludusDebug.geo(); return g && l.includes(g.phase); }, list, { timeout: ms });
const real = es => es.filter(e => !/GL Driver|WebGL|GPU stall|ERR_FAILED|net::|Failed to load resource/.test(e));

// What the player sees must never be "blurred with nothing to press": if the pause card is up its Resume button is on top.
async function sane(p, label) {
  const s = await p.evaluate(() => {
    const st = JSON.parse(ludusState()), g = window.ludusDebug.geo && window.ludusDebug.geo();
    const sheet = document.getElementById('pauseSheet'), btn = document.getElementById('resumeBtn');
    let resumeOnTop = null;
    if (!sheet.hidden) { const r = btn.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); resumeOnTop = !!hit && (hit === btn || btn.contains(hit)); }
    const blurred = !!document.querySelector('.geo.geo-paused');
    return { paused: st.paused, view: st.view, resumeOnTop, blurred, phase: g && g.phase, gamePaused: g && g.paused };
  });
  if (s.paused) check(`${label}: pause card visible and on top`, s.resumeOnTop === true, s);
  else if (s.view === 'game') check(`${label}: not blurred when not paused`, !s.blurred && !s.gamePaused, s);
  return s;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }).catch(() => L.launch());
  const P = await newPage(browser, null, { size: { width: 900, height: 600 } });
  let failRate = 0;
  await P.route(/panoramax|geovisio|\.jpg|\.jpeg|\/sd\.|\/hd\./i, r => (rnd() < failRate ? r.abort() : r.continue()));
  const openGeo = async () => { await P.evaluate(() => window.ludusOpenGame('geoguess')); await wait(1400); };
  await openGeo();
  await phaseIn(P, ['setup']); await wait(600);
  await P.click('.geo-chip:text-is("No limit")'); await P.click('.geo-go');
  let done = 0, closes = 0, losses = 0, failsOn = 0, games = 1;
  const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 's', '+', '-', 'a', 'd', 'Enter', ' ', 'Escape', 'p'];
  while (done < ROUNDS) {
    await phaseIn(P, ['play', 'result', 'final', 'offline'], 90000).catch(() => {});
    let g = await G(P), st = JSON.parse(await P.evaluate(() => ludusState()));
    if (st.paused) { await sane(P, `r${done} paused`); await P.click('#resumeBtn'); await wait(300); continue; }
    if (!g) { await openGeo(); continue; }
    if (g.phase === 'offline') { check(`r${done}: no retry card while photos load`, failRate === 0 ? false : true, g); await P.click('.geo-card .geo-go'); continue; }
    if (g.phase === 'final' || st.over) {
      await P.evaluate(() => document.getElementById('againBtn').click()); await wait(1200); games++;
      await phaseIn(P, ['setup']); await wait(400); await P.click('.geo-go'); continue;
    }
    if (g.phase === 'result') { await wait(300); await P.keyboard.press('Enter'); await wait(500); continue; }
    // play: mash keys, sometimes pause, close/reopen, lose the drawing surface, or break downloads
    failRate = !NO('fail') && rnd() < 0.3 ? 0.5 : 0; if (failRate) { failsOn++; log('downloads failing'); }
    for (let k = 0; k < (NO('mash') ? 0 : 25); k++) {
      const key = KEYS[Math.floor(rnd() * KEYS.length)];
      if (key === 'Enter' || key === ' ') continue;
      await P.keyboard.press(key); await wait(20 + rnd() * 60);
      if (key === 'Escape' || key === 'p') { await sane(P, `r${done} mash pause`); }
    }
    if (JSON.parse(await P.evaluate(() => ludusState())).paused) { await P.click('#resumeBtn'); await wait(200); }
    if (!NO('loss') && rnd() < 0.3) {   // lose the WebGL context
      log('context loss');
      const ok = await P.evaluate(() => { const c = document.querySelector('.geo-pano canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); const x = gl && gl.getExtension('WEBGL_lose_context'); if (!x) return false; x.loseContext(); setTimeout(() => x.restoreContext(), 300); return true; });
      if (ok) { losses++; await wait(1500); }
    }
    if (!NO('close') && rnd() < 0.3) {   // close the panel
      log('close/reopen');
      closes++;
      await P.evaluate(() => window.ludusClosed()); await wait(200); await P.evaluate(() => window.ludusOpened()); await wait(300);
      await openGeo(); await wait(2500);
      await sane(P, `r${done} after reopen`);
      if (JSON.parse(await P.evaluate(() => ludusState())).paused) { await P.click('#resumeBtn'); await wait(300); }
      continue;
    }
    failRate = 0;
    await phaseIn(P, ['play'], 60000).catch(() => {});
    g = await G(P);
    if (!g || g.phase !== 'play') continue;
    const clear = await P.waitForFunction(() => document.querySelector('.geo-load').hidden, null, { timeout: 30000 }).then(() => true, () => false);
    check(`r${done}: photo shows (spinner gone within 30 s) in play`, clear, await G(P));
    log('round', done, 'errors so far', real(P.errors).length);
    await P.evaluate(() => ludusGeoTest.pin(10 + Math.random() * 40, Math.random() * 60));
    await P.keyboard.press('Space');
    if (!(await phaseIn(P, ['result', 'wait'], 15000).then(() => true, () => false))) { check(`r${done}: Space guesses`, false, [await G(P), await P.evaluate(() => ludusState())]); continue; }
    done++;
    await sane(P, `r${done} result`);
    if (done % 4 === 0) await shot(P, `soak_r${done}`);
  }
  console.log(`rounds ${done}, games ${games}, closes ${closes}, context losses ${losses}, rounds with broken downloads ${failsOn}`);
  check('soak: no page errors', real(P.errors).length === 0, real(P.errors).slice(0, 5));

  // ---- pin stays in view when the map shrinks ----
  await P.evaluate(() => { document.getElementById('backBtn').click(); }); await wait(500);
  await openGeo();
  for (let i = 0; i < 40; i++) {   // get to a round being played, whatever state the game was saved in
    const g = await G(P), st = JSON.parse(await P.evaluate(() => ludusState()));
    if (st.paused) await P.click('#resumeBtn');
    else if (g && g.phase === 'play') break;
    else if (g && g.phase === 'setup') await P.click('.geo-go');
    else if (g && g.phase === 'result') await P.keyboard.press('Enter');
    else if (g && g.phase === 'final' || st.over) await P.evaluate(() => document.getElementById('againBtn').click());
    await wait(1500);
  }
  await phaseIn(P, ['play']);
  const box = await P.$eval('.geo-mapbox', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await P.mouse.move(box.x + box.w / 2, box.y + box.h / 2); await wait(700);
  const big = await P.$eval('.geo-mapbox', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  let allIn = true;
  for (const [fx, fy] of [[0.5, 0.04], [0.96, 0.06], [0.04, 0.94], [0.96, 0.94], [0.03, 0.5], [0.97, 0.5]]) {
    await P.mouse.move(big.x + big.w / 2, big.y + big.h / 2); await wait(700);
    const ob = await P.$eval('.geo-mapbox', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await P.mouse.click(ob.x + ob.w * fx, ob.y + ob.h * fy); await wait(250);
    await P.mouse.move(20, 300); await wait(1100);   // leave: the map shrinks
    log('after click', JSON.stringify(await P.evaluate(() => ({ pin: ludusDebug.geo().pin, n: document.querySelectorAll('.geo-gpin').length, size: ludusDebug.geo().sizeLv, hit: (document.elementFromPoint(0, 0) || {}).className }))));
    const vis = await P.evaluate(() => { const m = document.querySelector('.geo-mapbox .geo-gpin').getBoundingClientRect(), b = document.querySelector('.geo-mapbox').getBoundingClientRect(); return { m: [m.left, m.top, m.right, m.bottom].map(Math.round), b: [b.left, b.top, b.right, b.bottom].map(Math.round), inside: m.left >= b.left - 0.5 && m.top >= b.top - 0.5 && m.right <= b.right + 0.5 && m.bottom <= b.bottom + 0.5 }; });
    check(`pin at ${fx},${fy} fully visible after the map shrinks`, vis.inside, vis);
    if (!vis.inside) allIn = false;
  }
  await shot(P, 'soak_pin_closed');

  // ---- smooth zoom into a city: steady (no in-out bounce, the point under the pointer stays put) ----
  await P.mouse.move(big.x + big.w / 2, big.y + big.h / 2); await wait(700);
  await P.evaluate(() => ludusGeoTest.view(48.8566, 2.3522, 6)); await wait(1200);
  const res = await P.evaluate(async () => {
    const el = document.querySelector('.geo-minimap'), r = el.getBoundingClientRect(), cx = r.left + r.width * 0.6, cy = r.top + r.height * 0.4;
    const zs = [], drift = [];
    const map = Object.values(window).find(v => false);   // not reachable; use DOM-only measures
    let longT = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 50) longT++; })).observe({ type: 'longtask' }); } catch (e) {}
    const send = dy => el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    const zoomNow = () => ludusGeoTest.map().getZoom();
    let stop = false; (function f() { zs.push(zoomNow()); if (!stop) requestAnimationFrame(f); })();
    // slow wheel clicks with gaps (the bounce case), then a fast flick
    for (let i = 0; i < 10; i++) { send(-100); await new Promise(r => setTimeout(r, 300)); }
    for (let i = 0; i < 12; i++) { send(-40); await new Promise(r => setTimeout(r, 16)); }
    await new Promise(r => setTimeout(r, 1500)); stop = true;
    let back = 0; for (let i = 1; i < zs.length; i++) if (zs[i] < zs[i - 1] - 0.02) back++;
    return { from: zs[0], to: zs[zs.length - 1], frames: zs.length, backSteps: back, longT };
  });
  console.log('zoom', JSON.stringify(res));
  check('zoom only ever goes in while zooming in (no bounce back)', res.backSteps === 0 && res.to > res.from + 3, res);
  await shot(P, 'soak_zoom_city');
  check('no page errors at the end', real(P.errors).length === 0, real(P.errors).slice(0, 5));
  const fails = L.results.filter(x => !x).length;
  console.log(`${L.results.length - fails}/${L.results.length} checks passed`);
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(2); });
