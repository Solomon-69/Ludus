// "Play again" after the game ended starts the whole game over (1.12.34), no internet: node play-again.js
// Crates (Sokoban): finished on level 15 -> Play again is level 1, score 0; the pause menu's Restart and a mid-game restart keep the level.
// Every game: end the game, press Play again (button and Enter key): a fresh game, no saved state, score 0, no errors.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    const A = await newPage(browser, null, { size: { width: 520, height: 740 } });
    await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('crates'); });
    await wait(900);
    let c = await A.evaluate(() => window.ludusDebug.crates());
    await A.evaluate(() => document.getElementById('pauseBtn').click()); await wait(200);
    await A.evaluate(() => document.getElementById('restartBtn').click()); await wait(700);
    check('pause menu Restart starts the run again (same game, level 1)', (await A.evaluate(() => window.ludusDebug.crates())).lvl === 0);
    await A.evaluate(() => window.ludusForceOver(true)); await wait(1800);
    check('finished screen shows Play again', await A.$eval('#againBtn', e => e.textContent.trim() === 'Play again' && !!e.offsetParent));
    const seedA = (await A.evaluate(() => window.ludusDebug.crates())).seed;
    await A.click('#againBtn'); await wait(800);
    c = await A.evaluate(() => window.ludusDebug.crates());
    check('Play again after the end: level 1, score 0, blank dots, new seed', c.lvl === 0 && c.score === 0 && c.solvedN === 0 && c.seed !== seedA, c);
    check('score shows 0 and the finished screen is gone', (await A.$eval('#scoreNow', e => e.textContent)) === '0' && await A.$eval('#overSheet', e => e.hidden));
    await A.evaluate(() => window.ludusForceOver(false)); await wait(1800);
    await A.keyboard.press('Enter'); await wait(800);
    check('Enter on the finished screen also starts a new run', (await A.evaluate(() => window.ludusDebug.crates())).seed !== c.seed);
    check('no console errors (crates)', errs([A]) === 0, A.errors);
    // every game
    const ids = await A.evaluate(() => Ludus.games.map(g => ({ id: g.id, versus: !!g.versus })));
    let bad = [];
    for (const g of ids) {
      await A.evaluate(g => { Ludus.state.saves = {}; if (g.versus) Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [g.id]: 'bot' }); window.ludusOpenGame(g.id); }, g);
      await wait(500);
      await A.evaluate(() => window.ludusForceOver(true)); await wait(1700);
      const had = await A.$eval('#overSheet', e => !e.hidden).catch(() => false);
      await A.evaluate(() => document.getElementById('againBtn').click()); await wait(500);
      const r = await A.evaluate(g => ({ over: !document.getElementById('overSheet').hidden, score: document.getElementById('scoreNow').textContent, canvas: !!document.querySelector('#stage canvas, #stage *'), saved: !!(Ludus.state.saves && Ludus.state.saves[g.id]) }), g);
      if (!had || r.over || !r.canvas) bad.push([g.id, had, r]);
      await A.evaluate(() => document.getElementById('backBtn').click()); await wait(100);
    }
    check('every game (' + ids.length + '): Play again gives a fresh game', bad.length === 0, bad);
    check('no console errors (all games)', A.errors.filter(e => !/ERR_CERT|ERR_INTERNET|ERR_NAME/.test(e)).length === 0, A.errors);
  } catch (e) { check('play-again test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
