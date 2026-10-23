const L = require('./lib.js');
(async () => { const ids = process.argv[3].split(','); const b = await L.launch(); const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 200 * ids.length } });
  await p.goto('file://' + L.WEB + '/index.html'); await p.waitForTimeout(400);
  await p.evaluate(ids => { const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f2eee6;display:grid;grid-template-columns:repeat(3,auto);gap:10px;padding:10px;align-content:start;justify-content:start';
    for (const id of ids) { const g = Ludus.games.find(x => x.id === id);
      for (const [w, h, dark] of [[221, 78, false], [112, 80, false], [221, 78, true]]) { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; const c = Ludus.colors();
        const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; cv.style.cssText = `width:${w}px;height:${h}px;border-radius:12px;background:${g.tint}`;
        const x = cv.getContext('2d'); x.scale(2, 2); g.art(x, w, h, c); wrap.appendChild(cv); } }
    document.documentElement.dataset.theme = 'light'; document.body.appendChild(wrap); }, ids);
  await p.screenshot({ path: process.argv[2], fullPage: false }); await b.close(); })();
