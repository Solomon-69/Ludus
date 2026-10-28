// Frame-by-frame record of Online page motion (Forget collapse, Last party appearing, Online <-> All tab swap).
// node QA/harness/op-frames.js <outdir> [--dark] [--size compact|large|wide] [--web dir] [--ms 0,60,120,...]
// Writes <scene>-<ms>.png per timestamp plus a JSON layout trace (top/height/opacity of each Online block per frame),
// so a jump shows up as numbers too: report.json lists the biggest frame-to-frame move of every block.
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const out = args[0]; fs.mkdirSync(out, { recursive: true });
const web = opt('--web') || path.join(__dirname, '../../web');
const SIZES = { compact: [400, 600], large: [520, 740], wide: [760, 500] };
const [width, height] = SIZES[opt('--size') || 'compact'];
const MS = (opt('--ms') || '0,40,80,120,160,200,240,280,340,420').split(',').map(Number);
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const party = { role: 'host', code: 'AB3CD', mine: true, live: false, name: 'Ann', names: ['Ann', 'Bo', 'Cy'], games: ['dots', 'pong'], n: 1, at: Date.now() };
const trace = () => [...document.querySelectorAll('.online-page [data-k], .online-page .party-card, .grid > .card')].slice(0, 8).map(e => {
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { k: e.dataset.k || e.className.split(' ')[0], top: Math.round(r.top * 10) / 10, h: Math.round(r.height * 10) / 10, op: Math.round(+cs.opacity * 100) / 100, tf: cs.transform === 'none' ? '' : cs.transform };
});
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: args.includes('--dark') ? 'dark' : 'light', deviceScaleFactor: 2 });
  const report = {}, errors = [];
  // Time is driven by hand: page timers / rAF run on Playwright's fake clock and every CSS / Web animation is paused and
  // seeked to the same virtual time, so each frame shows exactly the moment it is named after (screenshots are slow).
  async function scene(name, prep, act) {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.clock.install();
    await page.addInitScript(p => { localStorage.clear(); if (p) localStorage.setItem('ludus.v1', JSON.stringify({ party: p })); }, prep.party ? party : null);
    const settle = async ms => { await page.clock.runFor(ms); await page.waitForTimeout(ms); };
    await page.goto('file://' + path.join(web, 'index.html')); await settle(800);
    if (prep.tab) { await page.evaluate(t => [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim() === t).click(), prep.tab); await settle(900); }
    // the fake clock runs on its own until paused: stop it so only runFor moves page time
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__born = new Map(); window.__seek = v => { for (const a of document.getAnimations()) { if (!__born.has(a)) { __born.set(a, v); a.pause(); } try { a.currentTime = Math.max(0, v - __born.get(a)); } catch (e) {} } }; });
    const frames = [];
    await page.evaluate(act); await page.evaluate(() => __seek(0));
    let v = 0;
    for (const ms of MS) {
      while (v < ms) { const d = Math.min(16, ms - v); await page.clock.runFor(d); v += d; await page.evaluate(x => __seek(x), v); }
      await page.waitForTimeout(30);
      const tr = await page.evaluate(trace);
      await page.screenshot({ path: path.join(out, `${name}-${String(ms).padStart(3, '0')}.png`) });
      frames.push({ ms, tr });
    }
    report[name] = frames; await page.close();
  }
  const click = id => `() => document.getElementById('${id}').click()`;
  await scene('forget', { party: 1, tab: 'Online' }, new Function('document.getElementById("opForget").click()'));
  await scene('tab-to-all', { party: 1, tab: 'Online' }, new Function('[...document.querySelectorAll("#filters .chip")].find(c => c.textContent.trim() === "All").click()'));
  await scene('tab-to-online', { party: 1, tab: 'All' }, new Function('[...document.querySelectorAll("#filters .chip")].find(c => c.textContent.trim() === "Online").click()'));
  // a party appears while the Online page is showing (back from a room): set it and redraw the way goHome does
  await scene('appear', { party: 0, tab: 'Online' }, new Function('Ludus.state.party = ' + JSON.stringify(party) + '; window.ludusSetSystemDark && 0; window.ludusSetSystemDark(matchMedia("(prefers-color-scheme: dark)").matches);'));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ errors, report }, null, 1));
  console.log(JSON.stringify({ errors, scenes: Object.keys(report) }));
  await browser.close();
})();
