// Cover shape regression (squashed covers, Mac 1.7 and Windows): every card cover must be drawn at the shape it is shown
// at, in All, each category, search results, Compact and Large, at 100/125/150/200% scale, and after the panel comes
// back from a wide game (the state that left covers squashed). node QA/harness/cover-aspect.js [--web dir]
const path = require('path'), os = require('os'), fs = require('fs');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(path.join(__dirname, '../online/node_modules/playwright-core')); }
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const web = opt('--web') || path.join(__dirname, '../../web');
const chrome = process.env.CHROME || (() => { const d = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const h = fs.readdirSync(d).find(x => x.startsWith('chromium_headless_shell')); return path.join(d, h, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); })();
const SIZES = { compact: { width: 400, height: 600 }, large: { width: 520, height: 740 } }, WIDE = { width: 760, height: 500 };
let pass = 0, fail = 0;
const check = (name, ok, info) => { ok ? pass++ : fail++; if (!ok) console.log('FAIL ' + name + '  ' + String(JSON.stringify(info)).slice(0, 300)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pw.chromium.launch({ executablePath: chrome });
  for (const scale of [1, 1.25, 1.5, 2]) for (const sz of ['compact', 'large']) {
    const p = await b.newPage({ viewport: SIZES[sz], deviceScaleFactor: scale });
    await p.addInitScript(() => { try { if (!localStorage.getItem('ludus.v1')) localStorage.setItem('ludus.v1', JSON.stringify({ introDone: true })); } catch (e) {} });
    await p.goto('file://' + path.join(web, 'index.html')); await wait(700);
    const has = await p.evaluate(() => typeof window.ludusCoverCheck === 'function');
    const measure = () => p.evaluate(() => window.ludusCoverCheck ? ludusCoverCheck() : (() => {   // also works on builds without the helper
      const out = { cards: 0, bad: [] };
      document.querySelectorAll('#grid .card .art canvas').forEach(cv => { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; out.cards++; if (Math.abs((cv.width / cv.height) / (w / h) - 1) > 0.02) out.bad.push(cv.closest('.card').dataset.id); });
      return out;
    })());
    const cc = async label => { await wait(450); const r = await measure(); check(`${scale * 100}% ${sz} ${label}: ${r.cards} covers true to shape`, r.cards > 0 && r.bad.length === 0, r); return r; };
    if (!has && scale === 1 && sz === 'compact') console.log('(build without ludusCoverCheck: measuring directly)');
    await cc('All');
    for (const f of ['Arcade', 'Puzzle', 'Duel', '2 Player']) { await p.click(`#filters .chip:text-is("${f}")`); await cc(f); }
    await p.click('#filters .chip:text-is("All")');
    await p.fill('#search', 'Map Hu'); await cc('search Map Hu');
    check(`${scale * 100}% ${sz} search Map Hu: Map Hunt first`, await p.evaluate(() => document.querySelector('#grid .card').dataset.id) === 'geoguess');
    await p.fill('#search', 'puz'); await cc('search puz');
    await p.fill('#search', ''); await cc('search cleared');
    await p.evaluate(() => { document.getElementById('grid').scrollTop = 400; }); await cc('scrolled');
    // the 1.7 state: a wide game open, the panel closed while still wide, then reopened at its normal size
    await p.evaluate(() => window.ludusOpenGame('geoguess')); await wait(900);
    await p.setViewportSize(WIDE); await wait(300);
    await p.evaluate(() => window.ludusClosed()); await wait(300);
    await p.setViewportSize(SIZES[sz]); await wait(200);
    await p.evaluate(() => window.ludusOpened()); await cc('back from a wide game');
    await p.setViewportSize(sz === 'compact' ? SIZES.large : SIZES.compact); await cc('switched Compact/Large');
    await p.close();
  }
  await b.close(); console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
