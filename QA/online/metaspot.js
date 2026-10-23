// Meta Spotter online race test, no internet: node metaspot.js [--dark]
// Three pages through the in-memory broker: the host picks the clues, everyone gets the same ten clues with the same
// four answers, a round ends once everyone answered (or the clock runs out), faster right answers score more, and
// every screen agrees on the final standings.
const L = require('./lib.js');
const { broker, wait, check, errs, party, shot } = L;
const dark = process.argv.includes('--dark');
const st = p => p.evaluate(() => window.ludusDebug.metaspot());
const clickOpt = (p, i) => p.evaluate(k => { const b = document.querySelectorAll('.ms-opt')[k]; if (b && !b.disabled) b.click(); return !!b; }, i);
const waitPhase = (p, ph, r) => p.waitForFunction(([a, b]) => { const s = window.ludusDebug.metaspot && window.ludusDebug.metaspot(); return s && s.phase === a && (b === undefined || s.round === b); }, [ph, r], { timeout: 15000 });

(async () => {
  const browser = await L.launch();
  try {
    const br = await broker.start();
    const { pages } = await party(browser, br, 'Meta Spotter', 3, { dark });
    const [A, B, C] = pages;
    await Promise.all(pages.map(p => waitPhase(p, 'setup')));
    check('all three screens show the race setup', true);
    // host picks Bollards and Europe; the guests follow
    await A.click('.lk-sheet .lk-chip:text-is("Bollards")'); await A.click('.lk-sheet .lk-chip:text-is("Europe")'); await wait(500);
    const bs = await st(B);
    check('guests follow the host\'s clue and region choice', bs.kind === 'bollard' && bs.region === 'Europe', [bs.kind, bs.region]);
    await shot(B, 'metaspot-setup-guest');
    await A.click('.lk-sheet .lk-btn:text-is("Start")');
    await Promise.all(pages.map(p => waitPhase(p, 'ask', 0)));
    const qs = await Promise.all(pages.map(st));
    check('everyone gets the same first clue and the same four answers', qs.every(s => JSON.stringify(s.q) === JSON.stringify(qs[0].q)) && qs[0].q.k === 'bollard', qs.map(s => s.q));
    // play all ten rounds: A answers right at once, B answers right a bit later, C answers wrong
    for (let r = 0; r < 10; r++) {
      await Promise.all(pages.map(p => waitPhase(p, 'ask', r)));
      const s = await st(A), right = s.q.o.indexOf(s.q.c), wrong = (right + 1) % 4;
      await clickOpt(A, right); await wait(350); await clickOpt(B, right); await clickOpt(C, wrong);
      await Promise.all(pages.map(p => waitPhase(p, r < 9 ? 'reveal' : 'over', r).catch(() => waitPhase(p, 'over'))));
      if (r === 0) { await shot(A, 'metaspot-reveal-host'); await shot(C, 'metaspot-reveal-guest'); }
    }
    await Promise.all(pages.map(p => waitPhase(p, 'over')));
    await wait(800);
    const fin = await Promise.all(pages.map(st));
    const sum = s => { const t = {}; s.answers.forEach((row, r) => Object.keys(row || {}).forEach(k => { t[k] = (t[k] || 0) + (row[k] ? 1 : 0); })); return t; };
    check('every screen saw every answer', fin.every(s => JSON.stringify(sum(s)) === JSON.stringify({ 0: 10, 1: 10, 2: 10 })), fin.map(sum));
    const scores = await Promise.all(pages.map(p => p.$eval('#scoreNow', e => +e.textContent)));
    check('fast right answers beat slow right ones, wrong answers score nothing', scores[0] > scores[1] && scores[1] > 0 && scores[2] === 0, scores);
    const titles = await Promise.all(pages.map(p => p.$eval('#overTitle', e => e.textContent).catch(() => '')));
    check('all screens agree the host won', titles[0] === 'You win' && /Ann wins/.test(titles[1]) && /Ann wins/.test(titles[2]), titles);
    await shot(B, 'metaspot-final-guest');
    check('no console errors on any screen', errs(pages) === 0, pages.map(p => p.errors));
    await br.stop && br.stop();
  } catch (e) { check('test ran', false, String(e.stack || e)); }
  finally { await browser.close(); }
  const ok = L.results.every(Boolean);
  console.log(ok ? 'ALL PASS' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
