// Concentric corners in the party lobby (host with the game picker, guest, seats, code boxes, Tournament tab), light + dark,
// compact + large. node QA/harness/corners-lobby.js  (uses the local broker from QA/online)
const path = require('path'), fs = require('fs');
const L = require('../online/lib.js');
const lib = fs.readFileSync(path.join(__dirname, 'corners-lib.js'), 'utf8');
(async () => {
  const browser = await L.launch(); let bad = [], pairs = 0, warn = [];
  for (const dark of [false, true]) for (const size of [{ width: 400, height: 600 }, { width: 520, height: 740 }]) {
    const br = await L.broker.start(), tag = (dark ? 'dark' : 'light') + '/' + size.width;
    const A = await L.newPage(browser, br, { name: 'Ann', dark, size }), B = await L.newPage(browser, br, { name: 'Bo', dark, size });
    const c = await L.flexCreate(A); await L.flexJoin(B, c); await L.wait(900);
    for (const [p, who] of [[A, 'host'], [B, 'guest']]) {
      await p.addScriptTag({ content: lib });
      bad.push(...await p.evaluate(t => __cornerScan(t), tag + '/' + who + '/room'));
      const tour = await p.$('.mode-tab:nth-child(2)');
      if (tour && who === 'host') { await tour.click(); await L.wait(400); bad.push(...await p.evaluate(t => __cornerScan(t), tag + '/host/tournament')); }
      pairs += await p.evaluate(() => window.__cornerPairs || 0); warn.push(...await p.evaluate(() => window.__cornerWarn || []));
      if (process.argv.includes('--shot')) await p.screenshot({ path: path.join(process.argv[process.argv.indexOf('--shot') + 1], 'lobby-' + tag.replace('/', '-') + '-' + who + '.png') });
    }
    for (const p of [A, B]) await p.context().close(); br.close();
  }
  await browser.close();
  bad = [...new Set(bad)];
  console.log(JSON.stringify({ pairs, problems: bad, warnings: [...new Set(warn)] }, null, 1));
  process.exit(bad.length ? 1 : 0);
})();
