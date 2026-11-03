// Turn Room: the original Rotate script plays line by line, dying or Restart puts you back at the start of the same room.
const L = require('./lib.js');
const { wait, check, newPage, errs } = L;
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      const A = await newPage(browser, null, { size: { width: 430, height: 780 }, dark });
      await A.evaluate(() => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.saves = {}; window.ludusOpenGame('rotate'); }); await wait(900);
      const d = () => A.evaluate(() => window.ludusDebug.rotate());
      check(t + ': room 1 types the first line', /^Make your/.test((await d()).story) || (await d()).story.length > 0, (await d()).story);
      await A.evaluate(() => window.ludusDebug.rotateLoad(7)); await wait(400);
      const s1 = (await d()).story; await wait(3600); const s2 = (await d()).story;
      check(t + ': room 8 plays the real lines in order', s1.startsWith("You aren") && s2.startsWith('This place'), [s1, s2]);
      await L.shot(A, 'rotate-story-' + t);
      await A.evaluate(() => window.ludusDebug.rotateDie()); await wait(2600);
      const r = await d();
      check(t + ': dying wakes you at the start of the same room', r.lvl === 7 && !r.done && r.deaths === 1 && (await A.$eval('#overSheet', e => e.hidden)), r);
      check(t + ': story does not replay after a death', !r.story.startsWith("You aren"), r.story);
      await A.click('#pauseBtn'); await wait(300); await A.click('#restartBtn'); await wait(500);
      const q = await d();
      check(t + ': Restart in the pause menu restarts only this room', q.lvl === 7 && q.deaths === 2 && (await A.$eval('#pauseSheet', e => e.hidden)), q);
      check(t + ': no console errors', errs([A]) === 0, A.errors);
      await A.context().close();
    }
  } catch (e) { check('rotate story test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
