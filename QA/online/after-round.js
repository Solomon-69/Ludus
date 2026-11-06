// After a round in a party, every player must always have something to press. Samples which buttons really take a click
// (hit-tested at their centre) through the whole end of a round, in the ways a round can end.
const L = require('./lib.js'); const { check, wait } = L;
const SAMPLE = () => {
  const seen = [];
  document.querySelectorAll('button, [role=button]').forEach(b => {
    const r = b.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || b.disabled) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
    const e = document.elementFromPoint(cx, cy); if (e && (e === b || b.contains(e))) seen.push((b.textContent.trim() || b.id || b.getAttribute('aria-label') || '?').slice(0, 14));
  });
  const sh = document.getElementById('lobbySheet'), s = (window.ludusOnline && window.ludusOnline() || {}).session;
  return { btn: seen, sheet: !sh.hidden, over: !document.getElementById('overSheet').hidden, st: s && s.ser && s.ser.st, title: sh.hidden ? '' : ((document.getElementById('lobbyCard').innerText || '').split('\n')[0] || '').slice(0, 30) };
};
const line = s => `${s.st || '-'}|${s.sheet ? 'card:' + s.title : ''}|${s.over ? 'over' : ''}|${s.btn.join(',')}`;
async function watch(pages, ms, tag) {
  const last = pages.map(() => ''), t0 = Date.now(); let dead = pages.map(() => 0);
  while (Date.now() - t0 < ms) {
    for (let i = 0; i < pages.length; i++) {
      const s = await pages[i].evaluate(SAMPLE), l = line(s);
      if (l !== last[i]) { console.log(`  ${tag} ${'AB'[i]} +${((Date.now() - t0) / 1000).toFixed(1)}s ${l}`); last[i] = l; }
      if (!s.btn.length) dead[i]++;
    }
    await wait(250);
  }
  return dead;
}
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const names = ['Ann', 'Bo'], pages = [];
  for (const n of names) pages.push(await L.newPage(browser, br, { name: n }));
  const [A, B] = pages, c = await L.flexCreate(A); await L.flexJoin(B, c);
  await L.pick(A, ['Air Hockey'], 3);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary'); await Promise.all(pages.map(L.waitPlaying)); await wait(600);
  console.log('both finish'); await Promise.all(pages.map((p, k) => p.evaluate(w => ludusForceOver(w), k === 0)));
  let d = await watch(pages, 9000, 'r1'); console.log('dead samples', d);
  await Promise.all(pages.map(L.waitPlaying)); await wait(600);
  console.log('guest only'); await B.evaluate(() => ludusForceOver(true));
  d = await watch(pages, 12000, 'r2'); console.log('dead samples', d);
  await Promise.all(pages.map(L.waitPlaying)); await wait(600);
  console.log('host stalls on board'); await Promise.all(pages.map((p, k) => p.evaluate(w => ludusForceOver(w), k === 0)));
  await A.waitForFunction(() => { const s = window.ludusOnline().session; return s.ser && s.ser.st !== 'play'; }, null, { timeout: 12000 });
  await A.evaluate(() => { const s = window.ludusOnline().session; if (s.ser && s.ser.t2) clearTimeout(s.ser.t2); });
  d = await watch(pages, 5000, 'r3'); console.log('dead samples', d);
  await browser.close(); br.stop && br.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
