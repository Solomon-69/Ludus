// Single game / Tournament pill slides (1.12.27): frames of the pill while switching, light + dark. node QA/harness/mode-slide.js [outdir]
const path = require('path');
const L = require('../online/lib.js');
(async () => {
  const out = process.argv[2]; const browser = await L.launch(); const res = {};
  for (const dark of [false, true]) {
    const br = await L.broker.start(), A = await L.newPage(browser, br, { name: 'Ann', dark, size: { width: 400, height: 600 } });
    await L.flexCreate(A); await L.wait(900);
    await A.evaluate(() => { Ludus.state.reduceMotion = false; document.documentElement.classList.remove('reduce', 'instant'); });   // lib starts with Reduce motion on
    const tag = dark ? 'dark' : 'light', at = () => A.evaluate(() => { const p = document.querySelector('.mode-pill'), on = document.querySelector('.mode-tab.is-on'); return { x: Math.round(new DOMMatrix(getComputedStyle(p).transform).m41), on: on && on.textContent, sel: document.querySelector('.mode-tab[aria-selected=true]')?.textContent }; });
    const f = [await at()];
    await A.click('.mode-tab:nth-child(2)');
    for (const ms of [40, 120, 450]) { await L.wait(ms === 40 ? 40 : ms - (ms === 120 ? 40 : 120)); f.push({ ms, ...(await at()) }); if (out) await A.screenshot({ path: path.join(out, `slide-${tag}-${ms}.png`), clip: { x: 0, y: 0, width: 400, height: 600 } }); }
    await A.click('.mode-tab:nth-child(1)'); await L.wait(500); f.push({ back: true, ...(await at()) });
    res[tag] = f; await A.context().close(); br.close();
  }
  await browser.close(); console.log(JSON.stringify(res));
  const ok = ['light', 'dark'].every(t => { const f = res[t]; return f[0].on === 'Single game' && f[3].on === 'Tournament' && f[3].x > f[0].x && f[1].x < f[3].x && f[4].x === f[0].x; });
  console.log(ok ? 'PASS pill slides between the tabs (light + dark)' : 'FAIL pill slide');
  // Reduce motion: no slide, straight to the new tab
  const br = await L.broker.start(), b2 = await L.launch(), R = await L.newPage(b2, br, { name: 'Rm', size: { width: 400, height: 600 } });
  await L.flexCreate(R); await L.wait(900); await R.click('.mode-tab:nth-child(2)'); await L.wait(40);
  const rx = await R.evaluate(() => Math.round(new DOMMatrix(getComputedStyle(document.querySelector('.mode-pill')).transform).m41));
  const okR = rx === res.light[3].x; console.log(okR ? 'PASS reduce motion: pill is at the new tab at once' : 'FAIL reduce motion x=' + rx);
  await b2.close(); br.close(); process.exit(ok && okR ? 0 : 1);
})();
