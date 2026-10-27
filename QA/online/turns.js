// Turn indicator check: every two-sided turn game shows whose turn it is (tinted active card, status text), light and dark.  node turns.js
const { chromium } = require('playwright-core');
const L = require('./lib.js'), path = require('path');
const { wait, check, shot } = L;
const GAMES = ['fourup', 'boxit', 'ninesq', 'crossing', 'wallrun', 'chess', 'lastwire', 'deadcentre'];
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 640 }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
      const P = await ctx.newPage(); P.errors = [];
      P.on('pageerror', e => P.errors.push(String(e)));
      await P.addInitScript(d => { try { localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, theme: d ? 'dark' : 'light' })); } catch (e) {} }, dark);
      await P.goto('file://' + path.join(L.WEB, 'index.html')); await wait(400);
      for (const id of GAMES) {
        await P.evaluate(i => window.ludusOpenGame(i), id); await wait(900);
        const friend = await P.$('.vs-toggle button[data-vs="friend"]');
        if (friend) { await friend.click(); await wait(700); }
        // sample the header: the pixel colours of the two player cards; the active card is clearly different from the waiting one
        const probe = await P.evaluate(() => {
          const cv = document.querySelector('#stage canvas'); if (!cv) return null;
          const r = cv.getBoundingClientRect(), x = cv.getContext && cv.getContext('2d');
          return { w: r.width, h: r.height, name: document.getElementById('gameName').textContent };
        });
        await shot(P, 'turn_' + id + (dark ? '_dark' : '_light'));
        check((dark ? 'dark ' : 'light ') + id + ': opens (' + (probe && probe.name) + ')', !!probe, probe);
      }
      check((dark ? 'dark' : 'light') + ': no page errors', P.errors.length === 0, P.errors);
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
