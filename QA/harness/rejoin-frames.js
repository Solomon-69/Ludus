// Frames of Rejoin -> party lobby (Online page slides away, the room sheet comes in). Needs the local broker (QA/online).
// node QA/harness/rejoin-frames.js <outdir> [--dark]. The moment the game view becomes active every animation is paused
// (MutationObserver, before the next frame) and then stepped by hand, like op-frames.js.
const path = require('path'), fs = require('fs');
const L = require('../online/lib.js');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const dark = process.argv.includes('--dark'), MS = [0, 40, 80, 120, 180, 260, 360, 500];
(async () => {
  const browser = await L.launch(), br = await L.broker.start();
  const page = await L.newPage(browser, br, { name: 'Ann', dark });
  await page.evaluate(() => { Ludus.state.reduceMotion = false; Ludus.state.party = { role: 'host', code: 'QW7RT', mine: true, live: false, names: ['Ann', 'Bo'], games: ['dots'], at: Date.now() }; window.ludusSetSystemDark(matchMedia('(prefers-color-scheme: dark)').matches); });
  await L.onlineTab(page); await L.wait(800);
  await page.evaluate(() => { window.__born = new Map(); window.__seek = v => { for (const a of document.getAnimations()) { if (!__born.has(a)) { __born.set(a, v); a.pause(); } try { a.currentTime = Math.max(0, v - __born.get(a)); } catch (e) {} } };
    new MutationObserver((m, ob) => { if (document.getElementById('game').classList.contains('is-active')) { ob.disconnect(); window.__hit = performance.now(); __seek(0); } }).observe(document.getElementById('game'), { attributes: true }); });
  await page.click('#opRejoin');
  await page.waitForFunction(() => window.__hit, null, { timeout: 30000 });
  const trace = [];
  for (const ms of MS) {
    await page.evaluate(v => __seek(v), ms); await L.wait(40);
    trace.push(await page.evaluate(() => ['home', 'game', 'lobbySheet'].map(id => { const e = document.getElementById(id), cs = getComputedStyle(e); return id + ' op=' + (+cs.opacity).toFixed(2) + ' tf=' + cs.transform.slice(0, 40); })));
    await page.screenshot({ path: path.join(out, 'rejoin-' + String(ms).padStart(3, '0') + '.png') });
  }
  // phase 2: the sheet goes from "Opening a room" to the room itself (card height and content change)
  const t2 = [];
  await page.evaluate(() => { for (const a of document.getAnimations()) a.finish(); window.__born = new Map(); window.__hit2 = 0;
    const c = document.getElementById('lobbyCard'); if (c.dataset.screen === 'room') { window.__hit2 = -1; return; }
    new MutationObserver((m, ob) => { if (c.dataset.screen === 'room') { ob.disconnect(); window.__hit2 = 1; __seek(0); } }).observe(c, { attributes: true }); });
  await page.waitForFunction(() => window.__hit2, null, { timeout: 30000 });
  for (const ms of MS) {
    await page.evaluate(v => __seek(v), ms); await L.wait(40);
    t2.push(await page.evaluate(() => { const c = document.getElementById('lobbyCard'), r = c.getBoundingClientRect(); return 'kids=' + [...c.children].map(k => k.getAnimations().map(a => a.effect.getComputedTiming().progress === null ? 'b' : (+a.effect.getComputedTiming().progress).toFixed(2)).join('/') + ':' + getComputedStyle(k).opacity).slice(0,4).join(',') + ' card top=' + r.top.toFixed(1) + ' h=' + r.height.toFixed(1) + ' hit=' + window.__hit2; }));
    await page.screenshot({ path: path.join(out, 'room-' + String(ms).padStart(3, '0') + '.png') });
  }
  trace.push(t2);
  fs.writeFileSync(path.join(out, 'rejoin.json'), JSON.stringify({ errors: page.errors, trace }, null, 1));
  console.log(JSON.stringify({ errors: page.errors, trace }, null, 0).slice(0, 3000));
  await browser.close(); br.close();
})();
